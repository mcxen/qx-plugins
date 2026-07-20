# Sysinfo

Sysinfo is a host-rendered Qx Workbench for macOS and Windows. It uses only
stable `context.system.*` ports; no PowerShell, shell scripts, Win32 calls, or
AppKit calls live in the plugin.

Surfaces:

- Overview: host identity, OS, processor, memory and power.
- Storage: system-volume usage.
- Network: active IPv4 interfaces and byte counters.
- Processes: sortable process list with an explicit, confirmed terminate action.
- System Settings: semantic destinations through `context.system.openSettings`.

Permissions:

- `system`: environment and System Settings destinations.
- `system-stats`: CPU and memory metrics.
- `system-info`: identity, storage, network and power.
- `processes`: process listing.
- `invoke:qx_system_information_kill_process`: confirmed termination only.

The UI is pure Workbench data, so List selection, search, details, Actions,
keyboard navigation, theme, Esc, and responsive layout remain owned by Qx.
