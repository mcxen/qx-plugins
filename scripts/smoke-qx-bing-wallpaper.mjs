#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const manifest = JSON.parse(
  await readFile(new URL("../src/qx-bing-wallpaper/manifest.json", import.meta.url), "utf8"),
);
const plugin = (await import(
  new URL(`../src/qx-bing-wallpaper/index.js?smoke=${Date.now()}`, import.meta.url)
)).default;

const manifestNames = manifest.commands.map((command) => command.name).sort();
const exportedNames = plugin.commands.map((command) => command.name).sort();
assert.deepEqual(exportedNames, manifestNames, "manifest and runtime commands must match");
assert.deepEqual(
  manifest.commands.filter((command) => command.interval).map((command) => command.name),
  ["daily-wallpaper"],
  "exactly one command should own the daily schedule",
);

const images = [
  {
    startdate: "20260725",
    urlbase: "/th?id=OHR.Latest_EN-US0000000000",
    copyright: "Latest image (© Example)",
  },
  {
    startdate: "20260724",
    urlbase: "/th?id=OHR.Random_EN-US0000000000",
    copyright: "Random image (© Example)",
  },
];

function createContext({ mode = "latest", failArchive = false } = {}) {
  const persisted = new Map();
  const wallpaperPaths = [];
  const invokes = [];
  const toasts = [];
  const workbenchSnapshots = [];
  return {
    persisted,
    wallpaperPaths,
    invokes,
    toasts,
    workbenchSnapshots,
    context: {
      locale: { current: "en", onChange: () => () => {} },
      getPreference: async (id) => (id === "dailyWallpaperMode" ? mode : null),
      http: {
        fetch: async (url) => {
          if (String(url).includes("HPImageArchive")) {
            if (failArchive) return { ok: false, status: 503 };
            return { ok: true, status: 200, json: async () => ({ images }) };
          }
          return {
            ok: true,
            status: 200,
            arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
          };
        },
      },
      storage: {
        persist: {
          get: async (key) => persisted.get(key) ?? null,
          set: async (key, value) => {
            persisted.set(key, value);
          },
        },
      },
      system: {
        env: async () => ({ platform: "macos", homeDir: "/Users/smoke" }),
        setWallpaper: async (path) => {
          wallpaperPaths.push(path);
        },
      },
      qx: {
        invokeRust: async (command, args) => {
          invokes.push({ command, args });
        },
      },
      ui: {
        mountWorkbench: (snapshot) => {
          workbenchSnapshots.push(snapshot);
          return {
            update(nextSnapshot) {
              workbenchSnapshots.push(nextSnapshot);
            },
          };
        },
      },
      showToast: (message) => toasts.push(String(message)),
    },
  };
}

const panelRun = createContext();
const panelContainer = { textContent: "", innerHTML: "" };
plugin.panel.render(panelContainer, panelRun.context);
await new Promise((resolve) => setImmediate(resolve));
await new Promise((resolve) => setImmediate(resolve));
const panelSnapshot = panelRun.workbenchSnapshots.at(-1);
assert.equal(panelSnapshot.layout.kind, "list", "wallpapers must use the Workbench List layout");
assert.ok(panelSnapshot.items.length > 0, "wallpaper list must publish fetched items");
assert.match(
  panelSnapshot.items[0].image.url,
  /_640x360\.jpg$/,
  "Workbench List items must publish thumbnail images",
);
assert.match(
  panelSnapshot.items[0].detail.image.url,
  /_UHD\.jpg$/,
  "Workbench detail must retain the full-resolution image",
);
plugin.panel.destroy(panelContainer);

const daily = plugin.commands.find((command) => command.name === "daily-wallpaper");
assert.ok(daily, "daily command missing");

const latestRun = createContext();
await daily.run(latestRun.context, { launchType: "background" });
assert.equal(latestRun.wallpaperPaths.length, 1, "background run must apply one wallpaper");
assert.equal(latestRun.toasts.length, 0, "background run must stay quiet");
assert.equal(
  latestRun.persisted.get("bing-wallpaper.last-applied.v1")?.mode,
  "latest",
  "default daily mode must use the latest image",
);
assert.ok(
  latestRun.invokes.some((call) => call.command === "plugin_file_write_base64"),
  "wallpaper image must be written through the host file port",
);

const randomRun = createContext({ mode: "random" });
const originalRandom = Math.random;
Math.random = () => 0.75;
try {
  await daily.run(randomRun.context, { launchType: "background" });
} finally {
  Math.random = originalRandom;
}
assert.equal(
  randomRun.persisted.get("bing-wallpaper.last-applied.v1")?.mode,
  "random",
  "daily preference must select random mode",
);

const failedRun = createContext({ failArchive: true });
await assert.rejects(
  () => daily.run(failedRun.context, { launchType: "background" }),
  /Bing HTTP 503/,
  "background failures must reject so the host records an error",
);
assert.equal(
  failedRun.persisted.has("bing-wallpaper.last-applied.v1"),
  false,
  "failed application must not write a false success record",
);

console.log("Qx Bing Wallpaper smoke checks passed");
