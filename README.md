# qx-plugins

Qx plugin marketplace source and index.

> Raycast 转换器代码暂时保留但已冻结、不维护。市场中的正式插件统一从上游源代码出发，使用 Qx `context.*`、Workbench、Actions 和 Island 协议重新开发；不要发布新的自动转换产物。

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
| `qx-bing-wallpaper` | Native Workbench Gallery | Qx-owned Bing gallery and wallpaper actions |
| `qxpicture` | Native Workbench List | Configurable random-image APIs with adaptive detail media |
| `raycast-calendar` | Raycast generic convert | UI calendar; works on Qx ≥ 0.4.28 |
| `external-display-control` | Native | DDC/CI brightness; macOS, needs Qx ≥ 0.4.61 |
| `v2ex` | Native | Host `v2ex_*` commands |

## Legacy Raycast converter（Frozen）

以下流程仅保留用于历史研究和一次性实验，不作为市场发布路径，也不承诺适配新的 Raycast API。

Open an issue whose title starts with `[convert]` and include a Raycast
extension tree URL:

```text
[convert] https://github.com/raycast/extensions/tree/<commit>/extensions/<extension-name>
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
| `context.http.fetch` + **`arrayBuffer()` / `bodyBase64`** | Image and other binary downloads. |
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

## Maintained plugin policy

- 阅读上游扩展源代码，保留业务意图，不保留 Raycast runtime/shim 结构。
- 共享能力先补 Qx host port，再由插件直接使用稳定的 `context.*` 协议。
- UI 优先发布声明式 Workbench 数据；复杂内容才使用 custom panel。
- 不再以 re-convert 作为升级或修复路径。

Design rules for host/converter contracts live in the Qx tree:
`docs/architecture-principles.md` (abstraction + SOLID). Keep marketplace
README abstract (what / why / which version), not a dump of esbuild internals.

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
