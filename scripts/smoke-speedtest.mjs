import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile(
  new URL("../src/speedtest/manifest.json", import.meta.url),
  "utf8",
));
assert.equal(manifest.version, "1.0.1");
assert.equal(
  manifest.min_app_version,
  "0.6.54",
  "Speedtest requires the host-rendered Workbench chart port",
);
assert.ok(manifest.panel, "Speedtest must remain a panel plugin");
assert.ok(manifest.permissions.includes("cli"));
assert.ok(manifest.permissions.includes("http"));

const moduleUrl = new URL("../src/speedtest/index.js", import.meta.url);
moduleUrl.searchParams.set("smoke", String(Date.now()));
const plugin = (await import(moduleUrl.href)).default;

let latestView = null;
let handlers = null;
let persisted = null;
let started = 0;
let cancelled = 0;

const resultEvent = {
  type: "result",
  isp: "Example ISP",
  interface: { name: "Ethernet", internalIp: "192.0.2.2", externalIp: "198.51.100.2", isVpn: false },
  server: { id: 7, name: "Example Server", location: "Shanghai", country: "China", host: "speed.example.test", ip: "203.0.113.7", port: 8080 },
  ping: { latency: 8.2, jitter: 1.1, low: 7.4, high: 10.8, packetLoss: 0 },
  download: { bandwidth: 13_000_000, bytes: 10_000_000, elapsed: 800, latency: { iqm: 12, jitter: 2, low: 9, high: 18 } },
  upload: { bandwidth: 4_000_000, bytes: 4_000_000, elapsed: 900, latency: { iqm: 16, jitter: 3, low: 11, high: 24 } },
  result: { id: "smoke-result", persisted: true, url: "https://www.speedtest.net/result/smoke" },
};

const context = {
  locale: { current: "en", onChange: () => () => {} },
  ui: {
    mountWorkbench(view, nextHandlers) {
      latestView = view;
      handlers = nextHandlers;
      return { update(next) { latestView = next; } };
    },
  },
  system: {
    env: async () => ({ platform: "windows", homeDir: "C:\\Users\\smoke", dirSep: "\\" }),
  },
  invoke: async (command) => {
    assert.equal(command, "plugin_file_exists");
    return true;
  },
  cli: {
    run: async () => ({ status: 0, timedOut: false, stdout: "", stderr: "" }),
    start: async (request) => {
      started += 1;
      assert.match(request.program, /speedtest\.exe$/);
      assert.deepEqual(request.args, ["--format", "json", "--progress", "--accept-license", "--accept-gdpr"]);
      return { id: `job-${started}`, state: "running", running: true, status: null, stdout: "", stderr: "", timedOut: false };
    },
    wait: async (id, options) => {
      if (started === 1) {
        const failed = { id, state: "failed", running: false, status: 1, stdout: "", stderr: "NoNetworkConnection", timedOut: false };
        options?.onUpdate?.(failed);
        return failed;
      }
      const downloadOne = JSON.stringify({ type: "download", download: { bandwidth: 12_500_000, progress: 0.4 } });
      const downloadTwo = JSON.stringify({ type: "download", download: { bandwidth: 13_000_000, progress: 0.8 } });
      const stdout = `${downloadOne}\n${downloadTwo}\n${JSON.stringify(resultEvent)}\n`;
      const succeeded = { id, state: "succeeded", running: false, status: 0, stdout, stderr: "", timedOut: false };
      options?.onUpdate?.(succeeded);
      return succeeded;
    },
    cancel: async () => { cancelled += 1; },
  },
  storage: {
    persist: {
      get: async () => null,
      set: async (_key, value) => { persisted = value; },
    },
  },
  clipboard: { write: async () => {} },
  openUrl: async () => {},
  prompt: async () => null,
  showToast: async () => {},
  clearInterval() {},
};

const container = {};
plugin.panel.render(container, context);

for (let attempt = 0; attempt < 40 && latestView?.items?.[0]?.tone !== "danger"; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
assert.equal(latestView.items[0].tone, "danger", "the first real CLI failure must stay visible");

handlers.onAction("restart");
for (
  let attempt = 0;
  attempt < 40 && (latestView?.items?.[0]?.tone !== "success" || !persisted);
  attempt += 1
) {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

assert.equal(started, 2);
assert.equal(latestView.items[0].tone, "success", "restart must clear the previous run error");
assert.equal(latestView.items.find((item) => item.id === "download")?.badge, "104.00 Mbps");
assert.equal(latestView.items.find((item) => item.id === "download")?.detail?.chart?.points?.length, 2);
assert.equal(persisted?.result?.result?.id, "smoke-result");

plugin.panel.destroy(container);
assert.equal(cancelled, 0, "finished jobs must not be cancelled during destroy");
console.log("speedtest smoke: ok");
