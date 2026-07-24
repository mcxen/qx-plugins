#!/usr/bin/env node
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { language: "en-US" },
});

const entryUrl = process.argv[2]
  ? pathToFileURL(process.argv[2])
  : new URL("../src/qxpicture/index.js", import.meta.url);
entryUrl.searchParams.set("smoke", String(Date.now()));
const { default: plugin } = await import(entryUrl);

const waitForAsyncHandlers = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

function createHarness(seed = new Map()) {
  let snapshot = null;
  let handlers = null;
  let promptCalls = 0;
  const toasts = [];
  const storage = seed;
  const context = {
    ui: {
      mountWorkbench(nextSnapshot, nextHandlers) {
        snapshot = nextSnapshot;
        handlers = nextHandlers;
        return {
          update(updated) {
            snapshot = updated;
          },
        };
      },
    },
    storage: {
      persist: {
        async get(key) {
          return storage.has(key) ? structuredClone(storage.get(key)) : null;
        },
        async set(key, value) {
          storage.set(key, structuredClone(value));
        },
      },
    },
    http: {
      async fetch() {
        throw new Error("network is not used by the API configuration smoke test");
      },
    },
    system: {
      async env() {
        return { platform: "macos", homeDir: "/tmp", dirSep: "/" };
      },
      async setWallpaper() {},
    },
    qx: { async invokeRust() {} },
    async prompt() {
      promptCalls += 1;
      throw new Error("API creation must not use prompt()");
    },
    showToast(message) {
      toasts.push(String(message));
    },
  };
  const container = { textContent: "", innerHTML: "" };
  plugin.panel.render(container, context);
  return {
    container,
    context,
    storage,
    toasts,
    get snapshot() {
      return snapshot;
    },
    get handlers() {
      return handlers;
    },
    get promptCalls() {
      return promptCalls;
    },
  };
}

const harness = createHarness();
await waitForAsyncHandlers();
harness.handlers.onTab("settings");
harness.handlers.onAction("add-source", null);
await waitForAsyncHandlers();

assert.equal(harness.snapshot.selectedId, "__new_source__");
assert.equal(harness.snapshot.items.some((item) => item.id === "__new_source__"), true);
assert.equal(harness.container.__qxpicture.state.sourceDraft.url, "https://");

const draftItem = { id: "__new_source__" };
harness.handlers.onInput("settings:source:name", "My JSON API", draftItem);
harness.handlers.onInput("settings:source:url", "https://example.test/image", draftItem);
harness.handlers.onInput("settings:source:type", "json", draftItem);
harness.handlers.onInput("settings:source:method", "POST", draftItem);
harness.handlers.onInput("settings:source:jsonPath", "payload.image", draftItem);
await waitForAsyncHandlers();
harness.handlers.onAction("save-source-draft", draftItem);
await waitForAsyncHandlers();

const saved = harness.storage.get("qxpicture.config.v1");
const custom = saved.sources.find((source) => source.name === "My JSON API");
assert.ok(custom, "validated draft should be persisted");
assert.equal(custom.url, "https://example.test/image");
assert.equal(custom.type, "json");
assert.equal(custom.method, "POST");
assert.equal(custom.jsonPath, "payload.image");
assert.equal(harness.promptCalls, 0);

const reloaded = createHarness(harness.storage);
await waitForAsyncHandlers();
assert.equal(
  reloaded.container.__qxpicture.state.config.sources.some(
    (source) => source.name === "My JSON API",
  ),
  true,
  "saved API should survive panel recreation",
);

reloaded.handlers.onTab("settings");
reloaded.handlers.onAction("add-source", null);
await waitForAsyncHandlers();
const invalidDraft = { id: "__new_source__" };
reloaded.handlers.onInput("settings:source:name", "Invalid API", invalidDraft);
await waitForAsyncHandlers();
const countBeforeInvalidSave = reloaded.container.__qxpicture.state.config.sources.length;
reloaded.handlers.onAction("save-source-draft", invalidDraft);
await waitForAsyncHandlers();
assert.equal(
  reloaded.container.__qxpicture.state.config.sources.length,
  countBeforeInvalidSave,
  "invalid draft must not mutate persisted sources",
);
assert.ok(reloaded.container.__qxpicture.state.sourceDraft, "invalid draft remains editable");
assert.match(reloaded.container.__qxpicture.state.error || "", /valid HTTP or HTTPS URL/i);

process.stdout.write("Qxpicture API draft smoke test passed\n");
