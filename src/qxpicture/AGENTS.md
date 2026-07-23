# Qxpicture — Agent Guide

Qx Workbench List/detail plugin for random image APIs.

## Invariants

1. Keep `manifest.panel` and `export default.panel` together.
2. Keep UI declarative through `context.ui.mountWorkbench`.
3. Persist API configuration with `context.storage.persist`.
4. Use `context.system.setWallpaper`; always write a **local file** first
   (`~/Pictures/Qxpicture` on both platforms via `mediaScratchDirectory`).
5. File and clipboard operations must keep their exact `invoke:` permissions.
6. `panel.render` must return before network work completes.
7. Image previews are restored from `qxpicture.image-cache.v1` on open;
   network fetch only runs on explicit **Refresh**.
8. Download directory defaults to `~/Downloads` and is editable under Settings → General.
9. Keep `mountWorkbench()` controller updates revisioned. Preserve cached media
   while item/detail `status` reports asynchronous refresh state.
10. Use host-owned adaptive detail media and zoom; do not inject a plugin lightbox
    or host-selector CSS.
11. API management uses Workbench form `actions`; each parameter uses a stable
    control `group` with an inline delete action. Keep the Qx minimum version in
    sync with that host protocol.

## Validation

- `node --check index.js`
- Validate `manifest.json`
- Test: open shows cache, Refresh fetches, click image lightbox, Save uses download dir,
  Set Wallpaper writes local file then `setWallpaper`.
