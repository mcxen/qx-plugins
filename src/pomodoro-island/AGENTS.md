# Pomodoro Island — Agent Guide

> Packaged with the plugin. Agents: read this before editing.

## What this plugin is

| Surface | Role |
|---------|------|
| **Commands** | Search actions: start focus/break, pause/resume, stop |
| **Panel** | Declarative Workbench: history list + structured current/history detail |
| **Actions** | Pure descriptors mapped by Qx to primary / context / Cmd/Ctrl+K |
| **Island** | Same business state projected to docked or floating QxIsland |

Timer state and history are persisted because command and panel runtimes are separate iframes. The command runtime owns ticking, and the manifest `pomodoro-heartbeat` interval reconciles persisted deadlines after panel close, wake or runtime reload. The panel only renders snapshots.

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
3. Panel UI must use `context.ui.mountWorkbench(state, handlers)`; do not add custom CSS/DOM.
4. Details use `{ title, subtitle, body, fields, sections }`; Workbench never accepts HTML.
5. Actions with `command` must match `manifest.commands[].name`; local-only actions use `onAction`.
6. Timer truth is the persisted absolute `endsAt`, never an incremented in-memory counter.
7. Workbench binds `backgroundPoll.command` to the manifest `no-view + interval` heartbeat and reloads on `onBackgroundPoll`.
8. Island publishes absolute `countdown.endsAt` (or paused `remainingMs`) and host-owned `pause/play` action icons; never push countdown text every second.
9. Timer intervals use **`context.setInterval` / `clearInterval`** only for completion detection; the heartbeat owns recovery/completion and Qx owns smooth countdown presentation.
10. Island is best-effort and uses the same state object through the Workbench `island` field or `context.island` while the panel is closed.
11. Completion makes the opposite phase the primary next action (focus → break, break → focus); repeating the same phase remains secondary.
12. Manifest command actions refresh persisted state through `onCommandComplete`; the open panel may repaint its deadline once per second but must not poll persistent storage every second.
13. A running timer publishes `activity: "pulse"`; paused/complete states remove it. Activity DOM/CSS, reduced motion, action busy state, and winner transitions are Qx responsibilities.
14. The plugin never publishes an open route. Qx binds the floating “Open Qx” control to `plugin:pomodoro-island` from the authenticated plugin session.
15. The Workbench Actions list exposes a persisted Show/Hide Island toggle. Hiding dismisses only the projection; it must not pause or stop the timer, and heartbeat reconciliation must respect the hidden state.

## Permissions

- `island` — show/update/dismiss external island
- `notifications` — session complete toast

## Edit checklist

- [ ] Bump `manifest.version` (semver)
- [ ] Keep panel data + command actions + island projection in sync
- [ ] `npm run package:plugins` from repo root
- [ ] Install zip or re-copy into `~/.qx/plugins/pomodoro-island/`
- [ ] Open panel: left history, right structured detail, no plugin-authored chrome
- [ ] Start focus → close panel → timer/history continue; reopen and verify remaining time
- [ ] Sleep/wake or reload runtime → heartbeat reconciles expired deadline once
- [ ] Docked island ticks; enable External Island Display and verify float
- [ ] Running shows host `pulse`; paused freezes countdown without activity; complete shows 100% success
- [ ] Floating “Open Qx” returns to the Pomodoro Workbench
- [ ] Pause/Stop from panel Actions, Cmd/Ctrl+K, search and island action
- [ ] Hide from panel Actions → timer keeps running and heartbeat does not re-show it; Show restores the same session

## Do not

- Call `setInterval` on bare `window` (leaks across runtime lifecycle)
- Assume command and panel module globals are shared
- Add custom panel CSS/HTML when the Workbench data model can represent it
- Register panel only in JS without `manifest.panel` (host ignores it for registration)
- Block `panel.render` on long network waits (host 15s timeout)
