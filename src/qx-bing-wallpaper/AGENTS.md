# Qx Bing Wallpaper — Agent Guide

Native Qx business plugin. Do not run it through the Raycast converter.

## Surfaces

- `open-gallery`: panel entry
- `set-random-wallpaper`: daily background command
- `set-latest-wallpaper`: daily background command
- Workbench Gallery: images, selection, structured details, item/panel Actions
- Persisted Bing archive cache

## Invariants

1. Keep `manifest.panel` and `export default.panel` together.
2. Publish serializable data through `context.ui.mountWorkbench`; do not add a custom DOM gallery.
3. Keep wallpaper/network/file operations behind `context.http`, `context.system`, and exact file `invoke:` ports.
4. `panel.render` must publish loading state and return before network I/O completes.
5. Background commands and the panel share data only through `context.storage.persist`.
6. Do not add Raycast metadata, imports, shims, or converted bundles.

## Permissions

- `http`: Bing archive and image downloads
- `open-url`: Bing source Action
- `clipboard`: copy image link Action
- `system`: platform/home detection and host-native macOS/Windows wallpaper setter
- `island`: Workbench busy projection
- exact `plugin_file_*`: file output

## Edit checklist

- Bump `manifest.version` for behavior changes.
- Keep `min_app_version` aligned with the Workbench Gallery host version.
- Run `npm run package:plugins`.
- Install `qx-bing-wallpaper.qx-plugin` locally and verify Gallery selection plus every Action.
