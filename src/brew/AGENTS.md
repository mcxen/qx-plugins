# Brew — Agent Guide

CLI-first macOS plugin: `context.cli` + host Workbench list/detail panel.

## Surfaces

- **Panel** — formulae/casks browse (required)
- **Actions** — refresh and package upgrades inside the panel

## Ports

`cli`, `notifications`, `open-url` — no host-specific invoke.

## Invariants

1. `manifest.panel` + `export.panel` present.
2. `panel.render` returns quickly; brew JSON loads async.
3. Prefer `context.cli.run` argv over `ai-bash`.
4. Keep the panel business-only: publish tabs/list/detail/Actions through `mountWorkbench`; do not restore custom DOM chrome.

## Checklist

- [ ] Bump version · package · reinstall · open panel
