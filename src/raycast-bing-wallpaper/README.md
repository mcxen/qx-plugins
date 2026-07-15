# Bing Wallpaper

Native Qx plugin for browsing and setting Bing daily wallpapers.

## Features

- Browse recent Bing wallpapers in a grid
- Set any wallpaper as the desktop background (all desktops)
- Download images to `~/Downloads`
- Background commands:
  - **Auto Random Bing Wallpaper** (every 5 minutes when enabled)
  - **Auto Switch Bing Wallpaper** (latest image, every 30 minutes when enabled)

## How it works

Wallpaper metadata is loaded through Qx `http` permission from Bing's public
`HPImageArchive` API. Image bytes are downloaded with `curl` via
`plugin_run_applescript`, then applied with System Events. This avoids the
host text-only HTTP body path that broke the earlier Raycast conversion.

## Permissions

- `http` — fetch wallpaper metadata
- `open-url` — open copyright / info links
- `invoke:plugin_run_applescript` — download images and set wallpaper

## macOS note

Setting the desktop picture may require granting **Automation** access for Qx
to control System Events the first time you set a wallpaper.
