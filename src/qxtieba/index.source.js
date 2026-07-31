/**
 * QxTieba — configurable Baidu Tieba community Workbench plugin.
 *
 * Runtime requests use only anonymous public web pages. Feed and detail data
 * are cached stale-while-revalidate so a Tieba verification response never
 * replaces usable local content.
 */

import { fetchTiebaThreadDetail, tiebaEmotionContent } from "./tieba-protobuf.js";

const BASE_URL = "https://tieba.baidu.com";
const CACHE_KEY = "cache.community.v1";
const DEFAULT_FORUMS = ["图拉丁", "笔记本"];
const DEFAULT_FORUM = DEFAULT_FORUMS[0];
const DEFAULT_FORUM_PREFERENCE = "图拉丁吧, 笔记本吧";
const MIXED_FORUM = "__mixed__";
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const DETAIL_TTL_MS = 10 * 60 * 1000;
const MAX_READ_HISTORY = 5_000;
const WEB_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 QxTieba/1.0";

let qxLocale = "en";
let stopLocale = null;

function setLocale(context) {
  stopLocale?.();
  qxLocale = context?.locale?.current || "en";
  stopLocale = context?.locale?.onChange?.(({ current }) => {
    qxLocale = current || "en";
  }) || null;
}

function isChinese() {
  return qxLocale === "zh-CN";
}

function copy(en, zh) {
  return isChinese() ? zh : en;
}

function errorMessage(error) {
  return String(error?.message || error || copy("Unknown error", "未知错误"));
}

function decodeHtml(value) {
  const text = String(value || "");
  if (typeof document !== "undefined") {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = text;
    return textarea.value;
  }
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function cleanText(value) {
  return decodeHtml(String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|section|article|h[1-6]|blockquote|li)>/gi, "\n\n")
    .replace(/<img[^>]+(?:alt|title)=(?:"([^"]*)"|'([^']*)')[^>]*>/gi, (_, a, b) => a || b || "")
    .replace(/<[^>]+>/g, ""))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalizeForumName(value) {
  const normalized = cleanText(value).replace(/[\s　]+/g, " ").trim();
  return normalized.replace(/吧$/u, "").trim() || DEFAULT_FORUM;
}

function parseForumNames(value) {
  const seen = new Set();
  const names = String(value || "")
    .split(/[,，;；\n]+/)
    .map((name) => cleanText(name).trim())
    .filter(Boolean)
    .map(normalizeForumName)
    .filter((name) => {
      if (!name || seen.has(name)) return false;
      seen.add(name);
      return true;
    });
  return names.length ? names : [...DEFAULT_FORUMS];
}

