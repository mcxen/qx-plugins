# QxCoolapk — Agent Guide

## Surfaces

| Surface | Role |
|---|---|
| Workbench panel | Coolapk hot/news/digital feeds, local search, article detail and replies |
| Command | Launcher entry |
| HTTP | Anonymous Coolapk feed/detail/reply API requests |
| Persist storage | SWR feed/detail/read cache with 3/7-day pruning |

## Invariants

1. Keep `manifest.panel` and `export default.panel` paired.
2. Keep stable Workbench item ids from the Coolapk feed `id`.
3. Paint cached feeds before awaiting network refreshes.
4. Load the complete article only after selection and update the same item id.
5. Publish article text and `detail.images`; do not draw a custom reader or lightbox.
6. Generate a fresh anonymous `X-App-Token` for API requests. Do not persist tokens.
7. Keep the Coolapk signature implementation dependency-free at runtime. The packaged
   `index.js` includes the BSD-3-Clause-licensed `bcryptjs` implementation. Edit
   `index.source.js`; `npm run package:plugins` rebuilds the bundled entry.
8. Keep rebuildable cache keys synchronized with `manifest.storage.cacheTargets`.
9. Cache values use a top-level `savedAt` envelope for host retention cleanup.
10. Do not add login, write, like, reply, or follow capabilities without a separate
    security and privacy review.

## Permissions

- `http`: Coolapk feed, full article, and first-page reply APIs.
- `open-url`: open the selected post on Coolapk.

## Edit checklist

- [ ] Bump the plugin version and add matching release notes.
- [ ] Validate manifest and JavaScript syntax.
- [ ] Run the mocked Workbench smoke test and a real anonymous API smoke test.
- [ ] Package all plugins and inspect `qxcoolapk.qx-plugin`.
- [ ] Reinstall the archive into `~/.qx/plugins/qxcoolapk`.
- [ ] Smoke-test cache-first open, tab switching, pagination, full article text,
      multi-image preview, read state, offline reopen, and retention pruning.
