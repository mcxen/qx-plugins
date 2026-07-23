/** Qxpicture — random image API browser built on the Qx Workbench port. */

const CONFIG_KEY = "qxpicture.config.v1";
const IMAGE_CACHE_KEY = "qxpicture.image-cache.v1";
const CONFIG_SCHEMA_VERSION = 2;
/** Virtual plugin-files path (host maps to disk). Prefer real user paths for wallpaper. */
const PLUGIN_FILES_CACHE = "/qx-plugin-files/qxpicture/images";
const GENERAL_SETTINGS_ID = "__general__";

const MWM_TYPE_OPTIONS = [
  { label: "PC", value: "pc" },
  { label: text("Mobile", "手机"), value: "mp" },
  { label: text("Landscape", "风景"), value: "fj" }
];

const DEFAULT_SOURCES = [
  {
    id: "picsum",
    name: "Picsum Photos",
    url: "https://picsum.photos/800/400",
    type: "direct",
    params: [
      { id: "width", key: "width", value: "800", type: "number" },
      { id: "height", key: "height", value: "400", type: "number" },
      { id: "blur", key: "blur", value: "0", type: "number" },
      {
        id: "grayscale",
        key: "grayscale",
        value: "0",
        type: "select",
        options: [
          { label: text("Off", "关闭"), value: "0" },
          { label: text("On", "开启"), value: "1" }
        ]
      }
    ],
    presets: [
      { id: "default", name: text("Default 800 × 400", "默认 800 × 400"), values: { width: "800", height: "400", blur: "0", grayscale: "0" } },
      { id: "soft", name: text("Soft blur", "柔和模糊"), values: { width: "1200", height: "675", blur: "3", grayscale: "0" } }
    ]
  },
  { id: "paugram", name: "保罗壁纸", url: "https://api.paugram.com/wallpaper/", type: "direct" },
  {
    id: "btstu",
    name: "搏天壁纸",
    url: "http://api.btstu.cn/sjbz/api.php?format=images",
    type: "direct",
    params: [
      {
        id: "method",
        key: "method",
        value: "pc",
        type: "select",
        options: [
          { label: "PC", value: "pc" },
          { label: text("Mobile", "手机"), value: "mobile" }
        ]
      },
      {
        id: "lx",
        key: "lx",
        value: "suiji",
        type: "select",
        options: [
          { label: text("Random", "随机"), value: "suiji" },
          { label: text("Anime", "动漫"), value: "dongman" },
          { label: text("Landscape", "风景"), value: "fengjing" }
        ]
      }
    ],
    presets: [
      { id: "pc-random", name: text("PC · Random", "电脑 · 随机"), values: { method: "pc", lx: "suiji" } },
      { id: "pc-landscape", name: text("PC · Landscape", "电脑 · 风景"), values: { method: "pc", lx: "fengjing" } },
      { id: "mobile-anime", name: text("Mobile · Anime", "手机 · 动漫"), values: { method: "mobile", lx: "dongman" } }
    ]
  },
  {
    id: "mwm-pc",
    name: "次元API PC",
    url: "https://t.mwm.moe/pc",
    type: "direct",
    params: [{ id: "type", key: "type", value: "pc", type: "select", options: MWM_TYPE_OPTIONS }]
  },
  {
    id: "mwm-mobile",
    name: "次元API 手机",
    url: "https://t.mwm.moe/mp",
    type: "direct",
    params: [{ id: "type", key: "type", value: "mp", type: "select", options: MWM_TYPE_OPTIONS }]
  },
  {
    id: "mwm-landscape",
    name: "次元API 风景",
    url: "https://t.mwm.moe/fj",
    type: "direct",
    params: [{ id: "type", key: "type", value: "fj", type: "select", options: MWM_TYPE_OPTIONS }]
  },
  { id: "dmoe", name: "樱花随机图", url: "https://www.dmoe.cc/random.php", type: "direct" },
  { id: "mtyqx", name: "墨天逸", url: "https://api.mtyqx.cn/tapi/random.php", type: "direct" },
  { id: "paulzzh", name: "PAULZZH东方", url: "https://img.paulzzh.com/touhou/random", type: "direct" },
  { id: "98qy", name: "98壁纸", url: "http://www.98qy.com/sjbz/api.php", type: "direct" },
  { id: "xl0408", name: "超级小兔", url: "https://imgapi.xl0408.top/index.php", type: "direct" },
  {
    id: "lolicon",
    name: "Lolicon",
    url: "https://api.lolicon.app/setu/v2",
    type: "json",
    method: "POST",
    jsonPath: "data[0].urls.original",
    params: [
      {
        id: "r18",
        key: "r18",
        value: "0",
        type: "select",
        options: [
          { label: "0", value: "0" },
          { label: "1", value: "1" },
          { label: "2", value: "2" }
        ]
      },
      { id: "keyword", key: "keyword", value: "", type: "text" },
      { id: "num", key: "num", value: "1", type: "number" }
    ],
    presets: [
      { id: "safe-one", name: text("General · 1 image", "普通 · 1 张"), values: { r18: "0", keyword: "", num: "1" } }
    ]
  }
];

function isZh() {
  return /^(zh-CN|zh-Hans|zh-SG|zh-MY|zh$)/i.test(String(navigator.language || ""));
}

