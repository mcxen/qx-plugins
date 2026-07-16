# Brew — Agent Guide

CLI-first macOS plugin: `context.cli` + list panel.

## Surfaces

- **Panel** — formulae/casks browse (required)
- **Commands** — open / refresh paths via search

## Ports

`cli`, `notifications`, `open-url` — no host-specific invoke.

## Invariants

1. `manifest.panel` + `export.panel` present.
2. `panel.render` returns quickly; brew JSON loads async.
3. Prefer `context.cli.run` argv over `ai-bash`.

## Checklist

- [ ] Bump version · package · reinstall · open panel
