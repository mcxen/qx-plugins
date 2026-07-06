# External Display Control

View DDC/CI details for external monitors and adjust brightness, contrast, and volume from Qx.

The plugin uses Qx native Rust commands and supports the open-source macOS DDC CLIs:

- `m1ddc`: https://github.com/waydabber/m1ddc
- `ddcctl`: https://github.com/kfix/ddcctl

Qx searches common Homebrew/system paths and only executes fixed allowlisted display-control commands.
