import assert from "node:assert/strict";
import plugin from "../src/qxheihe/index.js";

Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { language: "zh-CN", languages: ["zh-CN"] },
});

const persisted = new Map();
let snapshot = null;
let handlers = null;
let updates = 0;
let openedUrl = "";

const controller = {
  update(patch) {
    snapshot = { ...(snapshot || {}), ...patch };
    updates += 1;
  },
  updateItems() {},
  getState() {
    return snapshot;
  },
};

const context = {
  http: { fetch: (url, options) => fetch(url, options) },
  storage: {
    persist: {
      get: (key) => persisted.get(key) || null,
      set: (key, value) => persisted.set(key, value),
    },
  },
  ui: {
    mountWorkbench(state, nextHandlers) {
      snapshot = state;
      handlers = nextHandlers;
      return controller;
    },
  },
  getPreference: () => "",
  openUrl(url) {
    openedUrl = url;
  },
  showToast() {},
};

const container = { innerHTML: "" };
plugin.panel.render(container, context);

async function waitFor(predicate, label, timeoutMs = 15_000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error(`Timed out: ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

await waitFor(() => snapshot && !snapshot.loading && snapshot.items?.length, "feed");
assert.ok(snapshot.items.length >= 5);
assert.ok(snapshot.items.every((item) => item.id && item.detail));

const selected = snapshot.items.find((item) => item.detail.images?.length > 1) || snapshot.items[0];
handlers.onSelect(selected.id);
await waitFor(
  () => snapshot.items.find((item) => item.id === selected.id)?.detail?.status?.state !== "loading",
  "post detail",
);
const detailed = snapshot.items.find((item) => item.id === selected.id);
assert.ok(detailed.detail.body || detailed.detail.images?.length);

handlers.onQuery("unlikely-query-with-no-results");
assert.equal(snapshot.items.length, 0);
handlers.onQuery("");
assert.ok(snapshot.items.length >= 5);

const beforeMore = snapshot.items.length;
handlers.onAction("load-more");
await waitFor(() => !snapshot.island, "load more");
assert.ok(snapshot.items.length >= beforeMore);

handlers.onAction(`open:${selected.id}`, { id: selected.id });
assert.match(openedUrl, /^https:\/\/api\.xiaoheihe\.cn\/|^https:\/\/www\.xiaoheihe\.cn\//);

plugin.panel.destroy(container);
assert.ok(updates >= 5);
console.log(`QxHeihe smoke ok: items=${snapshot.items.length}, updates=${updates}, detailImages=${detailed.detail.images?.length || 0}`);
