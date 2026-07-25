import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const moduleUrl = pathToFileURL(new URL("../src/sysinfo/index.js", import.meta.url).pathname);
moduleUrl.searchParams.set("smoke", String(Date.now()));
const plugin = (await import(moduleUrl.href)).default;

let intervalCallback = null;
let handlers = null;
let latestView = null;
const calls = {
  stats: 0,
  power: 0,
  network: 0,
  counters: 0,
  processes: 0,
};

const context = {
  locale: {
    current: "en",
    onChange: () => () => {},
  },
  ui: {
    mountWorkbench(view, nextHandlers) {
      latestView = view;
      handlers = nextHandlers;
    },
  },
  system: {
    env: async () => ({ platform: "windows", arch: "x64" }),
    info: async () => ({
      hostname: "smoke-host",
      os: "Windows",
      platform: "windows",
      architecture: "x64",
      chip: "Smoke CPU",
      memory: "16 GB",
    }),
    stats: async () => {
      calls.stats += 1;
      return { cpu: 25, memory: 50, memoryUsedGb: 8, memoryTotalGb: 16 };
    },
    power: async () => {
      calls.power += 1;
      return {
        batteryPresent: true,
        batteryLevel: 80,
        isCharging: false,
        fullyCharged: false,
        externalConnected: false,
        source: "Battery",
      };
    },
    storage: async () => ({
      summary: "50% used",
      used: "50 GB",
      free: "50 GB",
      total: "100 GB",
      percentUsed: "50%",
    }),
    network: async () => {
      calls.network += 1;
      return { devices: [{ name: "Ethernet", ip: "192.0.2.1" }] };
    },
    networkCounters: async () => {
      calls.counters += 1;
      return {
        totalBytesIn: 100,
        totalBytesOut: 50,
        interfaces: [{ name: "Ethernet", bytesIn: 100, bytesOut: 50 }],
      };
    },
    processes: {
      list: async () => {
        calls.processes += 1;
        return { processes: [] };
      },
      kill: async () => {},
    },
    openSettings: async () => {},
  },
  setInterval(callback, delay) {
    assert.equal(delay, 5_000);
    intervalCallback = callback;
    return 1;
  },
  prompt: async () => null,
  showToast() {},
};

const container = {};
await plugin.panel.render(container, context);

for (let attempt = 0; attempt < 20 && latestView?.items?.length !== 6; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

assert.equal(latestView.items.length, 6, "initial Hardware snapshot should render all rows");
assert.equal(calls.stats, 1, "CPU and Memory should share the initial stats request");
assert.equal(calls.power, 1);
assert.equal(calls.network, 1);
assert.ok(intervalCallback, "Hardware refresh interval should be registered");

handlers.onSelect("system");
intervalCallback();
for (let attempt = 0; attempt < 20 && calls.power < 2; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

assert.equal(calls.stats, 2, "one live cycle should still share CPU/Memory stats");
assert.equal(calls.power, 2, "Power refreshes even when System is selected");
assert.equal(calls.network, 2, "Network refreshes even when System is selected");
assert.equal(calls.counters, 2, "Network counters refresh in the same cycle");
assert.equal(latestView.selectedId, "system", "background refresh preserves selection");

await plugin.panel.destroy(container);
console.log("sysinfo smoke: ok");
