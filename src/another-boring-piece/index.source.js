import {
  artworkUrl,
  bytesToBase64,
  fetchCatalog,
  fetchImageBytes,
  fetchRandomWallpaper,
  previewUrl,
  safeFileName,
} from "./source/service.js";
import {
  addHistory,
  AUTO_KEY,
  CATALOG_KEY,
  CATALOG_TTL_MS,
  ensureWallpaperFile,
  HISTORY_KEY,
  normalizeCatalogCache,
  readAutoState,
  readHistory,
  removeHistory,
  writeAutoState,
  writeHistory,
} from "./source/storage.js";

const panels = new WeakMap();
let locale = "en";
let stopLocale = null;

function setLocale(context, onChange) {
  stopLocale?.();
  locale = context?.locale?.current || "en";
  stopLocale = context?.locale?.onChange?.(({ current }) => {
    locale = current || "en";
    onChange?.();
  }) || null;
}

function text(en, zh) {
  return locale === "zh-CN" ? zh : en;
}

async function preference(context, id, fallback) {
  try {
    const value = await context.getPreference(id);
    return value == null || value === "" ? fallback : value;
  } catch {
    return fallback;
  }
}

async function preferenceBool(context, id, fallback = false) {
  const value = await preference(context, id, fallback);
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function friendlyError(error) {
  const message = String(error?.message || error || "");
  if (message.startsWith("http:")) {
    return text(`Artwork service returned HTTP ${message.split(":")[1] || "error"}.`, `艺术服务返回 HTTP ${message.split(":")[1] || "错误"}。`);
  }
  if (message.startsWith("image_http:")) {
    return text(`Image download returned HTTP ${message.split(":")[1] || "error"}.`, `图片下载返回 HTTP ${message.split(":")[1] || "错误"}。`);
  }
  if (message.startsWith("catalog:")) {
    return text("The artwork service returned an unreadable catalog.", "艺术服务返回了无法读取的目录。 ").trim();
  }
  if (message.startsWith("image:")) {
    return text("The artwork image response was not a supported JPEG.", "作品图片不是受支持的 JPEG 响应。 ").trim();
  }
  return message || text("The operation failed.", "操作失败。 ").trim();
}

function eventLabel(eventType) {
  if (eventType === "downloaded") return text("Downloaded", "已下载");
  if (eventType === "auto-switched") return text("Auto-switched", "自动轮换");
  return text("Set as wallpaper", "设为壁纸");
}

function formatTime(timestamp) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return "—";
  return new Intl.DateTimeFormat(locale === "zh-CN" ? "zh-CN" : "en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function wallpaperDetail(wallpaper, extraFields = [], status) {
  return {
    title: wallpaper.name,
    subtitle: `${wallpaper.artist} · ${wallpaper.creationDate}`,
    body: wallpaper.description || text("No description available.", "暂无作品说明。"),
    image: {
      url: previewUrl(wallpaper, 1280),
      alt: wallpaper.name,
      fit: "contain",
      aspectRatio: "auto",
      zoomable: true,
      caption: `${wallpaper.name} · ${wallpaper.artist}`,
    },
    mediaPlacement: "header",
    status,
    sections: [{
      title: text("Artwork", "作品"),
      fields: [
        { label: text("Artist", "艺术家"), value: wallpaper.artist },
        { label: text("Created", "创作年份"), value: wallpaper.creationDate },
        ...extraFields,
      ],
    }],
  };
}

function itemActions(includeDelete, busy) {
  const actions = [
    { id: "set", label: text("Set as Wallpaper", "设为壁纸"), menuKey: "w", kbd: "CmdOrCtrl+Shift+W", disabled: busy },
    { id: "download", label: text("Download", "下载"), menuKey: "s", kbd: "CmdOrCtrl+S", disabled: busy },
    { id: "copy", label: text("Copy Image Link", "复制图片链接"), menuKey: "c", kbd: "CmdOrCtrl+C", disabled: busy },
    { id: "open", label: text("Open Artwork Page", "打开作品页面"), menuKey: "o", kbd: "CmdOrCtrl+O", disabled: busy },
  ];
  if (includeDelete) actions.push({
    id: "delete-history",
    label: text("Delete History Item", "删除历史记录"),
    menuKey: "x",
    kbd: "CmdOrCtrl+Backspace",
    tone: "danger",
    disabled: busy,
  });
  return actions;
}

async function applyWallpaper(context, wallpaper) {
  const path = await ensureWallpaperFile(context, wallpaper);
  const applyTo = String(await preference(context, "applyTo", "every"));
  await context.system.setWallpaper(path, { scope: applyTo === "current" ? "current" : "every" });
  return path;
}

async function downloadWallpaper(context, wallpaper) {
  const { bytes, contentType } = await fetchImageBytes(context, wallpaper);
  return context.system.saveDownload({
    filename: safeFileName(wallpaper),
    mimeType: contentType,
    dataBase64: bytesToBase64(bytes),
  });
}

async function pickRandomAvoidingRecents(context, recentIds) {
  let candidate = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    candidate = await fetchRandomWallpaper(context);
    if (!recentIds.includes(candidate.id)) return candidate;
  }
  return candidate;
}

