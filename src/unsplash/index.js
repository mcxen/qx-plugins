/** Qx Unsplash — native Workbench Gallery plugin. */

const CACHE_KEY = "unsplash.gallery.v1";

function zh() {
  return /^(zh-CN|zh-Hans|zh-SG|zh-MY|zh$)/i.test(String(navigator.language || ""));
}

function text(en, cn) {
  return zh() ? cn : en;
}

function toBase64(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function expandHomePath(path) {
  const raw = String(path || "").trim() || "~/Downloads";
  if (raw === "~") return "/qx-home";
  if (raw.startsWith("~/")) return `/qx-home/${raw.slice(2)}`;
  return raw;
}

async function getAccessKey(context) {
  const key = String((await context.getPreference("accessKey")) || "").trim();
  if (!key) throw new Error(text(
    "Set an Unsplash Access Key in plugin preferences.",
    "请在插件设置中填写 Unsplash Access Key。",
  ));
  return key;
}

async function apiGet(context, path) {
  const key = await getAccessKey(context);
  const url = path.startsWith("http") ? path : `https://api.unsplash.com${path}`;
  const response = await context.http.fetch(url, {
    method: "GET",
    headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" },
    timeoutMs: 30_000,
  });
  if (!response.ok) {
    let detail = response.body || `HTTP ${response.status}`;
    try {
      const error = JSON.parse(response.body || "{}");
      detail = error.errors?.[0] || error.error || detail;
    } catch {
      /* use response body */
    }
    throw new Error(String(detail).slice(0, 300));
  }
  return response.json();
}

function pickUrl(photo, size) {
  const urls = photo?.urls || {};
  return urls[size] || urls.full || urls.regular || urls.small || urls.thumb || "";
}

function mapPhoto(photo) {
  return {
    id: String(photo.id),
    description: photo.description || photo.alt_description || photo.id,
    width: Number(photo.width) || 0,
    height: Number(photo.height) || 0,
    user: photo.user?.name || photo.user?.username || "Unknown",
    userLink: photo.user?.links?.html || "",
    pageUrl: photo.links?.html || `https://unsplash.com/photos/${photo.id}`,
    downloadLocation: photo.links?.download_location || "",
    thumb: pickUrl(photo, "small") || pickUrl(photo, "thumb"),
    preview: pickUrl(photo, "regular") || pickUrl(photo, "small"),
    urls: photo.urls || {},
  };
}

async function searchPhotos(context, query, page = 1) {
  const params = new URLSearchParams({ query: String(query || "").trim() || "nature", page: String(page), per_page: "24" });
  const data = await apiGet(context, `/search/photos?${params}`);
  return {
    results: Array.isArray(data.results) ? data.results.map(mapPhoto) : [],
    totalPages: Number(data.total_pages) || 1,
  };
}

async function randomPhoto(context) {
  const data = await apiGet(context, "/photos/random?count=1");
  const photo = Array.isArray(data) ? data[0] : data;
  if (!photo?.id) throw new Error(text("No random photo returned", "没有返回随机图片"));
  return mapPhoto(photo);
}

async function triggerDownloadEndpoint(context, location) {
  if (!location) return;
  try { await apiGet(context, location); } catch { /* analytics is best effort */ }
}

async function downloadPhotoBytes(context, photo) {
  const size = String((await context.getPreference("downloadSize")) || "full");
  const url = photo.urls?.[size] || photo.urls?.full || photo.preview;
  if (!url) throw new Error(text("No download URL", "没有可用的下载链接"));
  await triggerDownloadEndpoint(context, photo.downloadLocation);
  const response = await context.http.fetch(url, { method: "GET", timeoutMs: 120_000 });
  if (!response.ok) throw new Error(`Download HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function writeBytes(context, path, bytes) {
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  const directory = slash >= 0 ? path.slice(0, slash) : "/qx-home";
  await context.qx.invokeRust("plugin_file_ensure_dir", { path: directory });
  await context.qx.invokeRust("plugin_file_write_base64", { path, dataBase64: toBase64(bytes) });
  return path;
}

async function savePhoto(context, photo) {
  const directory = expandHomePath(await context.getPreference("downloadDir"));
  return writeBytes(context, `${directory.replace(/[\\/]$/, "")}/unsplash-${photo.id}.jpg`, await downloadPhotoBytes(context, photo));
}

async function setWallpaper(context, photo) {
  const env = await context.system.env();
  const configured = String((await context.getPreference("wallpaperDir")) || "~/Pictures/Unsplash");
  const directory = env.platform === "windows" && configured.startsWith("~/")
    ? `${env.homeDir}\\${configured.slice(2).replace(/\//g, "\\")}`
    : expandHomePath(configured);
  const path = await writeBytes(
    context,
    `${directory.replace(/[\\/]$/, "")}${env.platform === "windows" ? "\\" : "/"}unsplash-${photo.id}.jpg`,
    await downloadPhotoBytes(context, photo),
  );
  const applyTo = String((await context.getPreference("applyTo")) || "every");
  await context.system.setWallpaper(path, { scope: applyTo === "current" ? "current" : "every" });
  return path;
}

function createPanel(context) {
  const state = {
    query: "nature",
    page: 1,
    totalPages: 1,
    results: [],
    selectedId: null,
    loading: true,
    error: null,
    busy: null,
    busyId: null,
    dead: false,
    generation: 0,
    revision: 0,
    view: null,
    searchTimer: null,
  };

  const selected = () => state.results.find((photo) => photo.id === state.selectedId) || state.results[0];

  const paint = () => {
    if (state.dead) return;
    if (state.results.length && !state.results.some((photo) => photo.id === state.selectedId)) {
      state.selectedId = state.results[0].id;
    }
    const busy = Boolean(state.busy);
    const snapshot = {
      revision: ++state.revision,
      title: "Unsplash",
      layout: { kind: "gallery", columns: 4, aspectRatio: "landscape" },
      query: state.query,
      queryPlaceholder: text("Search Unsplash photos…", "搜索 Unsplash 图片…"),
      loading: state.loading,
      error: state.error,
      meta: `${state.results.length} ${text("photos", "张图片")} · ${text("page", "第")} ${state.page}`,
      emptyText: text("No photos", "没有图片"),
      selectedId: state.selectedId,
      items: state.results.map((photo) => {
        const itemBusy = state.busyId === photo.id;
        return {
          id: photo.id,
          title: photo.description,
          subtitle: photo.user,
          image: { url: photo.thumb || photo.preview, alt: photo.description, fit: "cover" },
          status: itemBusy ? { state: "loading", label: state.busy } : undefined,
          detail: {
            title: photo.description,
            subtitle: photo.user,
            image: {
              url: photo.preview || photo.thumb,
              alt: photo.description,
              fit: "contain",
              aspectRatio: "auto",
              zoomable: true,
              caption: photo.user,
            },
            status: itemBusy ? { state: "loading", label: state.busy } : undefined,
            fields: [
              { label: text("Photographer", "摄影师"), value: photo.user },
              { label: text("Dimensions", "尺寸"), value: photo.width && photo.height ? `${photo.width} × ${photo.height}` : "—" },
            ],
          },
          actions: [
            { id: "wallpaper", label: text("Set as Wallpaper", "设为壁纸"), primary: true, disabled: busy },
            { id: "download", label: text("Download", "下载"), kbd: "CmdOrCtrl+D", disabled: busy },
            { id: "copy", label: text("Copy Photo Link", "复制图片链接"), disabled: busy },
            { id: "open", label: text("Open on Unsplash", "在 Unsplash 打开"), disabled: busy },
            { id: "photographer", label: text("Open Photographer", "打开摄影师主页"), disabled: busy || !photo.userLink },
          ],
        };
      }),
      actions: [
        { id: "random", label: text("Random Photo", "随机图片"), disabled: busy },
        { id: "more", label: text("Load More", "加载更多"), disabled: busy || state.page >= state.totalPages },
        { id: "refresh", label: text("Refresh", "刷新"), disabled: busy },
      ],
      island: state.busy ? { primary: "Unsplash", secondary: state.busy, tone: "neutral" } : null,
    };
    if (state.view) {
      state.view.update(snapshot);
      return;
    }
    state.view = context.ui.mountWorkbench(snapshot, {
      onQuery(value) {
        state.query = value;
        paint();
        if (state.searchTimer != null) context.clearTimeout(state.searchTimer);
        state.searchTimer = context.setTimeout(() => {
          state.page = 1;
          void load(false);
        }, 400);
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

  const load = async (append = false) => {
    if (state.dead) return;
    const generation = ++state.generation;
    state.loading = true;
    state.error = null;
    paint();
    try {
      const result = await searchPhotos(context, state.query, state.page);
      if (state.dead || generation !== state.generation) return;
      state.totalPages = result.totalPages;
      state.results = append ? [...state.results, ...result.results] : result.results;
      if (!append) state.selectedId = state.results[0]?.id || null;
      await context.storage.persist.set(CACHE_KEY, {
        query: state.query,
        page: state.page,
        totalPages: state.totalPages,
        results: state.results,
        savedAt: Date.now(),
      });
    } catch (error) {
      if (state.dead || generation !== state.generation) return;
      state.error = String(error?.message || error);
      if (!append && !state.results.length) state.results = [];
    } finally {
      if (state.dead || generation !== state.generation) return;
      state.loading = false;
      paint();
    }
  };

  const loadCache = async () => {
    const cache = await context.storage.persist.get(CACHE_KEY).catch(() => null);
    if (state.dead || !cache?.results?.length) return;
    state.query = String(cache.query || "nature");
    state.page = Number(cache.page) || 1;
    state.totalPages = Number(cache.totalPages) || 1;
    state.results = cache.results;
    state.selectedId = state.results[0]?.id || null;
    paint();
  };

  const runBusy = async (label, task, targetId = null) => {
    if (state.busy) return;
    state.busy = label;
    state.busyId = targetId;
    state.error = null;
    paint();
    try {
      await task();
    } catch (error) {
      state.error = String(error?.message || error);
      context.showToast(state.error);
    } finally {
      state.busy = null;
      state.busyId = null;
      paint();
    }
  };

  const runAction = async (id) => {
    const photo = selected();
    if (id === "refresh") {
      state.page = 1;
      return load(false);
    }
    if (id === "more") {
      state.page += 1;
      return load(true);
    }
    if (id === "random") {
      return runBusy(text("Loading random photo…", "正在加载随机图片…"), async () => {
        const random = await randomPhoto(context);
        state.results = [random];
        state.selectedId = random.id;
        state.page = 1;
        state.totalPages = 1;
      });
    }
    if (!photo) return;
    if (id === "wallpaper") {
      return runBusy(text("Setting wallpaper…", "正在设置壁纸…"), async () => {
        await setWallpaper(context, photo);
        context.showToast(text("Wallpaper set", "壁纸设置成功"));
      }, photo.id);
    }
    if (id === "download") {
      return runBusy(text("Downloading photo…", "正在下载图片…"), async () => {
        const path = await savePhoto(context, photo);
        context.showToast(`${text("Saved", "已保存")} ${path}`);
      }, photo.id);
    }
    if (id === "copy") {
      await context.clipboard.write(photo.pageUrl);
      context.showToast(text("Photo link copied", "图片链接已复制"));
    } else if (id === "open") {
      await context.openUrl(photo.pageUrl);
    } else if (id === "photographer" && photo.userLink) {
      await context.openUrl(photo.userLink);
    }
  };

  return { state, paint, load, loadCache };
}

export default {
  commands: [
    {
      name: "open-search",
      title: "Unsplash: Search Photos",
      async run(context) {
        context.showToast(text("Open Unsplash from Extensions", "请从扩展中打开 Unsplash"));
      },
    },
    {
      name: "set-random-wallpaper",
      title: "Unsplash: Set Random Wallpaper",
      mode: "no-view",
      async run(context) {
        try {
          const photo = await randomPhoto(context);
          await setWallpaper(context, photo);
          context.showToast(`${text("Random wallpaper set", "随机壁纸设置成功")} · ${photo.user}`);
        } catch (error) {
          context.showToast(String(error?.message || error));
        }
      },
    },
  ],
  panel: {
    title: "Unsplash",
    render(container, context) {
      if (!context.ui?.mountWorkbench || !context.http?.fetch) {
        container.textContent = text("Qx 0.5.39 or newer is required.", "需要 Qx 0.5.39 或更高版本。");
        return;
      }
      const panel = createPanel(context);
      container.__qxUnsplashPanel = panel;
      panel.paint();
      void panel.loadCache().finally(() => void panel.load(false));
    },
    destroy(container) {
      const panel = container.__qxUnsplashPanel;
      if (panel) {
        panel.state.dead = true;
        panel.state.generation += 1;
        container.__qxUnsplashPanel = null;
      }
      container.innerHTML = "";
    },
  },
};
