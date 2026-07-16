/**
 * Qx marketplace plugin: Brew (macOS).
 * Host protocol: context.cli (permission "cli").
 */

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function resolveBrew(context) {
  const preferred = String((await context.getPreference("brewPath")) || "").trim();
  if (preferred) {
    const hit = await context.cli.which(preferred);
    if (hit) return hit;
    // Absolute path may not be "which"-able if custom; try as program directly.
    return preferred;
  }
  for (const candidate of ["brew", "/opt/homebrew/bin/brew", "/usr/local/bin/brew"]) {
    const hit = await context.cli.which(candidate);
    if (hit) return hit;
  }
  throw new Error("Homebrew not found. Install from https://brew.sh or set Brew executable in preferences.");
}

async function brewRun(context, args, timeoutMs = 120_000) {
  const program = await resolveBrew(context);
  const result = await context.cli.run({
    program,
    args,
    timeoutMs,
    env: {
      // Non-interactive Homebrew
      HOMEBREW_NO_AUTO_UPDATE: "1",
      HOMEBREW_NO_ENV_HINTS: "1",
      HOMEBREW_NO_ANALYTICS: "1",
    },
  });
  if (result.timedOut) {
    throw new Error(`brew ${args.join(" ")} timed out`);
  }
  // brew often prints warnings to stderr while still exiting 0
  if (result.status !== 0) {
    const msg = (result.stderr || result.stdout || `exit ${result.status}`).trim();
    throw new Error(msg.slice(0, 500));
  }
  return result;
}

function normalizeInstalled(json) {
  const formulae = (json.formulae || []).map((f) => ({
    id: f.name,
    name: f.full_name || f.name,
    kind: "formula",
    version: (f.installed && f.installed[0] && f.installed[0].version) || f.versions?.stable || "",
    desc: f.desc || "",
    homepage: f.homepage || "",
    outdated: Boolean(f.outdated),
  }));
  const casks = (json.casks || []).map((c) => ({
    id: c.token || c.name,
    name: c.token || c.name,
    kind: "cask",
    version: c.installed || c.version || "",
    desc: c.desc || "",
    homepage: c.homepage || "",
    outdated: Boolean(c.outdated),
  }));
  return [...formulae, ...casks].sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeOutdated(json) {
  const formulae = (json.formulae || []).map((f) => ({
    id: f.name,
    name: f.name,
    kind: "formula",
    version: (f.installed_versions || []).join(", "),
    current: f.current_version || "",
    desc: "outdated formula",
    homepage: "",
    outdated: true,
  }));
  const casks = (json.casks || []).map((c) => ({
    id: c.name,
    name: c.name,
    kind: "cask",
    version: (c.installed_versions || []).join(", "),
    current: c.current_version || "",
    desc: "outdated cask",
    homepage: "",
    outdated: true,
  }));
  return [...formulae, ...casks];
}

async function loadInstalled(context) {
  const result = await brewRun(context, ["info", "--json=v2", "--installed"], 180_000);
  return normalizeInstalled(JSON.parse(result.stdout || "{}"));
}

async function loadOutdated(context) {
  const result = await brewRun(context, ["outdated", "--json=v2"], 180_000);
  try {
    return normalizeOutdated(JSON.parse(result.stdout || "{}"));
  } catch {
    // Fallback: plain names
    const names = (result.stdout || "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    return names.map((name) => ({
      id: name,
      name,
      kind: "formula",
      version: "",
      current: "",
      desc: "outdated",
      homepage: "",
      outdated: true,
    }));
  }
}

