# Speedtest — Agent Guide

Port of the Raycast Speedtest extension (`tonka3000` et al.) to Qx Workbench.
Pinned upstream: `2e9c66f0bbc014643d6f9d7bd42ec7cd26bb3384`.

## Surfaces

- **Panel** — host Workbench list of ISP, server, ping, download, upload, call/stream quality, and result URL.
- **Island** — live phase / progress while the official CLI runs.
- **Persist** — last successful result at `speedtest.last-result.v1`.
- **Files** — official Ookla CLI under `/qx-plugin-files/speedtest/cli`.

## Layout

```text
src/speedtest/
├── AGENTS.md
├── README.md
├── manifest.json
├── index.source.js
├── index.js          # generated bundle
├── source/format.js
├── source/parse.js
├── source/cli.js
├── source/workbench.js
└── icon-generated.png
```

## Invariants

1. `manifest.panel` and `export default.panel` stay paired.
2. `panel.render` returns immediately; CLI download and the speed test run asynchronously.
3. Use the official Ookla CLI (`--format json --progress --accept-license --accept-gdpr`). Do not invent speeds.
4. Verify the vendor archive SHA-256 before extract. Clear-cache must wipe the CLI dir.
5. Chart points are real CLI bandwidth samples only. Fewer than two samples → no curve.
6. Destroy cancels the CLI job, timers, and locale listener.
7. Host owns chrome, Enter/Esc, Actions, and About. Do not inject SVG meters.

## Permissions

- `http` — download the vendor CLI archive
- `cli` — extract, chmod, and run `speedtest`
- `system` — `env()` for home/dirSep and real CLI path
- `clipboard` — copy summary / section
- `open-url` — open the Ookla result URL
- `notifications` — completion/error toasts
- `island` — live progress projection
- `invoke:plugin_file_*` — persist the extracted binary

## Checklist

- [ ] Bump `manifest.version` and `release-notes.json`
- [ ] `npm run build:speedtest` (or `package:one`)
- [ ] `npm run smoke:speedtest`
- [ ] Reinstall `speedtest.qx-plugin` and run a real test
- [ ] Confirm rate-limit and offline errors stay user-readable

## Do not

- Bundle the Ookla binary in the package
- Simulate progress percentages
- Call `navigator.language` or spawn a custom HTML speedometer
- Skip license acceptance flags; starting the panel accepts Ookla terms
