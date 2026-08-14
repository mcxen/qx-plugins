import assert from "node:assert/strict";
import plugin, { fetchComments } from "../src/hacker-news/index.js";

const records = new Map([
  [10, { id: 10, type: "comment", by: "alice", text: "root", time: 1, kids: [11] }],
  [11, { id: 11, type: "comment", by: "bob", text: "child", time: 2, kids: [] }],
]);
const context = {
  http: {
    async fetch(url) {
      const id = Number(String(url).match(/item\/(\d+)\.json/)?.[1]);
      return { ok: true, async text() { return JSON.stringify(records.get(id)); } };
    },
  },
};

const comments = await fetchComments(context, { by: "op", kids: [10] });
assert.equal(comments.length, 2);
assert.equal(comments[0].depth, 0);
assert.equal(comments[1].parentId, "10");
assert.equal(comments[1].depth, 1);
assert.equal(comments[1].replyToAuthor, "alice");

const now = Date.now();
const persisted = new Map([
  ["hacker-news.stories.v1", {
    savedAt: now,
    stories: [{
      id: 42, type: "story", title: "Cache contract", by: "op", score: 1,
      time: 1_700_000_000, descendants: 1, kids: [10],
    }],
  }],
  ["hacker-news.comments.v1.42", {
    savedAt: now - 10 * 60_000,
    items: [{ id: "old", author: "cached", body: "cached comment", depth: 0 }],
  }],
]);
const snapshots = [];
const panelContext = {
  locale: { current: "en", onChange() { return () => {}; } },
  async getPreference(id) { return id === "cacheTtlMinutes" ? "5" : "30"; },
  storage: { persist: {
    async get(key) { return persisted.get(key); },
    async set(key, value) { persisted.set(key, value); },
  } },
  http: {
    async fetch(url) {
      const id = Number(String(url).match(/item\/(\d+)\.json/)?.[1]);
      await new Promise((resolve) => setTimeout(resolve, 5));
      return {
        ok: true,
        async text() {
          return JSON.stringify({ id, type: "comment", by: "live", text: "live comment", time: 1, kids: [] });
        },
      };
    },
  },
  ui: { mountWorkbench(snapshot) {
    snapshots.push(structuredClone(snapshot));
    return { update(next) { snapshots.push(structuredClone(next)); } };
  } },
};
const container = { innerHTML: "", textContent: "" };
plugin.panel.render(container, panelContext);
await new Promise((resolve) => setTimeout(resolve, 30));

const cachedPaint = snapshots.find((snapshot) => (
  snapshot.island?.secondary === "Loading comments"
  && snapshot.items?.[0]?.detail?.replies?.items?.[0]?.body === "cached comment"
));
assert.ok(cachedPaint, "stale comments must paint immediately while island activity is visible");
assert.equal(cachedPaint.items[0].detail.replies.status, undefined);
const livePaint = snapshots.find((snapshot) => (
  snapshot.island == null
  && snapshot.items?.[0]?.detail?.replies?.items?.[0]?.body === "live comment"
));
assert.ok(livePaint, "live refresh must replace the visible cached comments");
plugin.panel.destroy(container);

console.log("Hacker News smoke ok: reply tree + cache repaint + island-only loading");
