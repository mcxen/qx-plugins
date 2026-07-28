# QX Gold — Agent Guide

## Surfaces

- Workbench panel: current JD accumulated-gold price, metrics, and line chart.
- Plugin Island projection: optional current-price display controlled by `showInIsland`.
- Persist storage: bounded real price samples for the chart.

## Invariants

1. `manifest.panel` and `export default.panel` remain paired.
2. Price data must come from the live JD API or retained real samples; never simulate quotes.
3. Island is opt-in at runtime. When disabled, publish `island: null` and release the slot.
4. Island priority and placement remain host-managed; the plugin must not invent a competing surface.
5. Keep all user-visible runtime copy bilingual through the local `text()` helper.

## Permissions

- `http`: fetch the public JD gold-price endpoint.
- `island`: publish the optional Workbench Island projection.

## Edit checklist

- [ ] Bump the manifest version and add a release-notes entry.
- [ ] Run `node --check src/qxgold/index.js`.
- [ ] Run `npm run package:plugins` and verify `qxgold.qx-plugin`.
- [ ] Test both Island settings: On publishes price; Off releases it.
- [ ] Verify cached chart history remains usable when the API is unavailable.
