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

const waitFor = async (predicate, message) => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(message);
};

function createHarness(seed = new Map(), { failPattern = null } = {}) {
  let snapshot = null;
  let handlers = null;
  let promptCalls = 0;
  let activeFetches = 0;
  let maxActiveFetches = 0;
  const httpCalls = [];
  const toasts = [];
  const storage = seed;
  const context = {
    locale: { current: "en", preference: "en", onChange: () => () => {} },
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
      async fetch(url) {
        const requestUrl = String(url);
        httpCalls.push(requestUrl);
        activeFetches += 1;
        maxActiveFetches = Math.max(maxActiveFetches, activeFetches);
        await new Promise((resolve) => setTimeout(resolve, 0));
        activeFetches -= 1;
        if (failPattern && requestUrl.includes(failPattern)) {
          throw new Error(`mock failure for ${failPattern}`);
        }
        if (requestUrl.includes("api.lolicon.app")) {
          return {
            ok: true,
            status: 200,
            url: requestUrl,
            headers: { "content-type": "application/json" },
            async json() {
              return { data: [{ urls: { original: "https://images.test/lolicon.jpg" } }] };
            },
          };
        }
        const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
        return {
          ok: true,
          status: 200,
          url: requestUrl,
          headers: { "content-type": "image/jpeg" },
          async arrayBuffer() {
            return bytes.buffer;
          },
        };
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
    get httpCalls() {
      return httpCalls;
    },
    get maxActiveFetches() {
      return maxActiveFetches;
    },
  };
}

const harness = createHarness();
await waitFor(
  () => Object.keys(harness.container.__qxpicture.state.imageCache).length === 12
    && harness.container.__qxpicture.state.busy == null,
  "empty-cache first open did not warm every configured API",
);
assert.equal(harness.httpCalls.length, 13, "12 sources include one JSON lookup plus image fetch");
assert.ok(harness.maxActiveFetches <= 3, "batch refresh must keep bounded concurrency");
assert.equal(
  harness.snapshot.actions.some((action) => action.id === "refresh-all"),
  true,
  "browse actions expose Refresh All",
);

const cachedOpen = createHarness(harness.storage);
await waitForAsyncHandlers();
assert.equal(cachedOpen.httpCalls.length, 0, "cached reopen must not fetch automatically");
cachedOpen.handlers.onAction("refresh-all", null);
await waitFor(
  () => cachedOpen.httpCalls.length === 13
    && cachedOpen.container.__qxpicture.state.busy == null,
  "Refresh All action did not update every API",
);
assert.ok(
  cachedOpen.httpCalls.some((url) => url.includes("_qx=")),
  "manual Refresh All must bypass upstream caches",
);

const partialFailure = createHarness(new Map(), { failPattern: "api.paugram.com" });
await waitFor(
  () => partialFailure.container.__qxpicture.state.busy == null
    && Object.keys(partialFailure.container.__qxpicture.state.sourceErrors).length === 1,
  "batch refresh did not retain a per-source failure",
);
assert.equal(
  Object.keys(partialFailure.container.__qxpicture.state.imageCache).length,
  11,
  "one failed API must not abort successful batch entries",
);

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

process.stdout.write("Qxpicture cache warm-up, Refresh All, and API draft smoke tests passed\n");