async function searchBrew(context, query) {
  const q = String(query || "").trim();
  if (!q) return [];
  const [formulaeOut, casksOut] = await Promise.all([
    brewRun(context, ["search", "--formulae", q], 60_000).catch(() => ({ stdout: "" })),
    brewRun(context, ["search", "--casks", q], 60_000).catch(() => ({ stdout: "" })),
  ]);
  const formulae = (formulaeOut.stdout || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((name) => ({
      id: name,
      name,
      kind: "formula",
      version: "",
      desc: "search hit",
      homepage: `https://formulae.brew.sh/formula/${encodeURIComponent(name)}`,
      outdated: false,
      remote: true,
    }));
  const casks = (casksOut.stdout || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((name) => ({
      id: name,
      name,
      kind: "cask",
      version: "",
      desc: "search hit",
      homepage: `https://formulae.brew.sh/cask/${encodeURIComponent(name)}`,
      outdated: false,
      remote: true,
    }));
  return [...formulae, ...casks];
}

function styles() {
  return `
    .bw{box-sizing:border-box;height:100%;display:flex;flex-direction:column;gap:8px;padding:12px;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--qx-text-primary,#111);}
    .bw *{box-sizing:border-box;}
    .bw-bar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;}
    .bw-bar input{flex:1;min-width:120px;height:32px;border:1px solid var(--qx-border-1,#ddd);border-radius:7px;padding:0 10px;background:var(--qx-bg-component-1,#fff);color:inherit;font:inherit;}
    .bw-bar button,.bw-act{height:30px;border:1px solid var(--qx-border-1,#ddd);border-radius:7px;background:var(--qx-bg-component-1,#fff);color:inherit;padding:0 10px;font:inherit;cursor:pointer;}
    .bw-bar button.is-on{border-color:var(--qx-accent,#2563eb);background:color-mix(in srgb,var(--qx-accent,#2563eb) 12%,transparent);}
    .bw-meta{color:var(--qx-text-secondary,#666);font-size:12px;}
    .bw-err{color:var(--qx-danger,#b91c1c);white-space:pre-wrap;font-size:12px;}
    .bw-list{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:4px;}
    .bw-row{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;padding:8px 10px;border-radius:8px;border:1px solid transparent;text-align:left;background:transparent;color:inherit;font:inherit;cursor:pointer;}
    .bw-row:hover{background:var(--qx-bg-component-2,#f5f5f5);}
    .bw-row.is-sel{border-color:var(--qx-accent,#2563eb);background:color-mix(in srgb,var(--qx-accent,#2563eb) 8%,transparent);}
    .bw-row strong{display:block;}
    .bw-row small{color:var(--qx-text-secondary,#666);}
    .bw-kind{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--qx-text-tertiary,#888);border:1px solid var(--qx-border-1,#ddd);border-radius:4px;padding:2px 5px;}
    .bw-actions{display:flex;gap:6px;flex-wrap:wrap;}
  `;
}

function render(container, context, state) {
  const items = state.filtered;
  const selected = items[state.selected] || null;
  const rows = items
    .map((item, index) => {
      const ver = item.current
        ? `${item.version || "?"} → ${item.current}`
        : item.version || "";
      return `<button type="button" class="bw-row${index === state.selected ? " is-sel" : ""}" data-i="${index}">
        <span>
          <strong>${esc(item.name)}</strong>
          <small>${esc(item.desc || "")}${ver ? ` · ${esc(ver)}` : ""}</small>
        </span>
        <span class="bw-kind">${esc(item.kind)}${item.outdated ? " · outdated" : ""}</span>
      </button>`;
    })
    .join("");

  container.innerHTML = `
    <style>${styles()}</style>
    <div class="bw">
      <div class="bw-bar">
        <button type="button" data-tab="installed" class="${state.tab === "installed" ? "is-on" : ""}">Installed</button>
        <button type="button" data-tab="outdated" class="${state.tab === "outdated" ? "is-on" : ""}">Outdated</button>
        <button type="button" data-tab="search" class="${state.tab === "search" ? "is-on" : ""}">Search</button>
        <input data-q placeholder="${state.tab === "search" ? "Search formulae & casks…" : "Filter…"}" value="${esc(state.query)}" />
        <button type="button" data-act="refresh">Refresh</button>
      </div>
      <div class="bw-meta">${state.loading ? "Running brew…" : `${items.length} packages`}${state.brewPath ? ` · ${esc(state.brewPath)}` : ""}</div>
      ${state.error ? `<div class="bw-err">${esc(state.error)}</div>` : ""}
      <div class="bw-list">${rows || `<div class="bw-meta">No packages</div>`}</div>
      <div class="bw-actions">
        <button type="button" data-act="upgrade" ${!selected || selected.remote ? "disabled" : ""}>Upgrade</button>
        <button type="button" data-act="upgrade-all" ${state.tab !== "outdated" ? "disabled" : ""}>Upgrade all outdated</button>
        <button type="button" data-act="install" ${!selected?.remote ? "disabled" : ""}>Install</button>
        <button type="button" data-act="uninstall" ${!selected || selected.remote ? "disabled" : ""}>Uninstall</button>
        <button type="button" data-act="open" ${!selected ? "disabled" : ""}>Homepage</button>
      </div>
    </div>
  `;

  const q = container.querySelector("[data-q]");
  q?.addEventListener("input", () => {
    state.query = q.value;
    if (state.tab === "search") {
      // debounce search
      clearTimeout(state._searchTimer);
      state._searchTimer = setTimeout(() => state.reload(), 350);
    } else {
      state.applyFilter();
      render(container, context, state);
    }
  });
  q?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && state.tab === "search") {
      e.preventDefault();
      state.reload();
    }
  });

  container.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.tab = btn.getAttribute("data-tab");
      state.query = "";
      state.selected = 0;
      state.reload();
    });
  });

  container.querySelectorAll(".bw-row").forEach((row) => {
    row.addEventListener("click", () => {
      state.selected = Number(row.getAttribute("data-i"));
      render(container, context, state);
    });
  });

  container.querySelector('[data-act="refresh"]')?.addEventListener("click", () => state.reload());
  container.querySelector('[data-act="upgrade"]')?.addEventListener("click", () => state.upgradeSelected());
  container.querySelector('[data-act="upgrade-all"]')?.addEventListener("click", () => state.upgradeAll());
  container.querySelector('[data-act="install"]')?.addEventListener("click", () => state.installSelected());
  container.querySelector('[data-act="uninstall"]')?.addEventListener("click", () => state.uninstallSelected());
  container.querySelector('[data-act="open"]')?.addEventListener("click", () => state.openHomepage());
}

