# Unsplash — Agent Guide

HTTP search + download/set wallpaper, rendered through the host Workbench Gallery.

## Ports

`http`, `system` (including native wallpaper), file invokes as declared in manifest, `open-url`, `clipboard`.

## Invariants

1. Panel registration complete.
2. Access Key only in preferences.
3. Cache search results in storage when useful.
4. Keep the panel business-only: publish images and Actions through `mountWorkbench`; do not restore custom DOM/CSS gallery code.

## Checklist

- [ ] Bump version · package · smoke search
