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
chooses docked vs floating placement from user settings.
The Workbench Actions list must expose a Show/Hide Island toggle. A user dismissal
must call `context.island.dismiss()` and suppress automatic panel polling from
recreating the session until the user explicitly shows it again.

## Layout

```text
src/qxgh/
├── AGENTS.md
├── manifest.json
├── index.js
└── README.md
```

## Permissions

`http`, `open-url`, `notifications`, `island`

## Checklist

- [ ] Bump version  
- [ ] `npm run package:plugins`  
- [ ] Reinstall zip · open QxGH panel  
