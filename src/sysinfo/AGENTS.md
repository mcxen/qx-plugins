# Sysinfo Plugin — Agent Guide

## Surfaces

- One `open-sysinfo` launcher command.
- One host-rendered Workbench panel with Overview, Storage, Network, and
  Processes tabs.
- No custom iframe HTML/CSS, island, background timer, or direct native command.

## Invariants

- Keep `manifest.panel` and `export default.panel` together.
- Depend only on typed `context.system.*` ports. Platform differences belong in
  Qx Rust adapters, never in this plugin.
- `panel.render` must paint immediately, then load asynchronously.
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
- Render a second list/detail shell in iframe HTML.
- Poll at sub-second intervals from `panel.render`.
