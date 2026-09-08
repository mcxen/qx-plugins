# Display Brightness — Agent Guide

Brightness uses the host `context.system.displayBrightness()` and
`context.system.setDisplayBrightness()` ports. Qx embeds the macOS DDC/CI
transport and Windows WMI/Monitor Configuration adapters; this plugin must not
install or spawn m1ddc/ddcctl, PowerShell, or another monitor utility.

## Invariants

1. Panel + the precise `display-control` permission.
2. Do not add CLI or arbitrary invoke permissions.
3. Workbench owns sliders, Actions, search and keyboard behavior. Keep hardware
   and software targets separate; never parse opaque target ids.
4. The write queue is serial and latest-per-target. Destroy cancels queued writes;
   errors remain visible and old reads cannot overwrite a newer requested value.
5. New host slider and software targets require Qx 0.6.109. 2.0.0 must not enter
   the online catalog until the Windows / external DDC device matrix is verified.

## Checklist

- [ ] Bump version · package · verify built-in and DDC displays
