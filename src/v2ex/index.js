const call = (context, cmd, args) => context.invoke(cmd, args || {});

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
  const now = Date.now();
  const diff = now - d.getTime();
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
    .v2ex-root { display:flex; flex-direction:column; height:100%; font:13px -apple-system,BlinkMacSystemFont,sans-serif; color:var(--qx-text-primary,#e0e0e0); background:transparent; margin:0; }
    .v2ex-topbar { display:flex; align-items:center; gap:8px; padding:6px 10px; border-bottom:1px solid var(--qx-border-1,#222); }
    .v2ex-search { flex:1; box-sizing:border-box; padding:5px 10px; border-radius:6px; border:1px solid var(--qx-border-1,#333); background:var(--qx-bg-component-2,#1a1a1a); color:var(--qx-text-primary,#e0e0e0); font:inherit; font-size:13px; outline:none; }
    .v2ex-search:focus { border-color:var(--qx-accent,#5b9aff); }
    .v2ex-tab { padding:4px 12px; border-radius:6px; border:1px solid var(--qx-border-1,#333); background:transparent; color:var(--qx-text-secondary,#888); cursor:pointer; font:inherit; font-size:12px; white-space:nowrap; }
    .v2ex-tab.active { background:var(--qx-accent,#5b9aff); color:#fff; border-color:var(--qx-accent,#5b9aff); }
    .v2ex-tab:hover:not(.active) { background:var(--qx-bg-component-2,#2a2a2a); }
    .v2ex-status { padding:3px 10px; font-size:11px; color:var(--qx-text-tertiary,#666); }
    .v2ex-body { flex:1; min-height:0; overflow-y:auto; }
    .v2ex-list-item { display:flex; align-items:flex-start; gap:8px; padding:7px 10px; cursor:pointer; border-bottom:1px solid var(--qx-border-1,#1a1a1a); }
    .v2ex-list-item.active { background:var(--qx-bg-component-3,rgba(91,154,255,0.12)); }
    .v2ex-list-item:hover { background:var(--qx-bg-component-2,#1f1f1f); }
    .v2ex-item-copy { flex:1; min-width:0; }
    .v2ex-item-title { font-size:13px; line-height:1.35; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .v2ex-item-meta { display:flex; gap:8px; font-size:11px; color:var(--qx-text-tertiary,#666); margin-top:2px; }
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
  </style>
`;

async function getToken(context) {
  return await context.getPreference("token");
}

async function getNodes(context) {
  const raw = await context.getPreference("nodes");
  return String(raw || "programmer create share ideas apple jobs qna")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function renderTopicsPanel(container, context) {
  let topics = [];
  let filtered = [];
  let selected = 0;
  let query = "";
  let mode = "latest";
  let nodeView = false;
  let currentNodes = [];

  container.innerHTML = STYLES + `<div class="v2ex-root"></div>`;
  const root = container.querySelector(".v2ex-root");

  // Topbar
  const topbar = document.createElement("div");
  topbar.className = "v2ex-topbar";

  const search = document.createElement("input");
  search.type = "text";
  search.className = "v2ex-search";
  search.placeholder = "Search V2EX topics...";
  topbar.appendChild(search);

  const tabLatest = document.createElement("button");
  tabLatest.className = "v2ex-tab active";
  tabLatest.textContent = "Latest";
  tabLatest.onclick = () => switchMode("latest");
  topbar.appendChild(tabLatest);

  const tabHot = document.createElement("button");
  tabHot.className = "v2ex-tab";
  tabHot.textContent = "Hot";
  tabHot.onclick = () => switchMode("hot");
  topbar.appendChild(tabHot);

  const tabNodes = document.createElement("button");
  tabHot.className = "v2ex-tab";
  tabNodes.className = "v2ex-tab";
  tabNodes.textContent = "Nodes";
  tabNodes.onclick = () => switchMode("nodes");
  topbar.appendChild(tabNodes);

  root.appendChild(topbar);

  const status = document.createElement("div");
  status.className = "v2ex-status";
  status.textContent = "Loading...";
  root.appendChild(status);

  const body = document.createElement("div");
  body.className = "v2ex-body";
  root.appendChild(body);

  async function switchMode(next) {
    mode = next;
    nodeView = next === "nodes";
    [tabLatest, tabHot, tabNodes].forEach((t) =>
      t.classList.toggle("active", t.textContent.toLowerCase() === (next === "nodes" ? "nodes" : next))
    );
    if (nodeView) {
      currentNodes = await getNodes(context);
      const node = currentNodes[0];
      if (node) await fetchNodeTopics(node);
    } else {
      await fetchTopics(next);
    }
  }

  async function fetchTopics(m) {
    status.textContent = "Loading...";
    body.innerHTML = "";
    try {
      topics = await call(context, "v2ex_fetch_topics", { mode: m });
      if (!Array.isArray(topics)) topics = [];
      applyFilter();
    } catch (err) {
      status.textContent = "Error: " + escapeHtml(String(err));
      topics = [];
      applyFilter();
    }
  }

  async function fetchNodeTopics(node) {
    status.textContent = `Loading node: ${node}...`;
    body.innerHTML = "";
    try {
      topics = await call(context, "v2ex_fetch_node_topics", { node });
      if (!Array.isArray(topics)) topics = [];
      applyFilter();
    } catch (err) {
      status.textContent = "Error: " + escapeHtml(String(err));
      topics = [];
      applyFilter();
    }
  }

  function applyFilter() {
    const q = query.trim().toLowerCase();
    filtered = q
      ? topics.filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            t.node.toLowerCase().includes(q) ||
            t.author.toLowerCase().includes(q),
        )
      : topics.slice();
    selected = Math.min(selected, Math.max(filtered.length - 1, 0));
    renderList();
    status.textContent = nodeView
      ? `${filtered.length} topics`
      : `${filtered.length} topics · ${mode}`;
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
      badge.textContent = String(topic.replies);
      item.appendChild(badge);

      item.onclick = () => {
        selected = i;
        renderList();
      };
      item.ondblclick = () => context.openUrl(topic.url);
      body.appendChild(item);
    });
  }

  search.addEventListener("input", () => {
    query = search.value;
    selected = 0;
    applyFilter();
  });

  search.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (e.key === "ArrowDown")
        selected = Math.min(selected + 1, filtered.length - 1);
      else selected = Math.max(selected - 1, 0);
      renderList();
      const items = body.querySelectorAll(".v2ex-list-item");
      if (items[selected]) items[selected].scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const topic = filtered[selected];
      if (topic) context.openUrl(topic.url);
    }
  });

  setTimeout(() => search.focus(), 100);
  fetchTopics("latest");
}

function renderNotificationsPanel(container, context) {
  container.innerHTML = STYLES + `<div class="v2ex-root"><div class="v2ex-body"></div></div>`;
  const body = container.querySelector(".v2ex-body");

  (async () => {
    const token = await getToken(context);
    if (!token) {
      body.innerHTML = `<div class="v2ex-empty">No token configured.<br>Go to Settings → Extensions → V2EX to set your access token.<br><br><a href="https://v2ex.com/settings/tokens" style="color:var(--qx-accent)">Get Token →</a></div>`;
      return;
    }
    body.innerHTML = `<div class="v2ex-empty">Loading notifications...</div>`;
    try {
      const notifications = await call(context, "v2ex_fetch_notifications");
      if (!Array.isArray(notifications) || notifications.length === 0) {
        body.innerHTML = `<div class="v2ex-empty">No notifications.</div>`;
        return;
      }
      body.innerHTML = "";
      const section = document.createElement("div");
      section.className = "v2ex-section";
      const title = document.createElement("div");
      title.className = "v2ex-section-title";
      title.textContent = `Notifications (${notifications.length})`;
      section.appendChild(title);

      notifications.forEach((n) => {
        const item = document.createElement("div");
        item.className = "v2ex-notif";

        const member = document.createElement("div");
        member.className = "v2ex-notif-member";
        member.textContent = n.member || "unknown";
        item.appendChild(member);

        const text = document.createElement("div");
        text.className = "v2ex-notif-text";
        text.innerHTML = stripHtml(n.text).slice(0, 200);
        item.appendChild(text);

        const time = document.createElement("div");
        time.className = "v2ex-notif-time";
        time.textContent = formatDate(n.created);
        item.appendChild(time);

        section.appendChild(item);
      });
      body.appendChild(section);
    } catch (err) {
      body.innerHTML = `<div class="v2ex-error">Failed to load notifications: ${escapeHtml(String(err))}</div>`;
    }
  })();
}

function renderTokenInfoPanel(container, context) {
  container.innerHTML = STYLES + `<div class="v2ex-root"><div class="v2ex-body"></div></div>`;
  const body = container.querySelector(".v2ex-body");

  (async () => {
    const token = await getToken(context);
    if (!token) {
      body.innerHTML = `<div class="v2ex-empty">No token configured.<br>Go to Settings → Extensions → V2EX to set your access token.<br><br><a href="https://v2ex.com/settings/tokens" style="color:var(--qx-accent)">Get Token →</a></div>`;
      return;
    }
    body.innerHTML = `<div class="v2ex-empty">Checking token...</div>`;
    try {
      const info = await call(context, "v2ex_fetch_token_info");
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
      body.innerHTML = "";
      body.appendChild(card);
    } catch (err) {
      body.innerHTML = `<div class="v2ex-error">Token check failed: ${escapeHtml(String(err))}</div>`;
    }
  })();
}

export default {
  commands: [
    {
      name: "open-v2ex",
      title: "Open V2EX",
      async run(context) {
        context.showToast("V2EX plugin loaded");
      },
    },
    {
      name: "view-notifications",
      title: "View Notifications",
      async run(context) {
        const token = await getToken(context);
        if (!token) {
          context.showToast("No token configured. Go to Settings → Extensions → V2EX.");
          return;
        }
        try {
          const notifications = await call(context, "v2ex_fetch_notifications");
          context.showToast(`${notifications.length} notification(s)`);
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
          context.showToast("No token configured. Go to Settings → Extensions → V2EX.");
          return;
        }
        try {
          const info = await call(context, "v2ex_fetch_token_info");
          context.showToast(`Token valid · ${info.total_used} uses · scope: ${info.scope}`);
        } catch (err) {
          context.showToast("Failed: " + String(err).slice(0, 100));
        }
      },
    },
  ],

  panel: {
    title: "V2EX",

    async render(container, context) {
      renderTopicsPanel(container, context);
    },

    destroy(container) {
      container.innerHTML = "";
    },
  },
};
