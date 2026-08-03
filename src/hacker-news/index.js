/**
 * Hacker News marketplace plugin — host Workbench only.
 *
 * The public Firebase API exposes the newest story ids and individual items.
 * Stories are loaded as a bounded batch; comments are fetched lazily for the
 * selected story and flattened with a stable tree path for the host reply list.
 */

const API_BASE = "https://hacker-news.firebaseio.com/v0";
const STORIES_URL = `${API_BASE}/newstories.json`;
const STORY_CACHE_KEY = "hacker-news.stories.v1";
const COMMENT_CACHE_PREFIX = "hacker-news.comments.v1.";
const DEFAULT_STORY_LIMIT = 30;
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MAX_COMMENT_ITEMS = 100;
const MAX_COMMENT_DEPTH = 8;
const REQUEST_CONCURRENCY = 8;

let qxLocale = "en";
let stopLocale = null;

function setLocale(context) {
  stopLocale?.();
  qxLocale = context?.locale?.current || "en";
  stopLocale = context?.locale?.onChange?.(({ current }) => {
    qxLocale = current || "en";
  }) || null;
}

function text(en, zh) {
  return qxLocale === "zh-CN" ? zh : en;
}

function errorMessage(error) {
  return String(error?.message || error || text("Unknown error", "未知错误"));
}

