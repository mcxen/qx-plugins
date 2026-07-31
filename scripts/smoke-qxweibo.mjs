import assert from "node:assert/strict";
import plugin from "../src/qxweibo/index.js";
import { createPluginStateKit } from "./plugin-state-kit.mjs";

Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { language: "zh-CN", languages: ["zh-CN"] },
});

const persisted = new Map();
let snapshot = null;
let handlers = null;
let openedUrl = "";
let visitorRequests = 0;
let imageRequests = 0;
let activeImageRequests = 0;
let maxConcurrentImageRequests = 0;

const users = {
  "10001": { id: 10001, screen_name: "主用户" },
  "10002": { id: 10002, screen_name: "关注甲" },
  "10003": { id: 10003, screen_name: "关注乙" },
};

function post(uid, suffix) {
  const imageCount = uid === "10001" ? 12 : 3;
  return {
    id: `${uid}${suffix}`,
    text: `<p>微博正文 ${uid}-${suffix}</p>`,
    source: "Qx Test",
    created_at: "Fri Jul 24 12:00:00 +0800 2026",
    user: users[uid],
    comments_count: 2,
    attitudes_count: 8,
    reposts_count: 1,
    pics: Array.from({ length: imageCount }, (_, index) => ({
      url: `https://wx.example.test/thumb/${uid}${suffix}-${index + 1}.jpg`,
      large: { url: `https://wx.example.test/large/${uid}${suffix}-${index + 1}.jpg` },
    })),
  };
}

function jsonResponse(value) {
  return {
    ok: true,
    status: 200,
    headers: { "content-type": "application/json" },
    json: async () => value,
    text: async () => JSON.stringify(value),
  };
}

async function mockFetch(url, options = {}) {
  const value = String(url);
  if (value.includes("visitor/genvisitor2")) {
    visitorRequests += 1;
    return {
      ...jsonResponse({}),
      text: async () => `visitor_callback({"data":{"sub":"guest-${visitorRequests}","subp":"pool"}})`,
    };
  }
  assert.match(String(options.headers?.Cookie || ""), /SUB=/);
  if (value.includes("wx.example.test")) {
    imageRequests += 1;
    activeImageRequests += 1;
    maxConcurrentImageRequests = Math.max(maxConcurrentImageRequests, activeImageRequests);
    try {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return {
        ok: true,
        status: 200,
        headers: { "content-type": "image/png" },
        arrayBuffer: async () => Uint8Array.from([137, 80, 78, 71]).buffer,
      };
    } finally {
      activeImageRequests -= 1;
    }
  }
  if (value.includes("/api/comments/show")) {
    return jsonResponse({
      ok: 1,
      data: {
        data: [{
          id: "comment-1",
          text: "<b>第一条评论</b>",
          created_at: "Fri Jul 24 12:10:00 +0800 2026",
          floor_number: 7,
          user: users["10001"],
          like_counts: 3,
          reply_text: "回复关系",
        }],
      },
    });
  }
  if (value.includes("/statuses/show")) {
    const id = new URL(value).searchParams.get("id");
    const uid = id.slice(0, 5);
    return jsonResponse({ ok: 1, data: { ...post(uid, id.slice(5)), text: `<p>完整微博 ${id}</p>` } });
  }
  const parsed = new URL(value);
  const containerId = parsed.searchParams.get("containerid") || "";
  if (containerId.includes("_followers_")) {
    return jsonResponse({
      ok: 1,
      data: {
        cards: [{
          card_group: [{ user: users["10002"] }, { user: users["10003"] }],
        }],
      },
    });
  }
  const uid = parsed.searchParams.get("value");
  return jsonResponse({
    ok: 1,
    data: { cards: [{ card_type: 9, mblog: post(uid, "01") }] },
  });
}

const controller = {
  update(patch) {
    snapshot = { ...(snapshot || {}), ...patch };
  },
  getState() {
    return snapshot;
  },
};

