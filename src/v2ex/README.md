# V2EX (Qx plugin)

Marketplace panel for browsing V2EX through the host **Workbench** protocol.

## Features

- Latest / Hot topic lists (public API, no token)
- Nodes tab (API v2 token + space-separated node preference)
- Notifications tab (token)
- Structured topic detail + host-rendered replies
- Actions: open in browser, copy link/title, refresh, check token
- **Cache**: plugin `storage.persist` + host `invoke:v2ex_*` disk/memory cache  
  Reopen paints from cache immediately; network refresh runs in the background

## Preferences

| Id | Purpose |
|----|---------|
| `token` | V2EX API v2 token (`https://v2ex.com/settings/tokens`) |
| `nodes` | Space-separated node names for the Nodes tab |
| `cacheTtlMinutes` | Freshness window for list cache (default `3`) |

## Permissions

- `http` — public API fallback for latest/hot
- `invoke:v2ex_*` — preferred path (host-side cache shared across installs)
- `open-url`, `notifications`, `clipboard`

## Host compatibility

Requires Qx **0.6.13+** with Workbench + `v2ex_fetch_*` commands. Token is read from
plugin preferences and passed into invoke args so global host settings are optional.

## Module mode

Business-only: the plugin publishes list/detail/actions/island data. QxShell owns
Top Bar filters, keyboard, Esc cascade, Bottom Bar, and reply chrome.
