# QxCoolapk

QxCoolapk is a native Qx Workbench plugin for browsing public Coolapk community
content.

## Features

- Hot, news, and digital-community feeds
- Local search across loaded posts
- Complete post text loaded on selection
- Authenticated image loading that avoids Coolapk CDN HTTP 567 responses
- Article images placed with the reading body; all dynamic-post images shown in scrollable list cards
- Background card thumbnails and bounded multi-image previews using the Qx host viewer
- First-page replies, read/unread state, and pagination
- Cache-first startup, offline reading, and automatic 3/7-day cleanup
- Open the original post on Coolapk

The plugin uses anonymous read-only API access. It does not collect Coolapk
credentials and does not provide likes, replies, follows, or other write actions.
Protected image responses are converted into session-only previews. List images
are reduced to thumbnail size, article images are bounded for the host, and
oversized animated images may appear as a still preview.

## Permissions

- `http` — fetch public Coolapk feeds, article details, replies, and protected images.
- `open-url` — open the original post in the browser.

## Upstream and third-party notices

The API request model, feed/detail endpoints, field mapping, device profile, and
anonymous token algorithm are reimplemented from
[`Lniosy/coolapk-mcp`](https://github.com/Lniosy/coolapk-mcp), licensed under MIT.

The packaged JavaScript includes
[`bcryptjs`](https://github.com/dcodeIO/bcrypt.js), licensed under the
3-Clause BSD License, for
generating the anonymous request token without Python, Node.js, or a native
runtime dependency.