const context = {
  state: createPluginStateKit(),
  locale: { current: "zh-CN", preference: "zh-CN", onChange: () => () => {} },
  http: { fetch: mockFetch },
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
  getPreference(id) {
    const values = {
      userId: "10001",
      followedUserIds: "",
      visitorCookies: "SUB=configured; SUBP=pool",
      visitorPoolSize: "2",
      followingUserLimit: 3,
      requestDelayMs: "0-0",
      cacheTtlMinutes: "10",
      retentionDays: "7",
      detailImageLayout: "horizontal",
    };
    return values[id] ?? "";
  },
  openUrl(url) {
    openedUrl = url;
  },
  showToast() {},
};

async function waitFor(predicate, label, timeoutMs = 10_000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error(`Timed out: ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
}

const container = { innerHTML: "" };
plugin.panel.render(container, context);
await waitFor(() => snapshot && !snapshot.loading && snapshot.items?.length, "user feed");
assert.equal(snapshot.items.length, 1);
assert.equal(snapshot.items[0].id, "1000101");
assert.equal(snapshot.items[0].tone, "neutral");
assert.doesNotMatch(snapshot.items[0].badge, /已读|未读|\b(?:Read|Unread)\b/i);
assert.ok(snapshot.items[0].detail);
await waitFor(
  () => snapshot.items[0].detail.replies?.items?.some((reply) => /第一条评论/.test(reply.body)),
  "comments",
);
assert.equal(snapshot.items[0].detail.sections, undefined);
assert.equal(snapshot.items[0].detail.replies.total, 2);
assert.equal(snapshot.items[0].detail.replies.items[0].floor, 7);
assert.equal(snapshot.items[0].detail.replies.items[0].author, "主用户");
assert.equal(snapshot.items[0].detail.replies.items[0].likeCount, 3);
assert.equal(snapshot.items[0].detail.replies.items[0].originalPoster, true);
assert.match(snapshot.items[0].detail.replies.items[0].body, /回复：回复关系/);
await waitFor(
  () => snapshot.items[0].detail.images?.length === 12 && !snapshot.island,
  "complete concurrent image group",
);
assert.equal(snapshot.items[0].detail.status, undefined);
assert.equal(snapshot.items[0].detail.replies.status, undefined);
assert.equal(snapshot.items[0].detail.images.length, 12);
assert.match(snapshot.items[0].detail.images[0].url, /^data:image\/png;base64,/);
assert.equal(visitorRequests, 1);
assert.ok(imageRequests >= 12);
assert.ok(maxConcurrentImageRequests >= 2);
assert.ok(maxConcurrentImageRequests <= 4);
const selectedImageConcurrency = maxConcurrentImageRequests;

handlers.onTab("following");
await waitFor(() => snapshot.tabs.find((tab) => tab.id === "following")?.active && !snapshot.loading, "following feed");
assert.equal(snapshot.items.length, 2);
assert.deepEqual(new Set(snapshot.items.map((item) => item.id)), new Set(["1000201", "1000301"]));

const selected = snapshot.items[0];
handlers.onSelect(selected.id);
assert.equal(snapshot.items.find((item) => item.id === selected.id).tone, "neutral");
assert.ok(persisted.get("cache.weibo.v1").readAt[selected.id]);
const reopenTarget = snapshot.items.find((item) => item.id !== selected.id);
handlers.onSelect(reopenTarget.id);
await waitFor(
  () => persisted.get("cache.weibo.v1")?.readAt?.[reopenTarget.id],
  "persist read state before close",
);
handlers.onAction(`open:${selected.id}`, selected);
assert.equal(openedUrl, `https://m.weibo.cn/detail/${selected.id}`);

plugin.panel.destroy(container);
assert.ok(persisted.get("cache.weibo.v1").feeds.following.items.length === 2);
const reopenedContainer = { innerHTML: "" };
plugin.panel.render(reopenedContainer, context);
await waitFor(() => snapshot && !snapshot.loading && snapshot.items?.length, "reopened user feed");
handlers.onTab("following");
await waitFor(
  () => snapshot.tabs.find((tab) => tab.id === "following")?.active && snapshot.items?.length === 2,
  "reopened following feed",
);
assert.equal(
  snapshot.items.find((item) => item.id === reopenTarget.id)?.tone,
  "neutral",
  "read state must survive panel reopen",
);
plugin.panel.destroy(reopenedContainer);
console.log(`QxWeibo smoke ok: posts=3, comments=true, images=12, imageConcurrency=${selectedImageConcurrency}, visitorPool=${visitorRequests + 1}`);
