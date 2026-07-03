# qx-plugins

Qx plugin marketplace index.

## Convert a Raycast Extension

Open a GitHub issue with a title that starts with `[convert]` and include a
Raycast extension tree URL in the title or body:

```text
[convert] https://github.com/raycast/extensions/tree/<commit>/extensions/bing-wallpaper
```

The `Convert Raycast Extension` workflow sparse-checks out that Raycast
extension, converts it into a Qx plugin, writes it to `src/<plugin-id>/`,
packages `<plugin-id>.qx-plugin`, updates `index.json`, pushes the result to
`main`, and comments with the raw download URL.

Converted Raycast `ActionPanel` items are rendered as compact right-side
buttons by default. Qx exposes a host preference at Settings -> Extensions ->
Installed -> Display to hide them, and the converted UI automatically hides
those buttons first when the plugin panel becomes narrow.

If an extension declares regular npm dependencies, the converter installs its
production dependencies in the temporary checkout with lifecycle scripts
disabled. React and React DOM are always resolved from the converter runtime so
converted extensions do not load a second React copy.

You can retry an issue conversion by commenting:

```text
/convert
```

## Local Conversion

```bash
npm ci
npm run convert:raycast-url -- \
  https://github.com/raycast/extensions/tree/870667fc671801a467deb7c4c7fc72992efe3820/extensions/bing-wallpaper \
  --out dist/raycast-converted \
  --package \
  --publish
```

`--publish` copies the converted plugin into `src/`, packages all plugins, and
regenerates `index.json`.

## Package Marketplace

```bash
npm run package:plugins
```

The package script scans `src/*/manifest.json`, creates one root
`<plugin-id>.qx-plugin` archive per plugin, computes each SHA-256 checksum, and
rewrites `index.json` for Qx marketplace scanning.
