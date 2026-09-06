# BluePrint — Agent Guide

## Surfaces

- Source: `index.source.js` owns note workflows; `source/transport.js` owns MCP/auth transport. `npm run build:blueprint` produces the self-contained Blob-compatible `index.js`; run it before `package:one`.

- Panel: host Workbench list/detail/form for BluePrint Xianji notes.
- Transport: PAT-authenticated stateless Streamable HTTP MCP only.
- Cache: disabled for Workbench note snapshots; PAT and authenticated image bytes stay out of persistence. Image previews are session-only and bounded (8 MiB per image, 32 MiB total).
- Settings: endpoint and PAT are a manually saved connection group; layout, density, and image visibility are an autosaved browsing group. Keep the IDs and their defaults stable when changing the UI.

## Invariants

1. Use `context.ui.mountWorkbench`; do not add custom DOM/CSS chrome.
2. Send PAT only in the `Authorization: Bearer` header. Never log it or place it in URL, Workbench state, storage, errors, or content.
3. Start by calling `blueprint_whoami` and `blueprint_list_capabilities`; expose writes only when the live tool list includes them.
4. Every user mutation gets a new UUID `operationId`; retry only the exact same request with the same id.
5. Updates send the complete Xianji write model, latest `baseVersion`, and preserve image/file asset IDs.
6. On conflict, retain the user's draft and offer an explicit latest-version reload. Never blind overwrite.
7. `panel.render` paints before network I/O. Note content and authenticated image data are session-only.
8. Writable notes publish the host-owned `cards` layout and `item.editor`; the plugin owns the authoritative start fetch, full-model CAS write, and typed save result. Read-only PATs omit the editor.
9. Host Enter/Esc own list-detail navigation. Plugin actions use stable ids and unique `menuKey` values.
10. No delete/trash action is exposed without a separate confirmed UX.

The `onEdit` handler returns only domain status plus `value`, `revision`, or
`message`; Qx's SDK adds the event identity to the wire acknowledgement.

## Async and security checklist

- Keep `baseVersion` and a fresh `operationId` in the plugin edit session. A
  stale response must not replace a newer draft or close the host editor.
- A conflict result retains the local value; “Keep draft and close” stores a
  session draft for the next explicit edit, while “Load latest version” is the
  only action that replaces it.
- Authenticated image requests must resolve to the configured MCP origin and
  BluePrint asset route before adding the Bearer header. Never publish a PAT in
  a URL, data model, error, toast, or log.
- `panel.destroy(container)` is mandatory and must clear locale listeners,
  pending session state, media bytes, and stale request generations. Do not
  rely on a cleanup function returned from `render`.

## Checklist

- Bump `manifest.json` and add localized `release-notes.json` entry.
- Run `npm run smoke:blueprint`.
- New/edit forms default to title/content/tags. Advanced fields are explicitly expanded; collapse must retain the complete write model.
- Run `npm run package:one -- --only=blueprint`.
- Reinstall the archive and validate with a real read/write PAT before publishing.
