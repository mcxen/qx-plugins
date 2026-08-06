import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { createPluginStateKit } from "./plugin-state-kit.mjs";
import plugin from "../src/qxtieba/index.source.js";
import {
  buildFeedUrl,
  normalizeForumName,
  parseForumNames,
  interleavePosts,
  parseFeedHtml,
  parseThreadHtml,
  pruneCache,
} from "../src/qxtieba/index.source.js";
import {
  decodeThreadResponse,
  multipartBody,
  parseThreadResponse,
  tiebaEmotionContent,
} from "../src/qxtieba/tieba-protobuf.js";

function concat(...parts) {
  return Buffer.concat(parts.map((part) => Buffer.from(part)));
}

function varint(value) {
  let current = BigInt(value);
  const bytes = [];
  while (current > 0x7fn) {
    bytes.push(Number(current & 0x7fn) | 0x80);
    current >>= 7n;
  }
  bytes.push(Number(current));
  return Buffer.from(bytes);
}

function fieldVarint(field, value) {
  return concat(varint((field << 3) | 0), varint(value));
}

function fieldBytes(field, value) {
  const bytes = Buffer.from(value);
  return concat(varint((field << 3) | 2), varint(bytes.length), bytes);
}

function fieldText(field, value) {
  return fieldBytes(field, Buffer.from(value, "utf8"));
}

assert.equal(normalizeForumName(" Python吧 "), "Python");
assert.equal(normalizeForumName("原神吧吧"), "原神吧");
assert.deepEqual(parseForumNames("图拉丁吧, 笔记本吧\n图拉丁吧"), ["图拉丁", "笔记本"]);
assert.deepEqual(parseForumNames(""), ["图拉丁", "笔记本"]);
assert.deepEqual(
  interleavePosts([
    [{ id: "a1" }, { id: "a2" }],
    [{ id: "b1" }, { id: "a2" }, { id: "b2" }],
  ]).map((post) => post.id),
  ["a1", "b1", "a2", "b2"],
);
assert.equal(buildFeedUrl("Python吧", 2), "https://tieba.baidu.com/mo/q/forum?kw=Python&page=2");
assert.equal(buildFeedUrl("Python", 2, true), "https://tieba.baidu.com/f?kw=Python&ie=utf-8&pn=50");

const feedHtml = `
  <ul>
    <li class="tl_shadow tl_shadow_new " data-tid="123456789">
      <a href="/p/123456789" class="j_common ti_item">
        <div class="ti_title"><span>如何学习 Python &amp; Rust</span></div>
        <span class="ti_author">测试用户</span>
        <span class="ti_time">07-29</span>
        <span class="btn_icon">42</span>
      </a>
    </li>
  </ul>
  <div class="pageBottom">下一页</div>
`;
const feed = parseFeedHtml(feedHtml, "Python吧", 1);
assert.equal(feed.items.length, 1);
assert.deepEqual(feed.items[0], {
  id: "123456789",
  title: "如何学习 Python & Rust",
  summary: "如何学习 Python & Rust",
  author: "测试用户",
  publishedAt: "07-29",
  replyCount: 42,
  forumName: "Python",
  url: "https://tieba.baidu.com/p/123456789",
  rank: 1,
});
assert.equal(feed.hasMore, true);

