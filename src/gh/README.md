# GitHub Actions (gh)

Watch **GitHub Actions** workflow runs and **Releases** for repos you pin in preferences.

**Module mode: business-only** — UI is the host `context.ui` workbench.  
**Data: public HTML only** — loads `github.com/.../actions` and `.../releases` pages (no REST API, no token).

## Features

- Multi-repo list (`owner/repo`, one per line) — **public repos**
- Actions tab: status / conclusion / duration / title (from page `aria-label`)
- Releases tab: tags + latest
- Auto-poll while the panel is open
- Optional **Qx Island** when the page shows an in-progress run
- SWR cache so reopen is instant
- Open the same pages/runs in the browser

## Setup

1. Install from marketplace or local `.qx-plugin`
2. **Settings → Extensions → GitHub Actions**
3. Set **Repositories** (default includes `mcxen/qx`)

Private repositories are not supported in HTML mode.

## Commands

| Command | What it does |
|---------|----------------|
| GitHub Actions | Open panel tip / refresh path |
| Refresh GitHub Status | Force network refresh |
| GitHub CI Summary | Toast latest run state |
| Watch CI on Island | Push in-progress run to island |

## Permissions

`http` · `open-url` · `notifications` · `island`
