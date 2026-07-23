# Unsplash (Qx marketplace)

Search Unsplash photos, download them, and set desktop wallpaper.

The panel uses the host Workbench Gallery for search, keyboard selection,
structured photo details, and item/panel Actions.
Details use host-owned adaptive media/zoom, and long actions publish per-photo
status without clearing the Gallery.

Reimplemented for Qx on host ports (not a full Raycast OAuth bundle):

| Capability | Port |
|------------|------|
| API search / random | `context.http` + Access Key (`Client-ID`) |
| Save image | `plugin_file_write_base64` |
| Platform / wallpaper path / set wallpaper | `context.system` |
| Open source pages | `context.openUrl` |

## Setup

1. Create an app at https://unsplash.com/oauth/applications  
2. Copy **Access Key** into plugin preferences  
3. Open **Unsplash** from Launcher  

## Source

Raycast `unsplash` @ `01edf86b41e63f42e4dc21cf5554a3f5e1180613`

## Not ported

- OAuth user login / Liked Images  
- Collection deep browsing parity  

## Host

- `min_app_version`: **0.6.13** (Workbench media/controller protocol)
- Permissions: `http`, `system`, file write, clipboard, open-url
