# Pomodoro Island

Pomodoro timer for Qx: **control panel** + search commands + external **QxIsland**.

## Features

- Focus / short-break sessions (configurable minutes)
- Pause, resume, stop
- Interactive island progress + notifications on complete
- In-app control panel (open from Extensions)

## Fix (v1.1.0)

Earlier builds only exported **commands** (island-only). Opening the plugin tab
showed **Panel not registered**. v1.1.0 adds `manifest.panel` + `panel.render`.

## Agent docs

See **`AGENTS.md`** in this package for architecture and maintenance checklist.

## Permissions

- `island`
- `notifications`
