# Pomodoro Island

Pomodoro timer and reference implementation for Qx's declarative **Workbench**.
Requires Qx 0.5.43 or later for the structured activity and floating open-target protocol.

## Features

- Focus / short-break sessions (configurable minutes)
- Persistent focus/break history in the left list
- Structured current/history detail rendered by Qx on the right
- Actions rendered once by Qx (primary button, context panel, Cmd/Ctrl+K)
- Interactive island progress rendered docked or in the external floating island
- No plugin-authored CSS or panel DOM

## Workbench + QxIsland template (v1.6.0)

The plugin publishes business data through `context.ui.mountWorkbench(state, handlers)`.
Use it as the marketplace template for list/detail,
manifest-command Actions, persistent cross-runtime state and island projection.

The persisted `endsAt` deadline and manifest `pomodoro-heartbeat` background
command keep the timer valid after the Workbench closes, across sleep/wake and
after runtime recovery. The open panel only refreshes presentation data.
Manifest action completion refreshes the persisted snapshot immediately; the
open countdown repaints locally and does not repeatedly read storage.

The active session is always shown as the first list item while it is running,
paused, or complete. Selecting it exposes the live remaining time and the
pause/resume/stop actions; historical sessions remain below it and keep their
own replay action.

Completion recommends the natural next phase: a completed focus session offers
**Start Short Break**, while a completed break offers **Start Focus**. Repeating
the same phase remains available from Actions instead of being the default.

The island publishes `countdown.endsAt`, host-owned `pulse` activity, and a
host-owned `pause` / `play` action icon. Qx renders the same live timer,
activity, progress overlay and compact capsule control in both the docked and
floating island without per-second plugin UI updates. Pausing removes the
activity while preserving the frozen countdown and warning tone; completion
switches to a real 100% success state.

Island business buttons, loading visuals, reduced-motion behavior, floating
compact/expand controls and duplicate-click protection all belong to Qx. The
plugin only publishes structured intent. The floating “Open Qx” control is
host-bound to `plugin:pomodoro-island`, so it returns directly to this
Workbench without the plugin passing a route.

## Agent docs

See **`AGENTS.md`** in this package for architecture and maintenance checklist.

## Permissions

- `island`
- `notifications`
