import { responseContentType, safeImagePreview } from "./media.js";

const CACHE_KEY = "cache.weibo.v1";
const API_BASE = "https://m.weibo.cn";
const VISITOR_URL = "https://visitor.passport.weibo.cn/visitor/genvisitor2";
const USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15";
const DAY_MS = 24 * 60 * 60 * 1000;

function isChinese() {
  return (globalThis.navigator?.languages || [globalThis.navigator?.language || ""])
    .some((locale) => /^zh(?:-|$)/i.test(String(locale)));
}

function copy(en, zh) {
  return isChinese() ? zh : en;
}

function errorMessage(error) {
  return String(error?.message || error || copy("Unknown error", "未知错误"));
}

function cleanText(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, "\"")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseIds(value) {
  const seen = new Set();
  return String(value || "")
    .split(/[\s,，;；]+/)
    .map((entry) => entry.trim())
    .filter((entry) => /^\d{4,24}$/.test(entry))
    .filter((entry) => seen.has(entry) ? false : (seen.add(entry), true));
}

function parseCookies(value) {
  const seen = new Set();
  return String(value || "")
    .split(/\r?\n+/)
    .map((entry) => entry.trim())
    .filter((entry) => /(?:^|;\s*)SUB=/.test(entry))
    .filter((entry) => seen.has(entry) ? false : (seen.add(entry), true));
}

function parseDelayRange(value) {
  const numbers = String(value || "").match(/\d+/g)?.map(Number) || [];
  const min = Math.min(5_000, Math.max(0, numbers[0] ?? 500));
  const max = Math.min(8_000, Math.max(min, numbers[1] ?? min + 700));
  return [min, max];
}

function randomBetween(min, max) {
  return Math.round(min + Math.random() * Math.max(0, max - min));
}

function sleep(context, ms) {
  return new Promise((resolve) => (context.setTimeout || globalThis.setTimeout)(resolve, ms));
}

function createSerialScheduler(context, range) {
  let tail = Promise.resolve();
  let lastDispatchAt = 0;
  return async function schedule(task) {
    const result = tail.then(async () => {
      const wait = Math.max(0, lastDispatchAt + randomBetween(...range) - Date.now());
      if (wait) await sleep(context, wait);
      lastDispatchAt = Date.now();
      return task();
    });
    tail = result.catch(() => {});
    return result;
  };
}

function emptyCache() {
  return {
    savedAt: 0,
    feeds: {
      user: { savedAt: 0, items: [], sourceIds: [] },
      following: { savedAt: 0, items: [], sourceIds: [] },
    },
    details: {},
    readAt: {},
    cachedAt: {},
  };
}

function normalizeUser(value) {
  if (!value || typeof value !== "object") return {};
  return {
    id: String(value.id || ""),
    screenName: cleanText(value.screen_name || value.screenName),
    avatar: String(value.avatar_hd || value.profile_image_url || ""),
    description: cleanText(value.description),
    verified: Boolean(value.verified),
  };
}

