# QxHeihe — Agent Guide

## Surfaces

| Surface | Role |
|---|---|
| Workbench panel | Community list, search, master-detail and multi-image preview |
| Command | Launcher entry |
| HTTP | Xiaoheihe feed and public post detail |
| Persist storage | SWR feed/detail/read cache with 3/7-day pruning |

## Invariants

1. `manifest.panel` and `export default.panel` must remain paired.
2. Keep stable item ids from `linkid`; never use list indexes.
3. Paint cache before awaiting a network refresh.
4. Full post detail loads only after selection and updates the same item id.
5. Publish structured `detail.images`; do not draw a custom image viewer.
6. Public detail must not depend on comment login. Always attempt the first
   anonymous comment page; the optional plain-text preference `commentCookie`
   may enhance the request. Never persist it inside community cache.
7. Sign every feed request immediately before dispatch. A configured legacy URL
   may provide business parameters, but its `hkey`, `_time`, and `nonce` must
   always be discarded and regenerated for refresh and pagination.
8. Keep rebuildable keys synchronized with `manifest.storage.cacheTargets`.
9. Cache values use a top-level `savedAt` envelope for host retention cleanup.
10. Use `context.state.createReadLedger` and `createLatestWriter` for read/cache state.
    Reading a post writes `readAt` once; reopening it must not indefinitely extend retention.
    Persist writes are serialized, and a feed refresh must not discard still-retained
    read ids merely because they are absent from the newest page.
11. Keep read state in `item.tone` only. Badges contain content metrics, never redundant
    `Read` / `Unread` text.
12. Publish indeterminate feed and detail loading only through Workbench `island`
    activity. Keep `detail.status` for errors; do not duplicate loading inside content.
13. After the selected detail settles, prefetch only the nearest three details
    serially into persistent cache without marking them read.

## Permissions

- `http`: feed and public detail API.
- `open-url`: open the original post.
- `island`: show feed and detail loading through the host animation.

## Edit checklist

- [ ] Bump plugin version and `min_app_version` if the Workbench contract changes.
- [ ] Run syntax check and package all plugins.
- [ ] Reinstall the archive into `~/.qx/plugins/qxheihe`.
- [ ] Smoke-test cache, refresh, selection, detail and multi-image preview.
- [ ] Smoke-test offline second open, read state, retention pruning and host cache declaration.
