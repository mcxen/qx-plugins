import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile(new URL("../src/agent-usage/manifest.json", import.meta.url), "utf8"));
assert.equal(manifest.version, "1.2.0");
assert.equal(
  manifest.min_app_version,
  "0.6.87",
  "marketplace compatibility must match the newest host API actually used by the plugin",
);
assert.deepEqual(manifest.storage?.cacheTargets, [{
  id: "usage-snapshot",
  label: "Agent usage snapshot",
  description: "Normalized Codex and Grok quota snapshots without local tokens or raw responses.",
  keys: ["agent-usage.snapshot.v1"],
  retentionDays: 7,
}], "cacheTargets must use the host's required id/keys schema");
assert.deepEqual(manifest.surfaceProviders, [{
  id: "usage-overview",
  source: "agent.usage",
  surfaces: ["home"],
  presentation: "wide",
  titles: { en: "Agent Usage", "zh-CN": "Agent 用量" },
  descriptions: {
    en: "Cached Codex and Grok quota windows without credentials or live background requests.",
    "zh-CN": "显示不含凭据、不会在后台实时请求的 Codex 与 Grok 配额缓存。",
  },
  defaultEnabled: false,
}], "Home surface must be manifest-only and use the registered agent.usage source");

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
let loginStarted = null;
const calls = { codex: 0, grok: 0 };
const context = {
  getPreference: async () => true,
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
  cli: {
    which: async (program) => `/usr/local/bin/${program}`,
    start: async (request) => {
      loginStarted = request;
      return { id: "login-job", running: true, state: "running", stdout: "", stderr: "" };
    },
    poll: async () => ({
      id: "login-job",
      running: false,
      state: "succeeded",
      stdout: "Open \u001b[94mhttps://auth.openai.com/codex/device\u001b[0m and enter TEST-CODE",
      stderr: "",
    }),
    cancel: async () => {},
  },
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
assert.ok(latestView.items.find((item) => item.id === "codex")?.actions.some((action) => action.id === "login:codex"));

handlers.onAction("login:codex", { id: "codex" });
for (let attempt = 0; attempt < 30 && !opened.includes("auth.openai.com"); attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 30));
}
assert.deepEqual(loginStarted?.args, ["login", "--device-auth"]);
assert.equal(opened, "https://auth.openai.com/codex/device");

handlers.onAction("copy:codex", { id: "codex" });
await new Promise((resolve) => setTimeout(resolve, 0));
assert.match(copied, /Codex · 75% remaining/);
handlers.onAction("open:grok", { id: "grok" });
await new Promise((resolve) => setTimeout(resolve, 0));
assert.match(opened, /^https:\/\/grok\.com/);

await plugin.panel.destroy(container);
console.log("agent-usage smoke: ok");
