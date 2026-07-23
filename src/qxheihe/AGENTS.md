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
6. Public detail must not depend on comment login. Comments may use the optional
   password preference `commentCookie`; never persist it inside community cache.
7. Keep the feed URL configurable because its upstream request parameters may change.
8. Keep rebuildable keys synchronized with `manifest.storage.cacheTargets`.
9. Cache values use a top-level `savedAt` envelope for host retention cleanup.
10. Reading a post writes `readAt` once; reopening it must not indefinitely extend retention.

## Permissions

- `http`: feed and public detail API.
- `open-url`: open the original post.

## Edit checklist

- [ ] Bump plugin version and `min_app_version` if the Workbench contract changes.
- [ ] Run syntax check and package all plugins.
- [ ] Reinstall the archive into `~/.qx/plugins/qxheihe`.
- [ ] Smoke-test cache, refresh, selection, detail and multi-image preview.
- [ ] Smoke-test offline second open, read state, retention pruning and host cache declaration.
