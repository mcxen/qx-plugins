# QxWeibo — Agent Guide

## Surfaces

| Surface | Role |
|---|---|
| Workbench panel | Configured-user posts, aggregated following feed, comments and multi-image detail |
| Command | Launcher entry |
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
   `detail.replies`; use an upstream floor when available and the stable response order
   only as a fallback. Do not rebuild replies from generic detail sections.
9. Never publish direct Sina image URLs to Workbench. Proxy images through `context.http`,
   keep data previews session-only, and publish structured Workbench media.
10. Do not implement a custom image viewer, preloader, list shell or Esc handler.
11. Keep rebuildable persist keys synchronized with `manifest.storage.cacheTargets`.
12. Do not add login, posting, reposting, liking, commenting or following actions without a
    separate security and privacy review.
13. Edit `index.source.js` and `source/*.js`; `index.js` is the bundled runtime entry.
    Qx currently loads one entry source through a Blob URL, so packaged runtime code must not
    depend on unresolved relative imports.

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
- `island`: show feed/detail/image loading activity through Workbench.

## Edit checklist

- [ ] Bump the plugin version and add matching release notes.
- [ ] Run `npm run build:qxweibo` and validate generated entry syntax.
- [ ] Run `npm run smoke:qxweibo`.
- [ ] Run `npm run package:plugins` and inspect `qxweibo.qx-plugin`.
- [ ] Reinstall the archive into `~/.qx/plugins/qxweibo`.
- [ ] Test cache-first open, both tabs, comments, image proxy, offline reopen and cleanup.
