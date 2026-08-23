#!/usr/bin/env node
import assert from "node:assert/strict";
import plugin from "../src/v2ex/index.js";

const tick = () => new Promise((resolve) => setImmediate(resolve));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function topic(id, title) {
  return {
    id,
    title,
    url: `https://www.v2ex.com/t/${id}`,
    node: "test",
    author: "tester",
    replies: 1,
    created: 1_700_000_000,
    content: `${title} body`,
    last_modified: 1_700_000_000,
  };
}

function reply(id, body) {
  return {
    id,
    content: body,
    author: "reply-user",
    created: 1_700_000_010,
    floor: 1,
  };
}

function createRun({ ageMs, topicLoader, replyLoader }) {
  const persisted = new Map([
    ["v2ex.cache.topics:latest", {
      data: [topic(1, "cached topic")],
      savedAt: Date.now() - ageMs,
    }],
    ["v2ex.cache.replies:1", {
      data: [reply(10, "cached reply")],
      savedAt: Date.now() - ageMs,
    }],
  ]);
  const snapshots = [];
  const invokes = [];
  let handlers;
  const context = {
    locale: { current: "en", onChange: () => () => {} },
    getPreference: async (id) => {
      if (id === "cacheTtlMinutes") return "3";
      if (id === "nodes") return "programmer";
      return "";
    },
    storage: {
      persist: {
        get: async (key) => persisted.get(key) ?? null,
        set: async (key, value) => persisted.set(key, value),
      },
    },
    invoke: async (command, args) => {
      invokes.push({ command, args });
      if (command === "v2ex_fetch_topics") return topicLoader();
      if (command === "v2ex_fetch_topic_replies") return replyLoader();
      return [];
    },
    http: { fetch: async () => { throw new Error("unexpected HTTP fallback"); } },
    ui: {
      mountWorkbench(snapshot, nextHandlers) {
        snapshots.push(snapshot);
        handlers = nextHandlers;
        return { update: (next) => snapshots.push(next) };
      },
    },
    showToast() {},
    openUrl: async () => {},
    clipboard: { write: async () => {} },
  };
  const container = { innerHTML: "", textContent: "" };
  plugin.panel.render(container, context);
  return { container, handlers: () => handlers, invokes, persisted, snapshots };
}

const liveTopics = deferred();
const liveReplies = deferred();
const staleRun = createRun({
  ageMs: 2 * 60 * 60 * 1000,
  topicLoader: () => liveTopics.promise,
  replyLoader: () => liveReplies.promise,
});

assert.equal(staleRun.snapshots[0].loading, true, "first snapshot must be a loading shell");
assert.equal(staleRun.snapshots[0].items.length, 0, "first snapshot must not publish a settled empty result");
assert.equal(staleRun.snapshots[0].cache.key, "topics:latest", "host cache scope must match the current tab");

for (let i = 0; i < 8 && !staleRun.snapshots.some((state) => state.items?.[0]?.title === "cached topic"); i += 1) await tick();
assert.ok(
  staleRun.snapshots.some((state) => state.items?.[0]?.title === "cached topic"),
  "retained topic cache must paint before revalidation finishes",
);
assert.equal(
  staleRun.invokes.filter((call) => call.command === "v2ex_fetch_topics").length,
  1,
  "stale topic cache should start exactly one background revalidation",
);

staleRun.handlers().onSelect("1");
for (let i = 0; i < 8 && !staleRun.snapshots.some((state) => state.items?.[0]?.detail?.replies?.items?.[0]?.body === "cached reply"); i += 1) await tick();
assert.ok(
  staleRun.snapshots.some((state) => state.items?.[0]?.detail?.replies?.items?.[0]?.body === "cached reply"),
  "retained reply cache must paint while reply revalidation runs",
);

liveReplies.resolve([reply(11, "live reply")]);
for (let i = 0; i < 8 && !staleRun.snapshots.some((state) => state.items?.[0]?.detail?.replies?.items?.[0]?.body === "live reply"); i += 1) await tick();
assert.ok(
  staleRun.snapshots.some((state) => state.items?.[0]?.detail?.replies?.items?.[0]?.body === "live reply"),
  "reply revalidation must update the current Workbench",
);

liveTopics.resolve([topic(2, "live topic")]);
for (let i = 0; i < 8 && !staleRun.snapshots.some((state) => state.items?.[0]?.title === "live topic"); i += 1) await tick();
assert.ok(
  staleRun.snapshots.some((state) => state.items?.[0]?.title === "live topic"),
  "topic revalidation must update the current Workbench",
);
assert.equal(staleRun.persisted.get("v2ex.cache.topics:latest").data[0].title, "live topic");
plugin.panel.destroy(staleRun.container);

let freshTopicCalls = 0;
const freshRun = createRun({
  ageMs: 1_000,
  topicLoader: async () => {
    freshTopicCalls += 1;
    return [topic(2, "unexpected live topic")];
  },
  replyLoader: async () => [],
});
for (let i = 0; i < 8 && !freshRun.snapshots.some((state) => state.items?.[0]?.title === "cached topic"); i += 1) await tick();
assert.ok(freshRun.snapshots.some((state) => state.items?.[0]?.title === "cached topic"));
assert.equal(freshTopicCalls, 0, "fresh topic cache must avoid transport entirely");
plugin.panel.destroy(freshRun.container);

console.log("V2EX cache smoke checks passed");
