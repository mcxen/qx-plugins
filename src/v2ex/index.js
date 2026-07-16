/**
 * V2EX marketplace plugin — host invoke API + plugin storage SWR cache.
 *
 * Data path (compatible with Qx host):
 *   1. Read plugin persist cache → paint immediately when present
 *   2. invoke:v2ex_* (host memory+disk cache, TTL ~3 min)
 *   3. fallback context.http public API if invoke fails
 *   4. Write fresh payload to persist for next open
 */

const CACHE_PREFIX = "v2ex.cache.";
const DEFAULT_TTL_MS = 3 * 60 * 1000;
const STALE_MS = 60 * 60 * 1000;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function stripHtml(html) {
  const d = document.createElement("div");
  d.innerHTML = html;
  return d.textContent || d.innerText || "";
}

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const diff = Date.now() - d.getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

function formatDate(ts) {
  if (!ts) return "-";
  return new Date(ts * 1000).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STYLES = `
  <style>
    .v2ex-root { display:flex; flex-direction:column; height:100%; font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--qx-text-primary,#e0e0e0); background:transparent; margin:0; }
    .v2ex-topbar { display:flex; align-items:center; gap:8px; padding:6px 10px; border-bottom:1px solid var(--qx-border-1,#222); flex-shrink:0; }
    .v2ex-search { flex:1; box-sizing:border-box; padding:5px 10px; border-radius:6px; border:1px solid var(--qx-border-1,#333); background:var(--qx-bg-component-2,#1a1a1a); color:var(--qx-text-primary,#e0e0e0); font:inherit; font-size:13px; outline:none; }
    .v2ex-search:focus { border-color:var(--qx-accent,#5b9aff); }
    .v2ex-tab { padding:4px 12px; border-radius:6px; border:1px solid var(--qx-border-1,#333); background:transparent; color:var(--qx-text-secondary,#888); cursor:pointer; font:inherit; font-size:12px; white-space:nowrap; }
    .v2ex-tab.active { background:var(--qx-accent,#5b9aff); color:#fff; border-color:var(--qx-accent,#5b9aff); }
    .v2ex-tab:hover:not(.active) { background:var(--qx-bg-component-2,#2a2a2a); }
    .v2ex-refresh { padding:4px 10px; border-radius:6px; border:1px solid var(--qx-border-1,#333); background:transparent; color:var(--qx-text-secondary,#888); cursor:pointer; font:inherit; font-size:12px; }
    .v2ex-refresh:hover { background:var(--qx-bg-component-2,#2a2a2a); }
    .v2ex-status { padding:3px 10px; font-size:11px; color:var(--qx-text-tertiary,#666); flex-shrink:0; }
    .v2ex-status.is-stale { color:var(--qx-accent,#5b9aff); }
    .v2ex-status.is-error { color:var(--qx-danger,#e44); }
    .v2ex-body { flex:1; min-height:0; overflow-y:auto; }
    .v2ex-list-item { display:flex; align-items:flex-start; gap:8px; padding:7px 10px; cursor:pointer; border-bottom:1px solid var(--qx-border-1,#1a1a1a); }
    .v2ex-list-item.active { background:var(--qx-bg-component-3,rgba(91,154,255,0.12)); }
    .v2ex-list-item:hover { background:var(--qx-bg-component-2,#1f1f1f); }
    .v2ex-item-copy { flex:1; min-width:0; }
    .v2ex-item-title { font-size:13px; line-height:1.35; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .v2ex-item-meta { display:flex; gap:8px; font-size:11px; color:var(--qx-text-tertiary,#666); margin-top:2px; flex-wrap:wrap; }
    .v2ex-item-node { background:var(--qx-bg-component-3,#222); padding:0 6px; border-radius:4px; font-size:10px; }
    .v2ex-item-replies { flex-shrink:0; padding:1px 7px; border-radius:999px; background:var(--qx-accent,#5b9aff); color:#fff; font-size:11px; font-weight:600; min-width:20px; text-align:center; }
    .v2ex-empty { display:flex; align-items:center; justify-content:center; height:100%; color:var(--qx-text-tertiary,#555); font-size:13px; padding:20px; text-align:center; }
    .v2ex-error { color:var(--qx-danger,#e44); padding:12px 10px; font-size:13px; }
    .v2ex-section { border-top:1px solid var(--qx-border-1,#222); padding-top:8px; margin-top:10px; }
    .v2ex-section-title { font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:var(--qx-text-tertiary,#888); margin:0 0 6px; padding:0 10px; }
    .v2ex-notif { padding:8px 10px; border-bottom:1px solid var(--qx-border-1,#1a1a1a); }
    .v2ex-notif-member { font-weight:600; color:var(--qx-text-primary); }
    .v2ex-notif-text { margin-top:3px; font-size:12px; color:var(--qx-text-secondary); line-height:1.4; }
    .v2ex-notif-time { margin-top:2px; font-size:11px; color:var(--qx-text-tertiary); }
    .v2ex-token-card { margin:10px; padding:12px; border:1px solid var(--qx-border-1,#333); border-radius:8px; background:var(--qx-bg-component-2,#1a1a1a); }
    .v2ex-token-row { display:flex; justify-content:space-between; gap:12px; padding:4px 0; font-size:12px; }
    .v2ex-token-label { color:var(--qx-text-tertiary,#888); }
    .v2ex-token-value { color:var(--qx-text-primary); font-weight:600; }
    .v2ex-token-badge { display:inline-block; padding:2px 8px; border-radius:4px; background:var(--qx-accent,#5b9aff); color:#fff; font-size:11px; font-weight:600; }
    .v2ex-detail { padding:12px 14px 20px; }
    .v2ex-detail-title { font-size:16px; font-weight:600; line-height:1.35; margin:0 0 8px; }
    .v2ex-detail-meta { font-size:12px; color:var(--qx-text-tertiary); margin-bottom:12px; display:flex; gap:10px; flex-wrap:wrap; }
    .v2ex-detail-body { font-size:13px; line-height:1.55; color:var(--qx-text-secondary); word-break:break-word; }
    .v2ex-detail-body img { max-width:100%; height:auto; border-radius:4px; }
    .v2ex-detail-actions { display:flex; gap:8px; margin-top:14px; }
    .v2ex-btn { padding:5px 12px; border-radius:6px; border:1px solid var(--qx-border-1,#333); background:var(--qx-bg-component-2,#1a1a1a); color:var(--qx-text-primary); cursor:pointer; font:inherit; font-size:12px; }
    .v2ex-btn.primary { background:var(--qx-accent,#5b9aff); border-color:var(--qx-accent,#5b9aff); color:#fff; }
    .v2ex-reply { padding:10px 0; border-top:1px solid var(--qx-border-1,#222); }
    .v2ex-reply-head { font-size:12px; color:var(--qx-text-tertiary); margin-bottom:4px; }
    .v2ex-reply-body { font-size:13px; line-height:1.5; color:var(--qx-text-secondary); }
  </style>
`;

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

function ageLabel(savedAt) {
  if (!savedAt) return "";
  const sec = Math.max(0, Math.floor((Date.now() - savedAt) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

/** Host invoke first (shared disk cache), then public HTTP. */
async function fetchTopicsLive(context, mode) {
  const m = mode === "hot" ? "hot" : "latest";
  try {
    const rows = await context.invoke("v2ex_fetch_topics", { mode: m });
    if (Array.isArray(rows)) return rows;
  } catch {
    /* fall through */
  }
  if (!context.http?.fetch) throw new Error("No V2EX transport available");
  const path = m === "hot" ? "/api/topics/hot.json" : "/api/topics/latest.json";
  const resp = await context.http.fetch(`https://www.v2ex.com${path}`, { method: "GET" });
  const text = typeof resp === "string" ? resp : resp?.body || resp?.text || JSON.stringify(resp);
  const arr = typeof text === "string" ? JSON.parse(text) : text;
  if (!Array.isArray(arr)) throw new Error("Unexpected V2EX payload");
  return arr.map((v) => ({
    id: v.id,
    title: v.title || "",
    url: `https://www.v2ex.com/t/${v.id}`,
    node: v.node?.title || "",
    author: v.member?.username || "",
    replies: v.replies || 0,
    created: v.created || 0,
    content: v.content_rendered || v.content || "",
    last_modified: v.last_modified || v.created || 0,
  }));
}

/**
 * Stale-while-revalidate: return cache immediately, refresh in background when stale.
 * @returns {{ data: any, fromCache: boolean, refreshing: boolean, savedAt?: number }}
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
      // Fire-and-forget revalidate
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

function renderTopicsPanel(container, context, initialMode = "latest") {
  let topics = [];
  let filtered = [];
  let selected = 0;
  let query = "";
  let mode = initialMode === "hot" ? "hot" : "latest";
  let nodeView = false;
  let currentNode = "";
  let viewing = null;
  let replies = [];
  let ttlMs = DEFAULT_TTL_MS;
  let destroyed = false;

  container.innerHTML = STYLES + `<div class="v2ex-root"></div>`;
  const root = container.querySelector(".v2ex-root");

  const topbar = document.createElement("div");
  topbar.className = "v2ex-topbar";

  const search = document.createElement("input");
  search.type = "text";
  search.className = "v2ex-search";
  search.placeholder = "Search loaded topics…";
  topbar.appendChild(search);

  const tabLatest = document.createElement("button");
  tabLatest.className = "v2ex-tab" + (mode === "latest" ? " active" : "");
  tabLatest.textContent = "Latest";
  tabLatest.onclick = () => void switchMode("latest");
  topbar.appendChild(tabLatest);

  const tabHot = document.createElement("button");
  tabHot.className = "v2ex-tab" + (mode === "hot" ? " active" : "");
  tabHot.textContent = "Hot";
  tabHot.onclick = () => void switchMode("hot");
  topbar.appendChild(tabHot);

  const tabNodes = document.createElement("button");
  tabNodes.className = "v2ex-tab";
  tabNodes.textContent = "Nodes";
  tabNodes.onclick = () => void switchMode("nodes");
  topbar.appendChild(tabNodes);

  const refreshBtn = document.createElement("button");
  refreshBtn.className = "v2ex-refresh";
  refreshBtn.textContent = "Refresh";
  refreshBtn.title = "Force refresh (bypass cache)";
  refreshBtn.onclick = () => void reload({ force: true });
  topbar.appendChild(refreshBtn);

  root.appendChild(topbar);

  const status = document.createElement("div");
  status.className = "v2ex-status";
  status.textContent = "Loading…";
  root.appendChild(status);

  const body = document.createElement("div");
  body.className = "v2ex-body";
  root.appendChild(body);

  function setStatus(text, kind = "") {
    status.className = "v2ex-status" + (kind ? ` is-${kind}` : "");
    status.textContent = text;
  }

  function syncTabs() {
    tabLatest.classList.toggle("active", !nodeView && mode === "latest");
    tabHot.classList.toggle("active", !nodeView && mode === "hot");
    tabNodes.classList.toggle("active", nodeView);
  }

  async function switchMode(next) {
    viewing = null;
    replies = [];
    if (next === "nodes") {
      nodeView = true;
      mode = "nodes";
      syncTabs();
      const nodes = await getNodes(context);
      currentNode = nodes[0] || "";
      if (!currentNode) {
        setStatus("No nodes configured. Set preference «Nodes».", "error");
        topics = [];
        applyFilter();
        return;
      }
      await reload({ force: false });
      return;
    }
    nodeView = false;
    mode = next;
    syncTabs();
    await reload({ force: false });
  }

  async function reload({ force = false } = {}) {
    if (destroyed) return;
    if (!force && topics.length === 0) setStatus("Loading…");
    else if (force) setStatus("Refreshing…");

    try {
      ttlMs = await getTtlMs(context);
      if (nodeView) {
        const token = await getToken(context);
        if (!token) {
          setStatus("Nodes require an Access Token in plugin preferences.", "error");
          topics = [];
          applyFilter();
          return;
        }
        const key = `node:${currentNode}`;
        const result = await loadWithCache(
          context,
          key,
          async () => {
            const rows = await context.invoke("v2ex_fetch_node_topics", {
              node: currentNode,
              token,
            });
            return Array.isArray(rows) ? rows : [];
          },
          { force, ttlMs },
        );
        if (destroyed) return;
        topics = result.data;
        applyFilter();
        setStatus(
          result.fromCache
            ? `${filtered.length} in ${currentNode} · cached ${ageLabel(result.savedAt)}${result.refreshing ? " · updating…" : ""}`
            : `${filtered.length} in ${currentNode}`,
          result.fromCache && result.refreshing ? "stale" : "",
        );
        if (result.error) setStatus(`${filtered.length} topics · offline cache`, "stale");
        return;
      }

      const key = `topics:${mode}`;
      const result = await loadWithCache(
        context,
        key,
        () => fetchTopicsLive(context, mode),
        { force, ttlMs },
      );
      if (destroyed) return;
      topics = result.data;
      applyFilter();
      const base = `${filtered.length} topics · ${mode}`;
      if (result.error) {
        setStatus(`${base} · offline cache (${ageLabel(result.savedAt)})`, "stale");
      } else if (result.fromCache) {
        setStatus(
          `${base} · cached ${ageLabel(result.savedAt)}${result.refreshing ? " · updating…" : ""}`,
          result.refreshing ? "stale" : "",
        );
      } else {
        setStatus(base);
      }
    } catch (err) {
      if (destroyed) return;
      setStatus("Error: " + String(err), "error");
      if (topics.length === 0) {
        topics = [];
        applyFilter();
      }
    }
  }

  function applyFilter() {
    const q = query.trim().toLowerCase();
    filtered = q
      ? topics.filter(
          (t) =>
            String(t.title || "").toLowerCase().includes(q)
            || String(t.node || "").toLowerCase().includes(q)
            || String(t.author || "").toLowerCase().includes(q),
        )
      : topics.slice();
    selected = Math.min(selected, Math.max(filtered.length - 1, 0));
    if (viewing) {
      void renderDetail(viewing);
    } else {
      renderList();
    }
  }

  function renderList() {
    body.innerHTML = "";
    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className = "v2ex-empty";
      empty.textContent = query ? "No matching topics" : "No topics loaded";
      body.appendChild(empty);
      return;
    }
    filtered.forEach((topic, i) => {
      const item = document.createElement("div");
      item.className = "v2ex-list-item" + (i === selected ? " active" : "");

      const copy = document.createElement("div");
      copy.className = "v2ex-item-copy";

      const title = document.createElement("div");
      title.className = "v2ex-item-title";
      title.textContent = topic.title;
      copy.appendChild(title);

      const meta = document.createElement("div");
      meta.className = "v2ex-item-meta";

      const node = document.createElement("span");
      node.className = "v2ex-item-node";
      node.textContent = topic.node || "?";
      meta.appendChild(node);

      const author = document.createElement("span");
      author.textContent = topic.author || "unknown";
      meta.appendChild(author);

      const time = document.createElement("span");
      time.textContent = formatTime(topic.last_modified || topic.created);
      meta.appendChild(time);

      copy.appendChild(meta);
      item.appendChild(copy);

      const badge = document.createElement("span");
      badge.className = "v2ex-item-replies";
      badge.textContent = String(topic.replies ?? 0);
      item.appendChild(badge);

      item.onclick = () => {
        selected = i;
        renderList();
      };
      item.ondblclick = () => {
        selected = i;
        void openTopic(topic);
      };
      body.appendChild(item);
    });
  }

  async function openTopic(topic) {
    viewing = topic;
    replies = [];
    await renderDetail(topic);
    try {
      const token = await getToken(context);
      const key = `replies:${topic.id}`;
      const result = await loadWithCache(
        context,
        key,
        async () => {
          const rows = await context.invoke("v2ex_fetch_topic_replies", {
            topicId: topic.id,
            token: token || undefined,
          });
          return Array.isArray(rows) ? rows : [];
        },
        { force: false, ttlMs },
      );
      if (viewing?.id !== topic.id || destroyed) return;
      replies = result.data;
      await renderDetail(topic);
    } catch {
      /* detail still shows topic content */
    }
  }

  async function renderDetail(topic) {
    body.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "v2ex-detail";

    const back = document.createElement("button");
    back.className = "v2ex-btn";
    back.textContent = "← Back";
    back.onclick = () => {
      viewing = null;
      replies = [];
      renderList();
    };
    wrap.appendChild(back);

    const h = document.createElement("h2");
    h.className = "v2ex-detail-title";
    h.textContent = topic.title || "";
    wrap.appendChild(h);

    const meta = document.createElement("div");
    meta.className = "v2ex-detail-meta";
    meta.innerHTML = `
      <span>${escapeHtml(topic.node || "")}</span>
      <span>${escapeHtml(topic.author || "")}</span>
      <span>${escapeHtml(formatTime(topic.last_modified || topic.created))}</span>
      <span>${Number(topic.replies) || 0} replies</span>
    `;
    wrap.appendChild(meta);

    const content = document.createElement("div");
    content.className = "v2ex-detail-body";
    content.innerHTML = topic.content || "<em>(no content)</em>";
    wrap.appendChild(content);

    const actions = document.createElement("div");
    actions.className = "v2ex-detail-actions";
    const open = document.createElement("button");
    open.className = "v2ex-btn primary";
    open.textContent = "Open in Browser";
    open.onclick = () => context.openUrl(topic.url);
    actions.appendChild(open);
    wrap.appendChild(actions);

    if (replies.length > 0) {
      const sec = document.createElement("div");
      sec.className = "v2ex-section";
      const st = document.createElement("div");
      st.className = "v2ex-section-title";
      st.textContent = `Replies (${replies.length})`;
      sec.appendChild(st);
      replies.forEach((r) => {
        const row = document.createElement("div");
        row.className = "v2ex-reply";
        row.innerHTML = `
          <div class="v2ex-reply-head">#${r.floor || "?"} · ${escapeHtml(r.author || "")} · ${escapeHtml(formatTime(r.created))}</div>
          <div class="v2ex-reply-body">${r.content || ""}</div>
        `;
        sec.appendChild(row);
      });
      wrap.appendChild(sec);
    } else if (viewing) {
      const loading = document.createElement("div");
      loading.className = "v2ex-section-title";
      loading.style.marginTop = "16px";
      loading.textContent = "Loading replies…";
      wrap.appendChild(loading);
    }

    body.appendChild(wrap);
  }

  search.addEventListener("input", () => {
    query = search.value;
    selected = 0;
    applyFilter();
  });

  search.addEventListener("keydown", (e) => {
    if (viewing) {
      if (e.key === "Escape") {
        e.preventDefault();
        viewing = null;
        replies = [];
        renderList();
      }
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (e.key === "ArrowDown") selected = Math.min(selected + 1, filtered.length - 1);
      else selected = Math.max(selected - 1, 0);
      renderList();
      const items = body.querySelectorAll(".v2ex-list-item");
      if (items[selected]) items[selected].scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const topic = filtered[selected];
      if (topic) void openTopic(topic);
    } else if (e.key === "r" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void reload({ force: true });
    }
  });

  setTimeout(() => search.focus(), 80);
  void reload({ force: false });

  return () => {
    destroyed = true;
  };
}

function renderNotificationsPanel(container, context) {
  container.innerHTML = STYLES + `<div class="v2ex-root"><div class="v2ex-body"></div></div>`;
  const body = container.querySelector(".v2ex-body");

  (async () => {
    const token = await getToken(context);
    if (!token) {
      body.innerHTML = `<div class="v2ex-empty">No token configured.<br>Settings → Extensions → V2EX → Access Token<br><br><a href="https://v2ex.com/settings/tokens" style="color:var(--qx-accent)">Get Token →</a></div>`;
      return;
    }
    body.innerHTML = `<div class="v2ex-empty">Loading notifications…</div>`;
    try {
      const result = await loadWithCache(
        context,
        "notifications",
        async () => {
          const rows = await context.invoke("v2ex_fetch_notifications", { token });
          return Array.isArray(rows) ? rows : [];
        },
        { force: false, ttlMs: 60_000 },
      );
      const notifications = result.data;
      if (!notifications.length) {
        body.innerHTML = `<div class="v2ex-empty">No notifications.</div>`;
        return;
      }
      body.innerHTML = "";
      const section = document.createElement("div");
      section.className = "v2ex-section";
      const title = document.createElement("div");
      title.className = "v2ex-section-title";
      title.textContent = `Notifications (${notifications.length})${result.fromCache ? " · cached" : ""}`;
      section.appendChild(title);

      notifications.forEach((n) => {
        const item = document.createElement("div");
        item.className = "v2ex-notif";
        item.innerHTML = `
          <div class="v2ex-notif-member">${escapeHtml(n.member || "unknown")}</div>
          <div class="v2ex-notif-text">${escapeHtml(stripHtml(n.text).slice(0, 240))}</div>
          <div class="v2ex-notif-time">${escapeHtml(formatDate(n.created))}</div>
        `;
        section.appendChild(item);
      });
      body.appendChild(section);
    } catch (err) {
      body.innerHTML = `<div class="v2ex-error">Failed: ${escapeHtml(String(err))}</div>`;
    }
  })();
}

function renderTokenInfoPanel(container, context) {
  container.innerHTML = STYLES + `<div class="v2ex-root"><div class="v2ex-body"></div></div>`;
  const body = container.querySelector(".v2ex-body");

  (async () => {
    const token = await getToken(context);
    if (!token) {
      body.innerHTML = `<div class="v2ex-empty">No token configured.<br>Settings → Extensions → V2EX</div>`;
      return;
    }
    body.innerHTML = `<div class="v2ex-empty">Checking token…</div>`;
    try {
      const info = await context.invoke("v2ex_fetch_token_info", { token });
      body.innerHTML = "";
      const card = document.createElement("div");
      card.className = "v2ex-token-card";
      card.innerHTML = `
        <div class="v2ex-token-row"><span class="v2ex-token-label">Status</span><span class="v2ex-token-badge">Valid</span></div>
        <div class="v2ex-token-row"><span class="v2ex-token-label">Scope</span><span class="v2ex-token-value">${escapeHtml(info.scope || "-")}</span></div>
        <div class="v2ex-token-row"><span class="v2ex-token-label">Total used</span><span class="v2ex-token-value">${info.total_used} times</span></div>
        <div class="v2ex-token-row"><span class="v2ex-token-label">Last used</span><span class="v2ex-token-value">${formatDate(info.last_used)}</span></div>
        <div class="v2ex-token-row"><span class="v2ex-token-label">Created</span><span class="v2ex-token-value">${formatDate(info.created)}</span></div>
        <div class="v2ex-token-row"><span class="v2ex-token-label">Expires</span><span class="v2ex-token-value">${formatDate(info.created + info.expiration)}</span></div>
        <div class="v2ex-token-row"><span class="v2ex-token-label">Good for</span><span class="v2ex-token-value">${info.good_for_days} days</span></div>
      `;
      body.appendChild(card);
    } catch (err) {
      body.innerHTML = `<div class="v2ex-error">Token check failed: ${escapeHtml(String(err))}</div>`;
    }
  })();
}

let destroyPanel = null;

export default {
  commands: [
    {
      name: "open-v2ex",
      title: "Open V2EX",
      async run(context) {
        context.showToast("Open the V2EX panel from Extensions or search results");
      },
    },
    {
      name: "view-hot",
      title: "V2EX Hot",
      async run(context) {
        context.showToast("Open V2EX panel → Hot");
      },
    },
    {
      name: "view-latest",
      title: "V2EX Latest",
      async run(context) {
        context.showToast("Open V2EX panel → Latest");
      },
    },
    {
      name: "view-notifications",
      title: "View Notifications",
      async run(context) {
        const token = await getToken(context);
        if (!token) {
          context.showToast("No token — set Access Token in V2EX plugin preferences");
          return;
        }
        try {
          const rows = await context.invoke("v2ex_fetch_notifications", { token });
          context.showToast(`${Array.isArray(rows) ? rows.length : 0} notification(s)`);
        } catch (err) {
          context.showToast("Failed: " + String(err).slice(0, 100));
        }
      },
    },
    {
      name: "view-token",
      title: "View Token Info",
      async run(context) {
        const token = await getToken(context);
        if (!token) {
          context.showToast("No token configured");
          return;
        }
        try {
          const info = await context.invoke("v2ex_fetch_token_info", { token });
          context.showToast(`Token valid · ${info.total_used} uses · ${info.scope}`);
        } catch (err) {
          context.showToast("Failed: " + String(err).slice(0, 100));
        }
      },
    },
  ],

  panel: {
    title: "V2EX",

    async render(container, context) {
      if (destroyPanel) {
        try {
          destroyPanel();
        } catch {
          /* ignore */
        }
        destroyPanel = null;
      }
      // Command routing via session (optional): last command name not available here.
      destroyPanel = renderTopicsPanel(container, context, "latest");
    },

    destroy(container) {
      if (destroyPanel) {
        try {
          destroyPanel();
        } catch {
          /* ignore */
        }
        destroyPanel = null;
      }
      container.innerHTML = "";
    },
  },
};