const threadHtml = `
  <h3 class="core_title_txt" title="如何学习 Python &amp; Rust">fallback</h3>
  <div class="l_post j_l_post" data-field="{&quot;author&quot;:{&quot;user_name&quot;:&quot;楼主&quot;},&quot;content&quot;:{&quot;post_id&quot;:1,&quot;post_no&quot;:1,&quot;date&quot;:&quot;2026-07-29 10:00&quot;}}">
    <div id="post_content_1" class="d_post_content j_d_post_content">主楼正文<img class="BDE_Smiley" src="/static/image_emoticon8.png"><br>第二行<img class="BDE_Image" src="//imgsrc.baidu.com/a.jpg"></div>
  </div>
  <div class="l_post j_l_post" data-field="{&quot;author&quot;:{&quot;user_name&quot;:&quot;回复者&quot;},&quot;content&quot;:{&quot;post_id&quot;:2,&quot;post_no&quot;:2,&quot;date&quot;:&quot;2026-07-29 10:05&quot;,&quot;agree_num&quot;:3}}">
    <div id="post_content_2" class="d_post_content j_d_post_content">有帮助的回复</div>
  </div>
  <div class="l_post j_l_post" data-field="{&quot;author&quot;:{&quot;user_name&quot;:&quot;楼主&quot;},&quot;content&quot;:{&quot;post_id&quot;:3,&quot;post_no&quot;:3,&quot;date&quot;:&quot;2026-07-29 10:10&quot;}}">
    <div id="post_content_3" class="d_post_content j_d_post_content">楼主补充</div>
  </div>
`;
const detail = parseThreadHtml(threadHtml, feed.items[0]);
assert.equal(detail.title, "如何学习 Python & Rust");
assert.equal(detail.body, "主楼正文image_emoticon8\n第二行");
assert.deepEqual(detail.content, [
  { type: "text", text: "主楼正文" },
  { type: "asset-image", assetPath: "assets/emotions/image_emoticon8.png", alt: "image_emoticon8" },
  { type: "text", text: "\n第二行" },
]);
assert.deepEqual(detail.images, ["https://imgsrc.baidu.com/a.jpg"]);
assert.equal(detail.replies.length, 2);
assert.equal(detail.replies[0].floor, 2);
assert.equal(detail.replies[0].body, "有帮助的回复");
assert.equal(detail.replies[1].originalPoster, true);

const owner = concat(fieldVarint(2, 99), fieldText(4, "楼主"));
const visitor = concat(fieldVarint(2, 100), fieldText(4, "吧友"));
const mainContent = concat(fieldText(2, "Protobuf 主楼image_emoticon12"), fieldText(25, "https://imgsrc.baidu.com/main.jpg"));
const replyContent = fieldText(2, "Protobuf 楼层image_emoticon8继续");
const nestedContent = fieldText(2, "楼中楼评论image_emoticon124");
const nestedComment = concat(
  fieldVarint(1, 3001),
  fieldBytes(2, nestedContent),
  fieldVarint(3, 1_700_000_200),
  fieldVarint(4, 99),
  fieldBytes(7, owner),
);
const nestedWrapper = fieldBytes(2, nestedComment);
const mainPost = concat(
  fieldVarint(1, 1001),
  fieldVarint(3, 1),
  fieldVarint(4, 1_700_000_000),
  fieldBytes(5, mainContent),
  fieldVarint(19, 99),
  fieldBytes(23, owner),
);
const replyPost = concat(
  fieldVarint(1, 1002),
  fieldVarint(3, 2),
  fieldVarint(4, 1_700_000_100),
  fieldBytes(5, replyContent),
  fieldBytes(37, fieldVarint(1, 7)),
  fieldBytes(15, nestedWrapper),
  fieldVarint(19, 100),
  fieldBytes(23, visitor),
);
const thread = concat(
  fieldVarint(1, 123456789),
  fieldText(3, "Protobuf 帖子"),
  fieldVarint(4, 2),
  fieldBytes(18, owner),
  fieldVarint(45, 1_700_000_000),
  fieldVarint(56, 99),
);
const page = fieldVarint(6, 1);
const responseData = concat(
  fieldBytes(3, page),
  fieldBytes(6, mainPost),
  fieldBytes(6, replyPost),
  fieldBytes(8, thread),
  fieldBytes(13, owner),
  fieldBytes(13, visitor),
);
const protoDetail = parseThreadResponse(fieldBytes(2, responseData), { id: "123456789" });
assert.equal(protoDetail.title, "Protobuf 帖子");
assert.equal(protoDetail.body, "Protobuf 主楼image_emoticon12");
assert.deepEqual(protoDetail.content, [
  { type: "text", text: "Protobuf 主楼" },
  { type: "asset-image", assetPath: "assets/emotions/image_emoticon12.png", alt: "image_emoticon12" },
]);
assert.deepEqual(protoDetail.images, ["https://imgsrc.baidu.com/main.jpg"]);
assert.equal(protoDetail.replies.length, 1);
assert.equal(protoDetail.replies[0].author, "吧友");
assert.equal(protoDetail.replies[0].likeCount, 7);
assert.match(protoDetail.replies[0].body, /↳ 楼主：楼中楼评论/);
assert.doesNotMatch(protoDetail.replies[0].body, /♥ 7/);
assert.deepEqual(protoDetail.replies[0].content, [
  { type: "text", text: "Protobuf 楼层" },
  { type: "asset-image", assetPath: "assets/emotions/image_emoticon8.png", alt: "image_emoticon8" },
  { type: "text", text: "继续\n\n↳ 楼主：楼中楼评论" },
  { type: "asset-image", assetPath: "assets/emotions/image_emoticon124.png", alt: "image_emoticon124" },
]);
assert.equal(tiebaEmotionContent("保留 image_emoticon55"), undefined);
assert.equal(protoDetail.hasMore, true);
const compressedResponse = {
  headers: { "content-encoding": "gzip", "content-type": "application/octet-stream" },
  async arrayBuffer() {
    return gzipSync(fieldBytes(2, responseData));
  },
};
const compressedDetail = await decodeThreadResponse(compressedResponse, { id: "123456789" });
assert.equal(compressedDetail.title, "Protobuf 帖子");
const transparentlyDecodedDetail = await decodeThreadResponse({
  headers: { "content-encoding": "gzip", "content-type": "application/octet-stream" },
  async arrayBuffer() { return fieldBytes(2, responseData); },
}, { id: "123456789" });
assert.equal(transparentlyDecodedDetail.title, "Protobuf 帖子");
await assert.rejects(
  decodeThreadResponse({
    headers: { "content-type": "text/html" },
    async arrayBuffer() { return Buffer.from("<html>verify</html>"); },
  }),
  /HTML verification page/,
);
assert.match(Buffer.from(multipartBody(Buffer.from([0, 128, 255]))).toString("latin1"), /name="data"/);

