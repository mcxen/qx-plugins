# Qx Plugins Marketplace — Agent Guide

> For AI agents and maintainers working in **this repo** (`mcxen/qx-plugins`).  
> Host app rules live in the Qx repo `AGENTS.md` / `public/doc/plugin-*.md`.

## Repo purpose

Ship installable **`.qx-plugin`** archives + **`index.json`** marketplace index consumed by Qx Settings → Extensions → Browse.

```text
qx-plugins/
├── AGENTS.md                 # this file
├── index.json                # marketplace catalog (generated)
├── package.json              # package:plugins script
├── scripts/package-plugins.mjs
├── src/
│   └── <plugin-id>/          # one folder per plugin
│       ├── AGENTS.md         # REQUIRED for agents — architecture + edit checklist
│       ├── manifest.json     # contract (id, permissions, commands, panel?)
│       ├── index.js          # ESM: export default { commands, panel? }
│       ├── README.md         # human docs
│       └── icon.*            # optional
└── <plugin-id>.qx-plugin     # zip at repo root (generated)
```

## Plugin development folder system

### 1. Create

```bash
mkdir -p src/my-plugin
# copy AGENTS.md template from src/weather/AGENTS.md or pomodoro-island/AGENTS.md
# write manifest.json + index.js + README.md
```

### 2. Contract (must stay true)

| Piece | Rule |
|-------|------|
| `manifest.id` | Stable kebab-case; equals install dir name |
| `manifest.entry` | Usually `index.js` |
| `manifest.permissions` | Explicit whitelist (`http`, `island`, `invoke:…`, …) |
| `manifest.commands` | Search/launcher actions |
| **`manifest.panel`** | **Required** if users open the plugin as a tab/panel. Missing → host **"Panel not registered"** |
| `export default.panel` | Must implement `render(container, context)` + optional `destroy` when panel is declared |
| `AGENTS.md` | Ship inside package — how to extend without breaking host |

### 3. Package

```bash
npm run package:plugins   # zips every src/* with manifest.json → *.qx-plugin + index.json
```

All files under `src/<id>/` are packed (including **`AGENTS.md`**).

### 4. Install locally (dev)

```bash
unzip -o my-plugin.qx-plugin -d ~/.qx/plugins/my-plugin
# or Settings → Extensions → Import
```

Restart / reload plugins in Qx, open panel, verify no registration errors.

### 5. Publish

```bash
git add src/<id> index.json <id>.qx-plugin
git commit -m "feat(marketplace): <id> x.y.z"
git push origin main   # use system proxy when needed
```

Raw URLs: `https://raw.githubusercontent.com/mcxen/qx-plugins/main/<id>.qx-plugin`

## Host integration map

```text
manifest.panel ──► loadPlugin registers RegisteredPanel
export panel.render ──► iframe qx:renderPanel
commands[].run ──► iframe qx:runCommand
context.* ──► postMessage RPC (http, storage, island, invoke, …)
```

Built-in React modules (`builtin:weather`) are **not** this package. Prefer marketplace plugins for Weather / V2EX / Pomodoro.

## Common failures

| Symptom | Cause | Fix |
|---------|--------|-----|
| **Panel not registered** | No `manifest.panel` (or panel only in JS) | Add both `manifest.panel` and `export default.panel` |
| Render timed out | Long await in `panel.render` | Paint UI first; load data async |
| Permission denied | Missing permission string | Add to `manifest.permissions` |
| Island silent | Missing `island` permission / API | Declare `island`; catch dismiss/update errors |
| Stale after edit | Old files in `~/.qx/plugins` | Re-unzip package over install dir |

## Per-plugin AGENTS.md (template)

Every `src/<id>/AGENTS.md` should cover:

1. **Surfaces** — commands / panel / island / storage  
2. **Layout** — files and what ships  
3. **Invariants** — host contracts (especially panel registration)  
4. **Permissions** — why each is needed  
5. **Edit checklist** — version bump, package, reinstall, smoke test  
6. **Do not** — anti-patterns  

See:

- `src/pomodoro-island/AGENTS.md`
- `src/weather/AGENTS.md`
- `src/v2ex/AGENTS.md`

## Agent working rules

- Prefer **port APIs** (`context.http`, `context.storage.persist`, `context.island`) over inventing host commands.
- Keep **one plugin = one directory**; do not nest multiple plugins in one folder.
- After logic changes: **package** + **local install** before claiming fixed.
- Do not force-push marketplace history; rebase/merge cleanly when `index.json` conflicts.
- Use system proxy for `git push` / `npm` when the environment requires it.
