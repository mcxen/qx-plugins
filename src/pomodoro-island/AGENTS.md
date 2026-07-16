# Pomodoro Island — Agent Guide

> Packaged with the plugin. Agents: read this before editing.

## What this plugin is

| Surface | Role |
|---------|------|
| **Commands** | Search actions: start focus/break, pause/resume, stop |
| **Panel** | Full control UI (timer + buttons). Required so host never shows "Panel not registered" |
| **Island** | External floating timer via `context.island` (`island` permission) |

State is **module-scoped** in `index.js` so island action callbacks and panel paint share one timer.

## Layout (dev)

```text
src/pomodoro-island/
├── AGENTS.md        # this file (shipped inside .qx-plugin)
├── manifest.json    # id, permissions, commands, panel, preferences
├── index.js         # ESM default export { commands, panel }
├── icon.svg
└── README.md        # human install notes
```

## Invariants

1. **`manifest.panel` must exist** if users can open `plugin:pomodoro-island` tab.
2. **`export default.panel.render/destroy`** must match manifest (host loads panel only when manifest declares it).
3. Timer intervals use **`context.setInterval` / `clearInterval`** (auto-cleared on destroy).
4. Island is best-effort: panel must still work if `context.island` throws.
5. Island action `command` names must match `manifest.commands[].name`.

## Permissions

- `island` — show/update/dismiss external island
- `notifications` — session complete toast

## Edit checklist

- [ ] Bump `manifest.version` (semver)
- [ ] Keep panel + commands + island labels in sync
- [ ] `npm run package:plugins` from repo root
- [ ] Install zip or re-copy into `~/.qx/plugins/pomodoro-island/`
- [ ] Open panel from Extensions — no "Panel not registered"
- [ ] Start focus → island ticks; Pause/Stop from panel and search

## Do not

- Call `setInterval` on bare `window` (leaks across panel remounts)
- Register panel only in JS without `manifest.panel` (host ignores it for registration)
- Block `panel.render` on long network waits (host 15s timeout)
