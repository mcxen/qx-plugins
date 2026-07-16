# QxGH — Agent Guide

> Packaged with the plugin. Read before editing.

## Identity

| Field | Value |
|-------|--------|
| **id** | `qxgh` |
| **name** | QxGH |
| **mode** | business-only + public HTML |

## Module mode: **business-only** + **public HTML**

Do **not** hand-roll CSS/DOM chrome. Panel UI must go through:

```js
context.ui.mountWorkbench(container, state, handlers)
```

Do **not** call `api.github.com`. Data sources only:

- `https://github.com/{owner}/{repo}/actions`
- `https://github.com/{owner}/{repo}/releases`

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
