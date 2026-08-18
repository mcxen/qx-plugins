# Qx Plugin Store

Static marketplace website for [qx-plugins](https://github.com/mcxen/qx-plugins).

Design direction: restrained dark surface (OriginKit-adjacent), Geist typography and hierarchy discipline (Vercel design.md). Catalog data is the same `index.json` the Qx app consumes.

## Local

```bash
cd store
npm install
npm run dev          # Vite at http://localhost:5178
npm run pages:dev    # Cloudflare Pages simulator at http://localhost:8788
```

`prepare:data` copies root `index.json` → `public/catalog.json`, the manifest-selected icon, and
declared/numbered screenshots from `src/*/`. The icon path declared by each plugin manifest is
preferred, so a plugin can ship the standard `icon-generated.png` replacement without relying on
filename order; legacy icon filenames remain fallbacks. `public/catalog.json`, `public/icons/`,
and `public/screenshots/` are ignored build outputs and must not be maintained by hand.

## Deploy (Cloudflare Pages)

```bash
cd store
npm run pages:deploy
# requires CLOUDFLARE_API_TOKEN (+ account context)
```

Or connect the repo in the Cloudflare dashboard with:

| Setting | Value |
|---------|--------|
| Root directory | `store` |
| Build command | `npm run build` |
| Build output | `dist` |

## Sync model

1. Maintain plugins under `src/` and `release-notes.json`; set `manifest.icon` to the generated
   `icon-generated.png` and list product screenshots in `manifest.screenshots`.
2. `npm run package:plugins` at repo root rewrites `index.json` + `.qx-plugin` archives.
3. `npm run store:build` runs `prepare:data` and bakes that index, the selected icons, and screenshots
   into the static site.
4. Optional: set the Qx app `index_url` to the Pages mirror of `catalog.json` later.

For a new plugin, the local smoke path is:

```bash
npm run package:plugins
npm run store:build
```

Open `store/dist/` or run `npm run pages:dev` to verify the list card, detail page, icon, and
screenshots before submitting the plugin change.

## Plugin sources (GitHub / CNB)

In-app guide: store route **`#/sources`** (header **源配置 / Sources**).

Markdown copy: [`SOURCES.md`](./SOURCES.md) — how to add the default GitHub
registry vs the CNB China mirror under **Qx → Settings → Extensions → Plugin libraries**.
