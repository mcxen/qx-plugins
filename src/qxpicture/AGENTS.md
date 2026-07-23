# Qxpicture — Agent Guide

Qx Workbench List/detail plugin for random image APIs.

## Invariants

1. Keep `manifest.panel` and `export default.panel` together.
2. Keep UI declarative through `context.ui.mountWorkbench`.
3. Persist API configuration with `context.storage.persist`.
4. Use `context.system.setWallpaper`; never duplicate macOS/Windows wallpaper code.
5. File and clipboard operations must keep their exact `invoke:` permissions.
6. `panel.render` must return before network work completes.

## Validation

- `node --check index.js`
- Validate `manifest.json`
- Test direct and JSON sources plus Refresh, Save, Copy, and Set Wallpaper.
