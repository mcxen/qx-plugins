# Bing Wallpaper

External Qx plugin converted from the Raycast extension `bing-wallpaper`.

Requires **Qx ≥ 0.5.18** for binary HTTP downloads (`arrayBuffer` / `bodyBase64`).

## Capabilities used from the Qx host

- `http` — JSON metadata and image bytes
- `plugin_file_*` — local wallpaper cache under plugin data
- `plugin_run_applescript` — set desktop picture via System Events
- Raycast API shim (`@raycast/api`) provided by the converter runtime

## Source

```
https://github.com/raycast/extensions/tree/bf7fe09a27513c3d80ad02cfc7b152af1cc2c284/extensions/bing-wallpaper
```

Commands: set-bing-wallpaper, auto-random-bing-wallpaper, auto-switch-bing-wallpaper
