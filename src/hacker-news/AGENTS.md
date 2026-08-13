# Hacker News — Agent Guide

## Surfaces

| Surface | Role |
|---------|------|
| **Panel** | Host Workbench latest-story list, structured detail, and comments |
| **Launcher** | The panel name is the launcher/search entry; no duplicate open command |
| **HTTP** | Public Firebase Hacker News API (`newstories` and `item`) |
| **Cache** | `context.storage.persist` stale-while-revalidate story and comment cache |

## Layout

```text
src/hacker-news/
├── AGENTS.md
├── manifest.json
├── index.js
└── README.md
```

## Invariants

1. `manifest.panel` and `export default.panel` must both remain present.
2. The panel only publishes `context.ui.mountWorkbench` data; the host owns Shell,
   list/detail navigation, Actions chrome, and Esc.
3. `newstories.json` is the source for the latest feed. Story and comment records
   are fetched from the public `item/{id}.json` endpoint.
4. Comments load when a story is selected, are bounded to protect responsiveness,
   and are cached independently from the story list.
5. Cached data is painted before a stale refresh; a failed refresh must preserve a
   usable cache instead of showing false success or deleting it.
6. Workbench actions have stable ids and unique menu keys. Do not add a global
   keyboard listener or duplicate host Enter/Esc navigation.

## Permissions

- `http` — read the public Hacker News Firebase API.
- `open-url` — open a story or Hacker News home page in the browser.
- `clipboard` — copy a story link.

## Checklist

- [ ] Bump `manifest.json` and add a matching `release-notes.json` entry.
- [ ] Run `npm run package:one -- --only=hacker-news` from `qx-plugins/`.
- [ ] Reinstall the generated package in Qx.
- [ ] Verify latest stories, stale cache, story detail, and nested comments.
- [ ] Verify browser and copy-link actions, keyboard list/detail navigation, and Esc.
- [ ] Exercise the real `newstories` and `item` API paths before publishing.

## Do not

- Do not add translation providers, API keys, or model settings to this first feed release.
- Do not parse Hacker News through a browser page or shell command.
- Do not render custom HTML/CSS chrome or a second reply list inside the plugin.