function absoluteTiebaUrl(value) {
  const text = decodeHtml(value).trim();
  if (!text) return "";
  if (text.startsWith("//")) return `https:${text}`;
  if (text.startsWith("http://")) return `https://${text.slice("http://".length)}`;
  if (/^https:\/\//i.test(text)) return text;
  return `${BASE_URL}/${text.replace(/^\/+/, "")}`;
}

function threadUrl(tid) {
  return `${BASE_URL}/p/${encodeURIComponent(String(tid || ""))}`;
}

function buildFeedUrl(forumName, page = 1, desktop = false) {
  const name = normalizeForumName(forumName);
  const safePage = Math.max(1, Math.floor(Number(page) || 1));
  if (desktop) {
    return `${BASE_URL}/f?kw=${encodeURIComponent(name)}&ie=utf-8&pn=${(safePage - 1) * 50}`;
  }
  return `${BASE_URL}/mo/q/forum?kw=${encodeURIComponent(name)}&page=${safePage}`;
}

function extract(pattern, text, group = 1) {
  const match = pattern.exec(String(text || ""));
  pattern.lastIndex = 0;
  return match?.[group] || "";
}

function parseDataField(tag) {
  const encoded = extract(/\bdata-field=(?:"([\s\S]*?)"|'([\s\S]*?)')/i, tag, 1)
    || extract(/\bdata-field=(?:"([\s\S]*?)"|'([\s\S]*?)')/i, tag, 2);
  if (!encoded) return {};
  try {
    const parsed = JSON.parse(decodeHtml(encoded));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function parseMobileFeedBlock(block, rank, forumName) {
  const tid = extract(/\bdata-tid=["'](\d+)["']/i, block)
    || extract(/\bhref=["'][^"']*\/p\/(\d+)/i, block);
  const href = extract(/<a\b[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*\bj_common\b[^"']*\bti_item\b[^"']*["']/i, block)
    || extract(/<a\b[^>]*href=["']([^"']*\/p\/\d+[^"']*)["']/i, block);
  const title = cleanText(extract(/<div\b[^>]*class=["'][^"']*\bti_title\b[^"']*["'][^>]*>[\s\S]*?<span\b[^>]*>([\s\S]*?)<\/span>/i, block));
  const author = cleanText(extract(/<span\b[^>]*class=["'][^"']*\bti_author\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i, block));
  const publishedAt = cleanText(extract(/<span\b[^>]*class=["'][^"']*\bti_time\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i, block));
  const replyCount = Number(cleanText(extract(/<span\b[^>]*class=["'][^"']*\bbtn_icon\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i, block)).replace(/[^\d]/g, "")) || 0;
  if (!tid || !title) return null;
  return {
    id: String(tid),
    title,
    summary: title,
    author: author || copy("Unknown author", "未知作者"),
    publishedAt,
    replyCount,
    forumName,
    url: absoluteTiebaUrl(href) || threadUrl(tid),
    rank,
  };
}

function parseDesktopFeedBlock(block, rank, forumName) {
  const openTag = extract(/^(<li\b[^>]*>)/i, block);
  const field = parseDataField(openTag);
  const tid = String(field?.id || field?.thread_id || extract(/\bdata-tid=["'](\d+)["']/i, block)
    || extract(/\bhref=["'][^"']*\/p\/(\d+)/i, block));
  const titleAnchor = extract(/<a\b[^>]*class=["'][^"']*\bj_th_tit\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/i, block);
  const title = cleanText(titleAnchor);
  const href = extract(/<a\b[^>]*href=["']([^"']*\/p\/\d+[^"']*)["'][^>]*class=["'][^"']*\bj_th_tit\b/i, block)
    || extract(/<a\b[^>]*class=["'][^"']*\bj_th_tit\b[^"']*["'][^>]*href=["']([^"']+)["']/i, block);
  const author = cleanText(extract(/<span\b[^>]*class=["'][^"']*\btb_icon_author\b[^"']*["'][^>]*title=["']([^"']+)["']/i, block)
    || extract(/<a\b[^>]*class=["'][^"']*\bfrs-author-name-wrap\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/i, block));
  const publishedAt = cleanText(extract(/<span\b[^>]*class=["'][^"']*\bthreadlist_reply_date\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i, block));
  const replyCount = Number(cleanText(extract(/<span\b[^>]*class=["'][^"']*\bthreadlist_rep_num\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i, block)).replace(/[^\d]/g, "")) || 0;
  if (!tid || !title) return null;
  return {
    id: tid,
    title,
    summary: title,
    author: author || cleanText(field?.author_name) || copy("Unknown author", "未知作者"),
    publishedAt,
    replyCount,
    forumName,
    url: absoluteTiebaUrl(href) || threadUrl(tid),
    rank,
  };
}

function parseFeedHtml(html, forumName, page = 1) {
  const source = String(html || "");
  const normalizedForum = normalizeForumName(forumName);
  const mobileBlocks = [...source.matchAll(/<li\b[^>]*class=(?:"[^"]*\btl_shadow\b[^"]*"|'[^']*\btl_shadow\b[^']*')[^>]*>[\s\S]*?<\/li>/gi)]
    .map((match) => match[0]);
  const desktopBlocks = mobileBlocks.length ? [] : [...source.matchAll(/<li\b[^>]*class=(?:"[^"]*\bj_thread_list\b[^"]*"|'[^']*\bj_thread_list\b[^']*')[^>]*>[\s\S]*?<\/li>/gi)]
    .map((match) => match[0]);
  const blocks = mobileBlocks.length ? mobileBlocks : desktopBlocks;
  const items = blocks
    .map((block, index) => mobileBlocks.length
      ? parseMobileFeedBlock(block, index + 1, normalizedForum)
      : parseDesktopFeedBlock(block, index + 1, normalizedForum))
    .filter(Boolean);
  const hasMore = /pageBottom|frs_more_spinner|moreSpinner|pager_new|下一页|next/i.test(source)
    || (Number(page) >= 1 && items.length >= 20);
  return { items, hasMore };
}

function imageUrls(segment) {
  const urls = [];
  for (const match of segment.matchAll(/<img\b[^>]*class=(?:"[^"]*\bBDE_Image\b[^"]*"|'[^']*\bBDE_Image\b[^']*')[^>]*>/gi)) {
    const tag = match[0];
    const src = extract(/\b(?:data-original|data-src|src)=["']([^"']+)["']/i, tag);
    const normalized = absoluteTiebaUrl(src);
    if (normalized && !urls.includes(normalized)) urls.push(normalized);
  }
  return urls;
}

function splitPostSegments(html) {
  const source = String(html || "");
  const matches = [...source.matchAll(/<div\b[^>]*class=(?:"[^"]*\bl_post\b[^"]*"|'[^']*\bl_post\b[^']*')[^>]*>/gi)];
  return matches.map((match, index) => ({
    openTag: match[0],
    html: source.slice(match.index, matches[index + 1]?.index ?? source.length),
  }));
}

function parseThreadTitle(html) {
  const titled = extract(/<h3\b[^>]*class=["'][^"']*\bcore_title_txt\b[^"']*["'][^>]*title=["']([^"']+)["']/i, html);
  if (titled) return cleanText(titled);
  return cleanText(extract(/<h3\b[^>]*class=["'][^"']*\bcore_title_txt\b[^"']*["'][^>]*>([\s\S]*?)<\/h3>/i, html));
}

function parsePostSegment(segment, index) {
  const field = parseDataField(segment.openTag);
  const contentField = field?.content && typeof field.content === "object" ? field.content : {};
  const authorField = field?.author && typeof field.author === "object" ? field.author : {};
  const contentHtml = extract(/<div\b[^>]*id=["']post_content_\d+["'][^>]*>([\s\S]*?)<\/div>/i, segment.html);
  const body = cleanText(contentHtml);
  const floorText = cleanText(extract(/<span\b[^>]*class=["'][^"']*\btail-info\b[^"']*["'][^>]*>([^<]*楼)<\/span>/i, segment.html));
  const floor = Number(contentField.post_no || contentField.floor || floorText.replace(/[^\d]/g, "")) || index + 1;
  const author = cleanText(authorField.user_name || authorField.user_nickname
    || extract(/<a\b[^>]*class=["'][^"']*\bp_author_name\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/i, segment.html))
    || copy("Unknown author", "未知作者");
  const publishedAt = cleanText(contentField.date
    || extract(/<span\b[^>]*class=["'][^"']*\btail-info\b[^"']*["'][^>]*>(\d{4}-\d{2}-\d{2}[\s\S]*?)<\/span>/i, segment.html));
  const id = String(contentField.post_id || contentField.id || `floor-${floor}`);
  const likeCount = Number(contentField.agree_num || field?.agree_num || 0) || 0;
  return {
    id,
    floor,
    author,
    publishedAt,
    body,
    likeCount,
    images: imageUrls(contentHtml),
  };
}

function parseThreadHtml(html, fallbackPost = {}) {
  const source = String(html || "");
  const posts = splitPostSegments(source).map(parsePostSegment).filter((post) => post.body || post.images.length);
  const first = posts[0] || null;
  const title = parseThreadTitle(source) || cleanText(fallbackPost.title) || copy("Untitled thread", "无标题帖子");
  const op = first?.author || cleanText(fallbackPost.author);
  const replies = posts.slice(first ? 1 : 0).map((post) => ({
    id: post.id,
    floor: post.floor,
    author: post.author,
    likeCount: post.likeCount,
    createdAt: post.publishedAt,
    originalPoster: Boolean(op && post.author === op),
    body: post.body,
    content: tiebaEmotionContent(post.body),
  }));
  return {
    title,
    body: first?.body || cleanText(fallbackPost.summary) || title,
    images: first?.images || [],
    author: op || copy("Unknown author", "未知作者"),
    publishedAt: first?.publishedAt || cleanText(fallbackPost.publishedAt),
    replies,
  };
}

function looksBlocked(html) {
  const text = cleanText(String(html || "").slice(0, 20_000));
  return /系统检测到您的请求|安全验证|请输入验证码|访问过于频繁|request blocked|verify/i.test(text);
}

async function fetchText(context, url, referer = BASE_URL) {
  const response = await context.http.fetch(url, {
    method: "GET",
    timeoutMs: 30_000,
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      Referer: referer,
      "User-Agent": WEB_USER_AGENT,
    },
  });
  if (!response?.ok) throw new Error(`Tieba HTTP ${response?.status || "error"}`);
  const html = await response.text();
  if (looksBlocked(html)) {
    throw new Error(copy("Tieba requested security verification", "贴吧要求完成安全验证"));
  }
  return html;
}

async function fetchFeed(context, forumName, page) {
  const url = buildFeedUrl(forumName, page, false);
  const html = await fetchText(context, url, BASE_URL);
  const result = parseFeedHtml(html, forumName, page);
  if (result.items.length) return result;
  throw new Error(copy("Tieba returned no readable posts", "贴吧未返回可读取的帖子"));
}

function interleavePosts(groups) {
  const queues = groups.map((group) => [...group]);
  const seen = new Set();
  const merged = [];
  let remaining = queues.reduce((total, queue) => total + queue.length, 0);
  while (remaining > 0) {
    for (const queue of queues) {
      const post = queue.shift();
      if (!post) continue;
      remaining -= 1;
      const id = String(post.id || "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      merged.push(post);
    }
  }
  return merged;
}

async function fetchForumSelection(context, forumNames, selection, page) {
  if (selection !== MIXED_FORUM) {
    const result = await fetchFeed(context, selection, page);
    return { ...result, loadedForums: 1, failedForums: 0 };
  }
  const settled = await Promise.allSettled(
    forumNames.map((forumName) => fetchFeed(context, forumName, page)),
  );
  const successful = settled
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
  if (!successful.length) {
    const firstFailure = settled.find((result) => result.status === "rejected");
    throw firstFailure?.reason || new Error(copy("All configured forums failed", "所有配置贴吧均加载失败"));
  }
  return {
    items: interleavePosts(successful.map((result) => result.items)),
    hasMore: successful.some((result) => result.hasMore),
    loadedForums: successful.length,
    failedForums: settled.length - successful.length,
  };
}

async function fetchDetail(context, post) {
  const detail = await fetchTiebaThreadDetail(context, post);
  if (!detail.body && !detail.replies.length) {
    throw new Error(copy("Tieba returned no readable thread content", "贴吧未返回可读取的帖子内容"));
  }
  return detail;
}

async function preference(context, id, fallback = "") {
  try {
    const value = await context.getPreference(id);
    return String(value || "").trim() || fallback;
  } catch {
    return fallback;
  }
}

async function cacheGet(context) {
  try {
    return await context.storage.persist.get(CACHE_KEY);
  } catch {
    return null;
  }
}

async function cacheSet(context, value) {
  try {
    await context.storage.persist.set(CACHE_KEY, value);
  } catch {
    // Cache failures must not replace usable network state.
  }
}

function cacheModel(raw) {
  const value = raw && typeof raw === "object" ? raw : {};
  return {
    forumName: normalizeForumName(value.forumName || DEFAULT_FORUM),
    posts: Array.isArray(value.posts) ? value.posts : [],
    page: Math.max(1, Number(value.page) || 1),
    hasMore: value.hasMore !== false,
    savedAt: Number(value.savedAt) || 0,
    details: value.details && typeof value.details === "object" ? value.details : {},
    readAt: value.readAt && typeof value.readAt === "object" ? value.readAt : {},
    cachedAt: value.cachedAt && typeof value.cachedAt === "object" ? value.cachedAt : {},
  };
}

function pruneCache(model, retentionDays) {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const keptIds = new Set();
  const posts = model.posts.filter((post) => {
    const id = String(post?.id || "");
    if (!id) return false;
    const reference = Number(model.readAt[id] || model.cachedAt[id] || model.savedAt);
    if (reference > 0 && reference < cutoff) return false;
    keptIds.add(id);
    return true;
  });
  const keep = ([id]) => keptIds.has(String(id));
  const readAt = Object.fromEntries(
    Object.entries(model.readAt)
      .filter(([, value]) => Number(value) >= cutoff)
      .sort((left, right) => Number(right[1]) - Number(left[1]))
      .slice(0, MAX_READ_HISTORY),
  );
  return {
    ...model,
    posts,
    details: Object.fromEntries(Object.entries(model.details).filter(keep)),
    readAt,
    cachedAt: Object.fromEntries(Object.entries(model.cachedAt).filter(keep)),
  };
}

function compactNumber(value) {
  const number = Number(value) || 0;
  return new Intl.NumberFormat(undefined, {
    notation: number >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(number);
}

function forumDisplayName(selection) {
  return selection === MIXED_FORUM ? copy("Mixed", "混合") : `${selection}吧`;
}

function createPanel(container, context) {
  setLocale(context);
  const state = {
    forumName: MIXED_FORUM,
    forumNames: [...DEFAULT_FORUMS],
    posts: [],
    visible: [],
    page: 1,
    hasMore: true,
    query: "",
    selectedId: null,
    loading: false,
    loadingMore: false,
    error: null,
    source: "",
    savedAt: 0,
    ttlMs: DEFAULT_TTL_MS,
    retentionDays: 7,
    imageLayout: "horizontal",
    details: {},
    detailLoading: new Set(),
    cachedAt: {},
    revision: 0,
    view: null,
    dead: false,
    prefetchRevision: 0,
  };
  const readLedger = context.state.createReadLedger({
    retentionDays: state.retentionDays,
    maxEntries: MAX_READ_HISTORY,
  });
  const cacheWriter = context.state.createLatestWriter((snapshot) => cacheSet(context, snapshot));
  const requestGate = context.state.createGenerationGate();

  function selectedPost() {
    return state.posts.find((post) => String(post.id) === String(state.selectedId));
  }

  function filterPosts() {
    const needle = state.query.trim().toLocaleLowerCase();
    state.visible = state.posts.filter((post) => {
      if (!needle) return true;
      return [post.title, post.summary, post.author, post.forumName]
        .join(" ")
        .toLocaleLowerCase()
        .includes(needle);
    });
    if (!state.visible.some((post) => String(post.id) === String(state.selectedId))) {
      state.selectedId = state.visible[0]?.id || null;
    }
  }

  function detailFor(post) {
    const id = String(post.id);
    const detail = state.details[id];
    const images = (detail?.images || []).map((url) => ({
      url,
      alt: detail?.title || post.title,
      fit: "contain",
      aspectRatio: "auto",
      zoomable: true,
    }));
    const replies = Array.isArray(detail?.replies) ? detail.replies : [];
    return {
      title: detail?.title || post.title,
      subtitle: [detail?.author || post.author, detail?.publishedAt || post.publishedAt, `${compactNumber(post.replyCount)} ${copy("replies", "回复")}`]
        .filter(Boolean)
        .join(" · "),
      status: detail?.error ? { state: "error", error: detail.error } : undefined,
      body: detail?.body || post.summary || post.title,
      images,
      imageLayout: state.imageLayout,
      mediaPlacement: "after-body",
      replies: {
        title: copy("Floor comments", "楼层评论"),
        total: Math.max(Number(post.replyCount) || 0, replies.length),
        items: replies.map((reply) => ({
          ...reply,
          content: reply.content || tiebaEmotionContent(reply.body),
        })),
        status: detail?.error ? { state: "error", error: detail.error } : undefined,
        emptyText: copy("No readable comments on the first page.", "首屏暂无可读取的评论。"),
      },
    };
  }

  function itemFor(post) {
    const id = String(post.id);
    const read = readLedger.has(id);
    return {
      id,
      title: post.title,
      subtitle: post.summary || `${post.author} · ${post.forumName}吧`,
      meta: [post.author, post.publishedAt].filter(Boolean).join(" · "),
      badge: `${compactNumber(post.replyCount)} ${copy("replies", "回复")}`,
      tone: read ? "neutral" : "accent",
      detail: detailFor(post),
      actions: [{
        id: `open:${id}`,
        label: copy("Open on Tieba", "在贴吧中打开"),
        primary: true,
      }, {
        id: `${read ? "unread" : "read"}:${id}`,
        label: read ? copy("Mark Unread", "标为未读") : copy("Mark Read", "标为已读"),
      }],
    };
  }

  function paint() {
    if (state.dead) return;
    filterPosts();
    const selected = selectedPost();
    const snapshot = {
      revision: ++state.revision,
      title: `QxTieba · ${forumDisplayName(state.forumName)}`,
      query: state.query,
      queryPlaceholder: copy("Search loaded Tieba posts…", "搜索已加载的贴吧帖子…"),
      layout: { kind: "list" },
      tabs: [MIXED_FORUM, ...state.forumNames].map((name) => ({
        id: name,
        label: forumDisplayName(name),
        active: name === state.forumName,
      })),
      loading: state.loading && state.posts.length === 0,
      error: state.error,
      meta: state.source,
      selectedId: state.selectedId,
      items: state.visible.map(itemFor),
      emptyText: state.loading
        ? copy("Loading Tieba…", "正在加载贴吧…")
        : copy("No matching posts. Check the configured forum name.", "没有匹配的帖子，请检查配置的贴吧名称。"),
      actions: [{
        id: "refresh",
        label: copy("Refresh", "刷新"),
        primary: !selected,
        disabled: state.loading || state.loadingMore,
      }, {
        id: "load-more",
        label: state.loadingMore ? copy("Loading more…", "正在加载更多…") : copy("Load More", "加载更多"),
        disabled: state.loading || state.loadingMore || !state.hasMore,
      }, {
        id: "mark-visible-read",
        label: copy("Mark Visible Read", "当前结果标为已读"),
      }],
      island: selected && state.detailLoading.has(String(selected.id))
        ? {
            primary: selected.title,
            secondary: copy("Loading thread and comments", "正在加载帖子与评论"),
            activity: "spinner",
          }
        : state.loading || state.loadingMore
        ? {
            primary: forumDisplayName(state.forumName),
            secondary: state.loadingMore ? copy("Loading more posts", "正在加载更多帖子") : copy("Refreshing community", "正在刷新社区"),
            activity: "spinner",
          }
        : null,
    };
    if (state.view) {
      state.view.update(snapshot);
      return;
    }
    state.view = context.ui.mountWorkbench(snapshot, {
      onQuery(value) {
        state.query = String(value || "");
        paint();
      },
      onTab(id) {
        const name = id === MIXED_FORUM ? MIXED_FORUM : normalizeForumName(id);
        if ((name !== MIXED_FORUM && !state.forumNames.includes(name)) || name === state.forumName) return;
        requestGate.invalidate();
        state.loading = false;
        state.loadingMore = false;
        state.forumName = name;
        state.posts = [];
        state.visible = [];
        state.page = 1;
        state.hasMore = true;
        state.selectedId = null;
        state.details = {};
        state.cachedAt = {};
        state.savedAt = 0;
        state.query = "";
        state.error = null;
        state.source = copy("Switching forum…", "正在切换贴吧…");
        paint();
        void loadFeed();
      },
      onSelect(id) {
        const key = String(id || "");
        state.selectedId = key;
        state.prefetchRevision += 1;
        if (readLedger.mark(key)) {
          void persistCache();
        }
        paint();
        void loadSelectedPost(key);
      },
      onAction(id, item) {
        if (id === "refresh") void loadFeed({ force: true });
        else if (id === "load-more") void loadMore();
        else if (id === "mark-visible-read") {
          if (readLedger.markMany(state.visible.map((post) => String(post.id)))) {
            paint();
            void persistCache();
          }
        } else if (id.startsWith("read:")) {
          if (readLedger.mark(id.slice("read:".length))) {
            paint();
            void persistCache();
          }
        } else if (id.startsWith("unread:")) {
          if (readLedger.unmark(id.slice("unread:".length))) {
            paint();
            void persistCache();
          }
        } else if (id.startsWith("open:")) {
          const key = id.slice("open:".length);
          const post = state.posts.find((entry) => String(entry.id) === key)
            || state.posts.find((entry) => String(entry.id) === String(item?.id))
            || selectedPost();
          if (post) void context.openUrl(post.url || threadUrl(post.id));
        }
      },
    });
  }

  function snapshotCache(savedAt = state.savedAt || Date.now()) {
    return pruneCache({
      forumName: state.forumName,
      posts: state.posts,
      page: state.page,
      hasMore: state.hasMore,
      savedAt,
      details: state.details,
      readAt: readLedger.snapshot(),
      cachedAt: state.cachedAt,
    }, state.retentionDays);
  }

  function persistCache(savedAt = state.savedAt || Date.now()) {
    const pruned = snapshotCache(savedAt);
    state.posts = pruned.posts;
    state.details = pruned.details;
    state.cachedAt = pruned.cachedAt;
    return cacheWriter.write(pruned);
  }

  async function loadDetail(id, { quiet = false } = {}) {
    const key = String(id || "");
    const post = state.posts.find((entry) => String(entry.id) === key);
    const previous = state.details[key];
    if (!post || state.detailLoading.has(key)) return;
    if (previous?.complete && Date.now() - Number(previous.savedAt || 0) <= DETAIL_TTL_MS) return;
    const generation = requestGate.current();
    state.detailLoading.add(key);
    if (!quiet) paint();
    try {
      const detail = await fetchDetail(context, post);
      if (state.dead || !requestGate.isCurrent(generation)) return;
      state.details[key] = { ...detail, complete: true, savedAt: Date.now() };
      await persistCache();
    } catch (error) {
      if (!state.dead && requestGate.isCurrent(generation)) {
        state.details[key] = { ...(previous || {}), error: errorMessage(error), savedAt: previous?.savedAt || 0 };
      }
    } finally {
      state.detailLoading.delete(key);
      if (!quiet) paint();
    }
  }

  async function prefetchAround(postId, revision) {
    const index = state.posts.findIndex((post) => String(post.id) === String(postId));
    if (index < 0) return;
    const neighbors = [state.posts[index + 1], state.posts[index - 1], state.posts[index + 2]].filter(Boolean);
    for (const post of neighbors) {
      if (
        state.dead
        || revision !== state.prefetchRevision
        || state.selectedId !== String(postId)
      ) return;
      await loadDetail(post.id, { quiet: true });
    }
  }

  async function loadSelectedPost(postId) {
    const revision = state.prefetchRevision;
    await loadDetail(postId);
    if (!state.dead && revision === state.prefetchRevision) {
      void prefetchAround(postId, revision);
    }
  }

  async function loadFeed({ force = false } = {}) {
    if (state.loading) return;
    state.loading = true;
    state.error = null;
    const generation = requestGate.next();
    paint();
    try {
      const [forumPreference, ttlPreference, retentionPreference, imageLayoutPreference] = await Promise.all([
        preference(context, "forumName", DEFAULT_FORUM_PREFERENCE),
        preference(context, "cacheTtlMinutes", "5"),
        preference(context, "retentionDays", "7"),
        preference(context, "detailImageLayout", "horizontal"),
      ]);
      state.forumNames = parseForumNames(forumPreference);
      if (state.forumName !== MIXED_FORUM && !state.forumNames.includes(state.forumName)) {
        state.forumName = MIXED_FORUM;
      }
      const ttl = Number(ttlPreference);
      state.ttlMs = Number.isFinite(ttl) && ttl > 0 ? Math.min(60, ttl) * 60 * 1000 : DEFAULT_TTL_MS;
      state.retentionDays = Number(retentionPreference) === 3 ? 3 : 7;
      state.imageLayout = imageLayoutPreference === "grid" ? "grid" : "horizontal";
      readLedger.configure({
        retentionDays: state.retentionDays,
        maxEntries: MAX_READ_HISTORY,
      });

      const cached = pruneCache(cacheModel(await cacheGet(context)), state.retentionDays);
      readLedger.merge(cached.readAt);
      const sameForum = normalizeForumName(cached.forumName) === state.forumName;
      const cacheAge = cached.savedAt ? Date.now() - cached.savedAt : Infinity;
      if (!force && sameForum && cached.posts.length) {
        state.posts = cached.posts;
        state.page = cached.page;
        state.hasMore = cached.hasMore;
        state.savedAt = cached.savedAt;
        state.details = cached.details;
        state.cachedAt = cached.cachedAt;
        state.selectedId ||= state.posts[0]?.id || null;
        state.source = cacheAge <= state.ttlMs
          ? copy(
              `Cached ${forumDisplayName(state.forumName)} feed`,
              `${forumDisplayName(state.forumName)} Feed 缓存`,
            )
          : copy("Stale cache · refreshing", "旧缓存 · 正在刷新");
        paint();
        if (cacheAge <= state.ttlMs) return;
      } else if (!sameForum) {
        state.posts = [];
        state.details = {};
        state.cachedAt = {};
        state.selectedId = null;
      }

      const result = await fetchForumSelection(context, state.forumNames, state.forumName, 1);
      if (state.dead || !requestGate.isCurrent(generation)) return;
      const now = Date.now();
      state.posts = result.items;
      state.page = 1;
      state.hasMore = result.hasMore;
      state.savedAt = now;
      state.cachedAt = Object.fromEntries(result.items.map((post) => [String(post.id), now]));
      state.selectedId = result.items[0]?.id || null;
      state.source = state.forumName === MIXED_FORUM
        ? copy(
            `Mixed feed · ${result.loadedForums}/${state.forumNames.length} forums`,
            `混合 Feed · ${result.loadedForums}/${state.forumNames.length} 个贴吧`,
          )
        : copy(`Live ${state.forumName} feed`, `${state.forumName}吧实时数据`);
      await persistCache(now);
    } catch (error) {
      if (!state.dead && requestGate.isCurrent(generation)) {
        state.error = errorMessage(error);
        state.source = state.posts.length
          ? copy("Offline · showing cache", "网络异常 · 显示缓存")
          : copy("Tieba feed unavailable", "贴吧 Feed 不可用");
      }
    } finally {
      if (!state.dead && requestGate.isCurrent(generation)) {
        state.loading = false;
        paint();
        if (state.selectedId) {
          const key = String(state.selectedId);
          if (readLedger.mark(key)) {
            paint();
            void persistCache();
          }
          void loadSelectedPost(state.selectedId);
        }
      }
    }
  }

  async function loadMore() {
    if (state.loading || state.loadingMore || !state.hasMore) return;
    state.loadingMore = true;
    state.error = null;
    const generation = requestGate.current();
    paint();
    try {
      const nextPage = state.page + 1;
      const result = await fetchForumSelection(context, state.forumNames, state.forumName, nextPage);
      if (state.dead || !requestGate.isCurrent(generation)) return;
      const byId = new Map(state.posts.map((post) => [String(post.id), post]));
      const now = Date.now();
      for (const post of result.items) {
        byId.set(String(post.id), post);
        state.cachedAt[String(post.id)] ||= now;
      }
      state.posts = [...byId.values()];
      state.page = nextPage;
      state.hasMore = result.hasMore;
      state.source = copy(`${state.posts.length} loaded posts`, `已加载 ${state.posts.length} 个帖子`);
      await persistCache();
    } catch (error) {
      if (!state.dead && requestGate.isCurrent(generation)) state.error = errorMessage(error);
    } finally {
      state.loadingMore = false;
      paint();
    }
  }

  paint();
  void loadFeed();

  return {
    destroy() {
      state.dead = true;
      state.prefetchRevision += 1;
      requestGate.invalidate();
      state.view = null;
      container.innerHTML = "";
    },
  };
}

const activePanels = new WeakMap();

const plugin = {
  commands: [{
    name: "open-qxtieba",
    title: "打开 QxTieba 贴吧",
    async run(context) {
      setLocale(context);
      await context.showToast(copy(
        "Open QxTieba from Extensions or search.",
        "请从扩展模块或搜索中打开 QxTieba。",
      ));
    },
  }],
  panel: {
    title: "QxTieba 贴吧",
    render(container, context) {
      setLocale(context);
      activePanels.get(container)?.destroy();
      activePanels.set(container, createPanel(container, context));
    },
    destroy(container) {
      activePanels.get(container)?.destroy();
      activePanels.delete(container);
    },
  },
};

export default plugin;

export {
  buildFeedUrl,
  normalizeForumName,
  parseForumNames,
  interleavePosts,
  parseFeedHtml,
  parseThreadHtml,
  pruneCache,
};
