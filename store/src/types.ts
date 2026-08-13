export interface PluginReleaseNote {
  version: string;
  notes?: string;
  notes_localizations?: Record<string, string>;
  published_at?: string;
}

export interface PluginIndexEntry {
  id: string;
  name: string;
  version: string;
  description: string;
  /** Locale → display name (from plugin manifest). */
  names?: Record<string, string>;
  /** Locale → description (from plugin manifest). */
  descriptions?: Record<string, string>;
  download_url: string;
  size_bytes?: number;
  checksum_sha256?: string;
  required_permissions?: string[];
  updated_at?: string;
  author?: string;
  min_app_version?: string;
  releases?: PluginReleaseNote[];
  icon_url?: string | null;
  /** Baked preview images relative to the store origin. */
  screenshot_urls?: string[];
}

export interface PluginCatalog {
  schema_version: number;
  generated_at?: string;
  plugins: PluginIndexEntry[];
}

export type Locale = "zh-CN" | "en";
export type SortKey = "updated" | "name" | "version";

export type Route =
  | { name: "home" }
  | { name: "detail"; id: string }
  | { name: "sources" };
