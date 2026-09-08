# Display Brightness

Adjust display brightness with Qx 0.6.109 or newer. The Workbench separates
hardware brightness from software dimming, with searchable displays, keyboard
sliders, explicit errors and a Restore Colors action.

The plugin calls Qx's typed `context.system` display-control port. Qx uses
macOS DisplayServices for compatible Apple panels, embedded IOAVService DDC on
Apple Silicon, and framebuffer I2C on Intel. Windows uses WMI and VCP 0x10 with
Monitor Configuration fallback. No external executable is required.

Software dimming changes the image through the host gamma table, not the
backlight. 100% restores the saved colors; 0% keeps a visible floor. HDR and
virtual-display drivers may reject it; a readback failure is reported explicitly.
Normal Qx exit restores colors still owned by Qx; force termination and changes
from other color utilities are outside that guarantee.

2.0.0 remains a development package pending external DDC, Intel and Windows
hardware acceptance. macOS built-in read/write and software dim/restore were
tested locally. Do not publish this version based only on fixtures.
