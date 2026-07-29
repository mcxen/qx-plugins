import assert from "node:assert/strict";
import {
  buildFeedUrl,
  normalizeForumName,
  parseForumNames,
  interleavePosts,
  parseFeedHtml,
  parseThreadHtml,
  pruneCache,
} from "../src/qxtieba/index.js";

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

console.log(`QxTieba smoke ok: feed=${feed.items.length}, replies=${detail.replies.length}, images=${detail.images.length}`);