function createState(container, context) {
  const state = {
    tab: "installed",
    query: "",
    items: [],
    filtered: [],
    selected: 0,
    loading: false,
    error: "",
    brewPath: "",
    dead: false,
    _searchTimer: 0,
    _reloadGen: 0,

    applyFilter() {
      const q = state.query.trim().toLowerCase();
      state.filtered = !q
        ? state.items
        : state.items.filter(
            (item) =>
              item.name.toLowerCase().includes(q) ||
              String(item.desc || "").toLowerCase().includes(q),
          );
      if (state.selected >= state.filtered.length) state.selected = 0;
    },

    async reload() {
      if (state.dead) return;
      const gen = ++state._reloadGen;
      state.loading = true;
      state.error = "";
      render(container, context, state);
      try {
        try {
          state.brewPath = await resolveBrew(context);
        } catch {
          state.brewPath = "";
        }
        if (state.dead || gen !== state._reloadGen) return;
        if (state.tab === "search") {
          state.items = await searchBrew(context, state.query);
        } else if (state.tab === "outdated") {
          state.items = await loadOutdated(context);
        } else {
          state.items = await loadInstalled(context);
        }
        if (state.dead || gen !== state._reloadGen) return;
        state.applyFilter();
      } catch (error) {
        if (state.dead || gen !== state._reloadGen) return;
        state.items = [];
        state.filtered = [];
        state.error = String(error?.message || error);
      } finally {
        if (state.dead || gen !== state._reloadGen) return;
        state.loading = false;
        render(container, context, state);
      }
    },

    selectedItem() {
      return state.filtered[state.selected] || null;
    },

    async upgradeSelected() {
      const item = state.selectedItem();
      if (!item || item.remote) return;
      state.loading = true;
      state.error = "";
      render(container, context, state);
      try {
        await brewRun(context, ["upgrade", item.id], 600_000);
        context.showToast(`Upgraded ${item.name}`);
        await state.reload();
      } catch (error) {
        state.error = String(error?.message || error);
        state.loading = false;
        render(container, context, state);
      }
    },

    async upgradeAll() {
      const ok = globalThis.confirm ? globalThis.confirm("Run brew upgrade for all outdated packages?") : true;
      if (!ok) return;
      state.loading = true;
      state.error = "";
      render(container, context, state);
      try {
        await brewRun(context, ["upgrade"], 600_000);
        context.showToast("brew upgrade finished");
        state.tab = "outdated";
        await state.reload();
      } catch (error) {
        state.error = String(error?.message || error);
        state.loading = false;
        render(container, context, state);
      }
    },

    async installSelected() {
      const item = state.selectedItem();
      if (!item?.remote) return;
      const ok = globalThis.confirm ? globalThis.confirm(`Install ${item.kind} ${item.name}?`) : true;
      if (!ok) return;
      state.loading = true;
      state.error = "";
      render(container, context, state);
      try {
        const args = item.kind === "cask" ? ["install", "--cask", item.id] : ["install", item.id];
        await brewRun(context, args, 600_000);
        context.showToast(`Installed ${item.name}`);
        state.tab = "installed";
        state.query = "";
        await state.reload();
      } catch (error) {
        state.error = String(error?.message || error);
        state.loading = false;
        render(container, context, state);
      }
    },

    async uninstallSelected() {
      const item = state.selectedItem();
      if (!item || item.remote) return;
      const ok = globalThis.confirm ? globalThis.confirm(`Uninstall ${item.name}?`) : true;
      if (!ok) return;
      state.loading = true;
      state.error = "";
      render(container, context, state);
      try {
        const args =
          item.kind === "cask" ? ["uninstall", "--cask", item.id] : ["uninstall", item.id];
        await brewRun(context, args, 300_000);
        context.showToast(`Uninstalled ${item.name}`);
        await state.reload();
      } catch (error) {
        state.error = String(error?.message || error);
        state.loading = false;
        render(container, context, state);
      }
    },

    async openHomepage() {
      const item = state.selectedItem();
      if (!item) return;
      let url = item.homepage;
      if (!url) {
        url =
          item.kind === "cask"
            ? `https://formulae.brew.sh/cask/${encodeURIComponent(item.id)}`
            : `https://formulae.brew.sh/formula/${encodeURIComponent(item.id)}`;
      }
      await context.openUrl(url);
    },
  };
  return state;
}