function normalizePics(mblog) {
  const values = [];
  const push = (url) => {
    const normalized = String(url || "").replace(/^http:\/\//i, "https://");
    if (/^https:\/\//i.test(normalized) && !values.includes(normalized)) values.push(normalized);
  };
  for (const pic of Array.isArray(mblog?.pics) ? mblog.pics : []) {
    push(pic?.large?.url || pic?.url);
  }
  const retweeted = mblog?.retweeted_status;
  for (const pic of Array.isArray(retweeted?.pics) ? retweeted.pics : []) {
    push(pic?.large?.url || pic?.url);
  }
  return values;
}

function normalizePost(mblog) {
  if (!mblog || typeof mblog !== "object" || !mblog.id) return null;
  if (mblog.createdAt !== undefined && mblog.user?.screenName !== undefined) {
    return {
      id: String(mblog.id),
      text: cleanText(mblog.text),
      createdAt: String(mblog.createdAt || ""),
      source: cleanText(mblog.source),
      region: cleanText(mblog.region),
      user: normalizeUser(mblog.user),
      commentsCount: Number(mblog.commentsCount || 0),
      likesCount: Number(mblog.likesCount || 0),
      repostsCount: Number(mblog.repostsCount || 0),
      pics: [...new Set((Array.isArray(mblog.pics) ? mblog.pics : [])
        .map((url) => String(url || "").replace(/^http:\/\//i, "https://"))
        .filter((url) => /^https:\/\//i.test(url)))],
    };
  }
  const retweeted = mblog.retweeted_status;
  const primaryText = cleanText(mblog.raw_text || mblog.text);
  const retweetText = retweeted
    ? `${copy("Repost", "转发")} · @${cleanText(retweeted.user?.screen_name)}\n${cleanText(retweeted.raw_text || retweeted.text)}`
    : "";
  return {
    id: String(mblog.id),
    text: [primaryText, retweetText].filter(Boolean).join("\n\n"),
    createdAt: String(mblog.created_at || ""),
    source: cleanText(mblog.source),
    region: cleanText(mblog.region_name),
    user: normalizeUser(mblog.user),
    commentsCount: Number(mblog.comments_count || 0),
    likesCount: Number(mblog.attitudes_count || 0),
    repostsCount: Number(mblog.reposts_count || 0),
    pics: normalizePics(mblog),
  };
}

function normalizePosts(cards) {
  const byId = new Map();
  const visit = (card) => {
    if (card?.mblog) {
      const post = normalizePost(card.mblog);
      if (post) byId.set(post.id, post);
    }
    for (const child of Array.isArray(card?.card_group) ? card.card_group : []) visit(child);
  };
  for (const card of Array.isArray(cards) ? cards : []) visit(card);
  return [...byId.values()];
}

function normalizeComment(comment) {
  if (!comment || typeof comment !== "object" || !comment.id) return null;
  const upstreamFloor = Number(
    comment.floor
      || comment.floor_number
      || comment.reply_number
      || comment.index
      || 0,
  );
  return {
    id: String(comment.id),
    text: cleanText(comment.text),
    createdAt: String(comment.created_at || ""),
    source: cleanText(comment.source),
    likesCount: Number(comment.like_counts || comment.like_count || 0),
    user: normalizeUser(comment.user),
    replyText: cleanText(comment.reply_text),
    floor: Number.isFinite(upstreamFloor) && upstreamFloor > 0
      ? Math.round(upstreamFloor)
      : null,
  };
}

function normalizeCache(value) {
  const fallback = emptyCache();
  if (!value || typeof value !== "object") return fallback;
  const normalizeFeed = (feed) => ({
    savedAt: Number(feed?.savedAt) || 0,
    items: (Array.isArray(feed?.items) ? feed.items : []).map(normalizePost).filter(Boolean),
    sourceIds: parseIds(feed?.sourceIds || []),
  });
  const details = {};
  for (const [id, detail] of Object.entries(value.details || {})) {
    details[String(id)] = {
      body: cleanText(detail?.body),
      comments: (Array.isArray(detail?.comments) ? detail.comments : [])
        .map(normalizeComment).filter(Boolean),
      savedAt: Number(detail?.savedAt) || 0,
      complete: Boolean(detail?.complete),
    };
  }
  return {
    savedAt: Number(value.savedAt) || 0,
    feeds: {
      user: normalizeFeed(value.feeds?.user),
      following: normalizeFeed(value.feeds?.following),
    },
    details,
    readAt: value.readAt && typeof value.readAt === "object" ? value.readAt : {},
    cachedAt: value.cachedAt && typeof value.cachedAt === "object" ? value.cachedAt : {},
  };
}

function pruneCache(cache, retentionDays) {
  const cutoff = Date.now() - retentionDays * DAY_MS;
  const keptIds = new Set();
  const feeds = {};
  for (const [mode, feed] of Object.entries(cache.feeds || {})) {
    const items = (feed.items || []).filter((post) => {
      const cachedAt = Number(cache.cachedAt[post.id] || feed.savedAt);
      if (cachedAt && cachedAt < cutoff) return false;
      keptIds.add(post.id);
      return true;
    });
    feeds[mode] = { ...feed, items };
  }
  const keep = ([id]) => keptIds.has(String(id));
  return {
    savedAt: Date.now(),
    feeds,
    details: Object.fromEntries(Object.entries(cache.details || {}).filter(keep)),
    readAt: Object.fromEntries(Object.entries(cache.readAt || {}).filter(keep)),
    cachedAt: Object.fromEntries(Object.entries(cache.cachedAt || {}).filter(keep)),
  };
}

function formatDate(value) {
  const timestamp = Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) return copy("Unknown time", "时间未知");
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatCount(value) {
  return new Intl.NumberFormat(undefined, {
    notation: Number(value) >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(Number(value) || 0);
}

function postTitle(post) {
  const text = cleanText(post.text).replace(/\s+/g, " ");
  return text.slice(0, 54) || copy("Untitled post", "无标题微博");
}

function postUrl(post) {
  return `${API_BASE}/detail/${encodeURIComponent(post.id)}`;
}

async function preference(context, id, fallback = "") {
  try {
    const value = await context.getPreference(id);
    return value === undefined || value === null || value === "" ? fallback : value;
  } catch {
    return fallback;
  }
}

function createPanel(container, context) {
  const state = {
    cache: emptyCache(),
    mode: "user",
    userId: "",
    followedIds: [],
    followingLimit: 6,
    cookiePoolSize: 3,
    configuredCookies: [],
    cookiePool: [],
    cookieCursor: 0,
    delayRange: [500, 1_200],
    ttlMs: 10 * 60 * 1000,
    retentionDays: 7,
    imageLayout: "horizontal",
    query: "",
    selectedId: null,
    loading: false,
    detailLoading: new Set(),
    imageLoading: new Set(),
    imagePreviews: new Map(),
    imageRequests: new Map(),
    error: null,
    source: "",
    requestSequence: 0,
    revision: 0,
    view: null,
    destroyed: false,
  };
  let apiSchedule = createSerialScheduler(context, state.delayRange);
  let imageSchedule = createSerialScheduler(context, [150, 450]);

  function activeFeed() {
    return state.cache.feeds[state.mode] || { savedAt: 0, items: [], sourceIds: [] };
  }

  function allPosts() {
    return Object.values(state.cache.feeds).flatMap((feed) => feed.items || []);
  }

  function selectedPost() {
    return allPosts().find((post) => post.id === String(state.selectedId));
  }

  function filteredPosts() {
    const query = state.query.trim().toLocaleLowerCase();
    return activeFeed().items.filter((post) => !query || [
      post.text,
      post.user?.screenName,
      post.source,
      post.region,
    ].join(" ").toLocaleLowerCase().includes(query));
  }

  function commentsReplies(post) {
    const comments = state.cache.details[post.id]?.comments || [];
    return {
      title: copy("Comments", "评论"),
      total: Math.max(Number(post.commentsCount) || 0, comments.length),
      items: comments.map((comment, index) => ({
        id: comment.id,
        floor: comment.floor || index + 1,
        author: comment.user?.screenName || copy("Unknown user", "未知用户"),
        createdAt: formatDate(comment.createdAt),
        originalPoster: Boolean(
          post.user?.id
          && comment.user?.id
          && post.user.id === comment.user.id,
        ),
        body: [
          comment.text,
          comment.replyText ? `${copy("Reply", "回复")}：${comment.replyText}` : "",
        ].filter(Boolean).join("\n"),
      })),
      status: state.detailLoading.has(post.id) ? {
        state: "loading",
        label: copy("Loading comments…", "正在加载评论…"),
      } : undefined,
      emptyText: copy("No comments yet.", "暂无评论。"),
    };
  }

  function detailFor(post) {
    const detail = state.cache.details[post.id];
    const images = post.pics.map((url) => {
      const preview = state.imagePreviews.get(`detail:${url}`)
        || state.imagePreviews.get(`thumbnail:${url}`);
      return preview ? {
        url: preview,
        alt: postTitle(post),
        fit: "contain",
        aspectRatio: "auto",
        zoomable: true,
      } : null;
    }).filter(Boolean);
    const busy = state.detailLoading.has(post.id) || state.imageLoading.has(post.id);
    return {
      title: postTitle(post),
      subtitle: `${post.user?.screenName || copy("Unknown author", "未知作者")} · ${formatDate(post.createdAt)}`,
      status: busy ? {
        state: "loading",
        label: state.detailLoading.has(post.id)
          ? copy("Loading comments and full post…", "正在加载完整微博与评论…")
          : copy("Proxying original images…", "正在代理微博原图…"),
      } : undefined,
      body: detail?.body || post.text,
      images,
      imageLayout: state.imageLayout,
      mediaPlacement: "header",
      fields: [
        { label: copy("Author", "作者"), value: post.user?.screenName || "—" },
        { label: copy("Likes", "点赞"), value: formatCount(post.likesCount) },
        { label: copy("Comments", "评论"), value: formatCount(post.commentsCount) },
        { label: copy("Reposts", "转发"), value: formatCount(post.repostsCount) },
        { label: copy("Published", "发布时间"), value: formatDate(post.createdAt) },
        { label: copy("Source", "来源"), value: post.source || "—" },
        { label: copy("Region", "地区"), value: post.region || "—" },
      ],
      replies: commentsReplies(post),
    };
  }

  function itemFor(post) {
    const cover = post.pics[0];
    const preview = cover ? state.imagePreviews.get(`thumbnail:${cover}`) : "";
    const read = Boolean(state.cache.readAt[post.id]);
    return {
      id: post.id,
      title: postTitle(post),
      subtitle: post.text,
      meta: `${post.user?.screenName || copy("Unknown author", "未知作者")} · ${formatDate(post.createdAt)}`,
      badge: `${read ? "" : `${copy("Unread", "未读")} · `}${post.pics.length ? `${post.pics.length} ${copy("images", "图")} · ` : ""}${formatCount(post.commentsCount)} ${copy("comments", "评论")}`,
      tone: read ? "neutral" : "accent",
      image: preview ? { url: preview, alt: postTitle(post), fit: "cover" } : undefined,
      detail: detailFor(post),
      actions: [
        { id: `open:${post.id}`, label: copy("Open on Weibo", "在微博中打开"), primary: true },
        {
          id: `${read ? "unread" : "read"}:${post.id}`,
          label: read ? copy("Mark Unread", "标为未读") : copy("Mark Read", "标为已读"),
        },
      ],
    };
  }

  function paint() {
    if (state.destroyed) return;
    const posts = filteredPosts();
    if (!posts.some((post) => post.id === String(state.selectedId))) {
      state.selectedId = posts[0]?.id || null;
    }
    const selected = selectedPost();
    const snapshot = {
      revision: ++state.revision,
      title: "QxWeibo 微博",
      query: state.query,
      queryPlaceholder: copy("Search loaded Weibo posts…", "搜索已加载的微博…"),
      layout: { kind: "list" },
      tabs: [
        { id: "user", label: copy("User Posts", "用户帖子"), active: state.mode === "user" },
        { id: "following", label: copy("Following Feed", "关注流"), active: state.mode === "following" },
      ],
      loading: state.loading && activeFeed().items.length === 0,
      error: state.error,
      meta: state.source,
      selectedId: state.selectedId,
      items: posts.map(itemFor),
      emptyText: !state.userId
        ? copy("Set a primary user UID in plugin preferences.", "请先在插件偏好设置中填写主用户 UID。")
        : state.loading
          ? copy("Loading Weibo…", "正在加载微博…")
          : copy("No matching posts", "没有匹配的微博"),
      actions: [
        { id: "refresh", label: copy("Refresh", "刷新"), primary: !selected, disabled: state.loading },
        { id: "mark-visible-read", label: copy("Mark Visible Read", "当前结果标为已读") },
        { id: "clear-cache", label: copy("Clear Content Cache", "清理内容缓存"), tone: "danger" },
      ],
      island: selected && (state.detailLoading.has(selected.id) || state.imageLoading.has(selected.id))
        ? {
            primary: postTitle(selected),
            secondary: state.detailLoading.has(selected.id)
              ? copy("Loading full post and comments", "正在加载完整微博与评论")
              : copy("Proxying original images", "正在代理微博原图"),
            activity: "spinner",
          }
        : state.loading
          ? {
              primary: "QxWeibo",
              secondary: state.mode === "following"
                ? copy("Refreshing following feed", "正在刷新关注流")
                : copy("Refreshing user posts", "正在刷新用户帖子"),
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
        if (!["user", "following"].includes(id) || id === state.mode) return;
        state.mode = id;
        state.query = "";
        state.error = null;
        state.selectedId = activeFeed().items[0]?.id || null;
        paint();
        refresh({ force: false });
      },
      onSelect(id) {
        const postId = String(id || "");
        state.selectedId = postId;
        if (postId && !state.cache.readAt[postId]) {
          state.cache.readAt[postId] = Date.now();
          persistCache();
        }
        paint();
        loadDetail(postId);
        loadPostImages(postId);
      },
      onAction(id, item) {
        if (id === "refresh") {
          refresh({ force: true });
        } else if (id === "mark-visible-read") {
          const now = Date.now();
          for (const post of filteredPosts()) state.cache.readAt[post.id] = now;
          paint();
          persistCache();
        } else if (id === "clear-cache") {
          state.cache = emptyCache();
          state.imagePreviews.clear();
          state.selectedId = null;
          state.source = copy("Cache cleared", "缓存已清理");
          paint();
          persistCache();
        } else if (id.startsWith("open:")) {
          const post = allPosts().find((entry) => entry.id === id.slice(5))
            || allPosts().find((entry) => entry.id === String(item?.id));
          if (post) context.openUrl(postUrl(post));
        } else if (id.startsWith("read:")) {
          state.cache.readAt[id.slice(5)] = Date.now();
          paint();
          persistCache();
        } else if (id.startsWith("unread:")) {
          delete state.cache.readAt[id.slice(7)];
          paint();
          persistCache();
        }
      },
    });
  }

  async function persistCache() {
    state.cache = pruneCache(state.cache, state.retentionDays);
    try {
      await context.storage.persist.set(CACHE_KEY, { ...state.cache, savedAt: Date.now() });
    } catch {}
  }

  async function generateVisitorCookie() {
    const response = await apiSchedule(() => context.http.fetch(VISITOR_URL, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        cb: "visitor_callback",
        from: "weibo",
        tid: "",
        return_url: `${API_BASE}/`,
      }).toString(),
      timeoutMs: 30_000,
    }));
    if (!response?.ok) throw new Error(`Visitor passport HTTP ${response?.status || "error"}`);
    const text = await response.text();
    const match = text.match(/visitor_callback\((.*)\)/s);
    const payload = match ? JSON.parse(match[1]) : {};
    const sub = payload?.data?.sub;
    const subp = payload?.data?.subp;
    if (!sub || !subp) throw new Error(copy("Visitor Cookie generation failed", "游客 Cookie 生成失败"));
    return `SUB=${sub}; SUBP=${subp}`;
  }

  async function ensureCookiePool() {
    if (state.cookiePool.length >= state.cookiePoolSize) return;
    state.cookiePool = [...state.configuredCookies];
    while (!state.destroyed && state.cookiePool.length < state.cookiePoolSize) {
      try {
        state.cookiePool.push(await generateVisitorCookie());
      } catch (error) {
        if (!state.cookiePool.length) throw error;
        break;
      }
    }
  }

  function nextCookie() {
    if (!state.cookiePool.length) return "";
    const cookie = state.cookiePool[state.cookieCursor % state.cookiePool.length];
    state.cookieCursor = (state.cookieCursor + 1) % state.cookiePool.length;
    return cookie;
  }

  async function requestJson(url, attempts = 3) {
    await ensureCookiePool();
    let lastError;
    for (let attempt = 0; attempt < Math.min(attempts, Math.max(1, state.cookiePool.length)); attempt += 1) {
      try {
        const response = await apiSchedule(() => context.http.fetch(url, {
          method: "GET",
          headers: {
            "User-Agent": USER_AGENT,
            Referer: `${API_BASE}/`,
            Cookie: nextCookie(),
            Accept: "application/json, text/plain, */*",
          },
          timeoutMs: 45_000,
        }));
        if (!response?.ok) throw new Error(`Weibo HTTP ${response?.status || "error"}`);
        const payload = await response.json();
        if (payload?.ok === 0) throw new Error(payload?.msg || copy("Weibo rejected the request", "微博拒绝了请求"));
        return payload;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error(copy("Weibo request failed", "微博请求失败"));
  }

  async function fetchUserPosts(uid) {
    const params = new URLSearchParams({
      type: "uid",
      value: uid,
      containerid: `107603${uid}`,
      since_id: "",
    });
    const payload = await requestJson(`${API_BASE}/api/container/getIndex?${params}`);
    return normalizePosts(payload?.data?.cards);
  }

  async function fetchFollowingIds(uid) {
    const params = new URLSearchParams({
      containerid: `231051_-_followers_-_${uid}`,
      page: "1",
    });
    const payload = await requestJson(`${API_BASE}/api/container/getIndex?${params}`);
    const ids = [];
    const visit = (card) => {
      const userId = String(card?.user?.id || "");
      if (/^\d+$/.test(userId) && !ids.includes(userId)) ids.push(userId);
      for (const child of Array.isArray(card?.card_group) ? card.card_group : []) visit(child);
    };
    for (const card of payload?.data?.cards || []) visit(card);
    return ids;
  }

  async function fetchMode(mode) {
    if (mode === "user") {
      return { items: await fetchUserPosts(state.userId), sourceIds: [state.userId] };
    }
    let sourceIds = state.followedIds;
    if (!sourceIds.length) sourceIds = await fetchFollowingIds(state.userId);
    sourceIds = sourceIds.slice(0, state.followingLimit);
    const collected = [];
    for (const uid of sourceIds) {
      if (state.destroyed) break;
      try {
        collected.push(...await fetchUserPosts(uid));
      } catch {}
    }
    const byId = new Map(collected.map((post) => [post.id, post]));
    const items = [...byId.values()].sort(
      (left, right) => (Date.parse(right.createdAt) || 0) - (Date.parse(left.createdAt) || 0),
    );
    return { items, sourceIds };
  }

  async function proxyImage(url, kind) {
    const key = `${kind}:${url}`;
    if (state.imagePreviews.has(key)) return state.imagePreviews.get(key);
    if (state.imageRequests.has(key)) return state.imageRequests.get(key);
    const request = (async () => {
      try {
        await ensureCookiePool();
        const response = await imageSchedule(() => context.http.fetch(url, {
          method: "GET",
          headers: {
            "User-Agent": USER_AGENT,
            Referer: "https://weibo.com/",
            Cookie: nextCookie(),
            Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          },
          timeoutMs: 90_000,
        }));
        if (!response?.ok) throw new Error(`Image HTTP ${response?.status || "error"}`);
        const type = responseContentType(response);
        if (!type.startsWith("image/")) throw new Error("Response is not an image");
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (!bytes.length) throw new Error("Image response was empty");
        const preview = await safeImagePreview(bytes, type, kind);
        if (preview) state.imagePreviews.set(key, preview);
        return preview;
      } catch {
        return "";
      } finally {
        state.imageRequests.delete(key);
      }
    })();
    state.imageRequests.set(key, request);
    return request;
  }

  async function loadThumbnails(posts) {
    for (const post of posts.slice(0, 24)) {
      if (state.destroyed) return;
      const cover = post.pics[0];
      if (cover && await proxyImage(cover, "thumbnail")) paint();
    }
  }

  async function loadPostImages(postId) {
    const post = allPosts().find((entry) => entry.id === String(postId));
    if (!post?.pics.length || state.imageLoading.has(post.id)) return;
    state.imageLoading.add(post.id);
    paint();
    try {
      for (const url of post.pics) {
        if (state.destroyed) break;
        if (await proxyImage(url, "detail")) paint();
      }
    } finally {
      state.imageLoading.delete(post.id);
      paint();
    }
  }

  async function loadDetail(postId) {
    const id = String(postId || "");
    const post = allPosts().find((entry) => entry.id === id);
    if (!post || state.detailLoading.has(id)) return;
    const cached = state.cache.details[id];
    if (cached?.complete && Date.now() - cached.savedAt <= state.ttlMs) return;
    state.detailLoading.add(id);
    paint();
    try {
      let body = post.text;
      try {
        const detailPayload = await requestJson(`${API_BASE}/statuses/show?id=${encodeURIComponent(id)}`);
        const detailPost = normalizePost(detailPayload?.data || detailPayload);
        if (detailPost?.text) body = detailPost.text;
      } catch {}
      const commentsPayload = await requestJson(
        `${API_BASE}/api/comments/show?id=${encodeURIComponent(id)}&page=1`,
      );
      const comments = (commentsPayload?.data?.data || []).map(normalizeComment).filter(Boolean);
      state.cache.details[id] = {
        body,
        comments,
        complete: true,
        savedAt: Date.now(),
      };
      await persistCache();
    } catch (error) {
      state.error = errorMessage(error);
    } finally {
      state.detailLoading.delete(id);
      paint();
    }
  }

  async function refresh({ force = false } = {}) {
    const mode = state.mode;
    const sequence = ++state.requestSequence;
    const cached = activeFeed();
    state.error = null;
    if (!state.userId) {
      state.source = copy("Configuration required", "需要配置");
      state.loading = false;
      paint();
      return;
    }
    if (!force && cached.items.length && Date.now() - cached.savedAt <= state.ttlMs) {
      state.source = copy("Cached Weibo feed", "微博缓存");
      state.selectedId ||= cached.items[0]?.id || null;
      paint();
      loadThumbnails(cached.items);
      if (state.selectedId) {
        loadDetail(state.selectedId);
        loadPostImages(state.selectedId);
      }
      return;
    }
    state.loading = true;
    state.source = cached.items.length
      ? copy("Stale cache · refreshing", "旧缓存 · 正在刷新")
      : copy("Connecting to Weibo", "正在连接微博");
    paint();
    try {
      const result = await fetchMode(mode);
      if (state.destroyed || sequence !== state.requestSequence || mode !== state.mode) return;
      const now = Date.now();
      state.cache.feeds[mode] = { items: result.items, sourceIds: result.sourceIds, savedAt: now };
      for (const post of result.items) state.cache.cachedAt[post.id] ||= now;
      state.selectedId = result.items[0]?.id || null;
      state.source = mode === "following"
        ? copy(`${result.sourceIds.length} users · ${result.items.length} posts`, `${result.sourceIds.length} 位用户 · ${result.items.length} 条微博`)
        : copy(`${result.items.length} user posts`, `${result.items.length} 条用户微博`);
      await persistCache();
      loadThumbnails(result.items);
      if (state.selectedId) {
        loadDetail(state.selectedId);
        loadPostImages(state.selectedId);
      }
    } catch (error) {
      if (!state.destroyed && sequence === state.requestSequence) {
        state.error = errorMessage(error);
        state.source = cached.items.length
          ? copy("Offline · showing cache", "网络异常 · 显示缓存")
          : copy("Weibo is unavailable", "微博数据不可用");
      }
    } finally {
      if (!state.destroyed && sequence === state.requestSequence) {
        state.loading = false;
        paint();
      }
    }
  }

  async function initialize() {
    const [
      userId,
      followedUserIds,
      visitorCookies,
      visitorPoolSize,
      followingUserLimit,
      requestDelayMs,
      cacheTtlMinutes,
      retentionDays,
      detailImageLayout,
    ] = await Promise.all([
      preference(context, "userId"),
      preference(context, "followedUserIds"),
      preference(context, "visitorCookies"),
      preference(context, "visitorPoolSize", "3"),
      preference(context, "followingUserLimit", 6),
      preference(context, "requestDelayMs", "500-1200"),
      preference(context, "cacheTtlMinutes", "10"),
      preference(context, "retentionDays", "7"),
      preference(context, "detailImageLayout", "horizontal"),
    ]);
    state.userId = parseIds(userId)[0] || "";
    state.followedIds = parseIds(followedUserIds);
    state.configuredCookies = parseCookies(visitorCookies);
    state.cookiePoolSize = Math.max(2, Math.min(4, Number(visitorPoolSize) || 3));
    state.followingLimit = Math.max(3, Math.min(12, Number(followingUserLimit) || 6));
    state.delayRange = parseDelayRange(requestDelayMs);
    state.ttlMs = Math.max(1, Math.min(120, Number(cacheTtlMinutes) || 10)) * 60 * 1000;
    state.retentionDays = [3, 7, 14].includes(Number(retentionDays)) ? Number(retentionDays) : 7;
    state.imageLayout = detailImageLayout === "grid" ? "grid" : "horizontal";
    apiSchedule = createSerialScheduler(context, state.delayRange);
    imageSchedule = createSerialScheduler(context, [
      Math.round(state.delayRange[0] / 3),
      Math.max(250, Math.round(state.delayRange[1] / 2)),
    ]);
    try {
      state.cache = pruneCache(
        normalizeCache(await context.storage.persist.get(CACHE_KEY)),
        state.retentionDays,
      );
    } catch {
      state.cache = emptyCache();
    }
    const cached = activeFeed();
    state.selectedId = cached.items[0]?.id || null;
    if (cached.items.length) {
      state.source = copy("Cached Weibo feed", "微博缓存");
      paint();
      loadThumbnails(cached.items);
    }
    await persistCache();
    refresh({ force: false });
  }

  paint();
  initialize();
  return {
    destroy() {
      state.destroyed = true;
      state.requestSequence += 1;
      state.view = null;
      state.imageRequests.clear();
      container.innerHTML = "";
    },
  };
}

export { cleanText, copy, createPanel, normalizePost, parseCookies, parseIds };
