# Bing Wallpaper (Raycast convert) — Agent Guide

Converted Raycast extension. Prefer host **system** / file invokes declared in manifest.

## Invariants

1. Keep shim compatibility; do not rewrite as native Qx panel unless intentional.
2. Panel must remain registered.
3. Storage for last wallpaper state.

## Checklist

- [ ] After convert re-run, verify panel opens
