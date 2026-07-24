import bcrypt from "bcryptjs";

const API_BASE = "https://api.coolapk.com";
const APP_ID = "com.coolapk.market";
const APP_VERSION = "16.2.0";
const APP_CODE = "2604201";
const DEVICE_CODE = "AZmV2N4UzN0UmZ3kDOzEzYgsjMwAjL2IjMwUjMuE0MRFEI7MkMxITM4AjMyAyOp1GZlJFI7kWbvFWaYByOgsDI7AyOzYGO3okVq1GWOlEez8WYLlkWKVWbllzX3pUTjFTcjx2aPVFR";
const V2_SALT_KEY = "dcf01e569c1e3db93a3d0fcf191a622c";
const BCRYPT_BASE64 = "./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const CACHE_KEY = "cache.community.v1";
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MODES = {
  hot: { label: ["Hot", "热门"], path: "/v6/page/dataList", board: "/feed/hotList" },
  news: { label: ["News", "快讯"], path: "/v6/page/dataList", board: "/page?url=V11_HOME_TAB_NEWS" },
  digital: { label: ["Digital", "数码"], path: "/v6/page/dataList", board: "/page?url=V10_DIGITAL_HOME" },
};

function isChinese() {
  return (navigator.languages || [navigator.language || ""])
    .some((locale) => /^zh(?:-|$)/i.test(String(locale)));
}

function copy(en, zh) {
  return isChinese() ? zh : en;
}

function errorMessage(error) {
  return String(error?.message || error || copy("Unknown error", "未知错误"));
}

