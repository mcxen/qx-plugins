import { bytesToBase64, fetchImageBytes, normalizeWallpaper } from "./service.js";

export const CATALOG_KEY = "another-boring.catalog.v1";
export const HISTORY_KEY = "another-boring.history.v1";
export const IMAGE_INDEX_KEY = "another-boring.image-index.v1";
export const AUTO_KEY = "another-boring.auto.v1";
export const CATALOG_TTL_MS = 6 * 60 * 60 * 1000;
export const HISTORY_LIMIT = 200;
export const IMAGE_SLOT_LIMIT = 20;
const WALLPAPER_DIR = "/qx-plugin-files/another-boring-piece/wallpapers";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function string(value) {
  return typeof value === "string" ? value.trim() : "";
}

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function eventId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `event-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeCatalogCache(value) {
  const cache = object(value);
  const wallpapers = (Array.isArray(cache.wallpapers) ? cache.wallpapers : []).map(normalizeWallpaper).filter(Boolean);
  const seen = new Set();
  return {
    savedAt: finite(cache.savedAt),
    todayId: string(cache.todayId),
    wallpapers: wallpapers.filter((wallpaper) => {
      if (seen.has(wallpaper.id)) return false;
      seen.add(wallpaper.id);
      return true;
    }).slice(0, 12),
  };
}

export function normalizeHistory(value) {
  const source = Array.isArray(value) ? value : [];
  return source.map((entry) => {
    const item = object(entry);
    const wallpaper = normalizeWallpaper(item.wallpaper);
    const type = ["selected", "downloaded", "auto-switched"].includes(item.eventType) ? item.eventType : "";
    if (!wallpaper || !type || !string(item.eventId) || !finite(item.timestamp)) return null;
    return {
      eventId: string(item.eventId),
      eventType: type,
      timestamp: finite(item.timestamp),
      wallpaper,
      downloadPath: string(item.downloadPath) || null,
    };
  }).filter(Boolean).sort((left, right) => right.timestamp - left.timestamp).slice(0, HISTORY_LIMIT);
}

export async function readHistory(context) {
  return normalizeHistory(await context.storage.persist.get(HISTORY_KEY).catch(() => []));
}

export async function writeHistory(context, entries) {
  const normalized = normalizeHistory(entries);
  await context.storage.persist.set(HISTORY_KEY, normalized);
  return normalized;
}

export async function addHistory(context, entries, eventType, wallpaper, downloadPath = null) {
  const entry = {
    eventId: eventId(),
    eventType,
    timestamp: Date.now(),
    wallpaper,
    downloadPath,
  };
  return writeHistory(context, [entry, ...entries]);
}

export async function removeHistory(context, entries, targetId) {
  return writeHistory(context, entries.filter((entry) => entry.eventId !== targetId));
}

function normalizeImageIndex(value) {
  const source = object(value);
  const entries = (Array.isArray(source.entries) ? source.entries : []).map((entry) => {
    const item = object(entry);
    const slot = Math.floor(finite(item.slot));
    if (!string(item.id) || slot < 0 || slot >= IMAGE_SLOT_LIMIT || !string(item.path)) return null;
    return { id: string(item.id), slot, path: string(item.path), touchedAt: finite(item.touchedAt) };
  }).filter(Boolean);
  return {
    nextSlot: Math.floor(finite(source.nextSlot)) % IMAGE_SLOT_LIMIT,
    entries: entries.slice(-IMAGE_SLOT_LIMIT),
  };
}

async function readImageIndex(context) {
  return normalizeImageIndex(await context.storage.persist.get(IMAGE_INDEX_KEY).catch(() => null));
}

export async function ensureWallpaperFile(context, wallpaper) {
  const index = await readImageIndex(context);
  const existing = index.entries.find((entry) => entry.id === wallpaper.id);
  if (existing) {
    const exists = await context.invoke("plugin_file_exists", { path: existing.path }).catch(() => false);
    if (exists) {
      existing.touchedAt = Date.now();
      await context.storage.persist.set(IMAGE_INDEX_KEY, index);
      return existing.path;
    }
  }

  const { bytes, contentType } = await fetchImageBytes(context, wallpaper);
  if (contentType !== "image/jpeg") throw new Error("image:jpeg_required");
  const slot = index.nextSlot;
  const path = `${WALLPAPER_DIR}/slot-${String(slot).padStart(2, "0")}.jpg`;
  await context.invoke("plugin_file_ensure_dir", { path: WALLPAPER_DIR });
  await context.invoke("plugin_file_write_base64", { path, dataBase64: bytesToBase64(bytes) });
  const nextEntries = index.entries.filter((entry) => entry.id !== wallpaper.id && entry.slot !== slot);
  nextEntries.push({ id: wallpaper.id, slot, path, touchedAt: Date.now() });
  await context.storage.persist.set(IMAGE_INDEX_KEY, {
    nextSlot: (slot + 1) % IMAGE_SLOT_LIMIT,
    entries: nextEntries.slice(-IMAGE_SLOT_LIMIT),
  });
  return path;
}

export async function readAutoState(context) {
  const source = object(await context.storage.persist.get(AUTO_KEY).catch(() => null));
  return {
    lastAppliedAt: finite(source.lastAppliedAt),
    recentIds: (Array.isArray(source.recentIds) ? source.recentIds : []).map(string).filter(Boolean).slice(-5),
  };
}

export async function writeAutoState(context, state, wallpaperId) {
  const recentIds = [...state.recentIds.filter((id) => id !== wallpaperId), wallpaperId].slice(-5);
  const next = { lastAppliedAt: Date.now(), recentIds };
  await context.storage.persist.set(AUTO_KEY, next);
  return next;
}
