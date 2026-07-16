# Unsplash (Qx marketplace)

Search Unsplash photos, download them, and set desktop wallpaper.

Reimplemented for Qx on host ports (not a full Raycast OAuth bundle):

| Capability | Port |
|------------|------|
| API search / random | `context.http` + Access Key (`Client-ID`) |
| Save image | `plugin_file_write_base64` |
| Set wallpaper (macOS) | `plugin_run_applescript` |
| Reveal / open | `context.cli` / `context.openUrl` |

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

- `min_app_version`: **0.5.26** (`context.cli` + binary HTTP)  
- Permissions: `http`, `cli`, file write, applescript, clipboard, open-url  
