import assert from "node:assert/strict";
import plugin, { buildRequestHeaders, cleanText, feedUrl } from "../src/qxcoolapk/index.js";

Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { language: "zh-CN", languages: ["zh-CN"] },
});

const persisted = new Map();
let snapshot = null;
let handlers = null;
let openedUrl = "";
const feeds = Array.from({ length: 6 }, (_, index) => ({
  id: String(9000 + index),
  entityType: "feed",
  messageTitle: index === 0 ? "完整文章测试" : "",
  message: `<p>摘要 ${index + 1}</p>`,
  dateline: 1_784_804_927 + index,
  likenum: index + 2,
  replynum: 2,
  picArr: [`http://image.coolapk.com/feed/${index + 1}.jpg`],
  userInfo: { uid: 100 + index, username: `作者-${index + 1}` },
  deviceTitle: "Qx Test Device",
}));

function response(data) {
  return { ok: true, status: 200, json: async () => ({ data }) };
}

function imageResponse() {
  const bytes = Uint8Array.from([
    137, 80, 78, 71, 13, 10, 26, 10,
    0, 0, 0, 13, 73, 72, 68, 82,
    0, 0, 0, 1, 0, 0, 0, 1,
    8, 2, 0, 0, 0, 144, 119, 83, 222,
  ]);
  return {
    ok: true,
    status: 200,
    headers: { "content-type": "image/png" },
    arrayBuffer: async () => bytes.buffer,
  };
}

async function mockFetch(url, options = {}) {
  assert.match(String(options.headers?.["X-App-Token"] || ""), /^v2/);
  assert.equal(options.headers?.["X-App-Id"], "com.coolapk.market");
  if (String(url).includes("image.coolapk.com")) return imageResponse();
  if (String(url).includes("/feed/detail")) {
    const id = new URL(url).searchParams.get("id");
    return response({
      ...feeds.find((feed) => feed.id === id),
      message: `<h2>完整正文 ${id}</h2><p>第二段内容 &amp; 更多文字</p>`,
      readNum: 321,
      picArr: [`http://image.coolapk.com/detail/${id}.jpg`],
    });
  }
  if (String(url).includes("/feed/replyList")) {
    return response([{
      id: "reply-1",
      message: "<p>第一条回复</p>",
      dateline: 1_784_804_999,
      userInfo: { username: "回复用户" },
    }]);
  }
  const page = Number(new URL(url).searchParams.get("page") || 1);
  return response(page > 1 ? feeds.slice(4) : feeds.slice(0, 5));
}

const controller = {
  update(patch) {
    snapshot = { ...(snapshot || {}), ...patch };
  },
  updateItems() {},
  getState() {
    return snapshot;
  },
};

const context = {
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
  getPreference() {
    return "";
  },
  openUrl(url) {
    openedUrl = url;
  },
  showToast() {},
};

async function waitFor(predicate, label, timeoutMs = 20_000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error(`Timed out: ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

assert.equal(cleanText("<p>A &amp; B</p><p>C</p>"), "A & B\n\nC");
assert.equal(new URL(feedUrl("hot", 2)).searchParams.get("page"), "2");
const headers = await buildRequestHeaders(1_784_804_927);
assert.match(headers["X-App-Token"], /^v2/);

const container = { innerHTML: "" };
plugin.panel.render(container, context);
await waitFor(() => snapshot && !snapshot.loading && snapshot.items?.length, "feed");
assert.equal(snapshot.items.length, 5);
assert.ok(snapshot.items.every((item) => item.id && item.detail));
await waitFor(
  () => snapshot.items.some((item) => item.image?.url?.startsWith("data:image/")),
  "authenticated thumbnails",
);
assert.match(snapshot.items[0].image.url, /^data:image\/png;base64,/);
assert.doesNotMatch(snapshot.items[0].image.url, /image\.coolapk\.com/);

const selected = snapshot.items[0];
handlers.onSelect(selected.id);
await waitFor(
  () => snapshot.items.find((item) => item.id === selected.id)?.detail?.body?.includes("完整正文"),
  "full article",
);
const detailed = snapshot.items.find((item) => item.id === selected.id);
assert.match(detailed.detail.body, /完整正文 9000\n\n第二段内容 & 更多文字/);
await waitFor(
  () => snapshot.items.find((item) => item.id === selected.id)?.detail?.images?.[0]?.url?.startsWith("data:image/"),
  "authenticated article images",
);
const detailedWithImage = snapshot.items.find((item) => item.id === selected.id);
assert.equal(detailedWithImage.detail.images.length, 1);
assert.match(detailedWithImage.detail.images[0].url, /^data:image\/png;base64,/);
assert.doesNotMatch(detailedWithImage.detail.images[0].url, /image\.coolapk\.com/);
assert.ok(detailed.detail.sections.some((section) => /第一条回复/.test(section.body || "")));
assert.doesNotMatch(detailed.badge, /未读/);

handlers.onQuery("不存在的关键词");
assert.equal(snapshot.items.length, 0);
handlers.onQuery("");
assert.equal(snapshot.items.length, 5);

handlers.onTab("news");
handlers.onTab("digital");
await waitFor(
  () => snapshot.tabs?.find((tab) => tab.id === "digital")?.active && !snapshot.loading && snapshot.items?.length,
  "rapid tab switch",
);
handlers.onTab("hot");
await waitFor(
  () => snapshot.tabs?.find((tab) => tab.id === "hot")?.active && !snapshot.island && snapshot.items?.length,
  "return to cached hot tab",
);

handlers.onAction("load-more");
await waitFor(() => !snapshot.island, "load more");
assert.equal(snapshot.items.length, 6);

handlers.onAction(`open:${selected.id}`, { id: selected.id });
assert.match(openedUrl, /^https:\/\/www\.coolapk\.com\/feed\//);
assert.ok(persisted.get("cache.community.v1").details[selected.id]);
assert.ok(persisted.get("cache.community.v1").readAt[selected.id]);

plugin.panel.destroy(container);

const stale = persisted.get("cache.community.v1");
stale.feeds.hot.savedAt = Date.now() - 10 * 60 * 1000;
persisted.set("cache.community.v1", stale);
const offlineContext = {
  ...context,
  http: { fetch: async () => { throw new Error("offline"); } },
};
const offlineContainer = { innerHTML: "" };
plugin.panel.render(offlineContainer, offlineContext);
await waitFor(
  () => snapshot && !snapshot.loading && snapshot.items?.length && snapshot.error,
  "offline cache",
);
assert.equal(snapshot.items.length, 6);
plugin.panel.destroy(offlineContainer);

const expiredAt = Date.now() - 8 * 24 * 60 * 60 * 1000;
const expired = persisted.get("cache.community.v1");
expired.feeds.hot.savedAt = expiredAt;
expired.cachedAt = Object.fromEntries(
  expired.feeds.hot.items.map((feed) => [feed.id, expiredAt]),
);
expired.readAt = Object.fromEntries(
  Object.keys(expired.readAt).map((id) => [id, expiredAt]),
);
persisted.set("cache.community.v1", expired);
const expiredContainer = { innerHTML: "" };
plugin.panel.render(expiredContainer, offlineContext);
await waitFor(
  () => snapshot && !snapshot.loading && snapshot.error && snapshot.items?.length === 0,
  "retention cleanup",
);
assert.equal(persisted.get("cache.community.v1").feeds.hot, undefined);
plugin.panel.destroy(expiredContainer);

console.log("QxCoolapk smoke ok: fullArticle=true, images=true, replies=true, offlineCache=true, retentionCleanup=true");
