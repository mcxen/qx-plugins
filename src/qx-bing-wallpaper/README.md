# Qx Bing Wallpaper

A native Qx plugin built against the Qx plugin handbook. It does not use the
Raycast converter or compatibility runtime.

## Features

- Host-rendered Workbench List with thumbnails, search, and keyboard selection
- Adaptive full-resolution detail media with host-owned zoom preview
- Per-image async feedback without clearing the List
- Item Actions: set wallpaper, download, copy image link, open Bing source
- Panel Actions: set a random wallpaper and refresh the List
- Three-hour persisted cache with stale fallback
- One daily background task, configurable to use the latest or a random recent image
- Durable last-applied record; download or wallpaper failures remain visible as failed background runs
- Host-native macOS and Windows wallpaper application (no PowerShell dependency)

The first automatic change is scheduled one day after install/enable. If Qx was asleep or closed
at the scheduled time, the host performs one catch-up run after it resumes.

Requires Qx 0.6.13+ for the Workbench media and controller protocol.
