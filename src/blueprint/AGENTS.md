# BluePrint — Agent Guide

## Surfaces

- Panel: host Workbench list/detail/form for BluePrint Xianji notes.
- Transport: PAT-authenticated stateless Streamable HTTP MCP only.
- Cache: disabled for Workbench note snapshots; PAT and authenticated image bytes stay out of persistence.

## Invariants

1. Use `context.ui.mountWorkbench`; do not add custom DOM/CSS chrome.
2. Send PAT only in the `Authorization: Bearer` header. Never log it or place it in URL, Workbench state, storage, errors, or content.
3. Start by calling `blueprint_whoami` and `blueprint_list_capabilities`; expose writes only when the live tool list includes them.
4. Every user mutation gets a new UUID `operationId`; retry only the exact same request with the same id.
5. Updates send the complete Xianji write model, latest `baseVersion`, and preserve image/file asset IDs.
6. On conflict, retain the user's draft and offer an explicit latest-version reload. Never blind overwrite.
7. `panel.render` paints before network I/O. Note content and authenticated image data are session-only.
8. Host Enter/Esc own list-detail navigation. Plugin actions use stable ids and unique `menuKey` values.
9. No delete/trash action is exposed without a separate confirmed UX.

## Checklist

- Bump `manifest.json` and add localized `release-notes.json` entry.
- Run `npm run smoke:blueprint`.
- Run `npm run package:one -- --only=blueprint`.
- Reinstall the archive and validate with a real read/write PAT before publishing.