const now = Date.now();
const pruned = pruneCache({
  forumName: "Python",
  posts: [{ id: "old" }, { id: "new" }],
  page: 1,
  hasMore: true,
  savedAt: now,
  details: { old: { body: "old" }, new: { body: "new" } },
  readAt: {
    old: now - 10 * 24 * 60 * 60 * 1000,
    orphan: now,
  },
  cachedAt: { new: now },
}, 7);
assert.deepEqual(pruned.posts.map((post) => post.id), ["new"]);
assert.deepEqual(Object.keys(pruned.details), ["new"]);
assert.equal(pruned.readAt.orphan, now, "recent read ids survive feed rotation");

const panelPosts = [{
  ...feed.items[0],
  id: "panel-1",
  title: "缓存帖子一",
}, {
  ...feed.items[0],
  id: "panel-2",
  title: "缓存帖子二",
}];
const persisted = new Map([["cache.community.v1", {
  forumName: "__mixed__",
  posts: panelPosts,
  page: 1,
  hasMore: true,
  savedAt: now,
  details: Object.fromEntries(panelPosts.map((post) => [post.id, {
    title: post.title,
    body: post.summary,
    replies: [],
    complete: true,
    savedAt: now,
  }])),
  readAt: {},
  cachedAt: Object.fromEntries(panelPosts.map((post) => [post.id, now])),
}]]);
let snapshot = null;
let handlers = null;
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
  http: { fetch: async () => { throw new Error("fresh cache must not fetch"); } },
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
    return id === "forumName" ? "Python吧" : "";
  },
  openUrl() {},
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
await waitFor(() => snapshot && !snapshot.loading && snapshot.items?.length === 2, "cached panel");
assert.equal(snapshot.items[0].tone, "neutral", "visible default detail must be read");
assert.equal(snapshot.items[0].detail.status, undefined);
assert.equal(snapshot.items[0].detail.replies.status, undefined);
const reopenTarget = snapshot.items[1];
handlers.onSelect(reopenTarget.id);
await waitFor(
  () => persisted.get("cache.community.v1")?.readAt?.[reopenTarget.id],
  "persist read state before close",
);
plugin.panel.destroy(container);

const reopenedContainer = { innerHTML: "" };
plugin.panel.render(reopenedContainer, context);
await waitFor(() => snapshot && !snapshot.loading && snapshot.items?.length === 2, "cached reopen");
assert.equal(
  snapshot.items.find((item) => item.id === reopenTarget.id)?.tone,
  "neutral",
  "read state must survive panel reopen",
);
plugin.panel.destroy(reopenedContainer);

console.log(`QxTieba smoke ok: feed=${feed.items.length}, htmlReplies=${detail.replies.length}, protobufReplies=${protoDetail.replies.length}, readReopen=true`);
