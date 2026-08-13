export const CATALOG_URL = "https://service.anotherboring.day/api/wallpapers/raycast-triple";
export const RANDOM_URL = "https://service.anotherboring.day/api/wallpapers/random-human";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function string(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeWallpaper(value) {
  const source = object(value);
  const wallpaper = {
    id: string(source.id),
    name: string(source.name),
    url: string(source.url),
    description: string(source.description),
    artist: string(source.artist),
    creationDate: string(source.creationDate),
    websiteUrl: string(source.websiteUrl),
  };
  if (!wallpaper.id || !wallpaper.name || !wallpaper.url || !wallpaper.artist || !wallpaper.creationDate) {
    return null;
  }
  if (!/^https:\/\//i.test(wallpaper.url)) return null;
  return wallpaper;
}

export function normalizeCatalog(value) {
  const source = object(value);
  const today = normalizeWallpaper(source.today);
  const random = (Array.isArray(source.random) ? source.random : []).map(normalizeWallpaper).filter(Boolean);
  const seen = new Set();
  const wallpapers = [today, ...random].filter((wallpaper) => {
    if (!wallpaper || seen.has(wallpaper.id)) return false;
    seen.add(wallpaper.id);
    return true;
  });
  if (!today || !wallpapers.length) throw new Error("catalog:invalid_response");
  return { todayId: today.id, wallpapers };
}

async function fetchJson(context, url) {
  const response = await context.http.fetch(url, {
    method: "GET",
    headers: { Accept: "application/json", "User-Agent": "Qx-ArtWallpapers/1.0" },
    timeoutMs: 20_000,
    maxBytes: 1024 * 1024,
  });
  if (!response.ok) throw new Error(`http:${response.status}`);
  const contentType = String(response.headers?.["content-type"] || response.headers?.["Content-Type"] || "");
  if (contentType && !contentType.toLowerCase().includes("application/json")) {
    throw new Error("catalog:unexpected_content_type");
  }
  try {
    return await response.json();
  } catch {
    throw new Error("catalog:invalid_json");
  }
}

export async function fetchCatalog(context) {
  return normalizeCatalog(await fetchJson(context, CATALOG_URL));
}

export async function fetchRandomWallpaper(context) {
  const wallpaper = normalizeWallpaper(await fetchJson(context, RANDOM_URL));
  if (!wallpaper) throw new Error("catalog:invalid_random");
  return wallpaper;
}

export function previewUrl(wallpaper, width) {
  const raw = string(wallpaper?.url);
  if (!raw) return "";
  if (raw.includes("imagedelivery.net")) {
    return raw.replace(/\/[^/]+$/, `/w=${width},fit=contain`);
  }
  if (raw.includes("cloudinary.com") && raw.includes("/upload/")) {
    return raw.replace("/upload/", `/upload/w_${width},c_limit,q_auto,f_auto/`);
  }
  return wallpaper.websiteUrl || raw;
}

export function artworkUrl(wallpaper) {
  return `https://anotherboring.day/art/${encodeURIComponent(wallpaper.id)}`;
}

export function safeFileName(wallpaper) {
  const title = string(wallpaper?.name).normalize("NFKD").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  const id = string(wallpaper?.id).replace(/[^a-z0-9_-]+/gi, "-");
  return `${title || "art-wallpaper"}-${id || "image"}.jpg`;
}

export async function fetchImageBytes(context, wallpaper) {
  const response = await context.http.fetch(wallpaper.url, {
    method: "GET",
    headers: { Accept: "image/jpeg,image/*;q=0.8", "User-Agent": "Qx-ArtWallpapers/1.0" },
    timeoutMs: 120_000,
    maxBytes: 16 * 1024 * 1024,
  });
  if (!response.ok) throw new Error(`image_http:${response.status}`);
  const contentType = String(response.headers?.["content-type"] || response.headers?.["Content-Type"] || "").split(";")[0].trim().toLowerCase();
  if (!contentType.startsWith("image/")) throw new Error("image:unexpected_content_type");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 1024) throw new Error("image:empty");
  return { bytes, contentType };
}

export function bytesToBase64(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}