export default {
  commands: [
    {
      name: "open-brew",
      title: "Brew",
      async run(context) {
        context.showToast("Open Brew from the plugin panel (search Brew).");
      },
    },
    {
      name: "brew-outdated",
      title: "Brew: Outdated",
      async run(context) {
        try {
          const items = await loadOutdated(context);
          context.showToast(
            items.length ? `${items.length} outdated package(s)` : "All packages up to date",
          );
        } catch (error) {
          context.showToast(String(error?.message || error));
        }
      },
    },
    {
      name: "brew-upgrade-all",
      title: "Brew: Upgrade All Outdated",
      async run(context) {
        const ok = globalThis.confirm
          ? globalThis.confirm("Run brew upgrade for all outdated packages?")
          : true;
        if (!ok) return;
        try {
          await brewRun(context, ["upgrade"], 600_000);
          context.showToast("brew upgrade finished");
        } catch (error) {
          context.showToast(String(error?.message || error));
        }
      },
    },
  ],

  panel: {
    title: "Brew",
    // Host renderPanel times out if this awaits brew (often >5s). Paint UI and load async.
    async render(container, context) {
      if (!context.cli?.run) {
        container.innerHTML =
          '<div style="padding:16px;color:var(--qx-danger)">This host has no context.cli. Requires Qx ≥ 0.5.26 and permission "cli".</div>';
        return;
      }
      const state = createState(container, context);
      container.__bwState = state;
      // First paint ("Running brew…") happens inside reload; do not await the CLI.
      void state.reload();
    },
    destroy(container) {
      const state = container.__bwState;
      if (state) {
        state.dead = true;
        clearTimeout(state._searchTimer);
        container.__bwState = undefined;
      }
      container.innerHTML = "";
    },
  },
};
