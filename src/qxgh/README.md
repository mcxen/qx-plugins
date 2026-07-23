# QxGH

Watch **GitHub Actions** and **Releases** for public repos you pin in preferences.

**Module mode: business-only** — declarative `context.ui` Workbench with structured list/detail/actions.
**Data: public HTML only** — `github.com/.../actions` and `.../releases` (no REST API).

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

## Permissions

`http` · `open-url` · `notifications` · `island`