function htmlToText(value) {
  return String(value || "")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*p\s*>/gi, "\n\n")
    .replace(/<\s*\/\s*li\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x([\da-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatTime(timestamp) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return text("Unknown time", "时间未知");
  const date = new Date(value * 1000);
  const diff = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return text("just now", "刚刚");
  if (minutes < 60) return text(`${minutes}m ago`, `${minutes} 分钟前`);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return text(`${hours}h ago`, `${hours} 小时前`);
  const days = Math.floor(hours / 24);
  if (days < 30) return text(`${days}d ago`, `${days} 天前`);
  return date.toLocaleDateString(qxLocale);
}

function formatDate(timestamp) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return "—";
  return new Date(value * 1000).toLocaleString(qxLocale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function compactNumber(value) {
  const number = Number(value) || 0;
  return new Intl.NumberFormat(qxLocale, {
    notation: number >= 1000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(number);
}

async function preference(context, id, fallback) {
  try {
    const value = await context.getPreference?.(id);
    return String(value ?? fallback).trim() || fallback;
  } catch {
    return fallback;
  }
}

async function storageGet(context, key) {
  try {
    return await context.storage?.persist?.get(key);
  } catch {
    return null;
  }
}

async function storageSet(context, key, value) {
  try {
    await context.storage?.persist?.set(key, value);
  } catch {
    // Cache failure must not make the live feed fail.
  }
}

async function readJson(context, url) {
  if (!context.http?.fetch) {
    throw new Error(text("HTTP is unavailable", "HTTP 网络能力不可用"));
  }
  const response = await context.http.fetch(url, {
    method: "GET",
    timeoutMs: 30_000,
    headers: { Accept: "application/json" },
  });
  if (response && response.ok === false) {
    throw new Error(`${text("Hacker News request failed", "Hacker News 请求失败")} (${response.status || "HTTP"})`);
  }
  const body = typeof response === "string"
    ? response
    : typeof response?.text === "function"
      ? await response.text()
      : response?.body ?? response;
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      throw new Error(text("Hacker News returned invalid JSON", "Hacker News 返回了无效 JSON"));
    }
  }
  return body;
}

async function mapLimit(values, limit, worker) {
  const results = new Array(values.length);
  let cursor = 0;
  async function consume() {
    while (cursor < values.length) {
      const index = cursor++;
      try {
        results[index] = await worker(values[index], index);
      } catch {
        results[index] = null;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, consume));
  return results;
}

function normalizeStory(item) {
  const id = Number(item?.id);
  if (!Number.isSafeInteger(id) || id <= 0 || item?.type !== "story" || item?.deleted) return null;
  const title = htmlToText(item.title) || text("Untitled story", "无标题帖子");
  return {
    id,
    title,
    by: String(item.by || "").trim() || text("unknown", "未知作者"),
    score: Number(item.score) || 0,
    time: Number(item.time) || 0,
    descendants: Number(item.descendants) || 0,
    text: String(item.text || ""),
    url: /^https?:\/\//i.test(String(item.url || ""))
      ? String(item.url)
      : `https://news.ycombinator.com/item?id=${id}`,
    hnUrl: `https://news.ycombinator.com/item?id=${id}`,
    kids: Array.isArray(item.kids) ? item.kids.map(Number).filter(Number.isSafeInteger) : [],
  };
}

async function fetchStories(context, limit) {
  const ids = await readJson(context, STORIES_URL);
  if (!Array.isArray(ids)) {
    throw new Error(text("Unexpected Hacker News story list", "Hacker News 帖子列表格式异常"));
  }
  const selectedIds = ids.slice(0, limit).map(Number).filter(Number.isSafeInteger);
  const rows = await mapLimit(
    selectedIds,
    REQUEST_CONCURRENCY,
    (id) => readJson(context, `${API_BASE}/item/${id}.json`),
  );
  const stories = rows.map(normalizeStory).filter(Boolean);
  if (!stories.length) {
    throw new Error(text("Hacker News returned no readable stories", "Hacker News 没有返回可读帖子"));
  }
  return stories;
}

async function fetchComments(context, story) {
  const queue = (story.kids || []).map((id, index) => ({
    id,
    path: [index + 1],
    depth: 1,
  }));
  const comments = [];

  while (queue.length && comments.length < MAX_COMMENT_ITEMS) {
    const batch = queue.splice(0, REQUEST_CONCURRENCY);
    const rows = await mapLimit(
      batch,
      REQUEST_CONCURRENCY,
      (entry) => readJson(context, `${API_BASE}/item/${entry.id}.json`),
    );
    rows.forEach((item, index) => {
      const entry = batch[index];
      if (!entry || !item || item.type !== "comment" || item.deleted || item.dead) return;
      const body = htmlToText(item.text);
      if (!body) return;
      comments.push({
        id: String(item.id),
        floor: entry.path.join("."),
        author: String(item.by || text("deleted", "已删除用户")),
        body,
        createdAt: formatDate(item.time),
        originalPoster: Boolean(story.by && item.by === story.by),
      });
      if (entry.depth < MAX_COMMENT_DEPTH && Array.isArray(item.kids)) {
        item.kids.map(Number).filter(Number.isSafeInteger).forEach((childId, childIndex) => {
          if (queue.length + comments.length >= MAX_COMMENT_ITEMS * 2) return;
          queue.push({
            id: childId,
            path: [...entry.path, childIndex + 1],
            depth: entry.depth + 1,
          });
        });
      }
    });
  }
  return comments;
}

function validStoryCache(value) {
  return Boolean(
    value && typeof value === "object" && Array.isArray(value.stories)
      && Number(value.savedAt) > 0,
  );
}

function validCommentCache(value) {
  return Boolean(
    value && typeof value === "object" && Array.isArray(value.items)
      && Number(value.savedAt) > 0,
  );
}

function createPanel(context) {
  setLocale(context);
  const state = {
    stories: [],
    query: "",
    selectedId: null,
    comments: new Map(),
    commentsLoading: new Set(),
    loading: false,
    error: null,
    meta: "",
    ttlMs: DEFAULT_TTL_MS,
    revision: 0,
    generation: 0,
    dead: false,
    view: null,
  };

  const visibleStories = () => {
    const needle = state.query.trim().toLocaleLowerCase();
    if (!needle) return state.stories;
    return state.stories.filter((story) => (
      `${story.title} ${story.by} ${htmlToText(story.text)}`.toLocaleLowerCase().includes(needle)
    ));
  };

  function storyDetail(story) {
    const id = String(story.id);
    const cached = state.comments.get(id);
    const loading = state.commentsLoading.has(id);
    return {
      title: story.title,
      subtitle: `${compactNumber(story.score)} ${text("points", "分")} · ${story.by} · ${formatTime(story.time)} · ${compactNumber(story.descendants)} ${text("comments", "条评论")}`,
      body: htmlToText(story.text) || text("No text; open the original story for the linked article.", "帖子没有正文；可打开原帖查看链接文章。"),
      fields: [
        { label: text("Author", "作者"), value: story.by },
        { label: text("Score", "分数"), value: story.score },
        { label: text("Published", "发布时间"), value: formatDate(story.time) },
        { label: text("Comments", "评论"), value: story.descendants },
      ],
      replies: {
        title: text("Comments", "评论区"),
        total: story.descendants,
        items: cached?.items || [],
        status: loading
          ? { state: "loading", label: text("Loading comments…", "正在加载评论…") }
          : cached?.error
            ? { state: "error", error: cached.error }
            : undefined,
        emptyText: story.descendants
          ? text("No readable comments loaded.", "暂时没有加载到可读评论。")
          : text("No comments yet.", "暂无评论。"),
      },
    };
  }

  function storyItem(story) {
    const id = String(story.id);
    return {
      id,
      title: story.title,
      subtitle: `${compactNumber(story.score)} ${text("points", "分")} · ${story.by} · ${formatTime(story.time)}`,
      meta: story.url.replace(/^https?:\/\//i, "").split("/")[0],
      badge: `${compactNumber(story.descendants)} ${text("comments", "评")}`,
      detail: storyDetail(story),
      actions: [
        {
          id: `open:${id}`,
          label: text("Open in Browser", "在浏览器中打开"),
          menuKey: "o",
          kbd: "CmdOrCtrl+O",
        },
        {
          id: `copy:${id}`,
          label: text("Copy Hacker News Link", "复制 Hacker News 链接"),
          menuKey: "c",
        },
      ],
      raw: story,
    };
  }

  function paint() {
    if (state.dead) return;
    const rows = visibleStories();
    if (rows.length && !rows.some((story) => String(story.id) === String(state.selectedId))) {
      state.selectedId = String(rows[0].id);
    }
    if (!rows.length) state.selectedId = null;
    const selected = rows.find((story) => String(story.id) === String(state.selectedId));
    const snapshot = {
      revision: ++state.revision,
      title: "Hacker News",
      layout: { kind: "list" },
      query: state.query,
      queryPlaceholder: text("Search loaded stories…", "搜索已加载帖子…"),
      loading: state.loading && state.stories.length === 0,
      error: state.stories.length ? undefined : state.error,
      meta: state.meta || `${rows.length} ${text("stories", "个帖子")}`,
      selectedId: state.selectedId,
      items: rows.map(storyItem),
      emptyText: state.loading
        ? text("Loading Hacker News…", "正在加载 Hacker News…")
        : state.error
          ? state.error
          : state.query.trim()
            ? text("No matching stories", "没有匹配的帖子")
            : text("No stories loaded", "暂无帖子"),
      actions: [
        {
          id: "refresh",
          label: text("Refresh", "刷新"),
          menuKey: "r",
          kbd: "CmdOrCtrl+R",
          disabled: state.loading,
        },
        {
          id: "open-site",
          label: text("Open Hacker News", "打开 Hacker News"),
          menuKey: "h",
        },
      ],
      island: state.loading
        ? {
            primary: "Hacker News",
            secondary: text("Refreshing stories", "正在刷新帖子"),
            activity: "spinner",
          }
        : selected && state.commentsLoading.has(String(selected.id))
          ? {
              primary: selected.title,
              secondary: text("Loading comments", "正在加载评论"),
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
      onSelect(id) {
        state.selectedId = String(id || "");
        paint();
        if (state.selectedId) void ensureComments(state.selectedId);
      },
      onAction(id, item) {
        void runAction(String(id || ""), item);
      },
    });
  }

  async function ensureComments(storyId, { force = false } = {}) {
    const id = String(storyId || "");
    const story = state.stories.find((row) => String(row.id) === id);
    if (!story || state.dead || state.commentsLoading.has(id)) return;
    if (!force && state.comments.has(id) && !state.comments.get(id)?.error) return;

    state.commentsLoading.add(id);
    paint();
    try {
      const cached = await storageGet(context, `${COMMENT_CACHE_PREFIX}${id}`);
      const fresh = validCommentCache(cached) && Date.now() - Number(cached.savedAt) <= state.ttlMs;
      if (!force && validCommentCache(cached)) {
        state.comments.set(id, { items: cached.items, savedAt: cached.savedAt });
        if (fresh || story.kids.length === 0) return;
      }
      const items = await fetchComments(context, story);
      if (state.dead) return;
      const savedAt = Date.now();
      state.comments.set(id, { items, savedAt });
      await storageSet(context, `${COMMENT_CACHE_PREFIX}${id}`, { items, savedAt });
    } catch (error) {
      if (!state.dead) {
        const existing = state.comments.get(id);
        state.comments.set(id, {
          items: existing?.items || [],
          savedAt: existing?.savedAt || 0,
          error: errorMessage(error),
        });
      }
    } finally {
      state.commentsLoading.delete(id);
      if (!state.dead) paint();
    }
  }

  async function reload({ force = false } = {}) {
    if (state.dead || state.loading) return;
    const generation = ++state.generation;
    state.loading = true;
    state.error = null;
    paint();
    const rawLimit = await preference(context, "storyLimit", String(DEFAULT_STORY_LIMIT));
    const parsedLimit = Number(rawLimit);
    const limit = [20, 30, 50].includes(parsedLimit) ? parsedLimit : DEFAULT_STORY_LIMIT;
    const rawTtl = await preference(context, "cacheTtlMinutes", "5");
    const parsedTtl = Number(rawTtl);
    state.ttlMs = Number.isFinite(parsedTtl) && parsedTtl > 0
      ? Math.min(60, parsedTtl) * 60 * 1000
      : DEFAULT_TTL_MS;

    const cached = await storageGet(context, STORY_CACHE_KEY);
    const hasCache = validStoryCache(cached) && Array.isArray(cached.stories);
    const cacheFresh = hasCache && Date.now() - Number(cached.savedAt) <= state.ttlMs;
    if (hasCache && (!state.stories.length || !force)) {
      state.stories = cached.stories.map(normalizeStory).filter(Boolean);
      state.meta = `${state.stories.length} ${text("stories", "个帖子")} · ${text("cached", "已缓存")} ${formatTime(Math.floor(Number(cached.savedAt) / 1000))}`;
      paint();
      if (!force && cacheFresh) {
        state.loading = false;
        paint();
        if (state.selectedId) void ensureComments(state.selectedId);
        return;
      }
    }

    try {
      const stories = await fetchStories(context, limit);
      if (state.dead || generation !== state.generation) return;
      state.stories = stories;
      state.meta = `${stories.length} ${text("latest stories", "条最新帖子")}`;
      await storageSet(context, STORY_CACHE_KEY, { stories, savedAt: Date.now() });
    } catch (error) {
      if (state.dead || generation !== state.generation) return;
      if (!state.stories.length) state.error = errorMessage(error);
      else state.meta = `${state.stories.length} ${text("stories", "个帖子")} · ${text("offline cache", "离线缓存")}`;
    } finally {
      if (state.dead || generation !== state.generation) return;
      state.loading = false;
      paint();
      if (state.selectedId) void ensureComments(state.selectedId);
    }
  }

  async function copyLink(story) {
    try {
      if (!context.clipboard?.write) throw new Error(text("Clipboard unavailable", "剪贴板不可用"));
      await context.clipboard.write(story.hnUrl);
      context.showToast?.(text("Hacker News link copied", "Hacker News 链接已复制"));
    } catch (error) {
      context.showToast?.(errorMessage(error));
    }
  }

  async function runAction(id, item) {
    if (id === "refresh") {
      await reload({ force: true });
      return;
    }
    if (id === "open-site") {
      await context.openUrl("https://news.ycombinator.com/");
      return;
    }
    const match = /^(open|copy):(\d+)$/.exec(id);
    if (!match) return;
    const story = state.stories.find((row) => String(row.id) === match[2]) || item?.raw;
    if (!story) return;
    if (match[1] === "open") await context.openUrl(story.hnUrl || story.url);
    else await copyLink(story);
  }

  paint();
  void reload();

  return {
    destroy() {
      state.dead = true;
      state.generation += 1;
      state.view = null;
    },
  };
}

let activePanel = null;

export default {
  commands: [
    {
      name: "open-hacker-news",
      title: "Open Hacker News",
      async run(context) {
        setLocale(context);
        context.showToast?.(text(
          "Open Hacker News from Extensions or search results",
          "请从扩展或搜索结果打开 Hacker News 面板",
        ));
      },
    },
  ],

  panel: {
    title: "Hacker News",

    render(container, context) {
      activePanel?.destroy();
      activePanel = null;
      if (!context.ui?.mountWorkbench) {
        container.textContent = text(
          "Qx 0.6.13 or newer is required for the Hacker News Workbench panel.",
          "Hacker News Workbench 面板需要 Qx 0.6.13 或更高版本。",
        );
        return;
      }
      container.innerHTML = "";
      activePanel = createPanel(context);
      container.__qxHackerNewsPanel = activePanel;
    },

    destroy(container) {
      const panel = container?.__qxHackerNewsPanel || activePanel;
      panel?.destroy();
      if (container) {
        container.__qxHackerNewsPanel = null;
        container.innerHTML = "";
      }
      activePanel = null;
      stopLocale?.();
      stopLocale = null;
    },
  },
};
