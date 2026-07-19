/** Qx Brew — native Workbench list/detail plugin. */

function zh() {
  return /^(zh-CN|zh-Hans|zh-SG|zh-MY|zh$)/i.test(String(navigator.language || ""));
}

function text(en, cn) {
  return zh() ? cn : en;
}

async function resolveBrew(context) {
  const preferred = String((await context.getPreference("brewPath")) || "").trim();
  if (preferred) return (await context.cli.which(preferred)) || preferred;
  for (const candidate of ["brew", "/opt/homebrew/bin/brew", "/usr/local/bin/brew"]) {
    const hit = await context.cli.which(candidate);
    if (hit) return hit;
  }
  throw new Error(text(
    "Homebrew not found. Install it from brew.sh or set the executable in preferences.",
    "未找到 Homebrew。请从 brew.sh 安装，或在插件设置中指定可执行文件。",
  ));
}

async function brewRun(context, args, timeoutMs = 120_000) {
  const program = await resolveBrew(context);
  const result = await context.cli.run({
    program,
    args,
    timeoutMs,
    env: {
      HOMEBREW_NO_AUTO_UPDATE: "1",
      HOMEBREW_NO_ENV_HINTS: "1",
      HOMEBREW_NO_ANALYTICS: "1",
    },
  });
  if (result.timedOut) throw new Error(`brew ${args.join(" ")} timed out`);
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `exit ${result.status}`).trim().slice(0, 500));
  }
  return result;
}

function itemKey(item) {
  return `${item.kind}:${item.id}`;
}

