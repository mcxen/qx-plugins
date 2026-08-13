import assert from "node:assert/strict";
import { Buffer } from "node:buffer";

const moduleUrl = new URL("../src/agent-usage/index.js", import.meta.url);
moduleUrl.searchParams.set("smoke", String(Date.now()));
const plugin = (await import(moduleUrl.href)).default;

function varint(value) {
  const bytes = [];
  let remaining = value;
  while (remaining >= 128) {
    bytes.push((remaining % 128) | 0x80);
    remaining = Math.floor(remaining / 128);
  }
  bytes.push(remaining);
  return bytes;
}

function grokResponse(usedPercent = 40, resetAt = Math.floor(Date.now() / 1000) + 86400) {
  const float = new Uint8Array(4);
  new DataView(float.buffer).setFloat32(0, usedPercent, true);
  const quota = Uint8Array.from([0x0d, ...float, 0x08, ...varint(resetAt)]);
  const billing = Uint8Array.from([0x2a, ...varint(quota.length), ...quota]);
  const payload = Uint8Array.from([0x0a, ...varint(billing.length), ...billing]);
  const trailer = new TextEncoder().encode("grpc-status: 0\r\n");
  return Uint8Array.from([
    0x00, 0, 0, 0, payload.length, ...payload,
    0x80, 0, 0, 0, trailer.length, ...trailer,
  ]).buffer;
}

const codexAuth = Buffer.from(JSON.stringify({
  tokens: { access_token: "smoke-codex-token", account_id: "smoke-account" },
})).toString("base64");
const grokAuth = Buffer.from(JSON.stringify({
  "https://auth.x.ai::smoke-client": {
    key: "smoke-grok-token",
    auth_mode: "oidc",
    email: "grok@example.test",
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  },
})).toString("base64");

let latestView = null;
let handlers = null;
let persisted = null;
let copied = "";
let opened = "";
const calls = { codex: 0, grok: 0 };
const context = {
  locale: { current: "en", onChange: () => () => {} },
  ui: {
    mountWorkbench(view, nextHandlers) {
      latestView = view;
      handlers = nextHandlers;
      return { update(next) { latestView = next; } };
    },
  },
  invoke: async (command, args) => {
    assert.equal(command, "plugin_file_read_base64");
    if (args.path.endsWith(".codex/auth.json")) return codexAuth;
    if (args.path.endsWith(".grok/auth.json")) return grokAuth;
    throw new Error("unexpected auth path");
  },
  http: {
    fetch: async (url, options) => {
      if (url.includes("chatgpt.com")) {
        calls.codex += 1;
        assert.match(options.headers.Authorization, /^Bearer /);
        return {
          status: 200,
          ok: true,
          json: async () => ({
            email: "codex@example.test",
            plan_type: "plus",
            rate_limit: {
              allowed: true,
              primary_window: {
                used_percent: 25,
                limit_window_seconds: 604800,
                reset_at: Math.floor(Date.now() / 1000) + 604800,
              },
            },
            credits: { has_credits: false, unlimited: false, balance: "0" },
          }),
        };
      }
      calls.grok += 1;
      assert.equal(options.bodyBase64, "AAAAAAA=");
      return { status: 200, ok: true, arrayBuffer: async () => grokResponse() };
    },
  },
  storage: {
    persist: {
      get: async () => null,
      set: async (_key, value) => { persisted = value; },
    },
  },
  clipboard: { write: async (value) => { copied = value; } },
  openUrl: async (value) => { opened = value; },
  showToast() {},
};

const container = { innerHTML: "" };
plugin.panel.render(container, context);
assert.equal(latestView.items.length, 2, "panel must paint both provider rows immediately");

for (let attempt = 0; attempt < 30 && (calls.codex < 1 || calls.grok < 1 || latestView.loading); attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

assert.equal(calls.codex, 1);
assert.equal(calls.grok, 1);
assert.equal(latestView.items.find((item) => item.id === "codex")?.badge, "75% left");
assert.equal(latestView.items.find((item) => item.id === "grok")?.badge, "60% left");
assert.equal(persisted.usage.length, 2, "only normalized provider snapshots should be cached");
assert.ok(!JSON.stringify(persisted).includes("smoke-codex-token"), "cache must not contain tokens");

handlers.onAction("copy:codex", { id: "codex" });
await new Promise((resolve) => setTimeout(resolve, 0));
assert.match(copied, /Codex · 75% remaining/);
handlers.onAction("open:grok", { id: "grok" });
await new Promise((resolve) => setTimeout(resolve, 0));
assert.match(opened, /^https:\/\/grok\.com/);

await plugin.panel.destroy(container);
console.log("agent-usage smoke: ok");
