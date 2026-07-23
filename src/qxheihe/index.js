/**
 * QxHeihe — 小黑盒社区 Workbench plugin.
 *
 * Feed data is cached stale-while-revalidate. Selecting a row opens the
 * host-owned master-detail view and asynchronously replaces the feed summary
 * with the official structured post detail.
 */

const DEFAULT_FEED_URL = "https://api.xiaoheihe.cn/bbs/app/feeds?app=heybox&os_type=web&x_app=heybox_website&x_client_type=web&x_os_type=Mac&x_client_version=&client_type=web&web_version=3.0&version=999.0.4&pull=0&offset=0&dw=604";
const DETAIL_URL = "https://api.xiaoheihe.cn/bbs/web/link/detail";
const COMMENT_URL = "https://api.xiaoheihe.cn/bbs/web/link/comment/list";
const LEGACY_CACHE_KEY = "qxheihe.feed.v1";
const CACHE_KEY = "cache.community.v2";
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const DETAIL_FORMAT_VERSION = 2;
const SIGN_ALPHABET = "AB45STUVWZEFGJ6CH01D237IXYPQRKLMN89";

function isChinese() {
  return (navigator.languages || [navigator.language || ""])
    .some((locale) => /^zh(?:-|$)/i.test(String(locale)));
}

function copy(en, zh) {
  return isChinese() ? zh : en;
}

function message(error) {
  return String(error?.message || error || copy("Unknown error", "未知错误"));
}

function cleanText(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|section|article|h[1-6]|blockquote|li)>/gi, "\n\n")
    .replace(/<span[^>]*data-emoji=["']([^"']+)["'][^>]*><\/span>/gi, "[$1]")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatTime(timestamp) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return copy("Unknown time", "时间未知");
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value * 1000));
}