function text(en, zh) {
  return isZh() ? zh : en;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeOptions(value) {
  return Array.isArray(value)
    ? value.slice(0, 32).map((option) => ({
        label: String(option?.label ?? option?.value ?? "").slice(0, 80),
        value: String(option?.value ?? "").slice(0, 240)
      }))
    : [];
}

function normalizeParam(raw, index) {
  const key = String(raw?.key || "").trim().slice(0, 120);
  const type = raw?.type === "number" || raw?.type === "select" ? raw.type : "text";
  return {
    id: String(raw?.id || key || `param-${index}-${Date.now()}`).trim().slice(0, 120),
    key,
    value: String(raw?.value ?? "").slice(0, 2_000),
    type,
    ...(type === "select" ? { options: normalizeOptions(raw?.options) } : {})
  };
}

function normalizePreset(raw, index) {
  const values = {};
  if (raw?.values && typeof raw.values === "object") {
    for (const [key, value] of Object.entries(raw.values).slice(0, 64)) {
      values[String(key).slice(0, 120)] = String(value ?? "").slice(0, 2_000);
    }
  }
  return {
    id: String(raw?.id || `preset-${index}-${Date.now()}`).slice(0, 120),
    name: String(raw?.name || `Preset ${index + 1}`).slice(0, 120),
    values
  };
}

function normalizeSource(raw, fallbackId) {
  const type = raw?.type === "json" ? "json" : "direct";
  const id = String(raw?.id || fallbackId || `custom-${Date.now()}`).trim();
  const defaultSource = DEFAULT_SOURCES.find((source) => source.id === id);
  const params = Array.isArray(raw?.params)
    ? raw.params.map(normalizeParam)
    : clone(defaultSource?.params || []);
  const presets = Array.isArray(raw?.presets)
    ? raw.presets.map(normalizePreset)
    : clone(defaultSource?.presets || []);
  return {
    id,
    name: String(raw?.name || "Untitled API").trim(),
    url: String(raw?.url || "").trim(),
    type,
    params,
    presets,
    ...(type === "json" ? {
      method: raw?.method === "POST"
        ? "POST"
        : raw?.method === "GET"
          ? "GET"
          : defaultSource?.method === "POST" ? "POST" : "GET",
      jsonPath: String(raw?.jsonPath || defaultSource?.jsonPath || "data[0].urls.original")
    } : {})
  };
}

function defaultConfig() {
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    sources: clone(DEFAULT_SOURCES),
    downloadDirectory: "~/Downloads",
    wallpaperScope: "every"
  };
}

async function readConfig(context) {
  const stored = await context.storage.persist.get(CONFIG_KEY).catch(() => null);
  if (!stored || !Array.isArray(stored.sources)) {
    const initial = defaultConfig();
    await context.storage.persist.set(CONFIG_KEY, initial);
    return initial;
  }
  const sources = stored.sources.map((source, index) => normalizeSource(source, `source-${index}`))
    .filter((source) => source.id && source.url);
  if (Number(stored.schemaVersion || 0) < CONFIG_SCHEMA_VERSION) {
    for (const source of DEFAULT_SOURCES) {
      if (!sources.some((item) => item.id === source.id)) sources.push(normalizeSource(clone(source), source.id));
    }
  }
  const config = {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    sources,
    downloadDirectory: String(stored.downloadDirectory || "~/Downloads"),
    wallpaperScope: stored.wallpaperScope === "current" ? "current" : "every"
  };
  if (Number(stored.schemaVersion || 0) < CONFIG_SCHEMA_VERSION) {
    await context.storage.persist.set(CONFIG_KEY, config);
  }
  return config;
}

async function writeConfig(context, config) {
  await context.storage.persist.set(CONFIG_KEY, {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    sources: config.sources.map((source) => normalizeSource(source, source.id)),
    downloadDirectory: config.downloadDirectory,
    wallpaperScope: config.wallpaperScope
  });
}

function withCacheBuster(url) {
  const separator = String(url).includes("?") ? "&" : "?";
  return `${url}${separator}_qx=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function appendParams(url, params) {
  const pairs = params
    .filter((param) => String(param.key || "").trim() && param.value !== "")
    .map((param) => `${encodeURIComponent(String(param.key).trim())}=${encodeURIComponent(param.value)}`);
  if (!pairs.length) return String(url);
  const raw = String(url);
  const hashIndex = raw.indexOf("#");
  const base = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const hash = hashIndex >= 0 ? raw.slice(hashIndex) : "";
  const separator = base.includes("?")
    ? base.endsWith("?") || base.endsWith("&") ? "" : "&"
    : "?";
  return `${base}${separator}${pairs.join("&")}${hash}`;
}

function typedParamValue(param) {
  if (param.type !== "number") return param.value;
  const number = Number(param.value);
  return Number.isFinite(number) ? number : param.value;
}

function buildRequest(source, cacheBust = false) {
  // cacheBust only when the user explicitly refreshes — keep stable URLs for cache.
  let url = source.url;
  let params = (source.params || [])
    .map((param) => ({ ...param, key: String(param.key || "").trim() }))
    .filter((param) => param.key);
  let picsumGrayscale = false;

  if (source.id === "picsum") {
    const width = Math.max(1, Number(params.find((param) => param.key === "width")?.value) || 800);
    const height = Math.max(1, Number(params.find((param) => param.key === "height")?.value) || 400);
    url = `${url.replace(/\/\d+\/\d+\/?$/, "").replace(/\/$/, "")}/${Math.round(width)}/${Math.round(height)}`;
    picsumGrayscale = Number(params.find((param) => param.key === "grayscale")?.value) === 1;
    params = params.filter((param) => {
      if (param.key === "width" || param.key === "height") return false;
      if (param.key === "grayscale") return false;
      if (param.key === "blur" && Number(param.value) === 0) return false;
      return true;
    });
  } else if (source.id.startsWith("mwm-")) {
    const variant = params.find((param) => param.key === "type")?.value;
    if (/^(pc|mp|fj)$/.test(variant || "")) {
      url = url.replace(/\/(pc|mp|fj)\/?$/, `/${variant}`);
    }
    params = params.filter((param) => param.key !== "type");
  }

  const method = source.type === "json" && source.method === "POST" ? "POST" : "GET";
  if (method === "POST") {
    const payload = Object.fromEntries(
      params.filter((param) => param.key).map((param) => [param.key, typedParamValue(param)])
    );
    return {
      url: cacheBust ? withCacheBuster(url) : url,
      displayUrl: url,
      body: JSON.stringify(payload),
      options: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        timeoutMs: 30_000
      }
    };
  }

  let requestUrl = appendParams(url, params);
  if (picsumGrayscale) {
    requestUrl += requestUrl.includes("?") ? "&grayscale" : "?grayscale";
  }
  return {
    url: cacheBust ? withCacheBuster(requestUrl) : requestUrl,
    displayUrl: requestUrl,
    body: "",
    options: { method: "GET", timeoutMs: 30_000 }
  };
}

function valueAtPath(value, path) {
  const tokens = String(path || "")
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  return tokens.reduce((current, token) => current == null ? undefined : current[token], value);
}

function contentType(response) {
  return String(
    response.headers?.["content-type"]
      || response.headers?.["Content-Type"]
      || "image/jpeg"
  ).split(";")[0].trim().toLowerCase();
}

function extensionFor(type) {
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  if (type.includes("gif")) return "gif";
  return "jpg";
}

function toBase64(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function toDataUrl(bytes, type) {
  const encoded = toBase64(bytes);
  if (encoded.length > 1_900_000) return "";
  return `data:${type || "image/jpeg"};base64,${encoded}`;
}

function pathJoin(directory, fileName, platform) {
  const separator = platform === "windows" ? "\\" : "/";
  return `${String(directory).replace(/[\\/]$/, "")}${separator}${fileName}`;
}

function expandDirectory(configured, env) {
  const home = String(env?.homeDir || "").replace(/[\\/]$/, "");
  const raw = String(configured || "~/Downloads").trim() || "~/Downloads";
  const sep = env?.dirSep || (env?.platform === "windows" ? "\\" : "/");
  if (raw === "~") return home || raw;
  if (raw.startsWith("~/") || raw.startsWith("~\\")) {
    const rest = raw.slice(2).replace(/[\\/]+/g, sep);
    return home ? `${home}${sep}${rest}` : rest;
  }
  return raw;
}

/** Absolute directory OS wallpaper APIs can read (not only the virtual plugin-files root). */
function wallpaperDirectory(env) {
  return expandDirectory("~/Pictures/Qxpicture", env);
}

function mediaScratchDirectory(env) {
  // Prefer a real user path so clipboard / wallpaper can open the file on both OS.
  try {
    return wallpaperDirectory(env);
  } catch {
    return PLUGIN_FILES_CACHE;
  }
}

async function resolveDownload(context, source, { cacheBust = false } = {}) {
  let imageUrl = source.url;
  if (source.type === "json") {
    const request = buildRequest(source, cacheBust);
    const response = await context.http.fetch(request.url, request.options);
    if (!response.ok) throw new Error(`${source.name}: HTTP ${response.status}`);
    const data = await response.json();
    const url = String(valueAtPath(data, source.jsonPath) || "").trim();
    if (!/^https?:\/\//i.test(url)) {
      throw new Error(`${source.name}: ${text("JSON did not contain an image URL", "JSON 中没有图片地址")}`);
    }
    imageUrl = url;
  }

  const requestUrl = source.type === "direct" ? buildRequest(source, cacheBust).url : imageUrl;
  const response = await context.http.fetch(requestUrl, { method: "GET", timeoutMs: 120_000 });
  if (!response.ok) throw new Error(`${source.name}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length) throw new Error(text("The image response was empty", "图片响应为空"));
  const mediaType = contentType(response);
  if (!mediaType.startsWith("image/")) {
    throw new Error(`${source.name}: ${text("response was not an image", "响应内容不是图片")}`);
  }
  const dataUrl = toDataUrl(bytes, mediaType);
  const finalUrl = String(response.url || requestUrl);
  const preview = dataUrl || (/^https:\/\//i.test(finalUrl) ? finalUrl : "");
  if (!preview) {
    throw new Error(`${source.name}: ${text("image is too large for a safe preview", "图片过大，无法安全预览")}`);
  }
  return { bytes, mediaType, preview, url: finalUrl };
}

