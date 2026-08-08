# Sysinfo Plugin — Agent Guide

## Surfaces

- The panel name is the launcher/search entry; no duplicate `open-sysinfo` command.
- One host-rendered Workbench panel. The Hardware view uses the left List for
  System, CPU, Memory, Power, Storage, Displays, and Network categories; Processes remains
  a separate top-level view because its rows are processes, not hardware types.
- No custom iframe HTML/CSS, island, background timer, or direct native command.

## Invariants

- Keep `manifest.panel` and `export default.panel` together.
- Depend only on typed `context.system.*` ports. Platform differences belong in
  Qx Rust adapters, never in this plugin.
- `manifest.homeWidgets` only associates supported semantic system sources with
  this panel. Home chrome, sampling, layout, focus, and resize behavior remain
  host-owned; never add widget DOM or CSS to the plugin.
- Battery presence, external power, charging, and fully charged are independent
  states. Never infer one from another. Optional health/capacity metrics render
  as `—` on hardware that does not expose them.
- `panel.render` must paint immediately, then load asynchronously.
- Live tabs refresh no faster than every five seconds and retain usable content
  while the next sample loads.
- Refresh is single-flight across timer ticks, tab changes, and manual actions.
  Disposable background ticks are skipped while a sample is active; user-driven
  navigation/refresh is queued once and runs after the active sample.
- Hardware loading is failure-tolerant: a single `context.system.*` rejection
  (e.g. Windows desktop without a battery WMI provider, or a Server Core SKU
  missing the NetAdapter module) must never blank the whole panel. Use
  `Promise.allSettled` and drop only the failed row; successful rows still
  render with their real data. Selected-item refresh keeps the previous sample
  when the new fetch rejects instead of replacing it with an error.
- System identity/specification, storage capacity, and display inventory are cached per panel runtime;
  live polling must not rescan them. CPU/memory load, power, network counters,
  and processes refresh in the background without replacing content with loading UI.
- While Hardware is open, CPU, Memory, Power, and Network refresh together every
  five seconds regardless of selection; CPU and Memory share the same in-flight
  stats request so one refresh cycle stays internally consistent.
- CPU specifications include the model plus optional physical/logical,
  performance/efficiency core counts, maximum frequency, cache line size, and
  native L1/L2/L3 cache records. They come from the cached system snapshot,
  never from the live utilization poll. Missing cache levels render as absent;
  do not synthesize an L3 cache when the platform does not expose one.
- Kernel identity follows neofetch's cached `uname -srm` model: keep kernel
  family and release separate in the host contract and render the combined
  value without polling it.
- Display inventory depends only on `context.system.displays()`. The host owns
  xcap/DisplayConfig/CoreGraphics details and returns optional connection/EDID
  fields; the plugin renders missing protocol data as `—`.
- Storage SMART health and temperature are optional future host fields. Never
  infer health from free capacity or label an unavailable sensor as healthy.
- Process termination always requires a typed `YES` confirmation.
- Keep both `platforms` entries; unsupported fields degrade to `—`, not a
  platform-specific fork.

## Permissions

- `system`: environment and semantic System Settings links.
- `system-stats`: CPU/memory.
- `system-info`: identity/storage/network/power.
- `processes`: list.
- `invoke:qx_system_information_kill_process`: confirmed terminate action.

## Edit checklist

1. Bump `manifest.version`.
2. Run `npm run package:plugins` in the marketplace repository.
3. Reinstall `sysinfo.qx-plugin` and smoke-test both List keyboard navigation
   and the confirmed terminate flow.
4. Verify the host module-port gate against the updated marketplace checkout.

## Do not

- Spawn PowerShell, Bash, `system_profiler`, or `taskkill` from the plugin.
- Reintroduce Windows WMI/PowerShell polling in the plugin or host hot path;
  Qx 0.6.36+ supplies the native Win32 implementation behind `context.system.*`.
- Render a second list/detail shell in iframe HTML.
- Poll at sub-second intervals from `panel.render`.
