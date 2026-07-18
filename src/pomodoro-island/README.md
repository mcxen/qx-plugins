# Pomodoro Island

Pomodoro timer and reference implementation for Qx's declarative **Workbench**.

## Features

- Focus / short-break sessions (configurable minutes)
- Persistent focus/break history in the left list
- Structured current/history detail rendered by Qx on the right
- Actions rendered once by Qx (primary button, context panel, Cmd/Ctrl+K)
- Interactive island progress rendered docked or in the external floating island
- No plugin-authored CSS or panel DOM

## Workbench template (v1.4.2)

The plugin publishes business data through `context.ui.mountWorkbench(state, handlers)`.
Use it as the marketplace template for list/detail,
manifest-command Actions, persistent cross-runtime state and island projection.

The persisted `endsAt` deadline and manifest `pomodoro-heartbeat` background
command keep the timer valid after the Workbench closes, across sleep/wake and
after runtime recovery. The open panel only refreshes presentation data.

The active session is always shown as the first list item while it is running,
paused, or complete. Selecting it exposes the live remaining time and the
pause/resume/stop actions; historical sessions remain below it and keep their
own replay action.

The island publishes `countdown.endsAt` plus a host-owned `pause` / `play`
action icon. Qx renders the same live timer and compact capsule control in both
the docked and floating island without per-second plugin UI updates.

## Agent docs

See **`AGENTS.md`** in this package for architecture and maintenance checklist.

## Permissions

- `island`
- `notifications`