function leftRotate(value, shift) {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function md5Ascii(value) {
  const input = String(value);
  const bitLength = input.length * 8;
  const totalLength = Math.ceil((input.length + 9) / 64) * 64;
  const bytes = new Uint8Array(totalLength);
  for (let index = 0; index < input.length; index += 1) {
    bytes[index] = input.charCodeAt(index) & 0xff;
  }
  bytes[input.length] = 0x80;
  const view = new DataView(bytes.buffer);
  view.setUint32(totalLength - 8, bitLength >>> 0, true);
  view.setUint32(totalLength - 4, Math.floor(bitLength / 0x100000000), true);
  const shifts = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const constants = Array.from(
    { length: 64 },
    (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0,
  );
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  for (let offset = 0; offset < totalLength; offset += 64) {
    const words = Array.from(
      { length: 16 },
      (_, index) => view.getUint32(offset + index * 4, true),
    );
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let index = 0; index < 64; index += 1) {
      let f;
      let wordIndex;
      if (index < 16) {
        f = (b & c) | (~b & d);
        wordIndex = index;
      } else if (index < 32) {
        f = (d & b) | (~d & c);
        wordIndex = (5 * index + 1) % 16;
      } else if (index < 48) {
        f = b ^ c ^ d;
        wordIndex = (3 * index + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        wordIndex = (7 * index) % 16;
      }
      const previousD = d;
      d = c;
      c = b;
      const sum = (a + f + constants[index] + words[wordIndex]) >>> 0;
      b = (b + leftRotate(sum, shifts[index])) >>> 0;
      a = previousD;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }
  return [a0, b0, c0, d0].map((word) =>
    [0, 8, 16, 24]
      .map((shift) => ((word >>> shift) & 0xff).toString(16).padStart(2, "0"))
      .join("")
  ).join("");
}

function base64Ascii(value) {
  return btoa(String(value)).replace(/=+$/g, "");
}

function bcryptBase64Decode(value, byteCount = 16) {
  const output = [];
  let index = 0;
  while (output.length < byteCount && index + 1 < value.length) {
    const first = Math.max(0, BCRYPT_BASE64.indexOf(value[index++]));
    const second = Math.max(0, BCRYPT_BASE64.indexOf(value[index++]));
    output.push((first << 2) | ((second & 0x30) >> 4));
    if (output.length >= byteCount || index >= value.length) break;
    const third = Math.max(0, BCRYPT_BASE64.indexOf(value[index++]));
    output.push(((second & 0x0f) << 4) | ((third & 0x3c) >> 2));
    if (output.length >= byteCount || index >= value.length) break;
    const fourth = Math.max(0, BCRYPT_BASE64.indexOf(value[index++]));
    output.push(((third & 0x03) << 6) | fourth);
  }
  return Uint8Array.from(output.slice(0, byteCount));
}

function bcryptBase64Encode(bytes) {
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const third = index + 2 < bytes.length ? bytes[index + 2] : 0;
    output += BCRYPT_BASE64[(first >> 2) & 0x3f];
    output += BCRYPT_BASE64[((first & 0x03) << 4) | ((second >> 4) & 0x0f)];
    output += BCRYPT_BASE64[((second & 0x0f) << 2) | ((third >> 6) & 0x03)];
    output += BCRYPT_BASE64[third & 0x3f];
  }
  return output.slice(0, 22);
}

let tokenCache = { timestamp: 0, token: "" };

async function generateToken(timestamp = Math.floor(Date.now() / 1000)) {
  if (tokenCache.timestamp === timestamp && tokenCache.token) return tokenCache.token;
  const time = String(timestamp);
  const tokenSource = `token://${APP_ID}/${V2_SALT_KEY}?${md5Ascii(time)}$${md5Ascii(DEVICE_CODE)}&${APP_ID}`;
  const password = md5Ascii(base64Ascii(tokenSource));
  const saltCharacters = `${base64Ascii(time)}/${md5Ascii(tokenSource)}`.slice(0, 24) + "u";
  const salt = `$2b$10$${bcryptBase64Encode(bcryptBase64Decode(saltCharacters))}`;
  const hash = (await bcrypt.hash(password, salt)).replace("$2b$", "$2y$");
  const token = `v2${base64Ascii(hash)}`;
  tokenCache = { timestamp, token };
  return token;
}

async function buildRequestHeaders(timestamp = Math.floor(Date.now() / 1000)) {
  return {
    Accept: "application/json",
    "X-Sdk-Int": "35",
    "X-Sdk-Locale": "zh-CN",
    "X-App-Mode": "universal",
    "X-App-Channel": "coolapk",
    "X-App-Id": APP_ID,
    "X-App-Device": DEVICE_CODE,
    "X-App-Version": APP_VERSION,
    "X-App-Code": APP_CODE,
    "X-Api-Version": "16",
    "X-App-Supported": APP_CODE,
    "X-Dark-Mode": "0",
    "X-Requested-With": "XMLHttpRequest",
    "X-App-Token": await generateToken(timestamp),
    "User-Agent": `Dalvik/2.1.0 (Linux; Android 16) +CoolMarket/${APP_VERSION}-${APP_CODE}-universal QxCoolapk/1.0`,
  };
}

function feedUrl(mode, page) {
  const definition = MODES[mode] || MODES.hot;
  const url = new URL(`${API_BASE}${definition.path}`);
  url.searchParams.set("url", definition.board);
  url.searchParams.set("page", String(Math.max(1, page)));
  return url.toString();
}

function detailUrl(id) {
  const url = new URL(`${API_BASE}/v6/feed/detail`);
  url.searchParams.set("id", String(id));
  return url.toString();
}

function repliesUrl(id) {
  const url = new URL(`${API_BASE}/v6/feed/replyList`);
  url.searchParams.set("id", String(id));
  url.searchParams.set("listType", "lastupdate_desc");
  url.searchParams.set("page", "1");
  url.searchParams.set("discussMode", "1");
  url.searchParams.set("feedType", "feed");
  return url.toString();
}

async function fetchData(context, url) {
  const response = await context.http.fetch(url, {
    method: "GET",
    headers: await buildRequestHeaders(),
    timeoutMs: 30_000,
  });
  if (!response?.ok) throw new Error(`HTTP ${response?.status || "error"}`);
  const payload = await response.json();
  if (!Object.prototype.hasOwnProperty.call(payload || {}, "data")) {
    throw new Error(payload?.message || copy("The Coolapk API rejected the request", "酷安接口拒绝了请求"));
  }
  return payload.data;
}

function decodeEntities(value) {
  const named = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: "\"",
  };
  return String(value || "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === "#") {
      const hexadecimal = entity[1]?.toLowerCase() === "x";
      const point = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      return Number.isFinite(point) ? String.fromCodePoint(point) : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

function cleanText(value) {
  return decodeEntities(
    String(value || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|section|article|h[1-6]|blockquote|li)>/gi, "\n\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function imageUrls(value) {
  let values = value;
  if (typeof values === "string") {
    try {
      const parsed = JSON.parse(values);
      values = Array.isArray(parsed) ? parsed : [values];
    } catch {
      values = values ? [values] : [];
    }
  }
  const seen = new Set();
  return (Array.isArray(values) ? values : [])
    .map((entry) => String(entry || "").trim().replace(/^http:\/\//i, "https://"))
    .filter((entry) => {
      if (!/^https:\/\//i.test(entry) || seen.has(entry)) return false;
      seen.add(entry);
      return true;
    });
}

function feedImages(feed) {
  return imageUrls(feed?.picArr || feed?.pic || []);
}

export function isArticleFeed(feed) {
  const feedType = String(feed?.feedType || feed?.feed_type || "").toLowerCase();
  return feedType === "feedarticle"
    || String(feed?.is_html_article ?? feed?.isHtmlArticle ?? "") === "1"
    || String(feed?.type ?? "") === "12";
}

function responseContentType(response) {
  return String(
    response?.headers?.["content-type"]
      || response?.headers?.["Content-Type"]
      || "",
  ).split(";")[0].trim().toLowerCase();
}

function toBase64(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function dataUrl(bytes, type) {
  const encoded = toBase64(bytes);
  return encoded.length <= 1_900_000
    ? `data:${type || "image/jpeg"};base64,${encoded}`
    : "";
}

function canvasBlob(canvas, type, quality) {
  if (typeof canvas.convertToBlob === "function") {
    return canvas.convertToBlob({ type, quality });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Image conversion failed")),
      type,
      quality,
    );
  });
}

async function decodeImage(blob) {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close?.(),
    };
  }
  if (
    typeof Image !== "function"
    || typeof URL?.createObjectURL !== "function"
  ) {
    return null;
  }
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("Image decoding failed"));
      image.src = objectUrl;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

async function safeImagePreview(bytes, type, purpose) {
  const direct = dataUrl(bytes, type);
  const isThumbnail = purpose === "thumbnail";

  let decoded;
  try {
    decoded = await decodeImage(new Blob([bytes], { type }));
    if (!decoded) return direct;
    const sourceWidth = Math.max(1, Number(decoded.width) || 1);
    const sourceHeight = Math.max(1, Number(decoded.height) || 1);
    const maxDimension = isThumbnail ? 360 : 1_600;
    if (!isThumbnail && Math.max(sourceWidth, sourceHeight) <= maxDimension && direct) {
      return direct;
    }
    let scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
    let quality = isThumbnail ? 0.72 : 0.84;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const width = Math.max(1, Math.round(sourceWidth * scale));
      const height = Math.max(1, Math.round(sourceHeight * scale));
      const canvas = typeof OffscreenCanvas === "function"
        ? new OffscreenCanvas(width, height)
        : Object.assign(document.createElement("canvas"), { width, height });
      const drawing = canvas.getContext("2d");
      if (!drawing) throw new Error("Image canvas is unavailable");
      drawing.fillStyle = "#ffffff";
      drawing.fillRect(0, 0, width, height);
      drawing.drawImage(decoded.source, 0, 0, width, height);
      const output = await canvasBlob(canvas, "image/jpeg", quality);
      const preview = dataUrl(new Uint8Array(await output.arrayBuffer()), "image/jpeg");
      if (preview) return preview;
      scale *= 0.72;
      quality = Math.max(0.56, quality - 0.07);
    }
  } catch {
    return direct;
  } finally {
    decoded?.close?.();
  }
  return direct;
}

function formatTime(timestamp) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return copy("Unknown time", "时间未知");
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value * 1000));
}

