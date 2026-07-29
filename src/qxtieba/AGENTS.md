# QxTieba — Agent Guide

## Surfaces

| Surface | Role |
|---|---|
| Workbench panel | Configured-bar feed, local search, master-detail and comments |
| Command | Launcher entry |
| HTTP | Baidu Tieba anonymous mobile forum and app-compatible Protobuf thread detail API |
| Persist storage | SWR feed/detail/read cache with 3/7-day pruning |

## Invariants

1. `manifest.panel` and `export default.panel` must remain paired.
2. Parse `forumName` as a comma/newline-separated list, normalize each entry by
   trimming a trailing `吧`, and preserve single-forum preferences.
3. Keep a Mixed tab plus one native tab per configured forum. Mixed loading is
   partial-failure tolerant and interleaves forums instead of concatenating them.
4. Use stable thread ids from `/p/<tid>` or Tieba `data-field`; never list indexes.
5. Paint cached content before awaiting a network refresh.
6. The app-compatible Protobuf API provides the first page of public floors and nested comments as Workbench `detail.replies`.
7. Keep the main-post body separate from replies, publish floor likes as `likeCount`, and mark matching authors as OP.
8. Publish structured `detail.images`; do not draw a custom image viewer.
9. Keep cache keys synchronized with `manifest.storage.cacheTargets`.
10. Cache values use a top-level `savedAt` envelope for host retention cleanup.
11. Anonymous endpoints may be rate-limited or risk-controlled; preserve cache and expose retry/open actions.

## Permissions

- `http`: public forum page and anonymous thread-detail Protobuf API.
- `open-url`: open a thread on Tieba.

## Edit checklist

- [ ] Bump the plugin version and add `release-notes.json` history.
- [ ] Run `npm run build:qxtieba`; the installed `index.js` must be a self-contained bundle with no relative imports.
- [ ] Run `npm run smoke:qxtieba`.
- [ ] Run `npm run package:one -- --only=qxtieba`.
- [ ] Reinstall the archive into `~/.qx/plugins/qxtieba`.
- [ ] Verify configured forum, pagination, selection, comments, offline cache and external open.

## Do not

- Do not require login cookies for public browsing.
- Do not invoke Python, MCP, a browser, or shell commands at runtime.
- Do not register global Esc or Actions shortcuts inside the plugin.
- Do not silently replace usable cache when Tieba returns a verification page.
