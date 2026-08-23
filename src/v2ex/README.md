# V2EX (Qx plugin)

Marketplace panel for browsing V2EX through the host **Workbench** protocol.

## Features

- Latest / Hot topic lists (public API, no token)
- Nodes tab (API v2 token + space-separated node preference)
- Notifications tab (token)
- Structured topic detail + host-rendered reply trees; leading `@member` replies nest under the latest earlier reply by that member
- Actions: open in browser, copy link/title, refresh, check token
- **Cache**: plugin `storage.persist` + host `invoke:v2ex_*` disk/memory cache  
  Every ordinary open reads retained cache first. Fresh entries avoid transport; stale entries remain
  visible while the current Workbench revalidates and the island shows activity. Tab/node scopes are isolated and Qx Storage can clear them.

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

Requires Qx **0.6.87+** with Workbench reply trees, cache scopes, managed cache targets, and `v2ex_fetch_*` commands. Token is read from
plugin preferences and passed into invoke args so global host settings are optional.

## Module mode

Business-only: the plugin publishes list/detail/actions/island data. QxShell owns
Top Bar filters, keyboard, Esc cascade, Bottom Bar, and reply chrome.
