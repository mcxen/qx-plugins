/**
 * Qx Bing Wallpaper — native Qx business plugin.
 * UI is pure Workbench data; network/files/system work goes through context ports.
 */

const CACHE_KEY = "bing-wallpapers.v1";
const CACHE_TTL_MS = 3 * 60 * 60 * 1000;
const WALLPAPER_DIR = "/qx-plugin-files/qx-bing-wallpaper/wallpapers";

function zh() {
  return /^(zh-CN|zh-Hans|zh-SG|zh-MY|zh$)/i.test(String(navigator.language || ""));
}

function text(en, cn) {
  return zh() ? cn : en;
}

async function preference(context, id, fallback) {
  try {
    const value = await context.getPreference(id);
    return value == null || value === "" ? fallback : value;
  } catch {
    return fallback;
  }
}

function toBase64(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function absoluteBingUrl(path) {
  if (!path) return "";
  return /^https:\/\//i.test(path) ? path : `https://www.bing.com${path}`;
}

function imageUrl(image, size = "uhd") {
  const base = image.urlbase || String(image.url || "").split("&")[0];
  if (!base) return absoluteBingUrl(image.url);
  const suffix = size === "thumb" ? "_640x360.jpg" : "_UHD.jpg";
  return absoluteBingUrl(`${base}${suffix}`);
}

function imageId(image) {
  const source = image.urlbase || image.url || image.startdate || "bing";
  const match = /OHR\.([^_&./]+)/i.exec(source);
  return (match?.[1] || image.startdate || "bing").replace(/[^a-z0-9_-]+/gi, "-");
}

function imageTitle(image) {
  const copyright = String(image.copyright || "").trim();
  return copyright.replace(/\s*\([^()]*(?:©|\bc\b)[^()]*\)\s*$/i, "").trim()
    || imageId(image);
}

function imageCredit(image) {
  const copyright = String(image.copyright || "");
  const match = /\(([^()]*(?:©|\bc\b)[^()]*)\)\s*$/i.exec(copyright);
  return match?.[1] || copyright;
}

function sourceUrl(image) {
  return image.copyrightlink ? absoluteBingUrl(image.copyrightlink) : imageUrl(image, "uhd");
}

async function fetchArchive(context, index) {
  const url = `https://www.bing.com/HPImageArchive.aspx?format=js&idx=${index}&n=8&pid=hp&uhd=1&uhdwidth=3840&uhdheight=2160`;
  const response = await context.http.fetch(url, { method: "GET", timeoutMs: 20_000 });
  if (!response.ok) throw new Error(`Bing HTTP ${response.status}`);
  const data = await response.json();
  return Array.isArray(data?.images) ? data.images : [];
}

async function fetchWallpapers(context) {
  const pages = await Promise.all([fetchArchive(context, 0), fetchArchive(context, 8)]);
  const seen = new Set();
  const images = pages.flat().filter((image) => {
    const id = imageId(image);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const bundle = { savedAt: Date.now(), images };
  await context.storage.persist.set(CACHE_KEY, bundle);
  return bundle;
}

async function loadWallpapers(context, force = false) {
  const cached = await context.storage.persist.get(CACHE_KEY).catch(() => null);
  if (!force && cached?.images?.length && Date.now() - Number(cached.savedAt || 0) < CACHE_TTL_MS) {
    return cached;
  }
  try {
    return await fetchWallpapers(context);
  } catch (error) {
    if (cached?.images?.length) return { ...cached, staleError: String(error?.message || error) };
    throw error;
  }
}

async function downloadImage(context, image, directory) {
  const url = imageUrl(image, "uhd");
  const response = await context.http.fetch(url, { method: "GET", timeoutMs: 120_000 });
  if (!response.ok) throw new Error(`Download HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const path = `${String(directory).replace(/[\\/]$/, "")}/bing-${imageId(image)}-${image.startdate || "wallpaper"}.jpg`;
  await context.qx.invokeRust("plugin_file_ensure_dir", { path: String(directory) });
  await context.qx.invokeRust("plugin_file_write_base64", { path, dataBase64: toBase64(bytes) });
  return path;
}

async function applyWallpaper(context, image) {
  const env = await context.system.env();
  const applyTo = String(await preference(context, "applyTo", "every"));
  const directory = env.platform === "windows"
    ? `${env.homeDir}\\Pictures\\Qx Bing Wallpaper`
    : WALLPAPER_DIR;
  const path = await downloadImage(context, image, directory);
  await context.system.setWallpaper(path, { scope: applyTo === "current" ? "current" : "every" });
  return path;
}

async function saveWallpaper(context, image) {
  const env = await context.system.env();
  const configured = String(await preference(context, "downloadDirectory", "~/Downloads"));
  const directory = configured === "~"
    ? env.homeDir
    : configured.startsWith("~/")
      ? `${env.homeDir}${env.platform === "windows" ? "\\" : "/"}${configured.slice(2)}`
      : configured;
  return downloadImage(context, image, directory);
}

function createPanelState(context) {
  const state = {
    images: [],
    selectedId: null,
    query: "",
    loading: true,
    error: null,
    stale: false,
    busy: null,
    dead: false,
    loadGeneration: 0,
  };

  const selected = () => state.images.find((image) => imageId(image) === state.selectedId) || state.images[0];

  const paint = () => {
    if (state.dead) return;
    const needle = state.query.trim().toLocaleLowerCase();
    const visible = needle
      ? state.images.filter((image) => `${imageTitle(image)} ${image.copyright || ""}`.toLocaleLowerCase().includes(needle))
      : state.images;
    if (visible.length && !visible.some((image) => imageId(image) === state.selectedId)) {
      state.selectedId = imageId(visible[0]);
    }
    context.ui.mountWorkbench({
      title: "Qx Bing Wallpaper",
      query: state.query,
      queryPlaceholder: text("Search wallpapers…", "搜索壁纸…"),
      layout: { kind: "gallery", columns: 4, aspectRatio: "landscape" },
      loading: state.loading,
      error: state.error,
      meta: state.stale
        ? text("Showing cached wallpapers", "正在显示缓存壁纸")
        : text(`${visible.length} Bing wallpapers`, `${visible.length} 张 Bing 壁纸`),
      emptyText: text("No wallpapers", "没有壁纸"),
      selectedId: state.selectedId,
      items: visible.map((image) => ({
        id: imageId(image),
        title: imageTitle(image),
        subtitle: imageCredit(image),
        badge: image.startdate || "",
        image: { url: imageUrl(image, "thumb"), alt: imageTitle(image), fit: "cover" },
        detail: {
          title: imageTitle(image),
          subtitle: imageCredit(image),
          image: { url: imageUrl(image, "full"), alt: imageTitle(image), fit: "contain" },
          fields: [
            { label: text("Date", "日期"), value: image.startdate || "—" },
            { label: text("Resolution", "分辨率"), value: "3840 × 2160" },
          ],
        },
        actions: [
          { id: "set", label: text("Set as Wallpaper", "设为壁纸"), primary: true },
          { id: "download", label: text("Download", "下载"), kbd: "CmdOrCtrl+D" },
          { id: "copy", label: text("Copy Image Link", "复制图片链接") },
          { id: "open", label: text("Open Bing Source", "打开 Bing 来源") },
        ],
      })),
      actions: [
        { id: "random", label: text("Set Random Wallpaper", "随机设置壁纸") },
        { id: "refresh", label: text("Refresh Gallery", "刷新图库") },
      ],
      island: state.busy
        ? { primary: "Qx Bing Wallpaper", secondary: state.busy, tone: "neutral" }
        : null,
    }, {
      onQuery(value) {
        state.query = value;
        paint();
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

  const load = async (force = false) => {
    if (state.dead) return;
    const generation = ++state.loadGeneration;
    state.loading = true;
    state.error = null;
    paint();
    try {
      const bundle = await loadWallpapers(context, force);
      if (state.dead || generation !== state.loadGeneration) return;
      state.images = bundle.images || [];
      state.stale = Boolean(bundle.staleError);
      state.error = bundle.staleError ? String(bundle.staleError) : null;
      if (!state.selectedId && state.images[0]) state.selectedId = imageId(state.images[0]);
    } catch (error) {
      if (state.dead || generation !== state.loadGeneration) return;
      state.error = String(error?.message || error);
    } finally {
      if (state.dead || generation !== state.loadGeneration) return;
      state.loading = false;
      paint();
    }
  };

  const withBusy = async (label, task) => {
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

  const runAction = async (id) => {
    const image = selected();
    if (id === "refresh") return load(true);
    if (id === "random") {
      const candidates = state.images;
      const random = candidates[Math.floor(Math.random() * candidates.length)];
      if (random) await withBusy(text("Setting random wallpaper…", "正在设置随机壁纸…"), async () => {
        await applyWallpaper(context, random);
        context.showToast(text("Random wallpaper set", "随机壁纸设置成功"));
      });
      return;
    }
    if (!image) return;
    if (id === "set") {
      await withBusy(text("Setting wallpaper…", "正在设置壁纸…"), async () => {
        await applyWallpaper(context, image);
        context.showToast(text("Wallpaper set", "壁纸设置成功"));
      });
    } else if (id === "download") {
      await withBusy(text("Downloading wallpaper…", "正在下载壁纸…"), async () => {
        const path = await saveWallpaper(context, image);
        context.showToast(`${text("Saved", "已保存")} ${path}`);
      });
    } else if (id === "copy") {
      await context.clipboard.write(imageUrl(image, "uhd"));
      context.showToast(text("Image link copied", "图片链接已复制"));
    } else if (id === "open") {
      await context.openUrl(sourceUrl(image));
    }
  };

  return { state, paint, load };
}

async function backgroundWallpaper(context, random) {
  const bundle = await loadWallpapers(context, true);
  const images = bundle.images || [];
  const image = random ? images[Math.floor(Math.random() * images.length)] : images[0];
  if (!image) throw new Error(text("No Bing wallpaper found", "没有找到 Bing 壁纸"));
  await applyWallpaper(context, image);
  context.showToast(random
    ? text("Random Bing wallpaper set", "已设置随机 Bing 壁纸")
    : text("Latest Bing wallpaper set", "已设置最新 Bing 壁纸"));
}

export default {
  commands: [
    {
      name: "open-gallery",
      title: "Qx Bing Wallpaper",
      async run(context) {
        context.showToast(text("Open Qx Bing Wallpaper from Extensions", "请从扩展中打开 Qx Bing Wallpaper"));
      },
    },
    {
      name: "set-random-wallpaper",
      title: "Set Random Bing Wallpaper",
      mode: "no-view",
      async run(context) {
        try { await backgroundWallpaper(context, true); }
        catch (error) { context.showToast(String(error?.message || error)); }
      },
    },
    {
      name: "set-latest-wallpaper",
      title: "Set Latest Bing Wallpaper",
      mode: "no-view",
      async run(context) {
        try { await backgroundWallpaper(context, false); }
        catch (error) { context.showToast(String(error?.message || error)); }
      },
    },
  ],

  panel: {
    title: "Qx Bing Wallpaper",
    render(container, context) {
      if (!context.ui?.mountWorkbench) {
        container.textContent = text("Qx 0.5.39 or newer is required.", "需要 Qx 0.5.39 或更高版本。");
        return;
      }
      const panel = createPanelState(context);
      container.__qxBingWallpaper = panel;
      panel.paint();
      void panel.load(false);
    },
    destroy(container) {
      if (container.__qxBingWallpaper) {
        container.__qxBingWallpaper.state.dead = true;
        container.__qxBingWallpaper = null;
      }
      container.innerHTML = "";
    },
  },
};
