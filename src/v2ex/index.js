export default {
  commands: [
    {
      name: "open-v2ex",
      title: "Open V2EX",
      async run(context) {
        context.showToast("V2EX plugin loaded");
      },
    },
  ],

  panel: {
    title: "V2EX Topics",

    async render(container, context) {
      let topics = [];
      let filtered = [];
      let selected = 0;
      let query = "";
      let loading = false;
      const pageSize = 30;

      // --- DOM structure ---
      const root = document.createElement("div");
      root.className = "v2ex-root";

      // Search bar
      const searchWrap = document.createElement("div");
      searchWrap.className = "v2ex-search-wrap";
      const searchInput = document.createElement("input");
      searchInput.type = "text";
      searchInput.className = "v2ex-search";
      searchInput.placeholder = "Search V2EX topics...";
      searchInput.autofocus = true;
      searchWrap.appendChild(searchInput);
      root.appendChild(searchWrap);

      // Mode tabs
      const tabBar = document.createElement("div");
      tabBar.className = "v2ex-tab-bar";
      const tabs = [
        { id: "latest", label: "Latest" },
        { id: "hot", label: "Hot" },
      ];
      let activeTab = "latest";

      tabs.forEach((tab) => {
        const btn = document.createElement("button");
        btn.className = "v2ex-tab";
        btn.dataset.tab = tab.id;
        btn.textContent = tab.label;
        if (tab.id === activeTab) btn.classList.add("active");
        btn.onclick = () => {
          if (tab.id !== activeTab) {
            activeTab = tab.id;
            tabs.forEach((b) =>
              b.classList.toggle("active", b.dataset.tab === activeTab)
            );
            fetchTopics(activeTab);
          }
        };
        tabBar.appendChild(btn);
      });
      root.appendChild(tabBar);

      // Status bar
      const statusBar = document.createElement("div");
      statusBar.className = "v2ex-status";
      statusBar.textContent = "Loading...";
      root.appendChild(statusBar);

      // Main body: list + detail
      const body = document.createElement("div");
      body.className = "v2ex-body";

      const listEl = document.createElement("div");
      listEl.className = "v2ex-list";
      body.appendChild(listEl);

      const detailEl = document.createElement("div");
      detailEl.className = "v2ex-detail";
      body.appendChild(detailEl);

      root.appendChild(body);

      // Esc hint
      const hint = document.createElement("div");
      hint.className = "v2ex-hint";
      root.appendChild(hint);

      container.appendChild(root);
      container.style.cssText = "overflow:hidden;";

      // --- CSS ---
      const style = document.createElement("style");
      style.textContent = `
        .v2ex-root {
          display: flex;
          flex-direction: column;
          height: 100%;
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 13px;
          color: var(--qx-text, #e0e0e0);
          background: transparent;
        }
        .v2ex-search-wrap {
          padding: 6px 8px 4px;
        }
        .v2ex-search {
          width: 100%;
          box-sizing: border-box;
          padding: 5px 10px;
          border-radius: 6px;
          border: 1px solid var(--qx-border, #333);
          background: var(--qx-bg-secondary, #1a1a1a);
          color: var(--qx-text, #e0e0e0);
          font-size: 13px;
          outline: none;
        }
        .v2ex-search:focus {
          border-color: var(--qx-accent, #5b9aff);
        }
        .v2ex-tab-bar {
          display: flex;
          gap: 4px;
          padding: 0 8px 4px;
        }
        .v2ex-tab {
          padding: 3px 12px;
          border-radius: 4px;
          border: none;
          background: transparent;
          color: var(--qx-text-secondary, #888);
          cursor: pointer;
          font-size: 12px;
        }
        .v2ex-tab.active {
          background: var(--qx-accent, #5b9aff);
          color: #fff;
        }
        .v2ex-tab:hover {
          background: var(--qx-hover, #2a2a2a);
        }
        .v2ex-status {
          padding: 2px 8px 4px;
          font-size: 11px;
          color: var(--qx-text-tertiary, #666);
        }
        .v2ex-body {
          display: flex;
          flex: 1;
          min-height: 0;
        }
        .v2ex-list {
          flex: 1;
          overflow-y: auto;
          border-right: 1px solid var(--qx-border, #222);
        }
        .v2ex-list-item {
          display: flex;
          align-items: flex-start;
          padding: 6px 8px;
          cursor: pointer;
          border-bottom: 1px solid var(--qx-border, #222);
        }
        .v2ex-list-item.active {
          background: var(--qx-active, rgba(91,154,255,0.15));
        }
        .v2ex-list-item:hover {
          background: var(--qx-hover, #2a2a2a);
        }
        .v2ex-item-content {
          flex: 1;
          min-width: 0;
        }
        .v2ex-item-title {
          font-size: 13px;
          line-height: 1.3;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .v2ex-item-meta {
          display: flex;
          gap: 8px;
          font-size: 11px;
          color: var(--qx-text-tertiary, #666);
          margin-top: 2px;
        }
        .v2ex-item-node {
          background: var(--qx-bg-tertiary, #222);
          padding: 0 5px;
          border-radius: 3px;
          font-size: 10px;
        }
        .v2ex-item-replies {
          margin-left: auto;
          padding: 1px 6px;
          border-radius: 8px;
          background: var(--qx-accent-bg, rgba(91,154,255,0.1));
          font-size: 11px;
          min-width: 18px;
          text-align: center;
        }
        .v2ex-detail {
          width: 0;
          overflow: hidden;
          transition: width 0.15s;
          background: var(--qx-bg-secondary, #1a1a1a);
        }
        .v2ex-detail.open {
          width: 45%;
        }
        .v2ex-detail-inner {
          padding: 12px;
          overflow-y: auto;
          height: 100%;
          box-sizing: border-box;
          white-space: pre-wrap;
          word-break: break-word;
          font-size: 12px;
          line-height: 1.5;
          color: var(--qx-text-secondary, #aaa);
        }
        .v2ex-detail-inner a {
          color: var(--qx-accent, #5b9aff);
          text-decoration: none;
        }
        .v2ex-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--qx-text-tertiary, #555);
          font-size: 13px;
        }
        .v2ex-hint {
          padding: 3px 8px;
          font-size: 11px;
          color: var(--qx-text-tertiary, #555);
          border-top: 1px solid var(--qx-border, #222);
        }
      `;
      container.appendChild(style);

      // --- Data ---
      async function fetchTopics(mode) {
        loading = true;
        statusBar.textContent = "Loading...";
        try {
          topics = await context.invoke("v2ex_fetch_topics", { mode });
          if (!Array.isArray(topics)) topics = [];
          applyFilter();
          statusBar.textContent = `${topics.length} topics`;
        } catch (err) {
          statusBar.textContent = "Error: " + String(err);
          topics = [];
          applyFilter();
        }
        loading = false;
      }

      function applyFilter() {
        const q = query.trim().toLowerCase();
        if (!q) {
          filtered = topics.slice(0, pageSize);
        } else {
          filtered = topics
            .filter(
              (t) =>
                t.title.toLowerCase().includes(q) ||
                t.node.toLowerCase().includes(q) ||
                t.author.toLowerCase().includes(q)
            )
            .slice(0, pageSize);
        }
        selected = Math.min(selected, Math.max(filtered.length - 1, 0));
        renderList();
        renderDetail();
        updateHint();
      }

      function renderList() {
        listEl.innerHTML = "";
        if (filtered.length === 0) {
          const empty = document.createElement("div");
          empty.className = "v2ex-empty";
          empty.textContent = query
            ? "No matching topics"
            : "No topics loaded";
          listEl.appendChild(empty);
          return;
        }
        filtered.forEach((topic, i) => {
          const item = document.createElement("div");
          item.className = "v2ex-list-item";
          if (i === selected) item.classList.add("active");

          const content = document.createElement("div");
          content.className = "v2ex-item-content";

          const title = document.createElement("div");
          title.className = "v2ex-item-title";
          title.textContent = topic.title;
          content.appendChild(title);

          const meta = document.createElement("div");
          meta.className = "v2ex-item-meta";

          const nodeSpan = document.createElement("span");
          nodeSpan.className = "v2ex-item-node";
          nodeSpan.textContent = topic.node || "?";
          meta.appendChild(nodeSpan);

          const authorSpan = document.createElement("span");
          authorSpan.textContent = topic.author;
          meta.appendChild(authorSpan);

          const repliesSpan = document.createElement("span");
          repliesSpan.textContent = formatTime(topic.created);
          meta.appendChild(repliesSpan);

          content.appendChild(meta);
          item.appendChild(content);

          const repliesBadge = document.createElement("span");
          repliesBadge.className = "v2ex-item-replies";
          repliesBadge.textContent = String(topic.replies);
          item.appendChild(repliesBadge);

          item.onclick = () => {
            selected = i;
            renderList();
            renderDetail();
            updateHint();
            context.openUrl(topic.url);
          };
          item.ondblclick = () => {
            context.openUrl(topic.url);
          };
          listEl.appendChild(item);
        });
      }

      function renderDetail() {
        const topic = filtered[selected];
        if (!topic) {
          detailEl.classList.remove("open");
          detailEl.innerHTML = "";
          return;
        }
        detailEl.classList.add("open");
        const inner = document.createElement("div");
        inner.className = "v2ex-detail-inner";
        inner.textContent = topic.content
          ? stripHtml(topic.content)
          : "(no content)";
        detailEl.innerHTML = "";
        detailEl.appendChild(inner);
      }

      function updateHint() {
        if (filtered[selected]) {
          hint.textContent = `↑↓ Navigate · Enter open in browser · Esc go back  —  ${filtered[selected].title}`;
        } else {
          hint.textContent = `↑↓ Navigate · Enter open in browser · Esc go back`;
        }
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

      // --- Keyboard ---
      searchInput.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          if (e.key === "ArrowDown")
            selected = Math.min(selected + 1, filtered.length - 1);
          else selected = Math.max(selected - 1, 0);
          renderList();
          renderDetail();
          updateHint();
          const items = listEl.querySelectorAll(".v2ex-list-item");
          if (items[selected]) items[selected].scrollIntoView({ block: "nearest" });
        } else if (e.key === "Enter") {
          e.preventDefault();
          const topic = filtered[selected];
          if (topic) context.openUrl(topic.url);
        } else if (e.key === "Escape") {
          // Let qx shell handle navigation back
          // The iframe esc is handled by parent
        }
      });

      searchInput.addEventListener("input", () => {
        query = searchInput.value;
        selected = 0;
        applyFilter();
      });

      // Focus
      setTimeout(() => searchInput.focus(), 100);

      // --- Init ---
      fetchTopics("latest");
    },

    async destroy(container) {
      container.innerHTML = "";
    },
  },
};
