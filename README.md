# qx-plugins

Qx plugin marketplace source and index.

Users install plugins from this repository via Qx Settings → Extensions /
Marketplace. Each entry in `index.json` points at a GitHub raw `.qx-plugin`
archive on `main`:

```text
https://raw.githubusercontent.com/mcxen/qx-plugins/main/<plugin-id>.qx-plugin
```

## Repository layout

```text
src/<plugin-id>/          # plugin source (manifest + entry + assets)
scripts/                  # convert + package tooling
index.json                # marketplace catalog (checksums, permissions, min version)
<plugin-id>.qx-plugin     # packaged zip archives published for download
```

| Plugin | Kind | Notes |
|--------|------|--------|
| `raycast-bing-wallpaper` | Raycast generic convert | Needs **Qx ≥ 0.5.18** (binary HTTP / `arrayBuffer`) |
| `raycast-calendar` | Raycast generic convert | UI calendar; works on Qx ≥ 0.4.28 |
| `external-display-control` | Native | DDC/CI brightness; macOS, needs Qx ≥ 0.4.61 |
| `v2ex` | Native | Host `v2ex_*` commands |

## Convert a Raycast extension (GitHub issue)

Open an issue whose title starts with `[convert]` and include a Raycast
extension tree URL:

```text
[convert] https://github.com/raycast/extensions/tree/<commit>/extensions/bing-wallpaper
```

The `Convert Raycast Extension` workflow:

1. Sparse-checkouts that path from `raycast/extensions`
2. Runs the JS converter (`scripts/convert-raycast-extension.mjs`)
3. Writes `src/<plugin-id>/` including icons **and screenshots** from Raycast
   `metadata/` / `screenshots/` / `media/`
4. Packages `<plugin-id>.qx-plugin`, updates `index.json`, pushes `main`
5. Comments the raw download URL

Retry by commenting `/convert` on the issue.

## Local conversion

```bash
npm ci

# From a Raycast GitHub tree URL (sparse clone + convert + publish into src/)
npm run convert:raycast-url -- \
  https://github.com/raycast/extensions/tree/<commit>/extensions/<name> \
  --out dist/raycast-converted \
  --package \
  --publish

# Or from a local checkout
npm run convert:raycast -- /path/to/extensions/<name> \
  --out dist/raycast-converted \
  --package
```

`--publish` copies the result into `src/`, packages **all** plugins under
`src/`, and regenerates `index.json`.

## Package marketplace only

```bash
npm run package:plugins
```

Scans `src/*/manifest.json`, builds deterministic `.qx-plugin` zips (fixed
mtime), computes SHA-256, and rewrites `index.json`.

## Host foundations required by converted plugins

Qx does **not** run Raycast extensions natively. The converter builds a browser
bundle that talks to Qx host RPC. Important host capabilities:

| Capability | Why |
|------------|-----|
| `context.http.fetch` + **`arrayBuffer()` / `bodyBase64`** | Image/binary downloads (Bing Wallpaper). Requires **Qx ≥ 0.5.18**. |
| `Buffer` global (converter banner + shim) | Many Raycast sources call `Buffer.from` |
| `plugin_file_*` | Durable cache under `/qx-plugin-files/<id>` |
| `plugin_run_applescript` | Desktop wallpaper, Finder automation (macOS) |
| Path aliases | `/qx-home` → user home; virtual plugin paths rewritten in AppleScript |
| Raycast UI shim | `List` / `Grid` / `Detail` / `ActionPanel` / preferences / toast |

If a converted plugin needs binary HTTP and the host is older than 0.5.18,
**fix the host** rather than rewriting the plugin as a one-off native app.

## Screenshots and install UX

Raycast-converted plugins ship screenshots inside the `.qx-plugin` archive.
Qx Marketplace reads `manifest.screenshots` and shows them in Installed /
details. Assets are **not** fetched live from `raycast/extensions` at install
time — only the packaged archive on `mcxen/qx-plugins` is downloaded.

## When to re-convert vs hand-edit

- **Re-convert** after converter/shim fixes (Buffer, ActionPanel, fetch), or
  when updating to a newer Raycast source commit.
- **Hand-edit** only for native plugins (`v2ex`, `external-display-control`)
  or tiny post-convert manifest tweaks (`min_app_version`, keywords, version).
- Prefer fixing **Qx host + converter** over bespoke forks of Raycast ports.

## Manifest conventions

- `id`: stable plugin id (`raycast-<raycast-name>` for converted)
- `version`: semver of the Qx package (not necessarily Raycast’s)
- `min_app_version`: minimum Qx app that provides required host APIs
- `permissions`: capability groups (`http`, `open-url`) and/or
  `invoke:<cmd>` for exact commands
- `screenshots`: filenames packaged next to `index.js`
- `raycast`: conversion metadata + platform compatibility report

## See also

- Qx in-app doc: `public/doc/raycast-plugin-conversion.md`
- Converter implementation: `scripts/raycast-converter/{generic,shims,adapters}.mjs`
