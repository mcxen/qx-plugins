/** Qxpicture — random image API browser built on the Qx Workbench port. */

const CONFIG_KEY = "qxpicture.config.v1";
const CONFIG_SCHEMA_VERSION = 2;
const CACHE_DIRECTORY = "/qx-plugin-files/qxpicture/images";

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
    .filter((param) => param.key && param.value !== "")
    .map((param) => `${encodeURIComponent(param.key)}=${encodeURIComponent(param.value)}`);
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
  let url = source.url;
  let params = (source.params || []).filter((param) => param.key);
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
  const raw = String(configured || "~/Downloads").trim() || "~/Downloads";
  if (raw === "~") return env.homeDir;
  if (raw.startsWith("~/") || raw.startsWith("~\\")) {
    return pathJoin(env.homeDir, raw.slice(2).replace(/[\\/]/g, env.dirSep || (env.platform === "windows" ? "\\" : "/")), env.platform);
  }
  return raw;
}

async function resolveDownload(context, source) {
  let imageUrl = source.url;
  if (source.type === "json") {
    const request = buildRequest(source, true);
    const response = await context.http.fetch(request.url, request.options);
    if (!response.ok) throw new Error(`${source.name}: HTTP ${response.status}`);
    const data = await response.json();
    const url = String(valueAtPath(data, source.jsonPath) || "").trim();
    if (!/^https?:\/\//i.test(url)) {
      throw new Error(`${source.name}: ${text("JSON did not contain an image URL", "JSON 中没有图片地址")}`);
    }
    imageUrl = url;
  }

  const requestUrl = source.type === "direct" ? buildRequest(source, true).url : imageUrl;
  const response = await context.http.fetch(requestUrl, { method: "GET", timeoutMs: 120_000 });
  if (!response.ok) throw new Error(`${source.name}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length) throw new Error(text("The image response was empty", "图片响应为空"));
  const mediaType = contentType(response);
  if (!mediaType.startsWith("image/")) {
    throw new Error(`${source.name}: ${text("response was not an image", "响应内容不是图片")}`);
  }
  const dataUrl = toDataUrl(bytes, contentType(response));
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

function createPanel(context) {
  const state = {
    config: defaultConfig(),
    tab: "browse",
    selectedId: "picsum",
    previews: {},
    downloads: {},
    loadingIds: new Set(),
    busy: null,
    error: null,
    dead: false,
    generation: 0,
    writeQueue: Promise.resolve()
  };

  const sourceById = (id = state.selectedId) =>
    state.config.sources.find((source) => source.id === id) || state.config.sources[0];

  const setError = (error) => {
    state.error = error ? String(error?.message || error) : null;
  };

  const persistConfig = () => {
    state.writeQueue = state.writeQueue
      .catch(() => {})
      .then(() => writeConfig(context, state.config));
    return state.writeQueue;
  };

  const invalidateSource = (source) => {
    delete state.downloads[source.id];
    delete state.previews[source.id];
  };

  const ensureSelection = () => {
    if (!state.config.sources.some((source) => source.id === state.selectedId)) {
      state.selectedId = state.config.sources[0]?.id || null;
    }
  };

  const browseItems = () => state.config.sources.map((source) => {
    const preview = state.previews[source.id];
    const ready = Boolean(state.downloads[source.id]);
    const loading = state.loadingIds.has(source.id);
    const request = buildRequest(source);
    const controls = [
      ...(source.presets?.length ? [{
        id: "browse:preset",
        label: text("Preset", "参数预设"),
        value: "",
        type: "select",
        options: [
          { label: text("Choose a preset…", "选择预设…"), value: "__none__" },
          ...source.presets.map((preset) => ({ label: preset.name, value: preset.id }))
        ]
      }] : []),
      ...(source.params || []).map((param) => ({
        id: `browse:param:${param.id}`,
        label: param.key || text("Unnamed", "未命名"),
        value: param.value,
        type: param.type,
        options: param.options || [],
        placeholder: param.type === "number" ? "0" : text("Parameter value", "参数值")
      }))
    ];
    return {
      id: source.id,
      title: source.name,
      subtitle: source.url,
      badge: source.type === "json" ? "JSON" : text("Image", "图片"),
      image: preview ? { url: preview, alt: source.name, fit: "cover" } : undefined,
      detail: {
        title: source.name,
        subtitle: request.displayUrl,
        image: preview ? { url: preview, alt: source.name, fit: "contain" } : undefined,
        form: controls.length ? {
          title: text("Parameter Controls", "参数调整"),
          description: text(
            "Changes are saved immediately. Choose Refresh to request the image with the new parameters.",
            "修改会立即保存；点击“刷新”后使用新参数请求图片。"
          ),
          controls
        } : undefined,
        body: loading
          ? text("Loading a new image…", "正在加载新图片…")
          : ready
            ? text("Choose Refresh to request another random image from this API.", "点击“刷新”可从该 API 获取另一张随机图片。")
            : text("Select this API to load its current image.", "选择此 API 以加载当前图片。"),
        fields: [
          { label: text("Type", "类型"), value: source.type === "json" ? "JSON" : text("Direct image", "直接图片") },
          { label: text("Status", "状态"), value: loading ? text("Loading", "加载中") : ready ? text("Ready", "就绪") : preview ? text("Thumbnail", "缩略图") : text("Not loaded", "未加载") },
          { label: text("Final Request URL", "最终请求 URL"), value: request.displayUrl },
          ...(request.body ? [{ label: "POST JSON", value: request.body }] : [])
        ]
      },
      actions: [
        { id: "refresh", label: text("Refresh Image", "刷新图片"), primary: true, disabled: Boolean(state.busy) || loading },
        { id: "save-preset", label: text("Save Parameter Preset", "保存参数预设"), disabled: Boolean(state.busy) || !(source.params || []).length },
        { id: "wallpaper", label: text("Set as Wallpaper", "设为壁纸"), disabled: Boolean(state.busy) || loading || !ready },
        { id: "save", label: text("Save to Local", "保存到本地"), kbd: "CmdOrCtrl+S", disabled: Boolean(state.busy) || loading || !ready },
        { id: "copy-image", label: text("Copy Image", "复制图片"), kbd: "CmdOrCtrl+C", disabled: Boolean(state.busy) || loading || !ready }
      ]
    };
  });

  const settingsItems = () => state.config.sources.map((source) => {
    const parameterControls = (source.params || []).flatMap((param) => [
      {
        id: `settings:param:${param.id}:key`,
        label: text("Parameter key", "参数 Key"),
        value: param.key,
        type: "text"
      },
      {
        id: `settings:param:${param.id}:type`,
        label: `${param.key || text("Parameter", "参数")} · ${text("type", "类型")}`,
        value: param.type,
        type: "select",
        options: [
          { label: "text", value: "text" },
          { label: "number", value: "number" },
          { label: "select", value: "select" }
        ]
      },
      ...(param.type === "select" ? [{
        id: `settings:param:${param.id}:options`,
        label: `${param.key || text("Parameter", "参数")} · options`,
        value: (param.options || []).map((option) =>
          option.label === option.value ? option.value : `${option.label}=${option.value}`
        ).join(", "),
        type: "text",
        placeholder: "Label=value, Label=value"
      }] : []),
      {
        id: `settings:param:${param.id}:value`,
        label: `${param.key || text("Parameter", "参数")} · value`,
        value: param.value,
        type: param.type,
        options: param.options || []
      }
    ]);
    return {
      id: source.id,
      title: source.name,
      subtitle: source.url,
      badge: source.type === "json" ? "JSON" : text("Image", "图片"),
      detail: {
        title: source.name,
        form: {
          title: text("API and Parameter Schema", "API 与参数 Schema"),
          description: text(
            "The form is generated from this source's stored parameter schema.",
            "此表单由该 API 存储的参数 schema 自动生成。"
          ),
          controls: [
            { id: "settings:source:name", label: text("Name", "名称"), value: source.name, type: "text" },
            { id: "settings:source:url", label: "URL", value: source.url, type: "text" },
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
            ...(source.type === "json" ? [{
              id: "settings:source:method",
              label: text("Parameter Transport", "参数传输方式"),
              value: source.method || "GET",
              type: "select",
              options: [
                { label: "GET query", value: "GET" },
                { label: "POST JSON", value: "POST" }
              ]
            }] : []),
            ...parameterControls
          ]
        },
        fields: [
          { label: text("Parameters", "参数数量"), value: (source.params || []).length },
          { label: text("Presets", "预设数量"), value: (source.presets || []).length }
        ]
      },
      actions: [
        { id: "add-param", label: text("Add Parameter", "添加参数"), primary: true },
        ...(source.params || []).map((param) => ({
          id: `delete-param:${param.id}`,
          label: `${text("Delete parameter", "删除参数")} · ${param.key || param.id}`,
          tone: "danger"
        })),
        { id: "delete-source", label: text("Delete API", "删除 API"), tone: "danger" }
      ]
    };
  });

  const paint = () => {
    if (state.dead) return;
    ensureSelection();
    const browse = state.tab === "browse";
    context.ui.mountWorkbench({
      title: "Qxpicture",
      layout: { kind: "list" },
      tabs: [
        { id: "browse", label: text("Browse", "浏览"), active: browse },
        { id: "settings", label: text("Settings", "设置"), active: !browse }
      ],
      loading: browse && state.config.sources.length > 0 && !Object.keys(state.previews).length,
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
    }, {
      onTab(id) {
        state.tab = id === "settings" ? "settings" : "browse";
        state.error = null;
        paint();
      },
      onSelect(id) {
        state.selectedId = id;
        paint();
        if (state.tab === "browse" && !state.downloads[id]) void refreshSource(id);
      },
      onAction(id, item) {
        void runAction(id, item?.id || state.selectedId);
      },
      onInput(id, value, item) {
        void updateInput(id, value, item?.id || state.selectedId);
      }
    });
  };

  const refreshSource = async (id) => {
    const source = sourceById(id);
    if (!source || state.loadingIds.has(source.id)) return;
    const generation = state.generation;
    state.loadingIds.add(source.id);
    setError(null);
    paint();
    try {
      const download = await resolveDownload(context, source);
      if (state.dead || generation !== state.generation) return;
      state.downloads[source.id] = download;
      state.previews[source.id] = download.preview;
    } catch (error) {
      if (!state.dead && generation === state.generation) setError(error);
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
    const source = sourceById(targetId);
    if (!source) return;

    if (controlId === "browse:preset") {
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
      paint();
      await persistConfig();
      return;
    }

    if (controlId === "settings:source:name") source.name = String(value).slice(0, 160);
    else if (controlId === "settings:source:url") source.url = String(value).slice(0, 2_000);
    else if (controlId === "settings:source:type") {
      source.type = value === "json" ? "json" : "direct";
      if (source.type === "json") {
        source.method ||= "GET";
        source.jsonPath ||= "data[0].urls.original";
      }
    } else if (controlId === "settings:source:method") {
      source.method = value === "POST" ? "POST" : "GET";
    } else if (controlId.startsWith("settings:param:")) {
      const [, , paramId, property] = controlId.split(":");
      const param = (source.params || []).find((item) => item.id === paramId);
      if (!param) return;
      if (property === "key") param.key = String(value).trim().slice(0, 120);
      else if (property === "value") param.value = String(value).slice(0, 2_000);
      else if (property === "type") {
        param.type = value === "number" || value === "select" ? value : "text";
        if (param.type === "select") {
          param.options = param.options?.length ? param.options : [{ label: param.value || "Option", value: param.value }];
        } else {
          delete param.options;
        }
      } else if (property === "options") {
        param.options = parseSelectOptions(value);
        if (param.options.length && !param.options.some((option) => option.value === param.value)) {
          param.value = param.options[0].value;
        }
      }
    } else {
      return;
    }

    invalidateSource(source);
    paint();
    await persistConfig();
  };

  const addParameter = async (source) => {
    const id = `param-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    source.params ||= [];
    source.params.push({ id, key: `param${source.params.length + 1}`, value: "", type: "text" });
    invalidateSource(source);
    await persistConfig();
    paint();
  };

  const deleteParameter = async (source, paramId) => {
    source.params = (source.params || []).filter((param) => param.id !== paramId);
    for (const preset of source.presets || []) {
      for (const key of Object.keys(preset.values)) {
        if (!(source.params || []).some((param) => param.key === key)) delete preset.values[key];
      }
    }
    invalidateSource(source);
    await persistConfig();
    paint();
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
    if (!state.downloads[source.id]) {
      const download = await resolveDownload(context, source);
      state.downloads[source.id] = download;
      state.previews[source.id] = download.preview;
      paint();
    }
    return state.downloads[source.id];
  };

  const saveCurrent = async (source) => {
    const env = await context.system.env();
    const directory = expandDirectory(state.config.downloadDirectory, env);
    const path = await writeImage(context, directory, source, await currentDownload(source), env.platform);
    context.showToast(`${text("Saved", "已保存")} ${path}`);
  };

  const setWallpaper = async (source) => {
    const env = await context.system.env();
    const directory = env.platform === "windows"
      ? pathJoin(env.homeDir, "Pictures\\Qxpicture", env.platform)
      : CACHE_DIRECTORY;
    const path = await writeImage(context, directory, source, await currentDownload(source), env.platform);
    await context.system.setWallpaper(path, { scope: state.config.wallpaperScope });
    context.showToast(text("Wallpaper set", "壁纸设置成功"));
  };

  const copyCurrent = async (source) => {
    const env = await context.system.env();
    const directory = env.platform === "windows"
      ? pathJoin(env.homeDir, "Pictures\\Qxpicture", env.platform)
      : CACHE_DIRECTORY;
    const path = await writeImage(context, directory, source, await currentDownload(source), env.platform);
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
    const source = sourceById(id);
    if (!source) return;
    const confirmation = await context.prompt(
      `${text("Type DELETE to remove", "输入 DELETE 以删除")} ${source.name}`,
      ""
    );
    if (confirmation !== "DELETE") return;
    state.config.sources = state.config.sources.filter((item) => item.id !== source.id);
    delete state.previews[source.id];
    delete state.downloads[source.id];
    ensureSelection();
    await writeConfig(context, state.config);
    paint();
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
    state.selectedId = state.config.sources[0]?.id || null;
    await writeConfig(context, state.config);
    paint();
    void refreshSource(state.selectedId);
  };

  const runAction = async (id, targetId) => {
    if (id === "add-source") return withBusy(text("Adding API…", "正在添加 API…"), () => editSource(null, true));
    if (id === "delete-source") return withBusy(text("Deleting API…", "正在删除 API…"), () => deleteSource(targetId));
    if (id === "download-directory") return withBusy(text("Updating save directory…", "正在更新保存目录…"), editDownloadDirectory);
    if (id === "wallpaper-scope") return withBusy(text("Updating wallpaper scope…", "正在更新壁纸范围…"), editWallpaperScope);
    if (id === "reset-sources") return withBusy(text("Restoring defaults…", "正在恢复默认设置…"), restoreDefaults);

    const source = sourceById(targetId);
    if (!source) return;
    if (id === "add-param") {
      return withBusy(text("Adding parameter…", "正在添加参数…"), () => addParameter(source));
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
    if (id === "refresh") return refreshSource(source.id);
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
    for (const source of state.config.sources) {
      if (source.type === "direct" && /^https:\/\//i.test(source.url)) {
        state.previews[source.id] = buildRequest(source, true).url;
      }
    }
    paint();
    if (state.selectedId) void refreshSource(state.selectedId);
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
        container.textContent = text("Qx 0.6.12 or newer is required.", "需要 Qx 0.6.12 或更高版本。");
        return;
      }
      const panel = createPanel(context);
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
