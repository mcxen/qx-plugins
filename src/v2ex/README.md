# V2EX (Qx plugin)

Marketplace panel for browsing V2EX topics with **stale-while-revalidate** caching.

## Features

- Latest / Hot topic lists (public API, no token)
- Optional Nodes / Notifications / Token status (API v2 token)
- In-panel topic detail + replies
- **Cache**: plugin `storage.persist` + host `invoke:v2ex_*` disk/memory cache  
  Reopen paints from cache immediately; network refresh runs in the background

## Preferences

| Id | Purpose |
|----|---------|
| `token` | V2EX API v2 token (`https://v2ex.com/settings/tokens`) |
| `nodes` | Space-separated node names for the Nodes tab |
| `cacheTtlMinutes` | Freshness window for list cache (default `3`) |

## Permissions

- `http` — public API fallback
- `invoke:v2ex_*` — preferred path (host-side cache shared with any built-in callers)
- `open-url`, `notifications`

## Host compatibility

Requires Qx with `v2ex_fetch_*` commands (cached since app builds that include the V2EX host module). Token can be passed from plugin preferences into invoke args so host settings are optional.