function compactNumber(value) {
  const number = Number(value) || 0;
  return new Intl.NumberFormat(undefined, {
    notation: number >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(number);
}

function uniqueHttps(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter((value) => {
      if (!/^https:\/\//i.test(value) || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

function leftRotate(value, shift) {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

/**
 * Small dependency-free MD5 implementation. Xiaoheihe signs only an ASCII
 * twenty-character seed, so byte conversion deliberately stays narrow.
 */
function md5Ascii(value) {
  const input = String(value);
  const bitLength = input.length * 8;
  const totalLength = Math.ceil((input.length + 9) / 64) * 64;
  const bytes = new Uint8Array(totalLength);
  for (let index = 0; index < input.length; index += 1) {
    bytes[index] = input.charCodeAt(index) & 0xff;
  }
  bytes[input.length] = 0x80;
  const view = new DataView(bytes.buffer);
  view.setUint32(totalLength - 8, bitLength >>> 0, true);
  view.setUint32(totalLength - 4, Math.floor(bitLength / 0x100000000), true);

  const shifts = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const constants = Array.from(
    { length: 64 },
    (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0,
  );
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let offset = 0; offset < totalLength; offset += 64) {
    const words = Array.from({ length: 16 }, (_, index) =>
      view.getUint32(offset + index * 4, true)
    );
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let index = 0; index < 64; index += 1) {
      let f;
      let wordIndex;
      if (index < 16) {
        f = (b & c) | (~b & d);
        wordIndex = index;
      } else if (index < 32) {
        f = (d & b) | (~d & c);
        wordIndex = (5 * index + 1) % 16;
      } else if (index < 48) {
        f = b ^ c ^ d;
        wordIndex = (3 * index + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        wordIndex = (7 * index) % 16;
      }
      const previousD = d;
      d = c;
      c = b;
      const sum = (a + f + constants[index] + words[wordIndex]) >>> 0;
      b = (b + leftRotate(sum, shifts[index])) >>> 0;
      a = previousD;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  return [a0, b0, c0, d0].map((word) =>
    [0, 8, 16, 24]
      .map((shift) => ((word >>> shift) & 0xff).toString(16).padStart(2, "0"))
      .join("")
  ).join("");
}

function mapSignatureChars(value, end) {
  const chars = SIGN_ALPHABET.slice(0, end);
  return [...String(value)]
    .map((character) => chars[character.charCodeAt(0) % chars.length])
    .join("");
}

function xtime(value) {
  return value & 128 ? ((value << 1) ^ 27) & 255 : value << 1;
}

function mix1(value) {
  return xtime(value) ^ value;
}

function mix2(value) {
  return mix1(xtime(value));
}

function mix3(value) {
  return mix2(mix1(xtime(value)));
}

function mix4(value) {
  return mix3(value) ^ mix2(value) ^ mix1(value);
}

function signatureTail(values) {
  const output = [...values];
  output[0] = mix4(values[0]) ^ mix3(values[1]) ^ mix2(values[2]) ^ mix1(values[3]);
  output[1] = mix1(values[0]) ^ mix4(values[1]) ^ mix3(values[2]) ^ mix2(values[3]);
  output[2] = mix2(values[0]) ^ mix1(values[1]) ^ mix4(values[2]) ^ mix3(values[3]);
  output[3] = mix3(values[0]) ^ mix2(values[1]) ^ mix1(values[2]) ^ mix4(values[3]);
  return output.reduce((sum, value) => sum + value, 0) % 100;
}

function heiheHkey(path, timestamp, nonce) {
  const normalizedPath = `/${String(path).split("/").filter(Boolean).join("/")}/`;
  const mapped = [
    mapSignatureChars(timestamp + 1, -2),
    mapSignatureChars(normalizedPath),
    mapSignatureChars(nonce),
  ];
  let interleaved = "";
  const length = Math.max(...mapped.map((value) => value.length));
  for (let index = 0; index < length; index += 1) {
    for (const value of mapped) {
      if (index < value.length) interleaved += value[index];
    }
  }
  const digest = md5Ascii(interleaved.slice(0, 20));
  const prefix = mapSignatureChars(digest.slice(0, 5), -4);
  const suffix = String(
    signatureTail([...digest.slice(-6)].map((character) => character.charCodeAt(0))),
  ).padStart(2, "0");
  return `${prefix}${suffix}`;
}

function randomNonce() {
  try {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("").toUpperCase();
  } catch {
    return md5Ascii(`${Date.now()}:${Math.random()}:${Math.random()}`).toUpperCase();
  }
}

function postUrl(post) {
  const share = String(post?.share_url || "");
  if (/^https:\/\//i.test(share)) return share;
  return `https://www.xiaoheihe.cn/app/bbs/link/${encodeURIComponent(post?.linkid || post?.link_id || "")}`;
}

function postTitle(post) {
  const title = cleanText(post?.title);
  if (title) return title;
  const body = cleanText(post?.description || post?.text);
  return body.slice(0, 48) || copy("Untitled post", "无标题帖子");
}

function postTopic(post, topics) {
  return String(post?.topics?.[0]?.name || topics?.[0]?.name || copy("Community", "社区"));
}

function feedImages(post) {
  const full = uniqueHttps(post?.imgs);
  return full.length ? full : uniqueHttps(post?.thumbs);
}

function parseDetailContent(link) {
  let blocks = [];
  try {
    const parsed = typeof link?.text === "string" ? JSON.parse(link.text) : link?.text;
    if (Array.isArray(parsed)) blocks = parsed;
  } catch {
    blocks = [];
  }
  const bodyParts = [];
  const images = [];
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    if (block.type === "img" && /^https:\/\//i.test(String(block.url || ""))) {
      images.push({
        url: String(block.url),
        alt: postTitle(link),
        fit: "cover",
        aspectRatio: "auto",
        zoomable: true,
      });
      continue;
    }
    const text = cleanText(block.text);
    if (text) bodyParts.push(text);
  }
  const fallbackImages = feedImages(link).map((url) => ({
    url,
    alt: postTitle(link),
    fit: "cover",
    aspectRatio: "auto",
    zoomable: true,
  }));
  return {
    body: bodyParts.join("\n\n") || cleanText(link?.description || link?.text),
    images: images.length ? images : fallbackImages,
  };
}

function responseJson(response) {
  if (!response?.ok) {
    throw new Error(`HTTP ${response?.status || "error"}`);
  }
  return response.json();
}

async function fetchJson(context, url, headers = {}) {
  const response = await context.http.fetch(url, {
    method: "GET",
    timeoutMs: 30_000,
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 QxHeihe/1.0",
      ...headers,
    },
  });
  const payload = await responseJson(response);
  if (payload?.status !== "ok") {
    throw new Error(payload?.msg || copy("The API rejected the request", "接口拒绝了请求"));
  }
  return payload.result || {};
}

function commentText(comment) {
  const raw = comment?.text ?? comment?.content ?? comment?.description ?? comment?.body;
  if (typeof raw !== "string") return cleanText(raw);
  try {
    const blocks = JSON.parse(raw);
    if (Array.isArray(blocks)) {
      return blocks.map((block) => cleanText(block?.text || block?.content)).filter(Boolean).join("\n");
    }
  } catch {
    // Plain text and HTML comments are both common.
  }
  return cleanText(raw);
}

function commentRows(result) {
  const candidates = [
    result?.comments,
    result?.comment_list,
    result?.list,
    result?.rows,
    result?.data,
  ];
  return candidates.find(Array.isArray) || [];
}

function commentAuthor(comment) {
  return cleanText(
    comment?.user?.username
      || comment?.user?.nickname
      || comment?.username
      || comment?.nickname
      || copy("Anonymous", "匿名用户"),
  );
}

function commentReplies(comment) {
  const rows = [
    comment?.replies,
    comment?.reply_list,
    comment?.children,
    comment?.sub_comments,
  ].find(Array.isArray) || [];
  return rows.slice(0, 5).map((reply) => {
    const author = commentAuthor(reply);
    const target = commentAuthor(reply?.reply_to || reply?.to_user || {});
    const prefix = target && target !== copy("Anonymous", "匿名用户")
      ? `${author} → ${target}`
      : author;
    return `${prefix}：${commentText(reply)}`;
  }).filter((line) => !line.endsWith("："));
}

function parseComments(result) {
  return commentRows(result).slice(0, 20).map((comment, index) => {
    const floor = Number(comment?.floor || comment?.floor_num || comment?.index);
    const created = Number(comment?.create_at || comment?.created_at || comment?.time);
    const likes = Number(comment?.like_num || comment?.up || comment?.award_num || 0);
    const meta = [
      Number.isFinite(floor) && floor > 0 ? `#${floor}` : `#${index + 1}`,
      created > 0 ? formatTime(created) : "",
      likes > 0 ? `${compactNumber(likes)} ♥` : "",
    ].filter(Boolean).join(" · ");
    const replies = commentReplies(comment);
    return {
      title: `${commentAuthor(comment)} · ${meta}`,
      body: [commentText(comment), ...replies.map((reply) => `↳ ${reply}`)]
        .filter(Boolean)
        .join("\n\n"),
    };
  }).filter((section) => section.body);
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
    const current = await context.storage.persist.get(CACHE_KEY);
    if (current) return current;
    const legacy = await context.storage.persist.get(LEGACY_CACHE_KEY);
    if (!legacy) return null;
    await context.storage.persist.set(CACHE_KEY, legacy);
    await context.storage.persist.delete(LEGACY_CACHE_KEY);
    return legacy;
  } catch {
    return null;
  }
}

async function cacheSet(context, value) {
  try {
    await context.storage.persist.set(CACHE_KEY, value);
  } catch {
    // Cache failure must not replace usable network data.
  }
}

function cacheModel(raw) {
  if (!raw || typeof raw !== "object") return null;
  const posts = Array.isArray(raw.posts)
    ? raw.posts
    : Array.isArray(raw.data)
      ? raw.data
      : [];
  return {
    posts,
    savedAt: Number(raw.savedAt) || 0,
    details: raw.details && typeof raw.details === "object" ? raw.details : {},
    readAt: raw.readAt && typeof raw.readAt === "object" ? raw.readAt : {},
    cachedAt: raw.cachedAt && typeof raw.cachedAt === "object" ? raw.cachedAt : {},
  };
}

function pruneCache(model, retentionDays) {
  const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - maxAgeMs;
  const keptIds = new Set();
  const posts = model.posts.filter((post) => {
    const id = String(post?.linkid || "");
    if (!id) return false;
    const reference = Number(model.readAt[id] || model.cachedAt[id] || model.savedAt);
    if (reference > 0 && reference < cutoff) return false;
    keptIds.add(id);
    return true;
  });
  const keepRecord = ([id]) => keptIds.has(String(id));
  return {
    posts,
    savedAt: model.savedAt,
    details: Object.fromEntries(Object.entries(model.details).filter(keepRecord)),
    readAt: Object.fromEntries(Object.entries(model.readAt).filter(keepRecord)),
    cachedAt: Object.fromEntries(Object.entries(model.cachedAt).filter(keepRecord)),
  };
}

function feedUrlAtOffset(base, offset, {
  timestamp = Math.floor(Date.now() / 1000),
  nonce = randomNonce(),
} = {}) {
  const url = new URL(base);
  url.searchParams.delete("hkey");
  url.searchParams.delete("_time");
  url.searchParams.delete("nonce");
  url.searchParams.set("offset", String(Math.max(0, offset)));
  url.searchParams.set("pull", offset > 0 ? "1" : "0");
  url.searchParams.set("version", "999.0.4");
  url.searchParams.set("_time", String(timestamp));
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("hkey", heiheHkey(url.pathname, timestamp, nonce));
  return url.toString();
}

function createPanel(container, context) {
  const state = {
    all: [],
    visible: [],
    query: "",
    tab: "all",
    selectedId: null,
    offset: 0,
    loading: false,
    loadingMore: false,
    error: null,
    source: "",
    savedAt: 0,
    retentionDays: 7,
    imageLayout: "horizontal",
    readAt: {},
    cachedAt: {},
    revision: 0,
    generation: 0,
    details: new Map(),
    detailLoading: new Set(),
    view: null,
    dead: false,
  };

  function cacheSnapshot(savedAt = state.savedAt || Date.now()) {
    const details = {};
    for (const [id, detail] of state.details) {
      if (detail && !detail.error) details[id] = detail;
    }
    return pruneCache({
      posts: state.all,
      savedAt,
      details,
      readAt: state.readAt,
      cachedAt: state.cachedAt,
    }, state.retentionDays);
  }

  async function persistCache(savedAt = state.savedAt || Date.now()) {
    const pruned = cacheSnapshot(savedAt);
    state.all = pruned.posts;
    state.readAt = pruned.readAt;
    state.cachedAt = pruned.cachedAt;
    for (const id of [...state.details.keys()]) {
      if (!Object.prototype.hasOwnProperty.call(pruned.details, id)) state.details.delete(id);
    }
    await cacheSet(context, pruned);
  }

  function markRead(id) {
    const key = String(id || "");
    if (!key || state.readAt[key]) return false;
    state.readAt[key] = Date.now();
    return true;
  }

  function markUnread(id) {
    const key = String(id || "");
    if (!key || !state.readAt[key]) return false;
    delete state.readAt[key];
    return true;
  }

  function selectedPost() {
    return state.all.find((post) => String(post.linkid) === String(state.selectedId));
  }

  function applyFilter() {
    const needle = state.query.trim().toLocaleLowerCase();
    state.visible = state.all.filter((post) => {
      if (state.tab === "images" && feedImages(post).length === 0) return false;
      if (!needle) return true;
      const haystack = [
        post.title,
        post.description,
        post.user?.username,
        post.topics?.map((topic) => topic.name).join(" "),
        post.hashtags?.map((tag) => tag.name).join(" "),
      ].join(" ").toLocaleLowerCase();
      return haystack.includes(needle);
    });
    if (!state.visible.some((post) => String(post.linkid) === String(state.selectedId))) {
      state.selectedId = state.visible[0] ? String(state.visible[0].linkid) : null;
    }
  }

  function detailFor(post) {
    const id = String(post.linkid);
    const cached = state.details.get(id);
    const images = cached?.images || feedImages(post).map((url) => ({
      url,
      alt: postTitle(post),
      fit: "cover",
      aspectRatio: "auto",
      zoomable: true,
    }));
    const body = cached?.body || cleanText(post.description);
    const topic = postTopic(post, cached?.topics);
    const sections = post.hashtags?.length ? [{
      title: copy("Tags", "标签"),
      body: post.hashtags.map((tag) => `#${tag.name}`).join("  "),
    }] : [];
    if (cached?.commentSections?.length) {
      sections.push({
        title: copy(
          `Comments (${cached.commentSections.length} loaded)`,
          `评论区（已加载 ${cached.commentSections.length} 条）`,
        ),
        body: cached.commentsTruncated
          ? copy("Showing the first 20 comments. Open Xiaoheihe to continue.", "当前展示前 20 条，更多评论请在小黑盒中查看。")
          : undefined,
      }, ...cached.commentSections);
    } else if (cached?.commentNotice) {
      sections.push({
        title: copy("Comments", "评论区"),
        body: cached.commentNotice,
      });
    }
    return {
      title: postTitle(post),
      subtitle: `${post.user?.username || copy("Unknown author", "未知作者")} · ${topic} · ${formatTime(post.create_at)}`,
      status: state.detailLoading.has(id)
        ? { state: "loading", label: copy("Loading post and comments…", "正在加载正文与评论…") }
        : cached?.error
          ? { state: "error", error: cached.error }
          : undefined,
      body,
      images,
      imageLayout: state.imageLayout,
      fields: [
        { label: copy("Author", "作者"), value: post.user?.username || "—" },
        { label: copy("Community", "社区"), value: topic },
        { label: copy("Likes", "点赞"), value: Number(post.link_award_num || post.up || 0) },
        { label: copy("Comments", "评论"), value: Number(post.comment_num || 0) },
        { label: copy("Published", "发布时间"), value: formatTime(post.create_at) },
      ],
      sections,
    };
  }

  function itemFor(post) {
    const images = feedImages(post);
    const topic = postTopic(post);
    const isRead = Boolean(state.readAt[String(post.linkid)]);
    return {
      id: String(post.linkid),
      title: postTitle(post),
      subtitle: cleanText(post.description) || `${post.user?.username || "—"} · ${topic}`,
      meta: `${post.user?.username || "—"} · ${formatTime(post.create_at)}`,
      badge: `${isRead ? "" : `${copy("Unread", "未读")} · `}${compactNumber(post.link_award_num || post.up)} ♥ · ${compactNumber(post.comment_num)} ${copy("comments", "评论")}`,
      tone: isRead ? "neutral" : "accent",
      image: images[0] ? {
        url: images[0],
        alt: postTitle(post),
        fit: "cover",
      } : undefined,
      detail: detailFor(post),
      actions: [{
        id: `open:${post.linkid}`,
        label: copy("Open on Xiaoheihe", "在小黑盒中打开"),
        primary: true,
      }, {
        id: `${isRead ? "unread" : "read"}:${post.linkid}`,
        label: isRead ? copy("Mark Unread", "标为未读") : copy("Mark Read", "标为已读"),
      }, {
        id: `open-comments:${post.linkid}`,
        label: copy("Open Comments on Xiaoheihe", "在小黑盒中查看评论"),
      }],
    };
  }

  function paint() {
    if (state.dead) return;
    applyFilter();
    const snapshot = {
      revision: ++state.revision,
      title: "QxHeihe 小黑盒",
      query: state.query,
      queryPlaceholder: copy("Search loaded posts…", "搜索已加载的帖子…"),
      layout: { kind: "list" },
      tabs: [
        { id: "all", label: copy("Recommended", "推荐"), active: state.tab === "all" },
        { id: "images", label: copy("With Images", "图片"), active: state.tab === "images" },
      ],
      loading: state.loading && state.all.length === 0,
      error: state.error,
      meta: state.source,
      selectedId: state.selectedId,
      items: state.visible.map(itemFor),
      emptyText: state.loading
        ? copy("Loading Xiaoheihe…", "正在加载小黑盒…")
        : copy("No matching posts", "没有匹配的帖子"),
      actions: [
        {
          id: "refresh",
          label: copy("Refresh", "刷新"),
          primary: !selectedPost(),
          disabled: state.loading || state.loadingMore,
        },
        {
          id: "load-more",
          label: state.loadingMore ? copy("Loading more…", "正在加载更多…") : copy("Load More", "加载更多"),
          disabled: state.loading || state.loadingMore,
        },
      ],
      island: state.loading || state.loadingMore
        ? {
            primary: "QxHeihe",
            secondary: state.loadingMore ? copy("Loading more", "加载更多") : copy("Refreshing community", "刷新社区"),
            activity: "spinner",
          }
        : null,
    };
    if (state.view) state.view.update(snapshot);
    else {
      state.view = context.ui.mountWorkbench(snapshot, {
        onQuery(value) {
          state.query = value;
          paint();
        },
        onTab(id) {
          state.tab = id === "images" ? "images" : "all";
          paint();
        },
        onSelect(id) {
          state.selectedId = id;
          const changed = markRead(id);
          paint();
          if (changed) void persistCache();
          void loadDetail(id);
        },
        onAction(id, item) {
          if (id === "refresh") void loadFeed({ force: true });
          else if (id === "load-more") void loadMore();
          else if (id.startsWith("read:")) {
            if (markRead(id.slice("read:".length))) {
              paint();
              void persistCache();
            }
          } else if (id.startsWith("unread:")) {
            if (markUnread(id.slice("unread:".length))) {
              paint();
              void persistCache();
            }
          } else if (id.startsWith("open:")) {
            const postId = id.slice("open:".length);
            const target = state.all.find((post) => String(post.linkid) === postId)
              || state.all.find((post) => String(post.linkid) === String(item?.id))
              || selectedPost();
            if (target) void context.openUrl(postUrl(target));
          } else if (id.startsWith("open-comments:")) {
            const postId = id.slice("open-comments:".length);
            const target = state.all.find((post) => String(post.linkid) === postId) || selectedPost();
            if (target) void context.openUrl(postUrl(target));
          }
        },
      });
    }
  }

  async function loadDetail(id) {
    const key = String(id || "");
    const previous = state.details.get(key);
    if (
      !key
      || (
        previous
        && !previous.error
        && previous.commentsResolved
        && previous.detailFormatVersion === DETAIL_FORMAT_VERSION
      )
      || state.detailLoading.has(key)
    ) return;
    const post = state.all.find((entry) => String(entry.linkid) === key);
    if (!post) return;
    const generation = state.generation;
    state.detailLoading.add(key);
    paint();
    try {
      const cookie = await preference(context, "commentCookie", "");
      // The public detail endpoint is the stable equivalent of opening the
      // share page: it returns the complete structured link.text without
      // executing the captcha-protected website SPA.
      const detailRequest = fetchJson(
        context,
        `${DETAIL_URL}?link_id=${encodeURIComponent(key)}`,
        { Referer: postUrl(post) },
      );
      const commentRequest = cookie
        ? fetchJson(
            context,
            `${COMMENT_URL}?link_id=${encodeURIComponent(key)}&offset=0&limit=20`,
            { Cookie: cookie, Referer: postUrl(post) },
          ).then((result) => ({ result })).catch((error) => ({ error }))
        : Promise.resolve({ skipped: true });
      const [result, commentOutcome] = await Promise.all([detailRequest, commentRequest]);
      if (state.dead || generation !== state.generation) return;
      const link = { ...post, ...(result.link || {}) };
      const parsed = parseDetailContent(link);
      const commentSections = commentOutcome.result ? parseComments(commentOutcome.result) : [];
      let commentNotice = "";
      if (commentOutcome.skipped) {
        commentNotice = copy(
          "Xiaoheihe requires login for comments. Add your Xiaoheihe Cookie in plugin preferences, or open the post in Xiaoheihe.",
          "小黑盒评论接口要求登录。可在插件设置中填写小黑盒 Cookie，或前往小黑盒查看评论。",
        );
      } else if (commentOutcome.error) {
        commentNotice = copy(
          `Comments unavailable: ${message(commentOutcome.error)}`,
          `评论暂不可用：${message(commentOutcome.error)}`,
        );
      } else if (!commentSections.length) {
        commentNotice = Number(link.comment_num || post.comment_num || 0) > 0
          ? copy("No readable comments were returned. The login may have expired.", "未返回可读取的评论，登录信息可能已失效。")
          : copy("No comments yet.", "暂无评论。");
      }
      state.details.set(key, {
        ...parsed,
        detailFormatVersion: DETAIL_FORMAT_VERSION,
        topics: Array.isArray(result.topics) ? result.topics : post.topics,
        commentSections,
        commentsResolved: true,
        commentsTruncated: commentSections.length >= 20
          || Number(link.comment_num || post.comment_num || 0) > commentSections.length,
        commentNotice,
        savedAt: Date.now(),
      });
      await persistCache();
    } catch (error) {
      if (!state.dead && generation === state.generation) {
        state.details.set(key, { ...(previous || {}), error: message(error) });
      }
    } finally {
      state.detailLoading.delete(key);
      paint();
    }
  }

  async function loadFeed({ force = false } = {}) {
    if (state.loading) return;
    state.loading = true;
    state.error = null;
    const generation = ++state.generation;
    paint();
    try {
      const [configuredUrl, ttlPreference, retentionPreference, imageLayoutPreference] = await Promise.all([
        preference(context, "feedUrl", DEFAULT_FEED_URL),
        preference(context, "cacheTtlMinutes", "5"),
        preference(context, "retentionDays", "7"),
        preference(context, "detailImageLayout", "horizontal"),
      ]);
      state.imageLayout = imageLayoutPreference === "grid" ? "grid" : "horizontal";
      const ttlRaw = Number(ttlPreference);
      const ttlMs = Number.isFinite(ttlRaw) && ttlRaw > 0
        ? Math.min(60, ttlRaw) * 60 * 1000
        : DEFAULT_TTL_MS;
      const retentionRaw = Number(retentionPreference);
      state.retentionDays = retentionRaw === 3 ? 3 : 7;
      const cached = pruneCache(
        cacheModel(await cacheGet(context)) || cacheModel({}),
        state.retentionDays,
      );
      await cacheSet(context, cached);
      const cacheAge = cached?.savedAt ? Date.now() - cached.savedAt : Infinity;
      if (!force && cached.posts.length) {
        state.all = cached.posts;
        state.savedAt = cached.savedAt;
        state.readAt = cached.readAt;
        state.cachedAt = cached.cachedAt;
        state.details = new Map(Object.entries(cached.details));
        state.source = cacheAge <= ttlMs
          ? copy("Cached community feed", "社区缓存")
          : copy("Stale cache · refreshing", "旧缓存 · 正在刷新");
        state.offset = state.all.length;
        paint();
        if (cacheAge <= ttlMs) return;
      }
      const result = await fetchJson(context, feedUrlAtOffset(configuredUrl, 0));
      if (state.dead || generation !== state.generation) return;
      const links = Array.isArray(result.links) ? result.links : [];
      const now = Date.now();
      state.all = links;
      state.offset = links.length;
      state.source = copy("Live community feed", "小黑盒社区实时数据");
      state.savedAt = now;
      state.cachedAt = Object.fromEntries(
        links.map((post) => [String(post.linkid), now]),
      );
      state.readAt = Object.fromEntries(
        Object.entries(state.readAt).filter(([id]) =>
          links.some((post) => String(post.linkid) === id)
        ),
      );
      await persistCache(now);
      if (!state.selectedId && links[0]) state.selectedId = String(links[0].linkid);
    } catch (error) {
      if (!state.dead && generation === state.generation) {
        state.error = message(error);
        state.source = state.all.length
          ? copy("Offline · showing cache", "网络异常 · 显示缓存")
          : copy("Feed unavailable", "社区数据不可用");
      }
    } finally {
      if (!state.dead && generation === state.generation) {
        state.loading = false;
        paint();
        if (state.selectedId) void loadDetail(state.selectedId);
      }
    }
  }

  async function loadMore() {
    if (state.loadingMore || state.loading) return;
    state.loadingMore = true;
    state.error = null;
    const generation = state.generation;
    paint();
    try {
      const configuredUrl = await preference(context, "feedUrl", DEFAULT_FEED_URL);
      const result = await fetchJson(context, feedUrlAtOffset(configuredUrl, state.offset));
      if (state.dead || generation !== state.generation) return;
      const incoming = Array.isArray(result.links) ? result.links : [];
      const byId = new Map(state.all.map((post) => [String(post.linkid), post]));
      const now = Date.now();
      for (const post of incoming) {
        const id = String(post.linkid);
        byId.set(id, post);
        state.cachedAt[id] = state.cachedAt[id] || now;
      }
      state.all = [...byId.values()];
      state.offset += incoming.length;
      state.source = copy(`${state.all.length} loaded posts`, `已加载 ${state.all.length} 个帖子`);
      await persistCache();
    } catch (error) {
      if (!state.dead && generation === state.generation) state.error = message(error);
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
      state.generation += 1;
      state.view = null;
      container.innerHTML = "";
    },
  };
}

const activePanels = new WeakMap();

const plugin = {
  commands: [{
    name: "open-qxheihe",
    title: "打开 QxHeihe 小黑盒",
    async run(context) {
      await context.showToast(copy(
        "Open QxHeihe from Extensions or search.",
        "请从扩展模块或搜索中打开 QxHeihe。"
      ));
    },
  }],
  panel: {
    title: "QxHeihe 小黑盒",
    render(container, context) {
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

export { feedUrlAtOffset, heiheHkey };
