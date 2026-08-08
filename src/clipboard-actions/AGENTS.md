# Clipboard Actions — Agent Guide

## Surfaces

- Two `mode: "no-view"` commands: plain-text paste and clipboard-image save.
- No panel, custom HTML, interval, Island, or network surface.
- Qx Settings owns global shortcut recording; manifest shortcut defaults are
  disabled and user overrides stay in the host settings state.

## Layout and shipped files

`manifest.json`, `index.js`, `README.md`, and this guide are the complete
runtime/package source. `index.js` is self-contained ESM and must stay free of
relative imports so the host Blob runtime can load it.

## Invariants

1. Keep manifest command names and exported `commands` names identical.
2. Keep both commands `mode: "no-view"`; do not add a panel merely to expose
   operations already available from Launcher search.
3. Plain-text paste must read and write through `context.clipboard`, then call
   exact `plugin_perform_paste`. Do not hide the host Accessibility error.
4. Image save must call `read_clipboard_image_now`, read the returned PNG through
   `plugin_file_read_base64`, and write it through `plugin_file_write_base64`.
   Destination names are timestamped, sanitized for both OSes, conflict-checked,
   and never intentionally overwritten.
5. Keep the save-directory preference localised and default it to
   `~/Pictures/Qx Clipboard`.

## Permissions

- `clipboard`: plain-text read/write and current-image discovery.
- `invoke:plugin_perform_paste`: native paste keystroke (Accessibility may be
  required on macOS).
- `invoke:plugin_file_read_base64`, `invoke:plugin_file_write_base64`, and
  `invoke:plugin_file_exists`: read the host PNG and create a unique saved copy.

## Edit and validation checklist

1. Keep command IDs, preference ID, and plugin ID stable.
2. Run `node --check src/clipboard-actions/index.js`.
3. Run `npm run smoke:clipboard-actions`.
4. Run `npm run package:one -- --only=clipboard-actions`; inspect `unzip -t
   clipboard-actions.qx-plugin` and the generated `releases.json`.
5. Re-test empty/non-text clipboard errors, Accessibility passthrough, image
   conflict naming, and Simplified Chinese messages.

## Do not

- Do not send paste keystrokes from JavaScript or use `child_process`/CLI.
- Do not write clipboard images directly to the plugin bundle or untrusted
  browser storage.
- Do not use `file://`, network image downloads, or a Raycast converter shim.
