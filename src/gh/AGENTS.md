# GitHub Actions (gh) — Agent Guide

> Packaged with the plugin. Read before editing.

## Module mode: **business-only** + **public HTML**

Do **not** hand-roll CSS/DOM chrome. Panel UI must go through:

```js
context.ui.mountWorkbench(container, state, handlers)
```

Do **not** call `api.github.com`. Data sources only:

- `https://github.com/{owner}/{repo}/actions`
- `https://github.com/{owner}/{repo}/releases`

Parse HTML (`aria-label` on run links, release tag links). Private repos need
a future authenticated browser path — not implemented.

## Surfaces

| Surface | Role |
|---------|------|
| **Panel** | Workbench: Actions / Releases tabs (required) |
| **Commands** | Open / refresh / summary toast / island watch |
| **Cache** | `storage.persist` SWR |
| **HTTP** | Public **HTML pages** via `context.http.fetch` |
| **Island** | Optional watch for in-progress rows parsed from HTML |

## Layout

```text
src/gh/
├── AGENTS.md
├── manifest.json
├── index.js
└── README.md
```

## Invariants

1. `manifest.panel` **and** `export.panel` — host only registers from manifest.
2. `panel.render` returns quickly; network loads async with SWR paint-first.
3. Token from preference `token` as `Authorization: Bearer …` when set.
4. Never log or toast the full token.
5. User-Agent identifies the plugin; GitHub requires a UA.

## Permissions

`http`, `open-url`, `notifications`, `island`

## Pages used

- `GET https://github.com/{owner}/{repo}/actions`
- `GET https://github.com/{owner}/{repo}/releases`

## Checklist

- [ ] Bump version  
- [ ] `npm run package:plugins`  
- [ ] Reinstall zip · open panel (public repos only)  
- [ ] Confirm list matches browser Actions/Releases pages  

