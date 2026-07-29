import assert from "node:assert/strict";
import {
  buildFeedUrl,
  normalizeForumName,
  parseForumNames,
  interleavePosts,
  parseFeedHtml,
  parseThreadHtml,
  pruneCache,
} from "../src/qxtieba/index.source.js";
import { multipartBody, parseThreadResponse } from "../src/qxtieba/tieba-protobuf.js";

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
    <div id="post_content_1" class="d_post_content j_d_post_content">主楼正文<br>第二行<img class="BDE_Image" src="//imgsrc.baidu.com/a.jpg"></div>
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
assert.equal(detail.body, "主楼正文\n第二行");
assert.deepEqual(detail.images, ["https://imgsrc.baidu.com/a.jpg"]);
assert.equal(detail.replies.length, 2);
assert.equal(detail.replies[0].floor, 2);
assert.equal(detail.replies[0].body, "有帮助的回复\n\n♥ 3");
assert.equal(detail.replies[1].originalPoster, true);

const owner = concat(fieldVarint(2, 99), fieldText(4, "楼主"));
const visitor = concat(fieldVarint(2, 100), fieldText(4, "吧友"));
const mainContent = concat(fieldText(2, "Protobuf 主楼"), fieldText(25, "https://imgsrc.baidu.com/main.jpg"));
const replyContent = fieldText(2, "Protobuf 楼层");
const nestedContent = fieldText(2, "楼中楼评论");
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
assert.equal(protoDetail.body, "Protobuf 主楼");
assert.deepEqual(protoDetail.images, ["https://imgsrc.baidu.com/main.jpg"]);
assert.equal(protoDetail.replies.length, 1);
assert.equal(protoDetail.replies[0].author, "吧友");
assert.match(protoDetail.replies[0].body, /↳ 楼主：楼中楼评论/);
assert.equal(protoDetail.hasMore, true);
assert.match(Buffer.from(multipartBody(Buffer.from([0, 128, 255]))).toString("latin1"), /name="data"/);

const now = Date.now();
const pruned = pruneCache({
  forumName: "Python",
  posts: [{ id: "old" }, { id: "new" }],
  page: 1,
  hasMore: true,
  savedAt: now,
  details: { old: { body: "old" }, new: { body: "new" } },
  readAt: { old: now - 10 * 24 * 60 * 60 * 1000 },
  cachedAt: { new: now },
}, 7);
assert.deepEqual(pruned.posts.map((post) => post.id), ["new"]);
assert.deepEqual(Object.keys(pruned.details), ["new"]);

console.log(`QxTieba smoke ok: feed=${feed.items.length}, htmlReplies=${detail.replies.length}, protobufReplies=${protoDetail.replies.length}`);
