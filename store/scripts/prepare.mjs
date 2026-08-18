#!/usr/bin/env node
/**
 * Bake marketplace catalog + plugin icons/screenshots into store/public.
 * Source of truth remains repo-root index.json (package:plugins).
 */
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const storeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(storeRoot, "..");
const publicDir = path.join(storeRoot, "public");
const iconsDir = path.join(publicDir, "icons");
const shotsDir = path.join(publicDir, "screenshots");
const srcRoot = path.join(repoRoot, "src");
const indexPath = path.join(repoRoot, "index.json");

const ICON_CANDIDATES = [
  "icon.svg",
  "icon.png",
  "extension-icon.png",
  "command-icon.png",
  "bing-wallpaper-icon.png",
];

async function readManifestScreenshots(pluginDir) {
  const manifestPath = path.join(pluginDir, "manifest.json");
  if (!existsSync(manifestPath)) return [];
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const list = Array.isArray(manifest.screenshots) ? manifest.screenshots : [];
    return list.map((s) => String(s || "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

async function readManifestIcon(pluginDir) {
  const manifestPath = path.join(pluginDir, "manifest.json");
  if (!existsSync(manifestPath)) return "";
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    return typeof manifest.icon === "string" ? manifest.icon.trim() : "";
  } catch {
    return "";
  }
}

/** Fall back: numbered preview assets in the plugin folder. */
async function discoverLooseScreenshots(pluginDir, declared) {
  if (declared.length > 0) return declared;
  const entries = await readdir(pluginDir);
  return entries
    .filter((n) =>
      /\.(png|jpe?g|webp|gif)$/i.test(n)
      && /(screenshot|preview|-\d+|metadata)/i.test(n)
      && !/icon|extension-icon|command-icon/i.test(n),
    )
    .sort((a, b) => a.localeCompare(b));
}

async function main() {
  await mkdir(iconsDir, { recursive: true });
  await mkdir(shotsDir, { recursive: true });

  if (!existsSync(indexPath)) {
    throw new Error(`Missing marketplace index: ${indexPath}. Run npm run package:plugins first.`);
  }

  const catalog = JSON.parse(await readFile(indexPath, "utf8"));
  const plugins = Array.isArray(catalog.plugins) ? catalog.plugins : [];
  const iconMap = {};
  const shotMap = {};
  const i18nMap = {};
  let shotCount = 0;

  for (const plugin of plugins) {
    const id = String(plugin.id || "").trim();
    if (!id) continue;
    const pluginDir = path.join(srcRoot, id);
    if (!existsSync(pluginDir)) continue;

    // Localized name/description maps from manifest (index may lag until re-package)
    const manifestPath = path.join(pluginDir, "manifest.json");
    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
        const names =
          manifest.names && typeof manifest.names === "object" && !Array.isArray(manifest.names)
            ? Object.fromEntries(
                Object.entries(manifest.names)
                  .map(([k, v]) => [String(k), String(v ?? "").trim()])
                  .filter(([, v]) => v),
              )
            : null;
        const descriptions =
          manifest.descriptions && typeof manifest.descriptions === "object" && !Array.isArray(manifest.descriptions)
            ? Object.fromEntries(
                Object.entries(manifest.descriptions)
                  .map(([k, v]) => [String(k), String(v ?? "").trim()])
                  .filter(([, v]) => v),
              )
            : null;
        if ((names && Object.keys(names).length) || (descriptions && Object.keys(descriptions).length)) {
          i18nMap[id] = {
            names: names && Object.keys(names).length ? names : undefined,
            descriptions: descriptions && Object.keys(descriptions).length ? descriptions : undefined,
          };
        }
      } catch {
        /* ignore bad manifest */
      }
    }

    // Icons
    let picked = null;
    const manifestIcon = await readManifestIcon(pluginDir);
    const iconCandidates = [manifestIcon, ...ICON_CANDIDATES]
      .filter(Boolean)
      .filter((name, index, values) => values.indexOf(name) === index);
    for (const name of iconCandidates) {
      const full = path.join(pluginDir, name);
      if (existsSync(full)) {
        picked = { full, name };
        break;
      }
    }
    if (!picked) {
      const entries = await readdir(pluginDir);
      const loose = entries.find(
        (n) =>
          /\.(png|svg|webp)$/i.test(n)
          && !/screenshot|preview|unsplash-|brew-|calendar-|bing-wallpaper-\d/i.test(n),
      );
      if (loose) picked = { full: path.join(pluginDir, loose), name: loose };
    }
    if (picked) {
      const ext = path.extname(picked.name).toLowerCase() || ".png";
      const outName = `${id}${ext}`;
      await copyFile(picked.full, path.join(iconsDir, outName));
      iconMap[id] = `icons/${outName}`;
    }

    // Screenshots
    const declared = await readManifestScreenshots(pluginDir);
    const shotNames = await discoverLooseScreenshots(pluginDir, declared);
    const urls = [];
    const pluginShotDir = path.join(shotsDir, id);
    if (shotNames.length > 0) await mkdir(pluginShotDir, { recursive: true });
    for (let i = 0; i < shotNames.length; i++) {
      const name = shotNames[i];
      const full = path.join(pluginDir, name);
      if (!existsSync(full)) continue;
      const base = path.basename(name).replace(/[^\w.\-]+/g, "_");
      const outRel = `screenshots/${id}/${String(i).padStart(2, "0")}-${base}`;
      await copyFile(full, path.join(publicDir, outRel));
      urls.push(outRel);
      shotCount += 1;
    }
    if (urls.length > 0) shotMap[id] = urls;
  }

  const enriched = {
    ...catalog,
    generated_at: new Date().toISOString(),
    plugins: plugins.map((p) => {
      const i18n = i18nMap[p.id] || {};
      return {
        ...p,
        // Prefer live manifest maps; fall back to whatever package index already has.
        names: i18n.names || p.names || undefined,
        descriptions: i18n.descriptions || p.descriptions || undefined,
        icon_url: iconMap[p.id] || null,
        screenshot_urls: shotMap[p.id] || [],
      };
    }),
  };

  await writeFile(path.join(publicDir, "catalog.json"), `${JSON.stringify(enriched, null, 2)}\n`, "utf8");
  console.log(
    `store prepare: ${plugins.length} plugins, ${Object.keys(iconMap).length} icons, ${shotCount} screenshots, ${Object.keys(i18nMap).length} i18n maps → public/catalog.json`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