function normalizeInstalled(json) {
  const formulae = (json.formulae || []).map((item) => ({
    id: item.name,
    name: item.full_name || item.name,
    kind: "formula",
    version: item.installed?.[0]?.version || item.versions?.stable || "",
    current: item.versions?.stable || "",
    desc: item.desc || "",
    homepage: item.homepage || "",
    outdated: Boolean(item.outdated),
  }));
  const casks = (json.casks || []).map((item) => ({
    id: item.token || item.name,
    name: item.token || item.name,
    kind: "cask",
    version: item.installed || item.version || "",
    current: item.version || "",
    desc: item.desc || "",
    homepage: item.homepage || "",
    outdated: Boolean(item.outdated),
  }));
  return [...formulae, ...casks].sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeOutdated(json) {
  const formulae = (json.formulae || []).map((item) => ({
    id: item.name,
    name: item.name,
    kind: "formula",
    version: (item.installed_versions || []).join(", "),
    current: item.current_version || "",
    desc: text("Outdated formula", "可更新的 Formula"),
    homepage: "",
    outdated: true,
  }));
  const casks = (json.casks || []).map((item) => ({
    id: item.name,
    name: item.name,
    kind: "cask",
    version: (item.installed_versions || []).join(", "),
    current: item.current_version || "",
    desc: text("Outdated cask", "可更新的 Cask"),
    homepage: "",
    outdated: true,
  }));
  return [...formulae, ...casks];
}

async function loadInstalled(context) {
  return normalizeInstalled(JSON.parse((await brewRun(
    context,
    ["info", "--json=v2", "--installed"],
    180_000,
  )).stdout || "{}"));
}

async function loadOutdated(context) {
  const result = await brewRun(context, ["outdated", "--json=v2"], 180_000);
  try {
    return normalizeOutdated(JSON.parse(result.stdout || "{}"));
  } catch {
    return (result.stdout || "").split("\n").map((line) => line.trim()).filter(Boolean).map((name) => ({
      id: name,
      name,
      kind: "formula",
      version: "",
      current: "",
      desc: text("Outdated", "可更新"),
      homepage: "",
      outdated: true,
    }));
  }
}

async function searchBrew(context, query) {
  const value = String(query || "").trim();
  if (!value) return [];
  const [formulaeOut, casksOut] = await Promise.all([
    brewRun(context, ["search", "--formulae", value], 60_000).catch(() => ({ stdout: "" })),
    brewRun(context, ["search", "--casks", value], 60_000).catch(() => ({ stdout: "" })),
  ]);
  const mapHits = (stdout, kind) => (stdout || "").split("\n").map((line) => line.trim()).filter(Boolean)
    .map((name) => ({
      id: name,
      name,
      kind,
      version: "",
      current: "",
      desc: text("Search result", "搜索结果"),
      homepage: `https://formulae.brew.sh/${kind}/${encodeURIComponent(name)}`,
      outdated: false,
      remote: true,
    }));
  return [...mapHits(formulaeOut.stdout, "formula"), ...mapHits(casksOut.stdout, "cask")];
}

function createPanel(context) {
  const state = {
    tab: "installed",
    query: "",
    items: [],
    selectedId: null,
    loading: true,
    error: null,
    busy: null,
    brewPath: "",
    dead: false,
    reloadGeneration: 0,
    searchTimer: null,
  };

  const visibleItems = () => {
    if (state.tab === "search") return state.items;
    const query = state.query.trim().toLocaleLowerCase();
    return query
      ? state.items.filter((item) => `${item.name} ${item.desc || ""}`.toLocaleLowerCase().includes(query))
      : state.items;
  };

  const selected = () => visibleItems().find((item) => itemKey(item) === state.selectedId) || visibleItems()[0];

  const paint = () => {
    if (state.dead) return;
    const items = visibleItems();
    if (items.length && !items.some((item) => itemKey(item) === state.selectedId)) {
      state.selectedId = itemKey(items[0]);
    }
    const busy = Boolean(state.busy);
    context.ui.mountWorkbench({
      title: "Brew",
      layout: { kind: "list" },
      query: state.query,
      queryPlaceholder: state.tab === "search"
        ? text("Search formulae and casks…", "搜索 Formula 与 Cask…")
        : text("Filter packages…", "筛选软件包…"),
      tabs: [
        { id: "installed", label: text("Installed", "已安装"), active: state.tab === "installed" },
        { id: "outdated", label: text("Outdated", "可更新"), active: state.tab === "outdated" },
        { id: "search", label: text("Search", "搜索"), active: state.tab === "search" },
      ],
      loading: state.loading,
      error: state.error,
      meta: `${items.length} ${text("packages", "个软件包")}${state.brewPath ? ` · ${state.brewPath}` : ""}`,
      emptyText: state.tab === "search" && !state.query
        ? text("Type to search Homebrew", "输入内容搜索 Homebrew")
        : text("No packages", "没有软件包"),
      selectedId: state.selectedId,
      items: items.map((item) => ({
        id: itemKey(item),
        title: item.name,
        subtitle: item.desc || item.version,
        icon: item.kind === "cask" ? "◆" : "◇",
        badge: item.outdated ? text("Outdated", "可更新") : item.kind,
        tone: item.outdated ? "warning" : "neutral",
        detail: {
          title: item.name,
          subtitle: item.desc,
          fields: [
            { label: text("Type", "类型"), value: item.kind },
            { label: text("Installed", "已安装版本"), value: item.version || "—" },
            { label: text("Latest", "最新版本"), value: item.current || "—" },
            { label: text("Status", "状态"), value: item.remote
              ? text("Available", "可安装")
              : item.outdated ? text("Update available", "有可用更新") : text("Installed", "已安装") },
          ],
        },
        actions: item.remote ? [
          { id: "install", label: text("Install", "安装"), primary: true, disabled: busy },
          { id: "homepage", label: text("Open Homepage", "打开主页"), disabled: busy },
        ] : [
          { id: "upgrade", label: text("Upgrade", "更新"), primary: item.outdated, disabled: busy },
          { id: "homepage", label: text("Open Homepage", "打开主页"), primary: !item.outdated, disabled: busy },
          { id: "uninstall", label: text("Uninstall", "卸载"), tone: "danger", disabled: busy },
        ],
      })),
      actions: [
        { id: "refresh", label: text("Refresh", "刷新"), disabled: busy },
        { id: "upgrade-all", label: text("Upgrade All Outdated", "更新全部可更新项"), disabled: busy || state.tab !== "outdated" },
      ],
      island: state.busy ? { primary: "Brew", secondary: state.busy, tone: "neutral" } : null,
    }, {
      onQuery(value) {
        state.query = value;
        paint();
        if (state.tab === "search") {
          if (state.searchTimer != null) context.clearTimeout(state.searchTimer);
          state.searchTimer = context.setTimeout(() => void reload(), 350);
        }
      },
      onTab(id) {
        if (!["installed", "outdated", "search"].includes(id)) return;
        state.tab = id;
        state.query = "";
        state.items = [];
        state.selectedId = null;
        void reload();
      },
      onSelect(id) {
        state.selectedId = id;
        paint();
      },
      onAction(id) {
        void runAction(id);
      },
    });
  };

  const reload = async () => {
    if (state.dead) return;
    const generation = ++state.reloadGeneration;
    state.loading = true;
    state.error = null;
    paint();
    try {
      state.brewPath = await resolveBrew(context);
      if (state.dead || generation !== state.reloadGeneration) return;
      state.items = state.tab === "search"
        ? await searchBrew(context, state.query)
        : state.tab === "outdated"
          ? await loadOutdated(context)
          : await loadInstalled(context);
      if (state.dead || generation !== state.reloadGeneration) return;
      state.selectedId = state.items[0] ? itemKey(state.items[0]) : null;
    } catch (error) {
      if (state.dead || generation !== state.reloadGeneration) return;
      state.items = [];
      state.error = String(error?.message || error);
    } finally {
      if (state.dead || generation !== state.reloadGeneration) return;
      state.loading = false;
      paint();
    }
  };

  const runBusy = async (label, task) => {
    if (state.busy) return;
    state.busy = label;
    state.error = null;
    paint();
    try {
      await task();
    } catch (error) {
      state.error = String(error?.message || error);
      context.showToast(state.error);
    } finally {
      state.busy = null;
      paint();
    }
  };

  const confirmAction = async (label) => {
    const answer = await context.prompt(`${label} ${text("Type YES to continue.", "输入 YES 继续。")}`, "");
    return answer === "YES";
  };

  const homepage = async (item) => {
    const url = item.homepage || `https://formulae.brew.sh/${item.kind}/${encodeURIComponent(item.id)}`;
    await context.openUrl(url);
  };

  const runAction = async (id) => {
    const item = selected();
    if (id === "refresh") return reload();
    if (id === "homepage" && item) return homepage(item);
    if (id === "upgrade-all") {
      if (!(await confirmAction(text("Upgrade all outdated packages?", "更新全部可更新软件包？")))) return;
      return runBusy(text("Upgrading packages…", "正在更新软件包…"), async () => {
        await brewRun(context, ["upgrade"], 600_000);
        context.showToast(text("Homebrew upgrade finished", "Homebrew 更新完成"));
        await reload();
      });
    }
    if (!item) return;
    if (id === "upgrade") {
      return runBusy(`${text("Upgrading", "正在更新")} ${item.name}…`, async () => {
        await brewRun(context, ["upgrade", item.id], 600_000);
        context.showToast(`${text("Upgraded", "已更新")} ${item.name}`);
        await reload();
      });
    }
    if (id === "install") {
      if (!(await confirmAction(`${text("Install", "安装")} ${item.name}?`))) return;
      return runBusy(`${text("Installing", "正在安装")} ${item.name}…`, async () => {
        await brewRun(context, item.kind === "cask" ? ["install", "--cask", item.id] : ["install", item.id], 600_000);
        context.showToast(`${text("Installed", "已安装")} ${item.name}`);
        state.tab = "installed";
        state.query = "";
        await reload();
      });
    }
    if (id === "uninstall") {
      if (!(await confirmAction(`${text("Uninstall", "卸载")} ${item.name}?`))) return;
      return runBusy(`${text("Uninstalling", "正在卸载")} ${item.name}…`, async () => {
        await brewRun(context, item.kind === "cask" ? ["uninstall", "--cask", item.id] : ["uninstall", item.id], 300_000);
        context.showToast(`${text("Uninstalled", "已卸载")} ${item.name}`);
        await reload();
      });
    }
  };

  return { state, paint, reload };
}

export default {
  commands: [
    {
      name: "open-brew",
      title: "Brew",
      async run(context) {
        context.showToast(text("Open Brew from Extensions", "请从扩展中打开 Brew"));
      },
    },
    {
      name: "brew-outdated",
      title: "Brew: Outdated",
      async run(context) {
        try {
          const items = await loadOutdated(context);
          context.showToast(items.length
            ? `${items.length} ${text("outdated packages", "个软件包可更新")}`
            : text("All packages are up to date", "全部软件包均为最新版本"));
        } catch (error) {
          context.showToast(String(error?.message || error));
        }
      },
    },
    {
      name: "brew-upgrade-all",
      title: "Brew: Upgrade All Outdated",
      async run(context) {
        const answer = await context.prompt(text(
          "Upgrade all outdated packages? Type YES to continue.",
          "更新全部可更新软件包？输入 YES 继续。",
        ), "");
        if (answer !== "YES") return;
        try {
          await brewRun(context, ["upgrade"], 600_000);
          context.showToast(text("Homebrew upgrade finished", "Homebrew 更新完成"));
        } catch (error) {
          context.showToast(String(error?.message || error));
        }
      },
    },
  ],
  panel: {
    title: "Brew",
    render(container, context) {
      if (!context.ui?.mountWorkbench || !context.cli?.run) {
        container.textContent = text("Qx 0.5.39 or newer is required.", "需要 Qx 0.5.39 或更高版本。");
        return;
      }
      const panel = createPanel(context);
      container.__qxBrewPanel = panel;
      panel.paint();
      void panel.reload();
    },
    destroy(container) {
      const panel = container.__qxBrewPanel;
      if (panel) {
        panel.state.dead = true;
        panel.state.reloadGeneration += 1;
        container.__qxBrewPanel = null;
      }
      container.innerHTML = "";
    },
  },
};
