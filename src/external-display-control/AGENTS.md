# Display Brightness — Agent Guide

Brightness uses the host `context.system.displayBrightness()` and
`context.system.setDisplayBrightness()` ports. Qx embeds the macOS DDC/CI
transport; this plugin must not install or spawn m1ddc/ddcctl.

## Invariants

1. Panel + the precise `display-control` permission.
2. Do not add CLI or arbitrary invoke permissions.

## Checklist

- [ ] Bump version · package · verify built-in and DDC displays
