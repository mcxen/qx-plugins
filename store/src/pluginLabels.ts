/**
 * Locale-aware plugin labels for the store UI.
 * Prefer catalog `names` / `descriptions` (from manifest → index.json),
 * then the package's raw name/description fields.
 */
import type { Locale } from "./types";
import type { PluginIndexEntry } from "./types";

type LocaleMap = Record<string, string>;

function pickFromLocaleMap(map: LocaleMap | undefined | null, locale: Locale): string | null {
  if (!map) return null;
  const candidates =
    locale === "zh-CN"
      ? ["zh-CN", "zh", "zh_CN", "zh-Hans", "zh_Hans", "cn"]
      : ["en", "en-US", "en_US"];
  for (const key of candidates) {
    const value = map[key]?.trim();
    if (value) return value;
  }
  return null;
}

export function localizePluginName(plugin: PluginIndexEntry, locale: Locale): string {
  const fromMap = pickFromLocaleMap(plugin.names, locale);
  if (fromMap) return fromMap;

  return (plugin.name || plugin.id).trim();
}

export function localizePluginDescription(plugin: PluginIndexEntry, locale: Locale): string {
  const fromMap = pickFromLocaleMap(plugin.descriptions, locale);
  if (fromMap) return fromMap;

  return (plugin.description || "").trim();
}

/** Search haystack includes both locales so queries work after language switch. */
export function pluginSearchBlob(plugin: PluginIndexEntry): string {
  const parts = [
    plugin.id,
    plugin.name,
    plugin.description,
    plugin.author,
    plugin.version,
    ...(plugin.required_permissions || []),
    ...Object.values(plugin.names || {}),
    ...Object.values(plugin.descriptions || {}),
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
}
