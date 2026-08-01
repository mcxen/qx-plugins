# QxGH（中文名：Github助手）

Watch **GitHub Actions** and **Releases** for public repos you pin in preferences.

**Module mode: business-only** — declarative `context.ui` Workbench with structured list/detail/actions.
**Data: public HTML only** — `github.com/.../actions` and `.../releases` (no REST API).

Repository Actions and Releases index pages are fetched concurrently. The first
usable list renders as soon as those index pages arrive; historical run
durations are enriched in the background so a slow system proxy cannot hold the
whole panel on its loading skeleton.

## Running progress

GitHub's public Actions list does not expose a real percentage. QxGH labels its
progress as estimated and calculates it from the median duration of recent runs
for the same repository and workflow. If that history is unavailable, it falls
back to repository history and finally a conservative default. The estimate is
recalculated every five seconds, never reaches 100% before GitHub reports
completion, and shows its sample basis in the detail panel.

Refreshing keeps the current list visible. A slow or failed refresh no longer
replaces usable cached runs with an empty loading screen.

## Setup

1. Install `qxgh.qx-plugin` from marketplace or local import  
2. Settings → Extensions → **QxGH**  
3. Set **Repositories** (default: `mcxen/qx`, `mcxen/qx-plugins`)

## Commands

| Command | What it does |
|---------|----------------|
| QxGH | Open panel tip |
| Refresh QxGH | Force refresh |
| QxGH CI Summary | Toast summary |
| QxGH Watch on Island | Island for in-progress run |

## Island control

When an active run is using QxIsland, open the QxGH Actions menu and choose
**Hide Active Run from Island**. QxGH dismisses its Island session immediately
and keeps it hidden across panel polling/refreshes for the current panel session.
Use **Show Active Run on Island** to restore it.
When no run is active, this toggle is omitted instead of presenting an action
that cannot change anything.

Every QxGH business action has a single-letter Actions key: open `Cmd/Ctrl+K`,
then press `O` to open the selected GitHub item, `R` to refresh, `P` to open the
repository page, or `I` to show/hide the active run on Island. Enter remains the
host-owned list/detail navigation action.

## Tray deployment status

Enable **Show active deployment in tray** in the QxGH extension preferences.
After QxGH refreshes, opening the Qx system tray menu shows a native **QxGH ·
repository** submenu. It includes the estimated deployment percentage and
elapsed/expected duration, plus **Refresh deployments** and **Show CI summary**.
Status rows are intentionally non-clickable so macOS and Windows retain their
own accessibility, contrast, and menu styling.

## Permissions

`http` · `open-url` · `notifications` · `island` · `tray`
