# V2EX — Agent Guide

> Packaged with the plugin. Read before editing.

## Surfaces

| Surface | Role |
|---------|------|
| **Panel** | Topic list + detail + replies (required) |
| **Commands** | Open / notifications / token |
| **Cache** | persist SWR + host `invoke:v2ex_*` disk cache |
| **HTTP** | Public API fallback |

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
2. Pass plugin preference `token` into authed invoke args when present.
3. Stale-while-revalidate: paint cache, refresh in background.
4. `panel.render` must not hang on network (host 15s budget).

## Permissions

`http`, `open-url`, `notifications`, `invoke:v2ex_*`

## Checklist

- [ ] Bump version  
- [ ] Package + reinstall  
- [ ] Open panel twice — second open should show `cached …`  
