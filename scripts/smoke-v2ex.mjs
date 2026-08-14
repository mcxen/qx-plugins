import assert from "node:assert/strict";
import plugin, { normalizeV2exReply } from "../src/v2ex/index.js";

const nested = normalizeV2exReply({
  id: 22,
  content: "@alice nested reply",
  author: "bob",
  created: 1_700_000_000,
  floor: 2,
  parent_id: 11,
  depth: 1,
  reply_to_author: "alice",
}, 1);

assert.deepEqual(nested, {
  id: 22,
  content: "@alice nested reply",
  author: "bob",
  created: 1_700_000_000,
  floor: 2,
  parentId: "11",
  depth: 1,
  replyToAuthor: "alice",
});

const root = normalizeV2exReply({
  id: 11,
  content: "root",
  author: "alice",
  floor: 1,
}, 0);
assert.equal(root.parentId, undefined);
assert.equal(root.depth, 0);
assert.equal(root.replyToAuthor, undefined);

const now = Date.now();
const persisted = new Map([
  ["v2ex.cache.topics:latest", {
    savedAt: now,
    data: [{ id: 42, title: "Cache contract", author: "op", node: "qx", replies: 1, content: "topic" }],
  }],
  ["v2ex.cache.replies:42", {
    savedAt: now - 10 * 60_000,
    data: [{ id: 1, author: "cached", floor: 1, content: "cached reply" }],
  }],
]);
const snapshots = [];
const context = {
  locale: { current: "en", onChange() { return () => {}; } },
  async getPreference(id) { return id === "cacheTtlMinutes" ? "3" : ""; },
  storage: { persist: {
    async get(key) { return persisted.get(key); },
    async set(key, value) { persisted.set(key, value); },
  } },
  async invoke(command) {
    if (command === "v2ex_fetch_topic_replies") {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return [{ id: 2, author: "live", floor: 1, content: "live reply" }];
    }
    throw new Error(`unexpected invoke: ${command}`);
  },
  ui: { mountWorkbench(snapshot) {
    snapshots.push(structuredClone(snapshot));
    return { update(next) { snapshots.push(structuredClone(next)); } };
  } },
};
const container = { innerHTML: "", textContent: "" };
await plugin.panel.render(container, context);
await new Promise((resolve) => setTimeout(resolve, 30));

const cachedPaint = snapshots.find((snapshot) => (
  snapshot.island?.secondary === "Loading replies"
  && snapshot.items?.[0]?.detail?.replies?.items?.[0]?.body === "cached reply"
));
assert.ok(cachedPaint, "stale replies must paint immediately while island activity is visible");
assert.equal(cachedPaint.items[0].detail.replies.status, undefined);
const livePaint = snapshots.find((snapshot) => (
  snapshot.island == null
  && snapshot.items?.[0]?.detail?.replies?.items?.[0]?.body === "live reply"
));
assert.ok(livePaint, "live refresh must replace the visible cached replies");
plugin.panel.destroy(container);

console.log("V2EX smoke ok: reply tree + cache repaint + island-only loading");