function compactNumber(value) {
  const number = Number(value) || 0;
  return new Intl.NumberFormat(undefined, {
    notation: number >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(number);
}

function authorName(feed) {
  return cleanText(feed?.userInfo?.username || feed?.username) || copy("Unknown author", "未知作者");
}

function feedTitle(feed) {
  const title = cleanText(feed?.messageTitle || feed?.message_title);
  if (title) return title;
  const body = cleanText(feed?.message);
  return body.slice(0, 52) || cleanText(feed?.title) || copy("Untitled post", "无标题帖子");
}

function originalUrl(feed) {
  const candidate = String(feed?.url || feed?.shareUrl || feed?.share_url || "");
  if (/^https:\/\//i.test(candidate)) return candidate;
  return `https://www.coolapk.com/feed/${encodeURIComponent(feed?.id || "")}`;
}

function normalizeFeed(raw) {
  if (!raw || typeof raw !== "object" || !raw.id) return null;
  return {
    ...raw,
    id: String(raw.id),
    message: String(raw.message || ""),
    picArr: feedImages(raw),
    deviceTitle: raw.deviceTitle || raw.device_title || "",
    readNum: raw.readNum || raw.viewnum || raw.hitnum || 0,
    userInfo: raw.userInfo && typeof raw.userInfo === "object"
      ? raw.userInfo
      : { username: raw.username || "", uid: raw.uid || "" },
  };
}

function normalizeFeedList(raw) {
  const byId = new Map();
  for (const entry of Array.isArray(raw) ? raw : []) {
    const feed = normalizeFeed(entry);
    if (feed) byId.set(feed.id, feed);
  }
  return [...byId.values()];
}

function replySections(raw) {
  return normalizeFeedList(raw).slice(0, 12).map((reply, index) => ({
    title: `${authorName(reply)} · #${index + 1} · ${formatTime(reply.dateline)}`,
    body: cleanText(reply.message),
  })).filter((section) => section.body);
}

async function preference(context, id, fallback = "") {
  try {
    const value = await context.getPreference(id);
    return String(value ?? "").trim() || fallback;
  } catch {
    return fallback;
  }
}

function emptyCache() {
  return { savedAt: 0, feeds: {}, details: {}, readAt: {}, cachedAt: {} };
}

function normalizeCache(raw) {
  if (!raw || typeof raw !== "object") return emptyCache();
  const feeds = {};
  for (const mode of Object.keys(MODES)) {
    const entry = raw.feeds?.[mode];
    if (!entry || typeof entry !== "object") continue;
    feeds[mode] = {
      savedAt: Number(entry.savedAt) || 0,
      page: Math.max(1, Number(entry.page) || 1),
      items: normalizeFeedList(entry.items),
    };
  }
  return {
    savedAt: Number(raw.savedAt) || 0,
    feeds,
    details: raw.details && typeof raw.details === "object" ? raw.details : {},
    readAt: raw.readAt && typeof raw.readAt === "object" ? raw.readAt : {},
    cachedAt: raw.cachedAt && typeof raw.cachedAt === "object" ? raw.cachedAt : {},
  };
}

function pruneCache(cache, retentionDays) {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const keptIds = new Set();
  const feeds = {};
  for (const [mode, entry] of Object.entries(cache.feeds || {})) {
    const items = normalizeFeedList(entry.items).filter((feed) => {
      const reference = Number(cache.readAt[feed.id] || cache.cachedAt[feed.id] || entry.savedAt);
      if (reference > 0 && reference < cutoff) return false;
      keptIds.add(feed.id);
      return true;
    });
    if (items.length) feeds[mode] = { ...entry, items };
  }
  const keep = ([id]) => keptIds.has(String(id));
  return {
    savedAt: Number(cache.savedAt) || Date.now(),
    feeds,
    details: Object.fromEntries(Object.entries(cache.details || {}).filter(keep)),
    readAt: Object.fromEntries(Object.entries(cache.readAt || {}).filter(keep)),
    cachedAt: Object.fromEntries(Object.entries(cache.cachedAt || {}).filter(keep)),
  };
}

async function readCache(context) {
  try {
    return normalizeCache(await context.storage.persist.get(CACHE_KEY));
  } catch {
    return emptyCache();
  }
}

async function writeCache(context, cache) {
  try {
    await context.storage.persist.set(CACHE_KEY, { ...cache, savedAt: Date.now() });
  } catch {
    // Cache failure must not replace live content.
  }
}

function createPanel(container, context) {
  const state = {
    cache: emptyCache(),
    mode: "hot",
    query: "",
    selectedId: null,
    loading: false,
    loadingMore: false,
    error: null,
    source: "",
    retentionDays: 7,
    imageLayout: "horizontal",
    detailLoading: new Set(),
    imageLoading: new Set(),
    imageReloadPending: new Set(),
    imagePreviews: new Map(),
    imageRequests: new Map(),
    imageFailures: new Set(),
    requestSequence: 0,
    revision: 0,
    view: null,
    dead: false,
  };

  function activeFeed() {
    return state.cache.feeds[state.mode] || { items: [], page: 1, savedAt: 0 };
  }

  function selectedFeed() {
    return activeFeed().items.find((feed) => feed.id === String(state.selectedId));
  }

  function visibleFeeds() {
    const needle = state.query.trim().toLocaleLowerCase();
    if (!needle) return activeFeed().items;
    return activeFeed().items.filter((feed) =>
      [
        feedTitle(feed),
        cleanText(feed.message),
        authorName(feed),
        feed.deviceTitle,
        feed.targetRow?.title,
      ].join(" ").toLocaleLowerCase().includes(needle)
    );
  }

  function detailFor(feed) {
    const cached = state.cache.details[feed.id];
    const article = isArticleFeed(feed);
    const originals = imageUrls(cached?.images || feedImages(feed)).slice(0, 24);
    const images = originals.map((url) => {
      const preview = state.imagePreviews.get(`detail:${url}`)
        || state.imagePreviews.get(`thumbnail:${url}`);
      return preview ? {
        url: preview,
        alt: feedTitle(feed),
        fit: "cover",
        aspectRatio: "auto",
        zoomable: true,
      } : null;
    }).filter(Boolean);
    const replies = Array.isArray(cached?.replies) ? cached.replies : [];
    const sections = replies.length
      ? [{
          title: copy(`Replies (${replies.length} loaded)`, `回复（已加载 ${replies.length} 条）`),
          body: copy("Showing the first page of replies.", "当前展示第一页回复。"),
        }, ...replies]
      : [];
    return {
      title: feedTitle(feed),
      subtitle: `${authorName(feed)} · ${formatTime(feed.dateline)}`,
      status: state.detailLoading.has(feed.id) || state.imageLoading.has(feed.id)
        ? {
            state: "loading",
            label: state.detailLoading.has(feed.id)
              ? copy("Loading full article…", "正在加载完整正文…")
              : copy("Loading protected images…", "正在加载受保护图片…"),
          }
        : cached?.error
          ? { state: "error", error: cached.error }
          : undefined,
      body: cached?.body || cleanText(feed.message),
      images,
      imageLayout: state.imageLayout,
      mediaPlacement: article ? "after-body" : "header",
      fields: [
        { label: copy("Author", "作者"), value: authorName(feed) },
        { label: copy("Likes", "点赞"), value: Number(feed.likenum || 0) },
        { label: copy("Replies", "回复"), value: Number(feed.replynum || 0) },
        { label: copy("Views", "阅读"), value: Number(cached?.readNum || feed.readNum || 0) },
        { label: copy("Published", "发布时间"), value: formatTime(feed.dateline) },
        { label: copy("Device", "设备"), value: cleanText(feed.deviceTitle) || "—" },
      ],
      sections,
    };
  }

  function itemFor(feed) {
    const images = feedImages(feed);
    const article = isArticleFeed(feed);
    const cardImages = article
      ? []
      : images.map((url) => {
          const preview = state.imagePreviews.get(`thumbnail:${url}`);
          return preview ? { url: preview, alt: feedTitle(feed), fit: "cover" } : null;
        }).filter(Boolean);
    const read = Boolean(state.cache.readAt[feed.id]);
    return {
      id: feed.id,
      title: feedTitle(feed),
      subtitle: cleanText(feed.message) || `${authorName(feed)} · ${formatTime(feed.dateline)}`,
      meta: `${authorName(feed)} · ${formatTime(feed.dateline)}`,
      badge: `${read ? "" : `${copy("Unread", "未读")} · `}${compactNumber(feed.likenum)} ♥ · ${compactNumber(feed.replynum)} ${copy("replies", "回复")}`,
      tone: read ? "neutral" : "accent",
      images: cardImages.length ? cardImages : undefined,
      detail: detailFor(feed),
      actions: [
        { id: `open:${feed.id}`, label: copy("Open on Coolapk", "在酷安中打开"), primary: true },
        {
          id: `${read ? "unread" : "read"}:${feed.id}`,
          label: read ? copy("Mark Unread", "标为未读") : copy("Mark Read", "标为已读"),
        },
      ],
    };
  }

  function paint() {
    if (state.dead) return;
    const visible = visibleFeeds();
    if (!visible.some((feed) => feed.id === String(state.selectedId))) {
      state.selectedId = visible[0]?.id || null;
    }
    const snapshot = {
      revision: ++state.revision,
      title: "QxCoolapk 酷安",
      query: state.query,
      queryPlaceholder: copy("Search loaded Coolapk posts…", "搜索已加载的酷安帖子…"),
      layout: { kind: "list" },
      tabs: Object.entries(MODES).map(([id, definition]) => ({
        id,
        label: copy(...definition.label),
        active: state.mode === id,
      })),
      loading: state.loading && activeFeed().items.length === 0,
      error: state.error,
      meta: state.source,
      selectedId: state.selectedId,
      items: visible.map(itemFor),
      emptyText: state.loading
        ? copy("Loading Coolapk…", "正在加载酷安…")
        : copy("No matching posts", "没有匹配的帖子"),
      actions: [
        {
          id: "refresh",
          label: copy("Refresh", "刷新"),
          primary: !selectedFeed(),
          disabled: state.loading || state.loadingMore,
        },
        {
          id: "load-more",
          label: state.loadingMore ? copy("Loading more…", "正在加载更多…") : copy("Load More", "加载更多"),
          disabled: state.loading || state.loadingMore,
        },
      ],
      island: state.loading || state.loadingMore
        ? {
            primary: "QxCoolapk",
            secondary: state.loadingMore ? copy("Loading more", "加载更多") : copy("Refreshing community", "刷新社区"),
            activity: "spinner",
          }
        : null,
    };
    if (state.view) state.view.update(snapshot);
    else {
      state.view = context.ui.mountWorkbench(snapshot, {
        onQuery(value) {
          state.query = String(value || "");
          paint();
        },
        onTab(id) {
          if (!MODES[id] || id === state.mode) return;
          state.mode = id;
          state.query = "";
          state.error = null;
          state.selectedId = activeFeed().items[0]?.id || null;
          paint();
          void loadMode({ force: false });
        },
        onSelect(id) {
          const key = String(id || "");
          state.selectedId = key;
          if (key && !state.cache.readAt[key]) {
            state.cache.readAt[key] = Date.now();
            void persist();
          }
          paint();
          void loadDetail(key);
          void loadDetailImages(key);
        },
        onAction(id, item) {
          if (id === "refresh") void loadMode({ force: true });
          else if (id === "load-more") void loadMore();
          else if (id.startsWith("open:")) {
            const key = id.slice("open:".length);
            const feed = activeFeed().items.find((entry) => entry.id === key)
              || activeFeed().items.find((entry) => entry.id === String(item?.id))
              || selectedFeed();
            if (feed) void context.openUrl(originalUrl(feed));
          } else if (id.startsWith("read:")) {
            state.cache.readAt[id.slice("read:".length)] = Date.now();
            paint();
            void persist();
          } else if (id.startsWith("unread:")) {
            delete state.cache.readAt[id.slice("unread:".length)];
            paint();
            void persist();
          }
        },
      });
    }
  }

  async function persist() {
    state.cache = pruneCache(state.cache, state.retentionDays);
    await writeCache(context, state.cache);
  }

  async function proxyImage(url, purpose) {
    const key = `${purpose}:${url}`;
    if (state.imagePreviews.has(key)) return state.imagePreviews.get(key);
    if (state.imageFailures.has(key)) return "";
    if (state.imageRequests.has(key)) return state.imageRequests.get(key);
    const request = (async () => {
      try {
        const response = await context.http.fetch(url, {
          method: "GET",
          headers: await buildRequestHeaders(),
          timeoutMs: 120_000,
        });
        if (!response?.ok) throw new Error(`HTTP ${response?.status || "error"}`);
        const type = responseContentType(response);
        if (!type.startsWith("image/")) throw new Error("Response is not an image");
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (!bytes.length) throw new Error("Image response was empty");
        const preview = await safeImagePreview(bytes, type, purpose);
        if (!preview) throw new Error("Image is too large for a safe preview");
        state.imagePreviews.set(key, preview);
        return preview;
      } catch {
        state.imageFailures.add(key);
        return "";
      } finally {
        state.imageRequests.delete(key);
      }
    })();
    state.imageRequests.set(key, request);
    return request;
  }

  async function loadThumbnails(feeds) {
    let cursor = 0;
    const jobs = feeds
      .slice(0, 18)
      .filter((feed) => !isArticleFeed(feed))
      .flatMap((feed) => feedImages(feed));
    const worker = async () => {
      while (!state.dead && cursor < jobs.length) {
        const url = jobs[cursor++];
        const preview = await proxyImage(url, "thumbnail");
        if (preview && !state.dead) paint();
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
  }

  async function loadDetailImages(id) {
    const key = String(id || "");
    if (!key) return;
    if (state.imageLoading.has(key)) {
      state.imageReloadPending.add(key);
      return;
    }
    const feed = Object.values(state.cache.feeds)
      .flatMap((entry) => entry.items || [])
      .find((entry) => entry.id === key);
    if (!feed) return;
    const originals = imageUrls(state.cache.details[key]?.images || feedImages(feed)).slice(0, 24);
    if (!originals.length) return;
    state.imageLoading.add(key);
    paint();
    let cursor = 0;
    const worker = async () => {
      while (!state.dead && cursor < originals.length) {
        const url = originals[cursor++];
        const preview = await proxyImage(url, "detail");
        if (preview && !state.dead) paint();
      }
    };
    try {
      await Promise.all(Array.from({ length: 2 }, worker));
    } finally {
      state.imageLoading.delete(key);
      paint();
      if (state.imageReloadPending.delete(key)) void loadDetailImages(key);
    }
  }

  async function loadDetail(id) {
    const key = String(id || "");
    if (!key || state.detailLoading.has(key)) return;
    const cached = state.cache.details[key];
    if (cached && !cached.error && cached.complete) return;
    const feed = Object.values(state.cache.feeds)
      .flatMap((entry) => entry.items || [])
      .find((entry) => entry.id === key);
    if (!feed) return;
    state.detailLoading.add(key);
    paint();
    try {
      const [detailRaw, repliesRaw] = await Promise.all([
        fetchData(context, detailUrl(key)),
        fetchData(context, repliesUrl(key)).catch(() => []),
      ]);
      if (state.dead) return;
      const detail = normalizeFeed(Array.isArray(detailRaw) ? detailRaw[0] : detailRaw) || feed;
      state.cache.details[key] = {
        body: cleanText(detail.message || feed.message),
        images: feedImages(detail).length ? feedImages(detail) : feedImages(feed),
        replies: replySections(repliesRaw),
        readNum: Number(detail.readNum || 0),
        complete: true,
        savedAt: Date.now(),
      };
      await persist();
      void loadDetailImages(key);
    } catch (error) {
      if (!state.dead) {
        state.cache.details[key] = { ...(cached || {}), error: errorMessage(error) };
      }
    } finally {
      state.detailLoading.delete(key);
      paint();
    }
  }

  async function loadMode({ force = false } = {}) {
    const mode = state.mode;
    const sequence = ++state.requestSequence;
    state.loading = true;
    state.error = null;
    paint();
    try {
      const ttlRaw = Number(await preference(context, "cacheTtlMinutes", "5"));
      const ttlMs = Number.isFinite(ttlRaw) && ttlRaw > 0
        ? Math.min(60, ttlRaw) * 60 * 1000
        : DEFAULT_TTL_MS;
      const cached = state.cache.feeds[mode];
      if (!force && cached?.items?.length) {
        state.source = Date.now() - cached.savedAt <= ttlMs
          ? copy("Cached Coolapk feed", "酷安缓存")
          : copy("Stale cache · refreshing", "旧缓存 · 正在刷新");
        state.selectedId ||= cached.items[0]?.id || null;
        paint();
        if (Date.now() - cached.savedAt <= ttlMs) return;
      }
      const items = normalizeFeedList(await fetchData(context, feedUrl(mode, 1)));
      if (state.dead || sequence !== state.requestSequence || mode !== state.mode) return;
      const now = Date.now();
      state.cache.feeds[mode] = { items, page: 1, savedAt: now };
      for (const feed of items) state.cache.cachedAt[feed.id] = state.cache.cachedAt[feed.id] || now;
      state.source = copy("Live Coolapk community", "酷安社区实时数据");
      state.selectedId = items[0]?.id || null;
      await persist();
      void loadThumbnails(items);
    } catch (error) {
      if (!state.dead && sequence === state.requestSequence) {
        state.error = errorMessage(error);
        state.source = activeFeed().items.length
          ? copy("Offline · showing cache", "网络异常 · 显示缓存")
          : copy("Coolapk is unavailable", "酷安数据不可用");
      }
    } finally {
      if (!state.dead && sequence === state.requestSequence) {
        state.loading = false;
        paint();
      }
    }
  }

  async function loadMore() {
    if (state.loading || state.loadingMore) return;
    const mode = state.mode;
    const current = activeFeed();
    const nextPage = current.page + 1;
    state.loadingMore = true;
    state.error = null;
    paint();
    try {
      const incoming = normalizeFeedList(await fetchData(context, feedUrl(mode, nextPage)));
      if (state.dead || mode !== state.mode) return;
      const byId = new Map(current.items.map((feed) => [feed.id, feed]));
      const now = Date.now();
      for (const feed of incoming) {
        byId.set(feed.id, feed);
        state.cache.cachedAt[feed.id] = state.cache.cachedAt[feed.id] || now;
      }
      state.cache.feeds[mode] = {
        items: [...byId.values()],
        page: nextPage,
        savedAt: current.savedAt || now,
      };
      state.source = copy(
        `${state.cache.feeds[mode].items.length} loaded posts`,
        `已加载 ${state.cache.feeds[mode].items.length} 个帖子`,
      );
      await persist();
      void loadThumbnails(incoming);
    } catch (error) {
      if (!state.dead) state.error = errorMessage(error);
    } finally {
      state.loadingMore = false;
      paint();
    }
  }

  async function start() {
    const [retention, imageLayout, defaultTab] = await Promise.all([
      preference(context, "retentionDays", "7"),
      preference(context, "detailImageLayout", "horizontal"),
      preference(context, "defaultTab", "hot"),
    ]);
    state.retentionDays = Number(retention) === 3 ? 3 : 7;
    state.imageLayout = imageLayout === "grid" ? "grid" : "horizontal";
    state.mode = MODES[defaultTab] ? defaultTab : "hot";
    state.cache = pruneCache(await readCache(context), state.retentionDays);
    state.selectedId = activeFeed().items[0]?.id || null;
    if (activeFeed().items.length) {
      state.source = copy("Cached Coolapk feed", "酷安缓存");
      paint();
      void loadThumbnails(activeFeed().items);
    }
    await writeCache(context, state.cache);
    void loadMode();
  }

  paint();
  void start();

  return {
    destroy() {
      state.dead = true;
      state.requestSequence += 1;
      state.view = null;
      container.innerHTML = "";
    },
  };
}

const activePanels = new WeakMap();

const plugin = {
  commands: [{
    name: "open-qxcoolapk",
    title: "打开 QxCoolapk 酷安",
    async run(context) {
      await context.showToast(copy(
        "Open QxCoolapk from Extensions or search.",
        "请从扩展模块或搜索中打开 QxCoolapk。",
      ));
    },
  }],
  panel: {
    title: "QxCoolapk 酷安",
    render(container, context) {
      activePanels.get(container)?.destroy();
      activePanels.set(container, createPanel(container, context));
    },
    destroy(container) {
      activePanels.get(container)?.destroy();
      activePanels.delete(container);
    },
  },
};

export default plugin;
export { buildRequestHeaders, cleanText, feedUrl, normalizeFeedList };