async function runRandomWallpaper(context, eventType) {
  const autoState = await readAutoState(context);
  const wallpaper = await pickRandomAvoidingRecents(context, autoState.recentIds);
  await applyWallpaper(context, wallpaper);
  const history = await readHistory(context);
  await addHistory(context, history, eventType, wallpaper);
  await writeAutoState(context, autoState, wallpaper.id);
  return wallpaper;
}

function createPanel(container, context) {
  const state = {
    tab: "today",
    query: "",
    catalog: [],
    todayId: null,
    catalogSavedAt: 0,
    history: [],
    selectedTodayId: null,
    selectedHistoryId: null,
    loading: false,
    stale: false,
    error: null,
    busy: null,
    busyId: null,
    generation: 0,
    revision: 0,
    view: null,
    dead: false,
    refreshPromise: null,
  };

  const sourceItems = () => state.tab === "history"
    ? state.history.map((entry) => ({ id: entry.eventId, wallpaper: entry.wallpaper, entry }))
    : state.catalog.map((wallpaper) => ({ id: wallpaper.id, wallpaper, entry: null }));

  const visibleItems = () => {
    const needle = state.query.trim().toLocaleLowerCase();
    return sourceItems().filter(({ wallpaper, entry }) => !needle || [
      wallpaper.name,
      wallpaper.artist,
      wallpaper.creationDate,
      wallpaper.description,
      entry ? eventLabel(entry.eventType) : "",
    ].join(" ").toLocaleLowerCase().includes(needle));
  };

  const selectedId = () => state.tab === "history" ? state.selectedHistoryId : state.selectedTodayId;
  const setSelectedId = (id) => {
    if (state.tab === "history") state.selectedHistoryId = id;
    else state.selectedTodayId = id;
  };

  const selectedItem = (fallbackId) => sourceItems().find((item) => item.id === String(fallbackId || selectedId() || ""));

  const paint = () => {
    if (state.dead) return;
    const visible = visibleItems();
    if (!visible.some((item) => item.id === selectedId())) setSelectedId(visible[0]?.id || null);
    const busy = Boolean(state.busy);
    const items = visible.map(({ id, wallpaper, entry }) => {
      const itemBusy = state.busyId === id;
      const status = itemBusy ? { state: "loading", label: state.busy } : undefined;
      const extraFields = entry ? [
        { label: text("Action", "操作"), value: eventLabel(entry.eventType) },
        { label: text("Time", "时间"), value: formatTime(entry.timestamp) },
        ...(entry.downloadPath ? [{ label: text("Saved file", "保存文件"), value: entry.downloadPath }] : []),
      ] : [
        { label: text("Collection", "集合"), value: wallpaper.id === state.todayId ? text("Today's pick", "今日精选") : text("Discovery", "随机发现") },
      ];
      return {
        id,
        title: wallpaper.name,
        subtitle: `${wallpaper.artist} · ${wallpaper.creationDate}`,
        meta: entry ? formatTime(entry.timestamp) : wallpaper.id === state.todayId ? text("Today", "今日") : text("Discovery", "发现"),
        badge: entry ? eventLabel(entry.eventType) : wallpaper.id === state.todayId ? text("Daily pick", "每日精选") : "",
        image: { url: previewUrl(wallpaper, 320), alt: wallpaper.name, fit: "cover" },
        status,
        detail: wallpaperDetail(wallpaper, extraFields, status),
        actions: itemActions(Boolean(entry), busy),
      };
    });
    const snapshot = {
      revision: ++state.revision,
      title: text("Art Wallpapers", "每日艺术壁纸"),
      layout: { kind: "list" },
      cache: { key: "art-wallpapers", mode: "stale-while-revalidate", maxAgeMs: 7 * 24 * 60 * 60 * 1000 },
      backgroundPoll: { command: "auto-switch-art-wallpaper" },
      query: state.query,
      queryPlaceholder: state.tab === "history"
        ? text("Search history by artwork, artist, year, or action…", "按作品、艺术家、年份或操作搜索历史…")
        : text("Search today's artworks…", "搜索今日艺术作品…"),
      tabs: [
        { id: "today", label: text("Today", "今日作品"), active: state.tab === "today" },
        { id: "history", label: text("History", "历史"), active: state.tab === "history" },
      ],
      loading: state.loading && items.length === 0,
      error: state.error,
      meta: state.tab === "history"
        ? text(`${state.history.length} history items`, `${state.history.length} 条历史记录`)
        : state.stale
          ? text("Cached artworks · refresh unavailable", "缓存作品 · 暂时无法刷新")
          : state.catalogSavedAt
            ? text(`Updated ${formatTime(state.catalogSavedAt)}`, `更新于 ${formatTime(state.catalogSavedAt)}`)
            : text("Hand-picked fine art", "每日精选艺术"),
      selectedId: selectedId(),
      items,
      emptyText: state.tab === "history"
        ? text("No history yet. Set or download an artwork to begin.", "暂无历史记录；设置或下载作品后会显示在这里。")
        : state.loading
          ? text("Loading today's artworks…", "正在加载今日艺术作品…")
          : text("No matching artworks.", "没有匹配的艺术作品。"),
      actions: state.tab === "history"
        ? [{ id: "clear-history", label: text("Clear All History", "清空全部历史"), menuKey: "h", tone: "danger", disabled: busy || state.history.length === 0 }]
        : [
          { id: "random", label: text("Set Random Artwork", "设置随机作品"), menuKey: "n", disabled: busy },
          { id: "refresh", label: text("Refresh Artworks", "刷新作品"), menuKey: "r", kbd: "CmdOrCtrl+R", disabled: busy || state.loading },
        ],
      island: state.busy ? { primary: text("Art Wallpapers", "每日艺术壁纸"), secondary: state.busy, activity: "spinner" } : null,
    };
    if (state.view) state.view.update(snapshot);
    else {
      state.view = context.ui.mountWorkbench(snapshot, {
        onQuery(value) {
          state.query = String(value || "");
          paint();
        },
        onTab(id) {
          if (!["today", "history"].includes(id) || id === state.tab) return;
          state.tab = id;
          state.query = "";
          paint();
        },
        onSelect(id) {
          setSelectedId(String(id || ""));
          paint();
        },
        onAction(id, item) {
          void runAction(String(id || ""), item?.id);
        },
        onBackgroundPoll() {
          void reloadHistory();
        },
      });
    }
  };

  const reloadHistory = async () => {
    const history = await readHistory(context);
    if (state.dead) return;
    state.history = history;
    if (!state.selectedHistoryId && history[0]) state.selectedHistoryId = history[0].eventId;
    paint();
  };

  const persistCatalog = async (catalog) => {
    const bundle = { savedAt: Date.now(), todayId: catalog.todayId, wallpapers: catalog.wallpapers };
    await context.storage.persist.set(CATALOG_KEY, bundle);
    return bundle;
  };

  const refreshCatalog = (force = false) => {
    if (state.refreshPromise) return state.refreshPromise;
    if (!force && state.catalogSavedAt && Date.now() - state.catalogSavedAt <= CATALOG_TTL_MS) return Promise.resolve();
    state.loading = true;
    state.error = null;
    const generation = ++state.generation;
    paint();
    const request = fetchCatalog(context).then(persistCatalog).then((bundle) => {
      if (state.dead || generation !== state.generation) return;
      state.catalog = bundle.wallpapers;
      state.todayId = bundle.todayId;
      state.catalogSavedAt = bundle.savedAt;
      state.selectedTodayId ||= bundle.todayId || bundle.wallpapers[0]?.id || null;
      state.stale = false;
    }).catch((error) => {
      if (state.dead || generation !== state.generation) return;
      state.error = friendlyError(error);
      state.stale = state.catalog.length > 0;
    }).finally(() => {
      if (!state.dead && generation === state.generation) {
        state.loading = false;
        state.refreshPromise = null;
        paint();
      }
    });
    state.refreshPromise = request;
    return request;
  };

  const withBusy = async (label, targetId, task) => {
    if (state.busy) return;
    state.busy = label;
    state.busyId = targetId || null;
    state.error = null;
    paint();
    try {
      await task();
    } catch (error) {
      state.error = friendlyError(error);
      context.showToast(state.error);
    } finally {
      state.busy = null;
      state.busyId = null;
      paint();
    }
  };

  const record = async (type, wallpaper, downloadPath = null) => {
    state.history = await addHistory(context, state.history, type, wallpaper, downloadPath);
    state.selectedHistoryId = state.history[0]?.eventId || null;
  };

  const runAction = async (id, targetId) => {
    if (id === "refresh") return refreshCatalog(true);
    if (id === "random") {
      await withBusy(text("Finding and setting a random artwork…", "正在查找并设置随机作品…"), null, async () => {
        const wallpaper = await runRandomWallpaper(context, "selected");
        await reloadHistory();
        context.showToast(text(`${wallpaper.name} is now your wallpaper.`, `已将《${wallpaper.name}》设为壁纸。`));
      });
      return;
    }
    if (id === "clear-history") {
      const confirmation = await context.prompt(text("Type CLEAR to remove all wallpaper history. Downloaded files are kept.", "输入 CLEAR 清空全部壁纸历史；已下载文件会保留。"), "");
      if (String(confirmation || "").trim().toUpperCase() !== "CLEAR") return;
      state.history = await writeHistory(context, []);
      state.selectedHistoryId = null;
      context.showToast(text("Wallpaper history cleared.", "壁纸历史已清空。"));
      paint();
      return;
    }
    const target = selectedItem(targetId);
    if (!target) return;
    const { wallpaper, entry } = target;
    if (id === "set") {
      await withBusy(text("Setting wallpaper…", "正在设置壁纸…"), target.id, async () => {
        await applyWallpaper(context, wallpaper);
        await record("selected", wallpaper);
        context.showToast(text("Wallpaper set.", "壁纸设置成功。"));
      });
    } else if (id === "download") {
      await withBusy(text("Downloading artwork…", "正在下载作品…"), target.id, async () => {
        const path = await downloadWallpaper(context, wallpaper);
        await record("downloaded", wallpaper, path);
        context.showToast(text(`Saved to ${path}`, `已保存到 ${path}`));
      });
    } else if (id === "copy") {
      await context.clipboard.write(wallpaper.url);
      context.showToast(text("Image link copied.", "图片链接已复制。"));
    } else if (id === "open") {
      await context.openUrl(artworkUrl(wallpaper));
    } else if (id === "delete-history" && entry) {
      const confirmation = await context.prompt(text(`Type DELETE to remove “${wallpaper.name}” from history.`, `输入 DELETE 从历史中删除《${wallpaper.name}》。`), "");
      if (String(confirmation || "").trim().toUpperCase() !== "DELETE") return;
      state.history = await removeHistory(context, state.history, entry.eventId);
      state.selectedHistoryId = state.history[0]?.eventId || null;
      context.showToast(text("History item deleted.", "历史记录已删除。"));
      paint();
    }
  };

  const hydrate = async () => {
    const [catalogCache, history] = await Promise.all([
      context.storage.persist.get(CATALOG_KEY).catch(() => null),
      readHistory(context),
    ]);
    if (state.dead) return;
    const catalog = normalizeCatalogCache(catalogCache);
    state.catalog = catalog.wallpapers;
    state.todayId = catalog.todayId;
    state.catalogSavedAt = catalog.savedAt;
    state.selectedTodayId = catalog.todayId || catalog.wallpapers[0]?.id || null;
    state.history = history;
    state.selectedHistoryId = history[0]?.eventId || null;
    paint();
    await refreshCatalog(false);
  };

  setLocale(context, paint);
  paint();
  void hydrate();
  return {
    destroy() {
      state.dead = true;
      state.generation += 1;
      state.view = null;
      stopLocale?.();
      stopLocale = null;
      container.innerHTML = "";
    },
  };
}

