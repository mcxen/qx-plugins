# QxWeibo — Agent Guide

## Surfaces

| Surface | Role |
|---|---|
| Workbench panel | Configured-user posts, aggregated following feed, comments and multi-image detail |
| Launcher | The panel name is the launcher/search entry; no duplicate open command |
| HTTP | Weibo mobile API, visitor passport and protected image requests |
| Persist storage | SWR feed/comment/read cache |
| Session storage | Rotating visitor cookies and proxied image previews |

## Invariants

1. Keep `manifest.panel` and `export default.panel` paired.
2. Keep stable Workbench item ids from Weibo `mblog.id`.
3. Paint cached feeds before awaiting network refreshes.
4. Read configured cookies only from preferences. Never persist, log or display Cookie values.
5. Maintain a small rotating visitor-cookie pool. Auto-generated cookies are session-only.
6. All Weibo API requests use the bounded serial scheduler and a randomized delay.
7. Following aggregation is bounded by `followingUserLimit`; do not fan out unbounded work.
8. Fetch comments and full-size media only after selection. Publish comments through
   `detail.replies`; preserve `likeCount`, use an upstream floor when available and the stable response order
   only as a fallback. Do not rebuild replies from generic detail sections.
9. Never publish direct Sina image URLs to Workbench. Proxy images through `context.http`,
   keep data previews session-only, and publish structured Workbench media.
   Preview storage is bounded to 128 entries / 30 MB of Data URL characters with a
   dynamic per-image budget. Detail loading preserves every source image, uses a
   four-request bounded concurrent queue, commits each group in source order, and
   `destroy()` releases unreachable panel state.
10. Do not implement a custom image viewer, preloader, list shell or Esc handler.
11. Keep rebuildable persist keys synchronized with `manifest.storage.cacheTargets`.
12. Do not add login, posting, reposting, liking, commenting or following actions without a
    separate security and privacy review.
13. Edit `index.source.js` and `source/*.js`; `index.js` is the bundled runtime entry.
    Qx currently loads one entry source through a Blob URL, so packaged runtime code must not
    depend on unresolved relative imports.
14. Keep read state in `item.tone`; badges contain image/comment metrics without
    redundant `Read` / `Unread` text.
15. Use `context.state` latest-writer/read-ledger/LRU/generation primitives.
    Retain read ids by their own timestamp (bounded to
    5,000 records and the configured retention window), even when switching feeds
    or when an item rotates out of the latest response.
16. Publish indeterminate feed, detail, and image loading only through Workbench
    `island` activity. Do not duplicate loading in `detail.status` or reply content.
17. After the selected detail settles, prefetch only the nearest three details
    serially into persistent content cache. Never mark prefetched items read or
    prefetch their full image groups.

## Source layout

```text
index.source.js       # command/panel composition root
source/weibo.js       # feed, cookies, cache, scheduling and Workbench workflow
source/media.js       # bounded image proxy conversion
index.js              # generated single-file ESM runtime entry
```

## Upstream attribution

The mobile endpoint mapping and response normalization are adapted from
`qinyuanpei/mcp-server-weibo` (MIT). See `THIRD_PARTY_NOTICES.md`.

## Permissions

- `http`: visitor passport, feeds, public following list, comments and image proxy.
- `open-url`: open the selected post on Weibo.
- `system`: save authenticated original image bytes to the user's Downloads directory.
- `island`: show feed/detail/image loading activity through Workbench.

## Edit checklist

- [ ] Bump the plugin version and add matching release notes.
- [ ] Run `npm run build:qxweibo` and validate generated entry syntax.
- [ ] Run `npm run smoke:qxweibo`.
- [ ] Run `npm run package:plugins` and inspect `qxweibo.qx-plugin`.
- [ ] Reinstall the archive into `~/.qx/plugins/qxweibo`.
- [ ] Test cache-first open, both tabs, comments, image proxy, offline reopen and cleanup.
