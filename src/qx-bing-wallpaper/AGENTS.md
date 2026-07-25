# Qx Bing Wallpaper — Agent Guide

Native Qx business plugin. Do not run it through the Raycast converter.

## Surfaces

- `open-gallery`: panel entry
- `set-random-wallpaper` / `set-latest-wallpaper`: manual no-view commands
- `daily-wallpaper`: the single daily background command; reads `dailyWallpaperMode`
- Workbench List: thumbnail images, selection, structured details, item/panel Actions
- Host-owned adaptive image detail + zoom Dialog; no iframe CSS/lightbox workaround
- Persisted Bing archive cache

## Invariants

1. Keep `manifest.panel` and `export default.panel` together.
2. Publish serializable data through `context.ui.mountWorkbench`; do not add a custom DOM gallery.
3. Keep wallpaper/network/file operations behind `context.http`, `context.system`, and exact file `invoke:` ports.
4. `panel.render` must publish loading state and return before network I/O completes.
5. Background commands and the panel share data only through `context.storage.persist`.
6. Do not add Raycast metadata, imports, shims, or converted bundles.
7. Keep `mountWorkbench()` controller updates revisioned; item/detail loading uses
   structured `status` and retains the current image.
8. Never catch and swallow command failures. The host background ledger must receive rejection
   so it cannot display a false success.
9. Persist a last-applied record only after both file write and host wallpaper application succeed.

## Permissions

- `http`: Bing archive and image downloads
- `open-url`: Bing source Action
- `clipboard`: copy image link Action
- `system`: platform/home detection and host-native macOS/Windows wallpaper setter
- `island`: Workbench busy projection
- exact `plugin_file_*`: file output

## Edit checklist

- Bump `manifest.version` for behavior changes.
- Keep `min_app_version` aligned with the Workbench List thumbnail host version.
- Run `npm run package:plugins`.
- Run `npm run smoke:bing-wallpaper`.
- Install `qx-bing-wallpaper.qx-plugin` locally and verify List thumbnail selection plus every Action.
