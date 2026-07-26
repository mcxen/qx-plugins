# QxGH — Agent Guide

> Packaged with the plugin. Read before editing.

## Identity

| Field | Value |
|-------|--------|
| **id** | `qxgh` |
| **name** | QxGH |
| **mode** | business-only + public HTML |

## Module mode: **business-only** + **public HTML**

Do **not** hand-roll CSS/DOM chrome. Panel UI must use the host renderer:

```js
context.ui.mountWorkbench(state, handlers)
```

Do **not** call `api.github.com`. Data sources only:

- `https://github.com/{owner}/{repo}/actions`
- `https://github.com/{owner}/{repo}/releases`

List items provide structured `detail` and `actions`; Workbench never accepts HTML.
The hottest active run is projected through the Workbench `island` field so Qx
chooses docked vs floating placement from user settings. It is also published to
the OS-native `context.tray` submenu as non-clickable status rows (percentage /
elapsed time) plus refresh actions; do not try to inject CSS into a system menu.
The Workbench Actions list must expose a Show/Hide Island toggle. A user dismissal
must call `context.island.dismiss()` and suppress automatic panel polling from
recreating the session until the user explicitly shows it again.
Actions and Releases index pages for every configured repository must load in
parallel. Run-detail duration hydration is secondary enrichment: never keep the
first usable Workbench list in a loading state while those detail pages resolve.

## Layout

```text
src/qxgh/
├── AGENTS.md
├── manifest.json
├── index.js
└── README.md
```

## Permissions

`http`, `open-url`, `notifications`, `island`, `tray`

## Checklist

- [ ] Bump version  
- [ ] `npm run package:plugins`  
- [ ] Reinstall zip · open QxGH panel  