async function writeImage(context, directory, source, download, platform) {
  const safeId = source.id.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 48) || "image";
  const fileName = `qxpicture-${safeId}-${Date.now()}.${extensionFor(download.mediaType)}`;
  const path = pathJoin(directory, fileName, platform);
  await context.qx.invokeRust("plugin_file_ensure_dir", { path: directory });
  await context.qx.invokeRust("plugin_file_write_base64", {
    path,
    dataBase64: toBase64(download.bytes)
  });
  return path;
}

async function readImageCache(context) {
  const raw = await context.storage.persist.get(IMAGE_CACHE_KEY).catch(() => null);
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  for (const [id, entry] of Object.entries(raw)) {
    if (!entry || typeof entry !== "object") continue;
    const preview = String(entry.preview || "").trim();
    const url = String(entry.url || "").trim();
    if (!preview && !url) continue;
    out[id] = {
      preview: preview || url,
      url: url || preview,
      mediaType: String(entry.mediaType || "image/jpeg"),
      path: entry.path ? String(entry.path) : "",
      at: Number(entry.at) || 0
    };
  }
  return out;
}

async function writeImageCache(context, cache) {
  const slim = {};
  for (const [id, entry] of Object.entries(cache || {})) {
    if (!entry) continue;
    // Persist preview URL / small data-URL only — not raw bytes.
    slim[id] = {
      preview: String(entry.preview || "").slice(0, 2_000_000),
      url: String(entry.url || "").slice(0, 4_000),
      mediaType: String(entry.mediaType || "image/jpeg").slice(0, 80),
      path: String(entry.path || "").slice(0, 1_000),
      at: Number(entry.at) || Date.now()
    };
  }
  await context.storage.persist.set(IMAGE_CACHE_KEY, slim);
}

