/**
 * QxHeihe — 小黑盒社区 Workbench plugin.
 *
 * Feed data is cached stale-while-revalidate. Selecting a row opens the
 * host-owned master-detail view and asynchronously replaces the feed summary
 * with the official structured post detail.
 */

const DEFAULT_FEED_URL = "https://api.xiaoheihe.cn/bbs/app/feeds?app=heybox&os_type=web&x_app=heybox_website&x_client_type=web&x_os_type=iOS&x_client_version=&client_type=web&web_version=3.0&version=999.0.4&hkey=D1D1P32&_time=1784804927&nonce=54097B81FDE24D170636FC99637DD0C0&pull=0&offset=0&dw=604";
const DETAIL_URL = "https://api.xiaoheihe.cn/bbs/web/link/detail";
const LEGACY_CACHE_KEY = "qxheihe.feed.v1";
const CACHE_KEY = "cache.community.v2";
const DEFAULT_TTL_MS = 5 * 60 * 1000;

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

async function fetchJson(context, url) {
  const response = await context.http.fetch(url, {
    method: "GET",
    timeoutMs: 30_000,
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 QxHeihe/1.0",
    },
  });
  const payload = await responseJson(response);
  if (payload?.status !== "ok") {
    throw new Error(payload?.msg || copy("The API rejected the request", "接口拒绝了请求"));
  }
  return payload.result || {};
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

function feedUrlAtOffset(base, offset) {
  const url = new URL(base);
  url.searchParams.set("offset", String(Math.max(0, offset)));
  url.searchParams.set("pull", offset > 0 ? "1" : "0");
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
    return {
      title: postTitle(post),
      subtitle: `${post.user?.username || copy("Unknown author", "未知作者")} · ${topic} · ${formatTime(post.create_at)}`,
      status: state.detailLoading.has(id)
        ? { state: "loading", label: copy("Loading full post…", "正在加载完整帖子…") }
        : cached?.error
          ? { state: "error", error: cached.error }
          : undefined,
      body,
      images,
      fields: [
        { label: copy("Author", "作者"), value: post.user?.username || "—" },
        { label: copy("Community", "社区"), value: topic },
        { label: copy("Likes", "点赞"), value: Number(post.link_award_num || post.up || 0) },
        { label: copy("Comments", "评论"), value: Number(post.comment_num || 0) },
        { label: copy("Published", "发布时间"), value: formatTime(post.create_at) },
      ],
      sections: post.hashtags?.length ? [{
        title: copy("Tags", "标签"),
        body: post.hashtags.map((tag) => `#${tag.name}`).join("  "),
      }] : [],
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
          }
        },
      });
    }
  }

  async function loadDetail(id) {
    const key = String(id || "");
    const previous = state.details.get(key);
    if (!key || (previous && !previous.error) || state.detailLoading.has(key)) return;
    const post = state.all.find((entry) => String(entry.linkid) === key);
    if (!post) return;
    const generation = state.generation;
    state.detailLoading.add(key);
    paint();
    try {
      const result = await fetchJson(context, `${DETAIL_URL}?link_id=${encodeURIComponent(key)}`);
      if (state.dead || generation !== state.generation) return;
      const link = { ...post, ...(result.link || {}) };
      const parsed = parseDetailContent(link);
      state.details.set(key, {
        ...parsed,
        topics: Array.isArray(result.topics) ? result.topics : post.topics,
        savedAt: Date.now(),
      });
      await persistCache();
    } catch (error) {
      if (!state.dead && generation === state.generation) {
        state.details.set(key, { error: message(error) });
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
      const configuredUrl = await preference(context, "feedUrl", DEFAULT_FEED_URL);
      const ttlRaw = Number(await preference(context, "cacheTtlMinutes", "5"));
      const ttlMs = Number.isFinite(ttlRaw) && ttlRaw > 0
        ? Math.min(60, ttlRaw) * 60 * 1000
        : DEFAULT_TTL_MS;
      const retentionRaw = Number(await preference(context, "retentionDays", "7"));
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
