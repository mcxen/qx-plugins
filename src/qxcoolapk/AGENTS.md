# QxCoolapk — Agent Guide

## Surfaces

| Surface | Role |
|---|---|
| Workbench panel | Coolapk hot/news/digital feeds, local search, article detail and replies |
| Command | Launcher entry |
| HTTP | Anonymous Coolapk feed/detail/reply and protected-image requests |
| Persist storage | SWR feed/detail/read cache with 3/7-day pruning |

## Invariants

1. Keep `manifest.panel` and `export default.panel` paired.
2. Keep stable Workbench item ids from the Coolapk feed `id`.
3. Paint cached feeds before awaiting network refreshes.
4. Load the complete article only after selection and update the same item id.
5. Classify `feedArticle` / `is_html_article=1` / `type=12` as articles. Parse
   `message_raw_output` into ordered `detail.content` text/image blocks so media
   retains its source paragraph position; use `mediaPlacement="after-body"` only
   as the fallback when ordered source blocks are unavailable. Never publish
   article media as list cards.
   Publish every non-article feed image through scrollable `item.images` compact
   cards. Detail loading preserves every source image; the host byte budget remains
   the final trust boundary.
6. Fetch Coolapk CDN images with the same anonymous authenticated headers as API
   requests. Never publish direct `image.coolapk.com` URLs to Workbench.
7. Publish bounded session-only image previews through item images and
   `detail.images`; use a 128-entry / 30 MB Data URL LRU with a dynamic per-image
   budget and clear unreachable panel state in `destroy()`.
   Dynamic multi-image detail uses the host `horizontal`
   filmstrip and host preview. Do not persist data URLs or draw a custom
   reader/lightbox.
8. Publish first-page replies through structured `detail.replies`, preserving
   the upstream floor and `likeCount` when present. Do not flatten replies into `sections`.
9. Generate a stable random anonymous per-installation `X-App-Device` and a fresh
   `X-App-Token` for API and image requests. Persist only the device identity with
   the cache; never persist tokens, emulate accounts, or rotate identity per request.
   An explicit user action may replace the identity and force one feed refresh, but
   must warn against repeated rotation. A Coolapk account-limit response must be
   surfaced without automatic retry loops.
10. Keep the Coolapk signature implementation dependency-free at runtime. The packaged
   `index.js` includes the BSD-3-Clause-licensed `bcryptjs` implementation. Edit
   `index.source.js`; `npm run package:plugins` rebuilds the bundled entry.
11. Keep rebuildable cache keys synchronized with `manifest.storage.cacheTargets`.
12. Cache values use a top-level `savedAt` envelope for host retention cleanup.
13. Do not add login, write, like, reply, or follow capabilities without a separate
    security and privacy review.
14. Keep read state in `item.tone`; badges contain image/like/reply metrics without
    redundant `Read` / `Unread` text.
15. Use `context.state` latest-writer/read-ledger/LRU/generation primitives.
    Retain read ids by their own timestamp (bounded to
    5,000 records and the configured retention window), even when a feed rotates out.
16. Publish indeterminate feed, article, and protected-image loading only through
    Workbench `island` activity. Keep `detail.status` for errors; do not duplicate
    loading inside content.
17. After the selected detail settles, prefetch only the nearest three details
    serially into persistent content cache. Never mark prefetched items read or
    prefetch their full image groups.

## Permissions

- `http`: Coolapk feed, full article, first-page reply, and protected image requests.
- `open-url`: open the selected post on Coolapk.
- `system`: save authenticated original image bytes to the user's Downloads directory.

## Edit checklist

- [ ] Bump the plugin version and add matching release notes.
- [ ] Validate manifest and JavaScript syntax.
- [ ] Run the mocked Workbench smoke test and a real anonymous API smoke test.
- [ ] Package all plugins and inspect `qxcoolapk.qx-plugin`.
- [ ] Reinstall the archive into `~/.qx/plugins/qxcoolapk`.
- [ ] Smoke-test cache-first open, tab switching, pagination, full article text,
      multi-image preview, read state, offline reopen, and retention pruning.
