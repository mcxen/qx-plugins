# Sysinfo — Qx System Monitor

Sysinfo is a QxPlugin rewrite of Raycast's
[System Monitor](https://github.com/raycast/extensions/tree/186d955eda64f9e956b25a3fdf5566b1d38f57f2/extensions/system-monitor)
business intent. It is implemented as a host-rendered Qx Workbench for macOS
and Windows, without carrying over Raycast components or runtime shims.

The plugin uses only stable `context.system.*` ports. PowerShell, Win32, IOKit,
`ioreg`, and other platform details stay inside Qx host adapters.

Its manifest also associates the CPU, memory, power, and network semantic data
sources with the Sysinfo panel through `homeWidgets`. Qx renders those cards on
the empty Launcher itself, shares the existing non-blocking system sampler, and
opens Sysinfo when a card is activated. The plugin does not inject Home DOM,
CSS, polling, or layout dimensions.

The Hardware view uses the left Workbench list to choose a hardware category;
the center detail pane shows that category. Processes stays as a separate view
because each process must remain an individually selectable and actionable row.

Surfaces:

- System: host identity, OS, processor and kernel.
- CPU: current used/free percentage plus cached model, physical/logical core
  counts, Apple performance/efficiency topology, and maximum frequency when the
  platform reports it. Cache details include the cache-line size and every
  native L1/L2/L3 record exposed by macOS `sysctl` or Linux sysfs; unavailable
  levels are omitted rather than guessed.
- Memory: current used/free/total memory.
- Power: battery level, independent charging/full/external-power states,
  remaining time, cycle count, condition, maximum capacity, temperature and
  available capacity metrics.
- Storage: system-volume usage.
- Displays: name, resolution, refresh rate, scale, rotation, built-in/primary
  state, and available connection technology / EDID identifiers. Windows uses
  the host DisplayConfig adapter for HDMI, DisplayPort, eDP, Miracast and
  virtual/indirect paths; unavailable macOS connector metadata renders as `—`.
- Network: active IPv4 interfaces and byte counters.
- Processes: sortable process list with an explicit, confirmed terminate action.
- System Settings: semantic destinations through `context.system.openSettings`.

CPU, Memory, Power, and Network refresh together every five seconds for as long
as the Hardware view is open, regardless of which category is selected.
Processes refreshes on the same cadence while that view is open. Background
refresh keeps the current rows usable, and CPU plus Memory share one in-flight
stats sample so their values come from the same refresh cycle.
The entire refresh cycle is single-flight: timer ticks are skipped while a
sample is active, while a tab change or manual refresh is queued once. This
prevents slow native providers from accumulating overlapping requests.
Static system specifications, storage capacity, and display inventory are cached
per panel runtime and only rescanned when the user explicitly chooses Refresh.

Storage capacity is available now. Per-device SMART health and temperature need
separate native NVMe/ATA IOCTL (Windows) and IOKit (macOS) adapters. USB bridge
hardware and Apple/third-party drivers may not expose those sensors, so future
fields remain optional and must never be synthesized from volume utilization.

Kernel family and release follow neofetch's lightweight approach: the host reads
the equivalent of `uname -srm` once as part of that static snapshot. Linux OS
identity comes from `os-release`; macOS product identity remains distinct from
its Darwin kernel identity.

Battery fields are optional by contract: Windows hardware and firmware expose
different subsets than macOS. Missing metrics render as `—`; a desktop without a
battery renders a deliberate No Battery state instead of failing the panel.
On Qx 0.6.36 and newer, Windows system, storage, network, process, and power
reads use direct Win32 APIs. The polling path does not start PowerShell or WMI
providers; extended battery-health fields remain optional when the native
system status API does not expose them.

Permissions:

- `system`: environment and System Settings destinations.
- `system-stats`: CPU and memory metrics.
- `system-info`: identity, storage, network and power.
- `processes`: process listing.
- `invoke:qx_system_information_kill_process`: confirmed termination only.

The UI is pure Workbench data, so List selection, search, details, Actions,
keyboard navigation, theme, Esc, and responsive layout remain owned by Qx.
