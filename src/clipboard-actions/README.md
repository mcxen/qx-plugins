# Clipboard Actions

Clipboard Actions provides two Qx no-view commands for macOS and Windows:

- **Paste Clipboard as Plain Text** reads the current text representation,
  writes it back as a plain-text clipboard item, and invokes Qx's native paste
  port in the previous foreground application. Empty or non-text clipboards
  fail with a localised message. Accessibility/automation failures from Qx are
  intentionally preserved.
- **Save Clipboard Image** reads the current clipboard image through Qx's
  clipboard permission, then copies the host-produced PNG to a configurable
  directory. The default is `~/Pictures/Qx Clipboard`; every filename is
  timestamped and checked for conflicts, and an existing file is never
  overwritten.

Search for either command in the Launcher. Record and enable its global shortcut
under **Settings → Extensions → Installed → Clipboard Actions → Shortcuts**;
shortcuts are disabled by default.

The plugin performs no network requests and does not use Raycast converter
shims. Clipboard reads, native paste, and file access remain behind Qx's
permission-checked `context.*` / `context.invoke` ports.
