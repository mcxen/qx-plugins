import assert from "node:assert/strict";
import plugin, { heiheHkey } from "../src/qxheihe/index.js";

Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { language: "zh-CN", languages: ["zh-CN"] },
});

const persisted = new Map();
let snapshot = null;
let handlers = null;
let updates = 0;
let openedUrl = "";
const legacyFeedUrl = "https://api.xiaoheihe.cn/bbs/app/feeds?app=heybox&hkey=EXPIRED&_time=1&nonce=EXPIRED&dw=604";

const posts = Array.from({ length: 6 }, (_, index) => ({
  linkid: String(1000 + index),
  title: `Post ${index + 1}`,
  description: `Summary ${index + 1}`,
  create_at: 1_784_804_927 + index,
  comment_num: 2,
  link_award_num: index,
  user: { username: `author-${index + 1}` },
  topics: [{ name: "Games" }],
  imgs: [`https://images.example.test/${index + 1}.jpg`],
  share_url: `https://www.xiaoheihe.cn/app/bbs/link/${1000 + index}`,
}));

function jsonResponse(value) {
  return {
    ok: true,
    status: 200,
    json: async () => value,
  };
}

async function mockFetch(url, options = {}) {
  if (String(url).includes("/bbs/web/link/detail")) {
    const id = new URL(url).searchParams.get("link_id");
    assert.match(String(options.headers?.Referer || ""), /xiaoheihe\.cn\/app\/bbs\/link\//);
    return jsonResponse({
      status: "ok",
      result: {
        link: {
          ...posts.find((post) => post.linkid === id),
          text: JSON.stringify([
            { type: "text", text: `<b>Full body ${id}</b>` },
            { type: "img", url: `https://images.example.test/detail-${id}.jpg` },
          ]),
        },
        topics: [{ name: "Games" }],
      },
    });
  }
  if (String(url).includes("/bbs/web/link/comment/list")) {
    assert.match(String(options.headers?.Cookie || ""), /session=smoke/);
    return jsonResponse({
      status: "ok",
      result: {
        comments: [{
          floor: 1,
          create_at: 1_784_804_999,
          like_num: 3,
          text: "First comment",
          user: { username: "commenter" },
          replies: [{ text: "Reply", user: { username: "reply-user" } }],
        }],
      },
    });
  }
  const feedUrl = new URL(url);
  const timestamp = Number(feedUrl.searchParams.get("_time"));
  const nonce = String(feedUrl.searchParams.get("nonce") || "");
  assert.ok(Math.abs(Math.floor(Date.now() / 1000) - timestamp) <= 2);
  assert.match(nonce, /^[A-F0-9]{32}$/);
  assert.notEqual(nonce, "EXPIRED");
  assert.equal(
    feedUrl.searchParams.get("hkey"),
    heiheHkey(feedUrl.pathname, timestamp, nonce),
  );
  const offset = Number(feedUrl.searchParams.get("offset") || 0);
  return jsonResponse({
    status: "ok",
    result: { links: offset > 0 ? posts.slice(4) : posts.slice(0, 5) },
  });
}

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
    if (id === "feedUrl") return legacyFeedUrl;
    return id === "commentCookie" ? "session=smoke" : "";
  },
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
await waitFor(
  () => snapshot.items[0]?.detail?.sections?.some((section) => /评论区/.test(section.title || "")),
  "initial post detail and comments",
);
const selected = snapshot.items[0];
handlers.onSelect(selected.id);
const detailed = snapshot.items.find((item) => item.id === selected.id);
assert.ok(detailed.detail.body || detailed.detail.images?.length);
assert.ok(detailed.detail.sections.some((section) => /commenter/.test(section.title || "")));
assert.doesNotMatch(detailed.badge, /未读/);
const cache = persisted.get("cache.community.v2");
assert.ok(cache.posts.length >= 5);
assert.ok(cache.readAt[selected.id]);
assert.ok(cache.details[selected.id]);

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

const offlineContext = {
  ...context,
  http: { fetch: async () => { throw new Error("offline"); } },
};
const cachedContainer = { innerHTML: "" };
plugin.panel.render(cachedContainer, offlineContext);
await waitFor(() => snapshot && !snapshot.loading && snapshot.items?.length, "offline cache");
assert.ok(snapshot.items.length >= 5);
plugin.panel.destroy(cachedContainer);

const expiredAt = Date.now() - 8 * 24 * 60 * 60 * 1000;
const expired = persisted.get("cache.community.v2");
expired.savedAt = expiredAt;
expired.cachedAt = Object.fromEntries(expired.posts.map((post) => [String(post.linkid), expiredAt]));
expired.readAt = Object.fromEntries(Object.keys(expired.readAt).map((id) => [id, expiredAt]));
persisted.set("cache.community.v2", expired);
const expiredContainer = { innerHTML: "" };
plugin.panel.render(expiredContainer, offlineContext);
await waitFor(() => snapshot && !snapshot.loading && snapshot.error, "retention cleanup");
assert.equal(snapshot.items.length, 0);
assert.equal(persisted.get("cache.community.v2").posts.length, 0);
plugin.panel.destroy(expiredContainer);

console.log(`QxHeihe smoke ok: updates=${updates}, detailImages=${detailed.detail.images?.length || 0}, comments=true, offlineCache=true, retentionCleanup=true`);
