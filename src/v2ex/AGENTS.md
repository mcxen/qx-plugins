# V2EX — Agent Guide

> Packaged with the plugin. Read before editing.

## Surfaces

| Surface | Role |
|---------|------|
| **Panel** | Host Workbench list + structured detail + replies |
| **Commands** | Open / hot / latest / notifications / token |
| **Cache** | persist SWR + host `invoke:v2ex_*` disk cache |
| **HTTP** | Public API fallback for latest/hot only |

## Layout

```text
src/v2ex/
├── AGENTS.md
├── manifest.json
├── index.js
└── README.md
```

## Invariants

1. `manifest.panel` required — host registers panel only from manifest.
2. Panel UI must use `context.ui.mountWorkbench`; do not paint custom DOM/CSS chrome.
3. Detail is structured text only (`body` / `fields` / `replies`). Never publish HTML.
4. Pass plugin preference `token` into authed invoke args when present.
5. Stale-while-revalidate: paint cache, refresh in background.
6. `panel.render` must not hang on network (host 15s budget); first paint may be empty/loading.
7. Actions use stable ids + unique `menuKey`. Host owns Enter open/back for list↔detail.
8. One action description only — no duplicated Bottom Bar / primary “open detail” fakes.
9. Nodes and notifications require token; latest/hot do not.

## Tabs / filters

- Tabs: `latest` · `hot` · `nodes` · `notifications`
- Filter `node` appears only on the Nodes tab (space-separated preference list)

## Actions (panel)

| id | Purpose |
|----|---------|
| `refresh` | Force reload current list |
| `open:{topicId}` | Open topic URL |
| `copy-link:{topicId}` | Copy topic URL |
| `copy-title:{topicId}` | Copy topic title |
| `check-token` | Toast token status |
| `open-tokens-page` | Open v2ex.com token settings |
| `open-site` | Open v2ex.com |

## Permissions

`http`, `open-url`, `notifications`, `clipboard`, `invoke:v2ex_*`

## Checklist

- [ ] Bump version in `manifest.json`
- [ ] `npm run package:one -- --only=v2ex` from `qx-plugins/`
- [ ] Reinstall package in Qx
- [ ] Latest/Hot work without token
- [ ] Nodes + Notifications require token and show clear errors without it
- [ ] Detail shows body + host reply list
- [ ] Open / copy actions work; Enter opens detail (host), Esc steps back
