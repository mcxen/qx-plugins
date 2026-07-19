# Brew (Qx marketplace)

macOS-only Homebrew manager. Reimplemented for Qx (not a raw Raycast generic
bundle) on top of the host **`context.cli`** protocol and Workbench List/Detail UI.

## Source

Raycast extension `brew` @ `a1f6fad4defba0d8c07a4c3e411edc7779702e4c`  
https://github.com/raycast/extensions/tree/a1f6fad4defba0d8c07a4c3e411edc7779702e4c/extensions/brew

## Host

| Need | Value |
|------|--------|
| Platform | macOS |
| min_app_version | 0.5.39 |
| Permissions | `cli`, `notifications`, `open-url` |
| Protocol | `context.ui.mountWorkbench` + `public/doc/plugin-cli-protocol.md` in Qx |

## Commands

- **Brew** — panel (installed / outdated / search)
- **Brew: Outdated** — toast count
- **Brew: Upgrade All Outdated** — `brew upgrade`

## CLI used

- `brew info --json=v2 --installed`
- `brew outdated --json=v2`
- `brew search --formulae|--casks <q>`
- `brew install|uninstall|upgrade …`
