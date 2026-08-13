import assert from "node:assert/strict";

const moduleUrl = new URL("../src/another-boring-piece/index.js", import.meta.url);
moduleUrl.searchParams.set("smoke", String(Date.now()));
const plugin = (await import(moduleUrl.href)).default;

const art = (id, name = `Artwork ${id}`) => ({
  id,
  name,
  url: `https://images.example.test/${id}.jpg`,
  description: `Description for ${id}`,
  artist: `Artist ${id}`,
  creationDate: "1900",
  websiteUrl: `https://images.example.test/${id}-preview.jpg`,
});

const catalog = { today: art("today", "Daily Painting"), random: [art("one"), art("two")] };
const persisted = new Map();
const files = new Set();
const calls = { catalog: 0, random: 0, image: 0, setWallpaper: 0, saveDownload: 0, notifications: 0 };
let latestView = null;
let handlers = null;
let copied = "";
let opened = "";

const jpegBytes = new Uint8Array(2048).fill(7);
const imageResponse = () => ({
  status: 200,
  ok: true,
  headers: { "content-type": "image/jpeg" },
  arrayBuffer: async () => jpegBytes.buffer.slice(0),
});

const context = {
  locale: { current: "en", onChange: () => () => {} },
  ui: {
    mountWorkbench(view, nextHandlers) {
      latestView = view;
      handlers = nextHandlers;
      return { update(next) { latestView = next; } };
    },
  },
  storage: {
    persist: {
      get: async (key) => persisted.get(key) ?? null,
      set: async (key, value) => { persisted.set(key, structuredClone(value)); },
    },
  },
  http: {
    fetch: async (url) => {
      if (url.includes("raycast-triple")) {
        calls.catalog += 1;
        return { status: 200, ok: true, headers: { "content-type": "application/json" }, json: async () => catalog };
      }
      if (url.includes("random-human")) {
        calls.random += 1;
        return { status: 200, ok: true, headers: { "content-type": "application/json" }, json: async () => art(`random-${calls.random}`) };
      }
      calls.image += 1;
      return imageResponse();
    },
  },
  invoke: async (command, args) => {
    if (command === "plugin_file_exists") return files.has(args.path);
    if (command === "plugin_file_ensure_dir") return null;
    if (command === "plugin_file_write_base64") {
      assert.ok(args.dataBase64.length > 1000);
      files.add(args.path);
      return null;
    }
    throw new Error(`unexpected invoke ${command}`);
  },
  system: {
    setWallpaper: async (path) => {
      assert.match(path, /slot-\d\d\.jpg$/);
      calls.setWallpaper += 1;
    },
    saveDownload: async ({ filename, mimeType, dataBase64 }) => {
      assert.match(filename, /\.jpg$/);
      assert.equal(mimeType, "image/jpeg");
      assert.ok(dataBase64.length > 1000);
      calls.saveDownload += 1;
      return `/Downloads/${filename}`;
    },
  },
  clipboard: { write: async (value) => { copied = value; } },
  openUrl: async (value) => { opened = value; },
  notification: { show: async () => { calls.notifications += 1; } },
  getPreference: async (id) => ({
    applyTo: "every",
    autoSwitchEnabled: false,
    refreshIntervalSeconds: "3600",
    notifyOnSwitch: false,
  })[id],
  prompt: async () => "DELETE",
  showToast() {},
};

const container = { innerHTML: "" };
plugin.panel.render(container, context);
assert.equal(latestView.items.length, 0, "panel must paint synchronously before cache/network work");

for (let attempt = 0; attempt < 30 && latestView.items.length !== 3; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

assert.equal(calls.catalog, 1);
assert.equal(latestView.items.length, 3);
assert.equal(latestView.items[0].title, "Daily Painting");
assert.equal(latestView.items[0].actions.some((action) => action.primary), false, "detail navigation owns Enter");
assert.deepEqual(latestView.items[0].actions.map((action) => action.menuKey), ["w", "s", "c", "o"]);

handlers.onAction("set", { id: "today" });
for (let attempt = 0; attempt < 30 && calls.setWallpaper < 1; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(calls.image, 1);
assert.equal(calls.setWallpaper, 1);
assert.equal(persisted.get("another-boring.history.v1").length, 1);

handlers.onAction("set", { id: "today" });
for (let attempt = 0; attempt < 30 && calls.setWallpaper < 2; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(calls.image, 1, "setting the same artwork should reuse the bounded file cache");

handlers.onAction("copy", { id: "today" });
handlers.onAction("open", { id: "today" });
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(copied, catalog.today.url);
assert.equal(opened, "https://anotherboring.day/art/today");

handlers.onAction("download", { id: "today" });
for (let attempt = 0; attempt < 30 && calls.saveDownload < 1; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(calls.saveDownload, 1);
assert.equal(persisted.get("another-boring.history.v1").length, 3);

handlers.onTab("history");
assert.equal(latestView.items.length, 3);
assert.ok(latestView.items[0].actions.some((action) => action.id === "delete-history"));
handlers.onAction("delete-history", { id: latestView.items[0].id });
for (let attempt = 0; attempt < 30 && latestView.items.length !== 2; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(latestView.items.length, 2);

const beforeRandom = calls.random;
await plugin.commands.find((command) => command.name === "auto-switch-art-wallpaper").run(context, { launchType: "background" });
assert.equal(calls.random, beforeRandom, "disabled automatic rotation must be a no-op");

await plugin.panel.destroy(container);

const storageModule = await import(new URL("../src/another-boring-piece/source/storage.js", import.meta.url));
const ringPersisted = new Map();
const ringFiles = new Set();
const ringContext = {
  storage: { persist: {
    get: async (key) => ringPersisted.get(key) ?? null,
    set: async (key, value) => { ringPersisted.set(key, structuredClone(value)); },
  } },
  http: { fetch: async () => imageResponse() },
  invoke: async (command, args) => {
    if (command === "plugin_file_exists") return ringFiles.has(args.path);
    if (command === "plugin_file_ensure_dir") return null;
    if (command === "plugin_file_write_base64") { ringFiles.add(args.path); return null; }
    throw new Error(`unexpected ring invoke ${command}`);
  },
};
for (let index = 0; index < 21; index += 1) {
  await storageModule.ensureWallpaperFile(ringContext, art(`ring-${index}`));
}
const ringIndex = ringPersisted.get("another-boring.image-index.v1");
assert.equal(ringIndex.entries.length, 20, "wallpaper file index must stay bounded");
assert.equal(ringFiles.size, 20, "wallpaper files must reuse exactly 20 fixed slots");

const serviceModule = await import(new URL("../src/another-boring-piece/source/service.js", import.meta.url));
await assert.rejects(
  () => serviceModule.fetchImageBytes({ http: { fetch: async () => ({
    status: 502,
    ok: true,
    headers: { "content-type": "text/html" },
    arrayBuffer: async () => new Uint8Array(2048).buffer,
  }) } }, art("bad-image")),
  /unexpected_content_type/,
  "HTML error bodies must not be treated as images",
);
console.log("another-boring-piece smoke: ok");
