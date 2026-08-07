# External Display Control

Adjust built-in and external display brightness from Qx on macOS and Windows.

The plugin calls Qx's typed `context.system` display-control port. Qx uses
macOS DisplayServices for built-in panels and embeds a DDC/CI transport based
on the MIT-licensed m1ddc packet/IOAVService implementation for compatible
external monitors. No Homebrew package or external executable is required.

On Windows, the same Qx port uses `WmiMonitorBrightness` for integrated panels
and the Win32 Monitor Configuration API for physical DDC/CI monitors. Plugin
code receives the same normalized model and never starts PowerShell or another
monitor utility.
