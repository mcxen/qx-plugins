/**
 * V2EX marketplace plugin — host Workbench only.
 *
 * Data: invoke:v2ex_* (shared host memory+disk cache) with public HTTP fallback
 * for latest/hot. Nodes / notifications / token need a preference token.
 * UI: context.ui.mountWorkbench — list + structured detail + host replies.
 */

const CACHE_PREFIX = "v2ex.cache.";
const DEFAULT_TTL_MS = 3 * 60 * 1000;
const STALE_MS = 60 * 60 * 1000;

var qxLocale = "en";
var stopLocale = null;

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

function stripHtml(html) {
  return String(html || "")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*p\s*>/gi, "\n\n")
    .replace(/<\/\s*li\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(Number(ts) * 1000);
  if (!Number.isFinite(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return text("just now", "刚刚");
  if (hours < 24) return text(`${hours}h ago`, `${hours}小时前`);
  const days = Math.floor(hours / 24);
  if (days < 30) return text(`${days}d ago`, `${days}天前`);
  return d.toLocaleDateString(qxLocale);
}

function formatDate(ts) {
  if (!ts) return "—";
  return new Date(Number(ts) * 1000).toLocaleString(qxLocale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ageLabel(savedAt) {
  if (!savedAt) return "";
  const sec = Math.max(0, Math.floor((Date.now() - savedAt) / 1000));
  if (sec < 60) return text(`${sec}s ago`, `${sec}秒前`);
  if (sec < 3600) return text(`${Math.floor(sec / 60)}m ago`, `${Math.floor(sec / 60)}分钟前`);
  return text(`${Math.floor(sec / 3600)}h ago`, `${Math.floor(sec / 3600)}小时前`);
}

async function getToken(context) {
  try {
    return String((await context.getPreference("token")) || "").trim();
  } catch {
    return "";
  }
}

async function getNodes(context) {
  try {
    const raw = await context.getPreference("nodes");
    return String(raw || "programmer create share ideas apple jobs qna")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  } catch {
    return ["programmer", "create", "share", "ideas", "apple", "jobs", "qna"];
  }
}

async function getTtlMs(context) {
  try {
    const raw = await context.getPreference("cacheTtlMinutes");
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return Math.min(60, n) * 60 * 1000;
  } catch {
    /* ignore */
  }
  return DEFAULT_TTL_MS;
}

const storage = {
  async get(context, key) {
    try {
      if (context.storage?.persist?.get) return await context.storage.persist.get(key);
      if (context.storage?.get) return await context.storage.get(key);
    } catch {
      /* ignore */
    }
    return null;
  },
  async set(context, key, value) {
    try {
      if (context.storage?.persist?.set) return await context.storage.persist.set(key, value);
      if (context.storage?.set) return await context.storage.set(key, value);
    } catch {
      /* ignore */
    }
  },
};

async function readCache(context, key) {
  const raw = await storage.get(context, CACHE_PREFIX + key);
  if (!raw || typeof raw !== "object") return null;
  if (!Array.isArray(raw.data) && typeof raw.data !== "object") return null;
  return raw;
}

async function writeCache(context, key, data) {
  await storage.set(context, CACHE_PREFIX + key, {
    data,
    savedAt: Date.now(),
  });
}

/**
 * Stale-while-revalidate: paint cache immediately; refresh when stale.
 * @returns {{ data: any, fromCache: boolean, refreshing: boolean, savedAt?: number, error?: unknown }}
 */
async function loadWithCache(context, key, loader, { force = false, ttlMs = DEFAULT_TTL_MS } = {}) {
  const cached = await readCache(context, key);
  const age = cached?.savedAt ? Date.now() - cached.savedAt : Infinity;
  const fresh = age <= ttlMs;
  const usable = cached && age <= STALE_MS;

  if (usable && !force) {
    const result = {
      data: cached.data,
      fromCache: true,
      refreshing: !fresh,
      savedAt: cached.savedAt,
    };
    if (!fresh) {
      Promise.resolve()
        .then(() => loader())
        .then((data) => writeCache(context, key, data))
        .catch(() => {});
    }
    return result;
  }

  try {
    const data = await loader();
    await writeCache(context, key, data);
    return { data, fromCache: false, refreshing: false, savedAt: Date.now() };
  } catch (err) {
    if (usable) {
      return {
        data: cached.data,
        fromCache: true,
        refreshing: false,
        savedAt: cached.savedAt,
        error: err,
      };
    }
    throw err;
  }
}

function normalizeTopic(row) {
  const id = Number(row?.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  return {
    id,
    title: String(row?.title || "").trim() || text("(untitled)", "（无标题）"),
    url: String(row?.url || `https://www.v2ex.com/t/${id}`),
    node: String(row?.node || "").trim(),
    author: String(row?.author || "").trim(),
    replies: Number(row?.replies) || 0,
    created: Number(row?.created) || 0,
    content: String(row?.content || ""),
    last_modified: Number(row?.last_modified) || Number(row?.created) || 0,
  };
}

function normalizeReply(row, index) {
  const id = Number(row?.id);
  if (!Number.isFinite(id)) return null;
  return {
    id,
    content: String(row?.content || ""),
    author: String(row?.author || "").trim() || text("unknown", "未知"),
    created: Number(row?.created) || 0,
    floor: Number(row?.floor) || index + 1,
  };
}

function normalizeNotification(row) {
  const id = Number(row?.id);
  if (!Number.isFinite(id)) return null;
  return {
    id,
    text: String(row?.text || ""),
    member: String(row?.member || "").trim() || text("unknown", "未知"),
    created: Number(row?.created) || 0,
  };
}

/** Host invoke first (shared disk cache), then public HTTP for latest/hot. */
async function fetchTopicsLive(context, mode) {
  const m = mode === "hot" ? "hot" : "latest";
  try {
    const rows = await context.invoke("v2ex_fetch_topics", { mode: m });
    if (Array.isArray(rows)) return rows.map(normalizeTopic).filter(Boolean);
  } catch {
    /* fall through */
  }
  if (!context.http?.fetch) throw new Error(text("No V2EX transport available", "没有可用的 V2EX 传输通道"));
  const path = m === "hot" ? "/api/topics/hot.json" : "/api/topics/latest.json";
  const resp = await context.http.fetch(`https://www.v2ex.com${path}`, { method: "GET" });
  const body = typeof resp === "string"
    ? resp
    : (typeof resp?.text === "function" ? await resp.text() : (resp?.body || JSON.stringify(resp)));
  const arr = typeof body === "string" ? JSON.parse(body) : body;
  if (!Array.isArray(arr)) throw new Error(text("Unexpected V2EX payload", "V2EX 响应格式异常"));
  return arr.map((v) => normalizeTopic({
    id: v.id,
    title: v.title || "",
    url: `https://www.v2ex.com/t/${v.id}`,
    node: v.node?.title || v.node?.name || "",
    author: v.member?.username || "",
    replies: v.replies || 0,
    created: v.created || 0,
    content: v.content_rendered || v.content || "",
    last_modified: v.last_modified || v.created || 0,
  })).filter(Boolean);
}

async function fetchNodeTopicsLive(context, node, token) {
  const rows = await context.invoke("v2ex_fetch_node_topics", {
    node,
    token: token || undefined,
  });
  return (Array.isArray(rows) ? rows : []).map(normalizeTopic).filter(Boolean);
}

async function fetchRepliesLive(context, topicId, token) {
  const rows = await context.invoke("v2ex_fetch_topic_replies", {
    topicId,
    token: token || undefined,
  });
  return (Array.isArray(rows) ? rows : [])
    .map((row, index) => normalizeReply(row, index))
    .filter(Boolean);
}

async function fetchNotificationsLive(context, token) {
  const rows = await context.invoke("v2ex_fetch_notifications", { token });
  return (Array.isArray(rows) ? rows : []).map(normalizeNotification).filter(Boolean);
}

function topicMatchesQuery(topic, needle) {
  if (!needle) return true;
  return (
    topic.title.toLowerCase().includes(needle)
    || topic.node.toLowerCase().includes(needle)
    || topic.author.toLowerCase().includes(needle)
    || stripHtml(topic.content).toLowerCase().includes(needle)
  );
}

function createPanel(context, initialMode = "latest") {
  setLocale(context);

  const state = {
    mode: ["latest", "hot", "nodes", "notifications"].includes(initialMode)
      ? initialMode
      : "latest",
    node: "",
    nodes: [],
    query: "",
    topics: [],
    notifications: [],
    selectedId: null,
    /** @type {Map<string, { items: any[], status?: any, error?: string }>} */
    replies: new Map(),
    loading: false,
    repliesLoading: new Set(),
    error: null,
    meta: "",
    ttlMs: DEFAULT_TTL_MS,
    dead: false,
    revision: 0,
    loadGeneration: 0,
    view: null,
  };

  const isTopicMode = () => state.mode === "latest" || state.mode === "hot" || state.mode === "nodes";

  const visibleTopics = () => {
    const needle = state.query.trim().toLowerCase();
    return needle ? state.topics.filter((topic) => topicMatchesQuery(topic, needle)) : state.topics;
  };

  const visibleNotifications = () => {
    const needle = state.query.trim().toLowerCase();
    if (!needle) return state.notifications;
    return state.notifications.filter((item) => (
      item.member.toLowerCase().includes(needle)
      || stripHtml(item.text).toLowerCase().includes(needle)
    ));
  };

  const selectedTopic = () => {
    if (!isTopicMode()) return null;
    const rows = visibleTopics();
    return rows.find((topic) => String(topic.id) === String(state.selectedId)) || null;
  };

  const selectedNotification = () => {
    if (state.mode !== "notifications") return null;
    const rows = visibleNotifications();
    return rows.find((item) => String(item.id) === String(state.selectedId)) || null;
  };

  function topicDetail(topic) {
    const key = String(topic.id);
    const cached = state.replies.get(key);
    const loading = state.repliesLoading.has(key);
    const body = stripHtml(topic.content) || text("(no content)", "（无内容）");
    return {
      title: topic.title,
      subtitle: [
        topic.node || text("V2EX", "V2EX"),
        topic.author || text("unknown", "未知"),
        formatTime(topic.last_modified || topic.created),
        `${topic.replies} ${text("replies", "条回复")}`,
      ].filter(Boolean).join(" · "),
      body,
      fields: [
        { label: text("Node", "节点"), value: topic.node || "—" },
        { label: text("Author", "作者"), value: topic.author || "—" },
        { label: text("Created", "创建"), value: formatDate(topic.created) },
        { label: text("Updated", "更新"), value: formatDate(topic.last_modified || topic.created) },
        { label: text("Replies", "回复"), value: topic.replies },
      ],
      replies: {
        title: text("Replies", "回复"),
        total: topic.replies,
        items: (cached?.items || []).map((reply) => ({
          id: String(reply.id),
          floor: reply.floor,
          author: reply.author,
          createdAt: formatTime(reply.created),
          originalPoster: reply.author === topic.author,
          body: stripHtml(reply.content) || text("(empty)", "（空）"),
        })),
        status: loading
          ? { state: "loading", label: text("Loading replies…", "正在加载回复…") }
          : cached?.error
            ? { state: "error", error: cached.error }
            : undefined,
        emptyText: text("No replies yet.", "暂无回复。"),
      },
    };
  }

  function topicItem(topic) {
    const id = String(topic.id);
    return {
      id,
      title: topic.title,
      subtitle: `${topic.node || "V2EX"} · ${topic.author || text("unknown", "未知")} · ${formatTime(topic.last_modified || topic.created)}`,
      meta: topic.author || undefined,
      badge: String(topic.replies ?? 0),
      detail: topicDetail(topic),
      actions: [
        {
          id: `open:${id}`,
          label: text("Open in Browser", "在浏览器中打开"),
          // Host Enter opens detail first; once detail is open Enter runs this primary.
          primary: true,
          menuKey: "o",
          kbd: "CmdOrCtrl+O",
        },
        {
          id: `copy-link:${id}`,
          label: text("Copy Link", "复制链接"),
          menuKey: "c",
        },
        {
          id: `copy-title:${id}`,
          label: text("Copy Title", "复制标题"),
          menuKey: "y",
        },
      ],
      raw: topic,
    };
  }

  function notificationItem(item) {
    const id = `n:${item.id}`;
    const body = stripHtml(item.text) || text("(empty notification)", "（空通知）");
    return {
      id,
      title: item.member,
      subtitle: body.slice(0, 160),
      meta: formatTime(item.created),
      badge: text("Notice", "通知"),
      detail: {
        title: item.member,
        subtitle: formatDate(item.created),
        body,
        fields: [
          { label: text("Member", "成员"), value: item.member },
          { label: text("Time", "时间"), value: formatDate(item.created) },
        ],
      },
      actions: [
        {
          id: "open-site",
          label: text("Open V2EX", "打开 V2EX"),
          menuKey: "o",
          kbd: "CmdOrCtrl+O",
        },
      ],
      raw: item,
    };
  }

  function modeLabel() {
    if (state.mode === "hot") return text("Hot", "热门");
    if (state.mode === "nodes") return state.node || text("Nodes", "节点");
    if (state.mode === "notifications") return text("Notifications", "通知");
    return text("Latest", "最新");
  }

  function panelActions() {
    // Item-scoped open/copy live on items[].actions. Host Enter/Esc own detail navigation.
    return [
      {
        id: "refresh",
        label: text("Refresh", "刷新"),
        menuKey: "r",
        kbd: "CmdOrCtrl+R",
        disabled: state.loading,
      },
      {
        id: "open-site",
        label: text("Open V2EX", "打开 V2EX"),
        menuKey: "v",
      },
      {
        id: "check-token",
        label: text("Check Token", "检查令牌"),
        menuKey: "k",
      },
      {
        id: "open-tokens-page",
        label: text("Get Token…", "获取令牌…"),
        menuKey: "g",
      },
    ];
  }

  function paint() {
    if (state.dead) return;

    let items;
    if (state.mode === "notifications") {
      items = visibleNotifications().map(notificationItem);
    } else {
      items = visibleTopics().map(topicItem);
    }

    if (items.length && !items.some((item) => item.id === String(state.selectedId))) {
      state.selectedId = items[0].id;
    }
    if (!items.length) state.selectedId = null;

    const selectedTitle = items.find((item) => item.id === String(state.selectedId))?.title;
    const filters = state.mode === "nodes"
      ? [{
          id: "node",
          label: text("Node", "节点"),
          value: state.node || (state.nodes[0] || ""),
          options: state.nodes.length
            ? state.nodes.map((node) => ({ label: node, value: node }))
            : [{ label: text("No nodes configured", "未配置节点"), value: "" }],
        }]
      : [];

    const snapshot = {
      revision: ++state.revision,
      title: "V2EX",
      layout: { kind: "list" },
      query: state.query,
      queryPlaceholder: state.mode === "nodes"
        ? text("Filter topics in this node…", "在当前节点中筛选主题…")
        : state.mode === "notifications"
          ? text("Filter notifications…", "筛选通知…")
          : text("Search loaded topics…", "搜索已加载主题…"),
      tabs: [
        { id: "latest", label: text("Latest", "最新"), active: state.mode === "latest" },
        { id: "hot", label: text("Hot", "热门"), active: state.mode === "hot" },
        { id: "nodes", label: text("Nodes", "节点"), active: state.mode === "nodes" },
        { id: "notifications", label: text("Notices", "通知"), active: state.mode === "notifications" },
      ],
      filters,
      loading: state.loading && items.length === 0,
      error: state.error,
      meta: state.meta || `${items.length} · ${modeLabel()}`,
      selectedId: state.selectedId,
      items,
      emptyText: state.loading
        ? text("Loading V2EX…", "正在加载 V2EX…")
        : state.error
          ? state.error
          : state.query.trim()
            ? text("No matching items", "没有匹配项")
            : text("No items loaded", "暂无内容"),
      actions: panelActions(),
      island: state.loading
        ? {
            primary: "V2EX",
            secondary: text("Loading topics", "正在加载主题"),
            activity: "spinner",
          }
        : state.repliesLoading.size > 0
          ? {
              primary: selectedTitle || "V2EX",
              secondary: text("Loading replies", "正在加载回复"),
              activity: "spinner",
            }
          : null,
    };

    if (state.view) {
      state.view.update(snapshot);
    } else {
      state.view = context.ui.mountWorkbench(snapshot, {
        onQuery(value) {
          state.query = String(value || "");
          paint();
        },
        onTab(id) {
          if (!["latest", "hot", "nodes", "notifications"].includes(id)) return;
          if (id === state.mode) return;
          state.mode = id;
          state.query = "";
          state.error = null;
          state.selectedId = null;
          void reload({ force: false });
        },
        onFilter(id, value) {
          if (id !== "node") return;
          const next = String(value || "").trim();
          if (!next || next === state.node) return;
          state.node = next;
          state.query = "";
          state.selectedId = null;
          void reload({ force: false });
        },
        onSelect(id) {
          state.selectedId = String(id || "");
          paint();
          if (isTopicMode() && state.selectedId) {
            void ensureReplies(state.selectedId);
          }
        },
        onAction(id, item) {
          void runAction(String(id || ""), item);
        },
      });
    }
  }

  async function ensureReplies(topicId, { force = false } = {}) {
    const key = String(topicId);
    if (!key || state.dead) return;
    if (!force && state.replies.has(key) && !state.replies.get(key)?.error) return;
    if (state.repliesLoading.has(key)) return;

    state.repliesLoading.add(key);
    paint();
    try {
      const token = await getToken(context);
      const ttlMs = await getTtlMs(context);
      const result = await loadWithCache(
        context,
        `replies:${key}`,
        () => fetchRepliesLive(context, Number(key), token),
        { force, ttlMs },
      );
      if (state.dead) return;
      state.replies.set(key, {
        items: Array.isArray(result.data) ? result.data : [],
        error: result.error ? errorMessage(result.error) : undefined,
      });
    } catch (err) {
      if (state.dead) return;
      state.replies.set(key, {
        items: state.replies.get(key)?.items || [],
        error: errorMessage(err),
      });
    } finally {
      state.repliesLoading.delete(key);
      if (!state.dead) paint();
    }
  }

  async function reload({ force = false } = {}) {
    if (state.dead) return;
    const generation = ++state.loadGeneration;
    state.loading = true;
    state.error = null;
    if (!force) {
      // Keep previous rows while refreshing when possible.
      paint();
    } else {
      paint();
    }

    try {
      state.ttlMs = await getTtlMs(context);
      state.nodes = await getNodes(context);
      if (state.mode === "nodes" && (!state.node || !state.nodes.includes(state.node))) {
        state.node = state.nodes[0] || "";
      }

      if (state.mode === "notifications") {
        const token = await getToken(context);
        if (!token) {
          throw new Error(text(
            "Notifications require an Access Token in plugin preferences.",
            "查看通知需要在插件偏好中填写访问令牌。",
          ));
        }
        const result = await loadWithCache(
          context,
          "notifications",
          () => fetchNotificationsLive(context, token),
          { force, ttlMs: Math.min(state.ttlMs, 60_000) },
        );
        if (state.dead || generation !== state.loadGeneration) return;
        state.notifications = Array.isArray(result.data) ? result.data : [];
        state.topics = [];
        state.meta = result.fromCache
          ? `${state.notifications.length} ${text("notices", "条通知")} · ${text("cached", "已缓存")} ${ageLabel(result.savedAt)}${result.refreshing ? ` · ${text("updating…", "更新中…")}` : ""}`
          : `${state.notifications.length} ${text("notices", "条通知")}`;
        if (result.error) {
          state.meta += ` · ${text("offline cache", "离线缓存")}`;
        }
      } else if (state.mode === "nodes") {
        if (!state.node) {
          throw new Error(text(
            "No nodes configured. Set preference «Nodes».",
            "未配置节点，请在插件偏好中填写“节点”。",
          ));
        }
        const token = await getToken(context);
        if (!token) {
          throw new Error(text(
            "Node topics require an Access Token in plugin preferences.",
            "按节点浏览需要在插件偏好中填写访问令牌。",
          ));
        }
        const result = await loadWithCache(
          context,
          `node:${state.node}`,
          () => fetchNodeTopicsLive(context, state.node, token),
          { force, ttlMs: state.ttlMs },
        );
        if (state.dead || generation !== state.loadGeneration) return;
        state.topics = Array.isArray(result.data) ? result.data : [];
        state.notifications = [];
        state.meta = result.fromCache
          ? `${state.topics.length} ${text("in", "条 ·")} ${state.node} · ${text("cached", "已缓存")} ${ageLabel(result.savedAt)}${result.refreshing ? ` · ${text("updating…", "更新中…")}` : ""}`
          : `${state.topics.length} ${text("in", "条 ·")} ${state.node}`;
        if (result.error) state.meta += ` · ${text("offline cache", "离线缓存")}`;
      } else {
        const result = await loadWithCache(
          context,
          `topics:${state.mode}`,
          () => fetchTopicsLive(context, state.mode),
          { force, ttlMs: state.ttlMs },
        );
        if (state.dead || generation !== state.loadGeneration) return;
        state.topics = Array.isArray(result.data) ? result.data : [];
        state.notifications = [];
        const label = state.mode === "hot" ? text("hot", "热门") : text("latest", "最新");
        state.meta = result.fromCache
          ? `${state.topics.length} ${text("topics", "个主题")} · ${label} · ${text("cached", "已缓存")} ${ageLabel(result.savedAt)}${result.refreshing ? ` · ${text("updating…", "更新中…")}` : ""}`
          : `${state.topics.length} ${text("topics", "个主题")} · ${label}`;
        if (result.error) state.meta += ` · ${text("offline cache", "离线缓存")}`;
      }

      const rows = state.mode === "notifications" ? visibleNotifications() : visibleTopics();
      if (!rows.some((row) => String(row.id) === String(state.selectedId)?.replace(/^n:/, ""))) {
        state.selectedId = rows[0]
          ? (state.mode === "notifications" ? `n:${rows[0].id}` : String(rows[0].id))
          : null;
      }
    } catch (err) {
      if (state.dead || generation !== state.loadGeneration) return;
      state.error = errorMessage(err);
      if (state.mode === "notifications") state.notifications = [];
      else state.topics = [];
      state.meta = "";
    } finally {
      if (state.dead || generation !== state.loadGeneration) return;
      state.loading = false;
      paint();
      if (isTopicMode() && state.selectedId) {
        void ensureReplies(state.selectedId);
      }
    }
  }

  async function copyText(value, okLabel) {
    const textValue = String(value || "");
    if (!textValue) return;
    try {
      if (context.clipboard?.write) {
        await context.clipboard.write(textValue);
      } else if (context.ocr?.copyText) {
        await context.ocr.copyText(textValue);
      } else {
        throw new Error(text("Clipboard unavailable", "剪贴板不可用"));
      }
      context.showToast?.(okLabel || text("Copied", "已复制"));
    } catch (err) {
      context.showToast?.(errorMessage(err));
    }
  }

  async function runAction(id, item) {
    if (!id) return;

    if (id === "refresh") {
      await reload({ force: true });
      return;
    }

    if (id === "open-site") {
      await context.openUrl("https://www.v2ex.com/");
      return;
    }

    if (id === "open-tokens-page") {
      await context.openUrl("https://www.v2ex.com/settings/tokens");
      return;
    }

    if (id === "check-token") {
      const token = await getToken(context);
      if (!token) {
        context.showToast?.(text(
          "No token — set Access Token in V2EX plugin preferences",
          "未配置令牌，请在 V2EX 插件偏好中填写访问令牌",
        ));
        return;
      }
      try {
        const info = await context.invoke("v2ex_fetch_token_info", { token });
        context.showToast?.(text(
          `Token valid · ${info.total_used} uses · ${info.scope || "—"}`,
          `令牌有效 · ${info.total_used} 次使用 · ${info.scope || "—"}`,
        ));
      } catch (err) {
        context.showToast?.(errorMessage(err).slice(0, 160));
      }
      return;
    }

    const openMatch = /^open:(\d+)$/.exec(id);
    if (openMatch) {
      const topic = state.topics.find((row) => String(row.id) === openMatch[1])
        || item?.raw;
      if (topic?.url) await context.openUrl(topic.url);
      return;
    }

    const copyLinkMatch = /^copy-link:(\d+)$/.exec(id);
    if (copyLinkMatch) {
      const topic = state.topics.find((row) => String(row.id) === copyLinkMatch[1])
        || item?.raw;
      if (topic?.url) await copyText(topic.url, text("Link copied", "链接已复制"));
      return;
    }

    const copyTitleMatch = /^copy-title:(\d+)$/.exec(id);
    if (copyTitleMatch) {
      const topic = state.topics.find((row) => String(row.id) === copyTitleMatch[1])
        || item?.raw;
      if (topic?.title) await copyText(topic.title, text("Title copied", "标题已复制"));
    }
  }

  // Prime nodes list so the filter paints even before first network response.
  void getNodes(context).then((nodes) => {
    if (state.dead) return;
    state.nodes = nodes;
    if (state.mode === "nodes" && !state.node) state.node = nodes[0] || "";
    paint();
  });

  paint();
  void reload({ force: false });

  return {
    destroy() {
      state.dead = true;
      state.loadGeneration += 1;
      state.view = null;
    },
    setMode(mode) {
      if (!["latest", "hot", "nodes", "notifications"].includes(mode)) return;
      if (mode === state.mode) return;
      state.mode = mode;
      state.query = "";
      state.error = null;
      state.selectedId = null;
      void reload({ force: false });
    },
  };
}

let activePanel = null;

export default {
  commands: [
    {
      name: "view-notifications",
      title: "View Notifications",
      async run(context) {
        setLocale(context);
        if (activePanel) {
          activePanel.setMode("notifications");
          return;
        }
        const token = await getToken(context);
        if (!token) {
          context.showToast?.(text(
            "No token — set Access Token in V2EX plugin preferences",
            "未配置令牌，请在 V2EX 插件偏好中填写访问令牌",
          ));
          return;
        }
        try {
          const rows = await context.invoke("v2ex_fetch_notifications", { token });
          const count = Array.isArray(rows) ? rows.length : 0;
          context.showToast?.(text(`${count} notification(s)`, `${count} 条通知`));
        } catch (err) {
          context.showToast?.(`${text("Failed: ", "失败：")}${errorMessage(err).slice(0, 100)}`);
        }
      },
    },
    {
      name: "view-token",
      title: "View Token Info",
      async run(context) {
        setLocale(context);
        const token = await getToken(context);
        if (!token) {
          context.showToast?.(text("No token configured", "未配置令牌"));
          return;
        }
        try {
          const info = await context.invoke("v2ex_fetch_token_info", { token });
          context.showToast?.(text(
            `Token valid · ${info.total_used} uses · ${info.scope}`,
            `令牌有效 · ${info.total_used} 次使用 · ${info.scope}`,
          ));
        } catch (err) {
          context.showToast?.(`${text("Failed: ", "失败：")}${errorMessage(err).slice(0, 100)}`);
        }
      },
    },
  ],

  panel: {
    title: "V2EX",

    async render(container, context) {
      if (activePanel) {
        try {
          activePanel.destroy();
        } catch {
          /* ignore */
        }
        activePanel = null;
      }

      if (!context.ui?.mountWorkbench) {
        container.textContent = text(
          "Qx 0.6.13 or newer is required for the V2EX Workbench panel.",
          "V2EX Workbench 面板需要 Qx 0.6.13 或更高版本。",
        );
        return;
      }

      container.innerHTML = "";
      activePanel = createPanel(context, "latest");
      container.__qxV2exPanel = activePanel;
    },

    destroy(container) {
      const panel = container?.__qxV2exPanel || activePanel;
      if (panel) {
        try {
          panel.destroy();
        } catch {
          /* ignore */
        }
      }
      if (container) {
        container.__qxV2exPanel = null;
        container.innerHTML = "";
      }
      activePanel = null;
      stopLocale?.();
      stopLocale = null;
    },
  },
};