const plugin = {
  commands: [
    {
      name: "set-random-art-wallpaper",
      title: "Set Random Art Wallpaper",
      mode: "no-view",
      async run(context) {
        setLocale(context);
        const wallpaper = await runRandomWallpaper(context, "selected");
        context.showToast(text(`${wallpaper.name} is now your wallpaper.`, `已将《${wallpaper.name}》设为壁纸。`));
      },
    },
    {
      name: "auto-switch-art-wallpaper",
      title: "Rotate Art Wallpaper",
      mode: "no-view",
      async run(context, options = {}) {
        setLocale(context);
        const manual = options.launchType !== "background";
        if (!manual && !(await preferenceBool(context, "autoSwitchEnabled", false))) return;
        const state = await readAutoState(context);
        const interval = Math.max(1800, Number(await preference(context, "refreshIntervalSeconds", "3600")) || 3600) * 1000;
        if (!manual && state.lastAppliedAt && Date.now() - state.lastAppliedAt < interval) return;
        const wallpaper = await runRandomWallpaper(context, "auto-switched");
        if (manual) {
          context.showToast(text(`${wallpaper.name} is now your wallpaper.`, `已将《${wallpaper.name}》设为壁纸。`));
        } else if (await preferenceBool(context, "notifyOnSwitch", false)) {
          await context.notification.show({
            title: text("Art wallpaper rotated", "艺术壁纸已轮换"),
            body: `${wallpaper.name} · ${wallpaper.artist}`,
          }).catch(() => {});
        }
      },
    },
  ],
  panel: {
    title: "Art Wallpapers",
    render(container, context) {
      panels.get(container)?.destroy();
      panels.set(container, createPanel(container, context));
    },
    destroy(container) {
      panels.get(container)?.destroy();
      panels.delete(container);
    },
  },
};

export default plugin;
export { friendlyError, wallpaperDetail };