function createPanel(context, container) {
  const state = {
    config: defaultConfig(),
    tab: "browse",
    selectedId: "picsum",
    previews: {},
    downloads: {},
    imageCache: {},
    loadingIds: new Set(),
    sourceErrors: {},
    busy: null,
    error: null,
    dead: false,
    generation: 0,
    revision: 0,
    view: null,
    writeQueue: Promise.resolve(),
    cacheWriteQueue: Promise.resolve()
  };

  const sourceById = (id = state.selectedId) => {
    if (id === GENERAL_SETTINGS_ID) return null;
    return state.config.sources.find((source) => source.id === id) || state.config.sources[0];
  };
  const sourceByExactId = (id) => {
    if (!id || id === GENERAL_SETTINGS_ID) return null;
    return state.config.sources.find((source) => source.id === id) || null;
  };

  const persistImageCache = () => {
    state.cacheWriteQueue = state.cacheWriteQueue
      .catch(() => {})
      .then(() => writeImageCache(context, state.imageCache));
    return state.cacheWriteQueue;
  };

  const rememberDownload = (sourceId, download, localPath = "") => {
    state.downloads[sourceId] = download;
    state.previews[sourceId] = download.preview;
    state.imageCache[sourceId] = {
      preview: download.preview,
      url: download.url,
      mediaType: download.mediaType,
      path: localPath || state.imageCache[sourceId]?.path || "",
      at: Date.now()
    };
    void persistImageCache();
  };

  const setError = (error) => {
    state.error = error ? String(error?.message || error) : null;
  };

  const persistConfig = () => {
    state.writeQueue = state.writeQueue
      .catch(() => {})
      .then(() => writeConfig(context, state.config));
    return state.writeQueue;
  };

  /** Avoid publishing a full declarative snapshot on every keystroke. */
  let softPaintTimer = null;
  const queueSoftPaint = (delayMs = 420) => {
    if (softPaintTimer) clearTimeout(softPaintTimer);
    softPaintTimer = setTimeout(() => {
      softPaintTimer = null;
      if (!state.dead) paint();
    }, delayMs);
  };

  const invalidateSource = (source) => {
    delete state.downloads[source.id];
    delete state.previews[source.id];
    // Keep persistent cache so reopening still shows a last image; Refresh replaces it.
  };

  const ensureSelection = () => {
    if (state.selectedId === GENERAL_SETTINGS_ID) {
      if (state.tab === "settings") return;
      state.selectedId = state.config.sources[0]?.id || null;
      return;
    }
    if (!state.config.sources.some((source) => source.id === state.selectedId)) {
      state.selectedId = state.config.sources[0]?.id || null;
    }
  };

  const browseItems = () => state.config.sources.map((source) => {
    const preview = state.previews[source.id];
    const ready = Boolean(state.downloads[source.id]);
    const loading = state.loadingIds.has(source.id);
    const sourceError = state.sourceErrors[source.id];
    const status = loading
      ? { state: "loading", label: text("Loading image…", "正在加载图片…") }
      : sourceError
        ? { state: "error", label: text("Refresh failed", "刷新失败"), error: sourceError }
        : undefined;
    const request = buildRequest(source);
    // Split preset into its own form block so the open dropdown is not stacked
    // under every parameter row (host form selects share one scroll region).
    const presetControls = source.presets?.length ? [{
      id: "browse:preset",
      label: text("Preset", "参数预设"),
      value: "__none__",
      type: "select",
      options: [
        { label: text("Choose a preset…", "选择预设…"), value: "__none__" },
        ...source.presets.map((preset) => ({ label: preset.name, value: preset.id }))
      ]
    }] : [];
    const paramControls = (source.params || []).map((param) => ({
      id: `browse:param:${param.id}`,
      label: param.key || text("Unnamed", "未命名"),
      value: param.value,
      type: param.type,
      options: param.options || [],
      placeholder: param.type === "number" ? "0" : text("Parameter value", "参数值")
    }));
    const canUse = ready || Boolean(preview);
    return {
      id: source.id,
      title: source.name,
      subtitle: source.url,
      badge: source.type === "json" ? "JSON" : text("Image", "图片"),
      image: preview ? { url: preview, alt: source.name, fit: "cover" } : undefined,
      status,
      detail: {
        title: source.name,
        subtitle: request.displayUrl,
        image: preview ? {
          url: preview,
          alt: source.name,
          fit: "contain",
          aspectRatio: "auto",
          zoomable: true,
          caption: source.url
        } : undefined,
        status,
        form: (presetControls.length || paramControls.length) ? {
          title: text("Parameter Controls", "参数调整"),
          description: text(
            "Changes are saved immediately. Click the image for full-screen preview. Refresh loads a new image.",
            "修改会立即保存；点击图片可全屏预览；点“刷新”才会重新请求图片。"
          ),
          // Preset first in isolation; parameters follow with separators via labels.
          controls: [...presetControls, ...paramControls]
        } : undefined,
        body: loading
          ? text("Loading a new image…", "正在加载新图片…")
          : ready
            ? text("Click the image to enlarge. Choose Refresh for another random image.", "点击图片可放大。点“刷新”获取另一张随机图。")
            : preview
              ? text("Showing cached image. Choose Refresh to fetch a new one.", "正在显示缓存图片。点“刷新”可重新获取。")
              : text("Choose Refresh to load an image from this API.", "点“刷新”从该 API 加载图片。"),
        fields: [
          { label: text("Type", "类型"), value: source.type === "json" ? "JSON" : text("Direct image", "直接图片") },
          {
            label: text("Status", "状态"),
            value: loading
              ? text("Loading", "加载中")
              : ready
                ? text("Ready", "就绪")
                : preview
                  ? text("Cached", "已缓存")
                  : text("Not loaded", "未加载")
          },
          { label: text("Save directory", "保存目录"), value: state.config.downloadDirectory || "~/Downloads" },
          { label: text("Final Request URL", "最终请求 URL"), value: request.displayUrl },
          ...(request.body ? [{ label: "POST JSON", value: request.body }] : [])
        ]
      },
      actions: [
        { id: "refresh", label: text("Refresh Image", "刷新图片"), primary: true, disabled: Boolean(state.busy) || loading },
        { id: "save-preset", label: text("Save Parameter Preset", "保存参数预设"), disabled: Boolean(state.busy) || !(source.params || []).length },
        { id: "wallpaper", label: text("Set as Wallpaper", "设为壁纸"), disabled: Boolean(state.busy) || loading || !canUse },
        { id: "save", label: text("Save to Local", "保存到本地"), kbd: "CmdOrCtrl+S", disabled: Boolean(state.busy) || loading || !canUse },
        { id: "copy-image", label: text("Copy Image", "复制图片"), kbd: "CmdOrCtrl+C", disabled: Boolean(state.busy) || loading || !canUse }
      ]
    };
  });

  const settingsItems = () => {
    const general = {
      id: GENERAL_SETTINGS_ID,
      title: text("General", "通用"),
      subtitle: text("Download folder and wallpaper scope", "下载目录与壁纸范围"),
      badge: text("App", "应用"),
      detail: {
        title: text("General", "通用"),
        form: {
          title: text("Storage", "存储"),
          description: text(
            "Saved images use this directory. Default is ~/Downloads.",
            "保存图片使用此目录，默认为 ~/Downloads。"
          ),
          controls: [
            {
              id: "settings:downloadDirectory",
              label: text("Download directory", "下载目录"),
              value: state.config.downloadDirectory || "~/Downloads",
              type: "text",
              placeholder: "~/Downloads"
            },
            {
              id: "settings:wallpaperScope",
              label: text("Wallpaper scope", "壁纸范围"),
              value: state.config.wallpaperScope === "current" ? "current" : "every",
              type: "select",
              options: [
                { label: text("Every display", "所有显示器"), value: "every" },
                { label: text("Current display only", "仅当前显示器"), value: "current" }
              ]
            }
          ]
        },
        fields: [
          { label: text("Expanded path", "展开路径"), value: state.config.downloadDirectory || "~/Downloads" },
          { label: text("Image cache entries", "图片缓存条目"), value: Object.keys(state.imageCache).length }
        ]
      },
      actions: [
        { id: "download-directory", label: text("Edit Save Directory…", "编辑保存目录…"), primary: true },
        { id: "clear-image-cache", label: text("Clear Image Cache", "清除图片缓存"), tone: "danger" }
      ]
    };

    const sources = state.config.sources.map((source) => {
      const params = source.params || [];
      const request = buildRequest(source, false);
      const paramSummary = params.length
        ? params
          .filter((param) => param.key)
          .map((param) => `${param.key}=${param.value === "" ? "∅" : param.value}`)
          .join(" · ")
        : text("No parameters", "无参数");

      const parameterControls = params.flatMap((param, index) => {
        const n = index + 1;
        const groupId = `parameter:${param.id}`;
        const groupLabel = text(
          `Parameter #${n}${param.key ? ` · ${param.key}` : ""}`,
          `参数 #${n}${param.key ? ` · ${param.key}` : ""}`
        );
        const group = {
          id: groupId,
          label: groupLabel,
          action: {
            id: `delete-param:${param.id}`,
            label: text("Delete parameter", "删除参数"),
            tone: "danger"
          }
        };
        const valueControl = param.type === "select" && (param.options || []).length
          ? {
              id: `settings:param:${param.id}:value`,
              label: text("Value", "值"),
              value: param.value,
              type: "select",
              options: param.options,
              group: { id: groupId }
            }
          : {
              id: `settings:param:${param.id}:value`,
              label: text("Value", "值"),
              value: param.value,
              type: param.type === "number" ? "number" : "text",
              placeholder: param.type === "number" ? "0" : text("value", "参数值"),
              group: { id: groupId }
            };
        return [
          {
            id: `settings:param:${param.id}:key`,
            label: text("Key", "参数名"),
            value: param.key,
            type: "text",
            placeholder: text("e.g. width", "例如 width"),
            group
          },
          {
            id: `settings:param:${param.id}:type`,
            label: text("Type", "类型"),
            value: param.type || "text",
            type: "select",
            options: [
              { label: text("Text", "文本"), value: "text" },
              { label: text("Number", "数字"), value: "number" },
              { label: text("Select", "选项"), value: "select" }
            ],
            group: { id: groupId }
          },
          valueControl,
          ...(param.type === "select" ? [{
            id: `settings:param:${param.id}:options`,
            label: text("Options", "选项列表"),
            value: (param.options || [])
              .map((option) => option.label === option.value
                ? option.value
                : `${option.label}=${option.value}`)
              .join(", "),
            type: "text",
            placeholder: text("label=value, label=value", "名称=值, 名称=值"),
            group: { id: groupId }
          }] : [])
        ];
      });

      const hasDefaultParams = DEFAULT_SOURCES.some(
        (item) => item.id === source.id && (item.params || []).length > 0
      );

      return {
        id: source.id,
        title: source.name,
        subtitle: paramSummary === text("No parameters", "无参数")
          ? source.url
          : `${paramSummary}`,
        badge: source.type === "json" ? "JSON" : text("Image", "图片"),
        detail: {
          title: source.name,
          subtitle: source.url,
          body: text(
            "Edit Key / Value pairs below. Changes save immediately and are joined into the request on Refresh.",
            "在下方编辑 Key / Value。修改会立即保存，刷新时拼接到请求 URL（或 POST JSON）。"
          ),
          form: {
            title: text("API + Parameters", "API 与参数"),
            description: text(
              "Each parameter has its own Key, Type, Value, options, and delete action. Changes save automatically.",
              "每个参数独立管理参数名、类型、值、选项与删除操作，修改会自动保存。"
            ),
            controls: [
              {
                id: "settings:source:name",
                label: text("Name", "名称"),
                value: source.name,
                type: "text"
              },
              {
                id: "settings:source:url",
                label: "URL",
                value: source.url,
                type: "text",
                placeholder: "https://"
              },
              {
                id: "settings:source:type",
                label: text("Response Type", "响应类型"),
                value: source.type,
                type: "select",
                options: [
                  { label: text("Direct image", "直接图片"), value: "direct" },
                  { label: "JSON", value: "json" }
                ]
              },
              ...(source.type === "json" ? [
                {
                  id: "settings:source:method",
                  label: text("Parameter Transport", "参数传输方式"),
                  value: source.method || "GET",
                  type: "select",
                  options: [
                    { label: text("GET query string", "GET 查询串"), value: "GET" },
                    { label: text("POST JSON body", "POST JSON 体"), value: "POST" }
                  ]
                },
                {
                  id: "settings:source:jsonPath",
                  label: text("JSON image path", "JSON 图片路径"),
                  value: source.jsonPath || "data[0].urls.original",
                  type: "text",
                  placeholder: "data[0].urls.original"
                }
              ] : []),
              ...parameterControls
            ],
            actions: [
              {
                id: "add-param",
                label: text("Add Parameter", "添加参数"),
                primary: true
              },
              ...(hasDefaultParams ? [{
                id: "fill-default-params",
                label: text("Restore Default Parameters", "恢复默认参数")
              }] : []),
              {
                id: "delete-source",
                label: text("Delete API", "删除 API"),
                tone: "danger"
              }
            ]
          },
          fields: [
            {
              label: text("Parameter list", "参数一览"),
              value: paramSummary
            },
            {
              label: text("Request preview", "请求预览"),
              value: request.displayUrl
            },
            ...(request.body
              ? [{ label: text("POST body preview", "POST 体预览"), value: request.body }]
              : []),
            {
              label: text("Presets", "预设数量"),
              value: (source.presets || []).length
            }
          ],
          sections: params.length ? [{
            title: text("Parameter rows", "参数行"),
            body: params.map((param, index) => {
              const key = param.key || text("(unnamed)", "（未命名）");
              const val = param.value === "" ? text("(empty)", "（空）") : param.value;
              return `#${index + 1}  ${key}  =  ${val}`;
            }).join("\n")
          }] : [{
            title: text("Parameter rows", "参数行"),
            body: text(
              "No parameters. Typical presets: Picsum → width/height/blur; Lolicon → r18/keyword/num.",
              "暂无参数。常用预置：Picsum → width/height/blur；Lolicon → r18/keyword/num。"
            )
          }]
        },
        actions: [
          {
            id: "add-param",
            label: text("Add Parameter", "添加参数"),
            primary: true
          },
          ...(hasDefaultParams ? [{
            id: "fill-default-params",
            label: text("Fill Default Parameters", "填充默认参数")
          }] : []),
          {
            id: "delete-source",
            label: text("Delete API", "删除 API"),
            tone: "danger"
          }
        ]
      };
    });

    return [general, ...sources];
  };

  const paint = () => {
    if (state.dead) return;
    ensureSelection();
    const browse = state.tab === "browse";
    const snapshot = {
      revision: ++state.revision,
      title: "Qxpicture",
      layout: { kind: "list" },
      tabs: [
        { id: "browse", label: text("Browse", "浏览"), active: browse },
        { id: "settings", label: text("Settings", "设置"), active: !browse }
      ],
      loading: Boolean(state.busy) && browse && !Object.keys(state.previews).length,
      error: state.error,
      meta: browse
        ? text(`${state.config.sources.length} image APIs`, `${state.config.sources.length} 个图片 API`)
        : `${text("Save to", "保存到")} ${state.config.downloadDirectory}`,
      emptyText: browse
        ? text("No image APIs. Add one in Settings.", "没有图片 API，请在设置中添加。")
        : text("No APIs configured.", "尚未配置 API。"),
      selectedId: state.selectedId,
      items: browse ? browseItems() : settingsItems(),
      actions: browse ? [
        { id: "refresh", label: text("Refresh Current Image", "刷新当前图片"), primary: true, disabled: Boolean(state.busy) || !state.selectedId }
      ] : [
        { id: "add-source", label: text("Add API", "添加 API"), primary: true },
        { id: "download-directory", label: text("Choose Save Directory", "选择保存目录") },
        { id: "wallpaper-scope", label: text("Wallpaper Scope", "壁纸范围") },
        { id: "reset-sources", label: text("Restore Default APIs", "恢复默认 API") }
      ],
      island: state.busy
        ? { primary: "Qxpicture", secondary: state.busy, activity: "spinner", tone: "neutral" }
        : null
    };
    if (state.view) {
      state.view.update(snapshot);
      return;
    }
    state.view = context.ui.mountWorkbench(snapshot, {
      onTab(id) {
        state.tab = id === "settings" ? "settings" : "browse";
        state.error = null;
        if (state.tab === "settings" && !state.config.sources.some((s) => s.id === state.selectedId)) {
          state.selectedId = GENERAL_SETTINGS_ID;
        } else if (state.tab === "browse") {
          ensureSelection();
        }
        paint();
      },
      onSelect(id) {
        state.selectedId = id;
        paint();
        // Never auto-fetch: show cache until the user clicks Refresh.
      },
      onAction(id, item) {
        void runAction(id, item?.id || state.selectedId);
      },
      onInput(id, value, item) {
        void updateInput(id, value, item?.id || state.selectedId);
      }
    });
  };

  const refreshSource = async (id, { cacheBust = true } = {}) => {
    const source = sourceById(id);
    if (!source || state.loadingIds.has(source.id)) return;
    const generation = state.generation;
    state.loadingIds.add(source.id);
    delete state.sourceErrors[source.id];
    setError(null);
    paint();
    try {
      const download = await resolveDownload(context, source, { cacheBust });
      if (state.dead || generation !== state.generation) return;
      rememberDownload(source.id, download);
    } catch (error) {
      if (!state.dead && generation === state.generation) {
        setError(error);
        state.sourceErrors[source.id] = String(error?.message || error);
      }
    } finally {
      state.loadingIds.delete(source.id);
      paint();
    }
  };

  const withBusy = async (label, task) => {
    if (state.busy) return;
    state.busy = label;
    setError(null);
    paint();
    try {
      await task();
    } catch (error) {
      setError(error);
      context.showToast(state.error);
    } finally {
      state.busy = null;
      paint();
    }
  };

  const parseSelectOptions = (value) => String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 32)
    .map((entry) => {
      const separator = entry.indexOf("=");
      return separator < 0
        ? { label: entry, value: entry }
        : {
            label: entry.slice(0, separator).trim() || entry.slice(separator + 1).trim(),
            value: entry.slice(separator + 1).trim()
          };
    });

  const updateInput = async (controlId, value, targetId) => {
    if (controlId === "settings:downloadDirectory") {
      const next = String(value || "").trim() || "~/Downloads";
      state.config.downloadDirectory = next;
      await persistConfig();
      queueSoftPaint(500);
      return;
    }
    if (controlId === "settings:wallpaperScope") {
      state.config.wallpaperScope = String(value).trim().toLowerCase() === "current" ? "current" : "every";
      paint();
      await persistConfig();
      return;
    }

    const source = sourceById(targetId);
    if (!source) return;

    if (controlId === "browse:preset") {
      if (!value || value === "__none__") return;
      const preset = (source.presets || []).find((item) => item.id === value);
      if (!preset) return;
      for (const param of source.params || []) {
        if (Object.prototype.hasOwnProperty.call(preset.values, param.key)) {
          param.value = String(preset.values[param.key]);
        }
      }
      invalidateSource(source);
      paint();
      await persistConfig();
      return;
    }

    if (controlId.startsWith("browse:param:")) {
      const paramId = controlId.slice("browse:param:".length);
      const param = (source.params || []).find((item) => item.id === paramId);
      if (!param) return;
      param.value = String(value);
      invalidateSource(source);
      await persistConfig();
      // Debounce remount so number/text fields stay focused while typing.
      queueSoftPaint(480);
      return;
    }

    let needsHardPaint = false;

    if (controlId === "settings:source:name") {
      source.name = String(value).slice(0, 160);
    } else if (controlId === "settings:source:url") {
      source.url = String(value).slice(0, 2_000);
    } else if (controlId === "settings:source:type") {
      source.type = value === "json" ? "json" : "direct";
      if (source.type === "json") {
        source.method ||= "GET";
        source.jsonPath ||= "data[0].urls.original";
      }
      needsHardPaint = true;
    } else if (controlId === "settings:source:method") {
      source.method = value === "POST" ? "POST" : "GET";
      needsHardPaint = true;
    } else if (controlId === "settings:source:jsonPath") {
      source.jsonPath = String(value || "").trim().slice(0, 240) || "data[0].urls.original";
    } else if (controlId.startsWith("settings:param:")) {
      const parts = controlId.split(":");
      // settings:param:<id>:key|value|type|options
      const paramId = parts[2];
      const property = parts[3];
      const param = (source.params || []).find((item) => item.id === paramId);
      if (!param) return;
      if (property === "key") {
        // Do not trim trailing spaces while typing; only cap length.
        const previousKey = param.key;
        param.key = String(value ?? "").slice(0, 120);
        if (previousKey && previousKey !== param.key) {
          for (const preset of source.presets || []) {
            if (!Object.prototype.hasOwnProperty.call(preset.values, previousKey)) continue;
            if (param.key) preset.values[param.key] = preset.values[previousKey];
            delete preset.values[previousKey];
          }
        }
      } else if (property === "value") {
        param.value = String(value ?? "").slice(0, 2_000);
      } else if (property === "type") {
        param.type = value === "number" || value === "select" ? value : "text";
        if (param.type === "select") {
          param.options = param.options?.length
            ? param.options
            : [{ label: param.value || "Option", value: param.value || "option" }];
        } else {
          delete param.options;
        }
        needsHardPaint = true;
      } else if (property === "options") {
        param.options = parseSelectOptions(value);
        if (param.options.length && !param.options.some((option) => option.value === param.value)) {
          param.value = param.options[0].value;
        }
      } else {
        return;
      }
    } else {
      return;
    }

    invalidateSource(source);
    await persistConfig();
    if (needsHardPaint) paint();
    else queueSoftPaint(480);
  };

  const addParameter = async (source) => {
    const id = `param-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    source.params ||= [];
    const nextIndex = source.params.length + 1;
    source.params.push({
      id,
      key: "",
      value: "",
      type: "text"
    });
    // Seed a friendly placeholder key only if the list was empty of keys.
    if (!source.params.some((param) => param.id !== id && param.key)) {
      source.params[source.params.length - 1].key = `param${nextIndex}`;
    }
    invalidateSource(source);
    await persistConfig();
    paint();
    context.showToast(text(
      `Added parameter #${source.params.length}. Fill Key and Value below.`,
      `已添加参数 #${source.params.length}，请在下方填写参数名与值。`
    ));
  };

  const fillDefaultParams = async (source) => {
    const defaults = DEFAULT_SOURCES.find((item) => item.id === source.id);
    if (!defaults?.params?.length) {
      throw new Error(text(
        "No built-in parameters for this API.",
        "该 API 没有内置默认参数。"
      ));
    }
    source.params = clone(defaults.params).map(normalizeParam);
    if (Array.isArray(defaults.presets) && !(source.presets || []).length) {
      source.presets = clone(defaults.presets).map(normalizePreset);
    }
    if (defaults.type === "json") {
      source.method = defaults.method || source.method || "GET";
      source.jsonPath = defaults.jsonPath || source.jsonPath || "data[0].urls.original";
    }
    invalidateSource(source);
    await persistConfig();
    paint();
    context.showToast(text("Default parameters restored", "已填充默认参数"));
  };

  const deleteParameter = async (source, paramId) => {
    const parameter = (source.params || []).find((param) => param.id === paramId);
    if (!parameter) return;
    const confirmation = await context.prompt(
      text(
        `Delete parameter “${parameter.key || "unnamed"}”? Press OK to confirm.`,
        `删除参数“${parameter.key || "未命名"}”？点击确定即可确认。`
      ),
      "DELETE"
    );
    if (String(confirmation || "").trim().toUpperCase() !== "DELETE") return;
    source.params = (source.params || []).filter((param) => param.id !== paramId);
    for (const preset of source.presets || []) {
      for (const key of Object.keys(preset.values)) {
        if (!(source.params || []).some((param) => param.key === key)) delete preset.values[key];
      }
    }
    invalidateSource(source);
    await persistConfig();
    paint();
    context.showToast(text("Parameter deleted", "参数已删除"));
  };

  const savePreset = async (source) => {
    const name = await context.prompt(text("Preset name", "预设名称"), "");
    if (name == null || !String(name).trim()) return;
    const values = Object.fromEntries((source.params || []).filter((param) => param.key)
      .map((param) => [param.key, param.value]));
    source.presets ||= [];
    source.presets.push({
      id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: String(name).trim().slice(0, 120),
      values
    });
    await persistConfig();
    paint();
  };

  const currentDownload = async (source) => {
    if (state.downloads[source.id]?.bytes?.length) {
      return state.downloads[source.id];
    }
    // Re-fetch without cache-bust so wallpaper/save work after restoring cache.
    const download = await resolveDownload(context, source, { cacheBust: false });
    rememberDownload(source.id, download);
    paint();
    return download;
  };

  const saveCurrent = async (source) => {
    const env = await context.system.env();
    const directory = expandDirectory(state.config.downloadDirectory || "~/Downloads", env);
    if (!directory) {
      throw new Error(text("Download directory is empty.", "下载目录为空。"));
    }
    const path = await writeImage(context, directory, source, await currentDownload(source), env.platform);
    rememberDownload(source.id, state.downloads[source.id], path);
    context.showToast(`${text("Saved", "已保存")} ${path}`);
  };

  const setWallpaper = async (source) => {
    const env = await context.system.env();
    // Always materialize a real local file first (macOS + Windows wallpaper APIs).
    const directory = mediaScratchDirectory(env);
    const download = await currentDownload(source);
    if (!download?.bytes?.length) {
      throw new Error(text("No image bytes to set as wallpaper.", "没有可用于壁纸的图片数据。"));
    }
    const path = await writeImage(context, directory, source, download, env.platform);
    if (!path) {
      throw new Error(text("Failed to write wallpaper file.", "写入壁纸文件失败。"));
    }
    rememberDownload(source.id, download, path);
    const scope = state.config.wallpaperScope === "current" ? "current" : "every";
    // Host resolves plugin-files paths and absolute user paths.
    await context.system.setWallpaper(path, { scope });
    context.showToast(text("Wallpaper set", "壁纸设置成功"));
  };

  const copyCurrent = async (source) => {
    const env = await context.system.env();
    const directory = mediaScratchDirectory(env);
    const path = await writeImage(context, directory, source, await currentDownload(source), env.platform);
    rememberDownload(source.id, state.downloads[source.id], path);
    await context.qx.invokeRust("clipboard_write_image_file", { path });
    context.showToast(text("Image copied", "图片已复制"));
  };

  const editSource = async (id, adding = false) => {
    const existing = adding ? null : sourceById(id);
    const name = await context.prompt(text("API name", "API 名称"), existing?.name || "");
    if (name == null || !String(name).trim()) return;
    const url = await context.prompt("URL", existing?.url || "https://");
    if (url == null || !/^https?:\/\//i.test(String(url).trim())) {
      throw new Error(text("Enter a valid HTTP or HTTPS URL.", "请输入有效的 HTTP 或 HTTPS 地址。"));
    }
    const typeValue = await context.prompt(
      text("Type: direct or json", "类型：direct 或 json"),
      existing?.type || "direct"
    );
    if (typeValue == null) return;
    const type = String(typeValue).trim().toLowerCase() === "json" ? "json" : "direct";
    const source = normalizeSource({
      ...(existing || {}),
      id: existing?.id || `custom-${Date.now()}`,
      name,
      url,
      type
    });
    if (adding) state.config.sources.push(source);
    else state.config.sources = state.config.sources.map((item) => item.id === source.id ? source : item);
    delete state.previews[source.id];
    delete state.downloads[source.id];
    state.selectedId = source.id;
    await writeConfig(context, state.config);
    paint();
  };

  const deleteSource = async (id) => {
    const source = sourceByExactId(id);
    if (!source) return;
    const confirmation = await context.prompt(
      text(
        `Delete API “${source.name}”? Press OK to confirm.`,
        `删除 API“${source.name}”？点击确定即可确认。`
      ),
      "DELETE"
    );
    if (String(confirmation || "").trim().toUpperCase() !== "DELETE") return;
    state.config.sources = state.config.sources.filter((item) => item.id !== source.id);
    delete state.previews[source.id];
    delete state.downloads[source.id];
    delete state.imageCache[source.id];
    delete state.sourceErrors[source.id];
    ensureSelection();
    await writeConfig(context, state.config);
    await writeImageCache(context, state.imageCache);
    paint();
    context.showToast(text("API deleted", "API 已删除"));
  };

  const editDownloadDirectory = async () => {
    const directory = await context.prompt(
      text("Save directory", "保存目录"),
      state.config.downloadDirectory
    );
    if (directory == null || !String(directory).trim()) return;
    state.config.downloadDirectory = String(directory).trim();
    await writeConfig(context, state.config);
    paint();
  };

  const editWallpaperScope = async () => {
    const scope = await context.prompt(
      text("Wallpaper scope: every or current", "壁纸范围：every 或 current"),
      state.config.wallpaperScope
    );
    if (scope == null) return;
    state.config.wallpaperScope = String(scope).trim().toLowerCase() === "current" ? "current" : "every";
    await writeConfig(context, state.config);
    paint();
  };

  const restoreDefaults = async () => {
    const confirmation = await context.prompt(
      text("Type RESET to restore default APIs", "输入 RESET 以恢复默认 API"),
      ""
    );
    if (confirmation !== "RESET") return;
    state.config.sources = clone(DEFAULT_SOURCES);
    state.previews = {};
    state.downloads = {};
    state.imageCache = {};
    state.selectedId = state.config.sources[0]?.id || null;
    await writeConfig(context, state.config);
    await writeImageCache(context, {});
    paint();
    // Do not auto-fetch after reset; user chooses Refresh.
  };

  const clearImageCache = async () => {
    const confirmation = await context.prompt(
      text("Type CLEAR to wipe cached previews", "输入 CLEAR 以清除图片缓存"),
      ""
    );
    if (confirmation !== "CLEAR") return;
    state.imageCache = {};
    state.previews = {};
    state.downloads = {};
    await writeImageCache(context, {});
    paint();
    context.showToast(text("Image cache cleared", "图片缓存已清除"));
  };

  const runAction = async (id, targetId) => {
    if (id === "add-source") return withBusy(text("Adding API…", "正在添加 API…"), () => editSource(null, true));
    if (id === "delete-source") return withBusy(text("Deleting API…", "正在删除 API…"), () => deleteSource(targetId));
    if (id === "download-directory") return withBusy(text("Updating save directory…", "正在更新保存目录…"), editDownloadDirectory);
    if (id === "wallpaper-scope") return withBusy(text("Updating wallpaper scope…", "正在更新壁纸范围…"), editWallpaperScope);
    if (id === "reset-sources") return withBusy(text("Restoring defaults…", "正在恢复默认设置…"), restoreDefaults);
    if (id === "clear-image-cache") return withBusy(text("Clearing cache…", "正在清除缓存…"), clearImageCache);

    const source = sourceByExactId(targetId);
    if (!source) return;
    if (id === "add-param") {
      return withBusy(text("Adding parameter…", "正在添加参数…"), () => addParameter(source));
    }
    if (id === "fill-default-params") {
      return withBusy(
        text("Filling default parameters…", "正在填充默认参数…"),
        () => fillDefaultParams(source)
      );
    }
    if (id.startsWith("delete-param:")) {
      return withBusy(
        text("Deleting parameter…", "正在删除参数…"),
        () => deleteParameter(source, id.slice("delete-param:".length))
      );
    }
    if (id === "save-preset") {
      return withBusy(text("Saving preset…", "正在保存预设…"), () => savePreset(source));
    }
    if (id === "refresh") return refreshSource(source.id, { cacheBust: true });
    if (id === "wallpaper") {
      return withBusy(text("Setting wallpaper…", "正在设置壁纸…"), () => setWallpaper(source));
    }
    if (id === "save") {
      return withBusy(text("Saving image…", "正在保存图片…"), () => saveCurrent(source));
    }
    if (id === "copy-image") {
      return withBusy(text("Copying image…", "正在复制图片…"), () => copyCurrent(source));
    }
  };

  const initialize = async () => {
    state.config = await readConfig(context);
    ensureSelection();
    // Restore last successful previews — do not network until user hits Refresh.
    state.imageCache = await readImageCache(context);
    for (const [id, entry] of Object.entries(state.imageCache)) {
      if (entry?.preview) state.previews[id] = entry.preview;
    }
    paint();
  };

  return { state, paint, initialize };
}

export default {
  commands: [
    {
      name: "open",
      title: "Open Qxpicture",
      async run(context) {
        context.showToast(text("Open Qxpicture from Extensions", "请从扩展中打开 Qxpicture"));
      }
    }
  ],
  panel: {
    title: "Qxpicture",
    render(container, context) {
      if (!context.ui?.mountWorkbench || !context.http?.fetch || !context.system?.setWallpaper) {
        container.textContent = text("Qx 0.6.13 or newer is required.", "需要 Qx 0.6.13 或更高版本。");
        return;
      }
      const panel = createPanel(context, container);
      container.__qxpicture = panel;
      panel.paint();
      void panel.initialize().catch((error) => {
        panel.state.error = String(error?.message || error);
        panel.paint();
      });
    },
    destroy(container) {
      const panel = container.__qxpicture;
      if (panel) {
        panel.state.dead = true;
        panel.state.generation += 1;
        container.__qxpicture = null;
      }
      container.innerHTML = "";
    }
  }
};
