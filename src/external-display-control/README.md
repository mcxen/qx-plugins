# External Display Control

Adjust built-in and external display brightness from Qx.

The plugin calls Qx's typed `context.system` display-control port. Qx uses
macOS DisplayServices for built-in panels and embeds a DDC/CI transport based
on the MIT-licensed m1ddc packet/IOAVService implementation for compatible
external monitors. No Homebrew package or external executable is required.
