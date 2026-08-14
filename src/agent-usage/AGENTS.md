# Agent Usage — Agent Guide

## Product boundary

- This is a clean Qx-native rewrite of the upstream Agent Usage business intent.
- The first market release supports only Codex and Grok because both complete API paths are live-tested before publication.
- Add another provider only after its authentication, request, binary/error handling, and parser have succeeded against the real current service.
- Never import Raycast components, runtime shims, or converter output.

## Surfaces and UI

- The plugin owns one host-rendered Workbench panel plus a declarative `agent.usage` Home Surface Provider; it must not render iframe HTML or duplicate Qx shell chrome.
- The Home provider is cache-only: Qx reads the normalized `agent-usage.snapshot.v1` snapshot without loading the plugin runtime, reading auth files, or making provider requests.
- `panel.render` paints immediately, hydrates the persisted snapshot, then refreshes stale data.
- Rows stay compact: provider, account/plan, remaining percentage, reset time, and native details. Do not invent usage history or estimated progress.
- Enter remains host list-to-detail navigation. Refresh, Copy Summary, and Open Dashboard live in Actions with stable ids and unique menu keys.
- Every runtime string must use the local `text(en, zh)` helper driven by `context.locale.current`.

## Data and security

- Read only `~/.codex/auth.json` and `~/.grok/auth.json` through `plugin_file_read_base64`.
- Never persist or log access tokens, refresh tokens, raw auth files, or full HTTP bodies.
- Persist only normalized quota snapshots; keep the key synchronized with `manifest.storage.cacheTargets`.
- HTTP is bounded by explicit timeouts and response-size limits. Binary Grok responses must use `bodyBase64` and `arrayBuffer()`.
- Token refresh is deliberately not written back. If a local session is expired, instruct the user to log in with its own CLI.
- Refresh is single-flight and destruction invalidates late async results.

## Release checklist

1. Bump `manifest.version` and add localized release notes.
2. Run `npm run smoke:agent-usage`.
3. Run the live provider check with real local Codex and Grok sessions.
4. Run `npm run package:one -- --only=agent-usage` and inspect the archive.
5. Reinstall the archive and verify search, detail navigation, Actions, Esc, and both themes.
