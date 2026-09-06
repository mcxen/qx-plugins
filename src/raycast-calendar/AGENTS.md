# Quick Calendar — Agent Guide

- `index.source.js` owns panel lifecycle, preferences and Qx host Actions.
- `source/calendar.js` owns civil dates, lunar formatting and verified holiday data.
- `source/view.js` owns the calendar table and Markdown export. A fixed seven-day
  table cannot be expressed by the current Workbench collection ports; this
  custom content stays inside Main Area, using host theme tokens and Actions.
- `index.js` is the self-contained generated entry. Run `npm run build:calendar`
  after source changes, including before `package:one`.
- Keep ID `raycast-calendar`, panel registration and existing preference IDs.
  Preserve attribution to original author fuksman. Do not restore Raycast shims.
- Use Qx locale/clipboard/openUrl ports; no global key handlers or custom shell.
  Cleanup Actions, locale subscription and midnight-check timer on destroy;
  ignore late preference results after teardown.
- Permissions: `clipboard` for explicit copy, `open-url` for official notices.
  Calendar and lunar display are offline and need no HTTP permission.
- Add annual schedules only from checked official notices, with source URL and
  document number. No data means unknown, never an inferred work/rest schedule.
- Preserve UTC civil-date arithmetic and leap-month names; today's date is local.
- Validate known lunar boundaries, make-up weekends, cross-month holidays,
  missing years, both week starts/locales, preferences and lifecycle cleanup.
- Run `npm run smoke:calendar`, package only this plugin, inspect and install the
  archive, then verify the panel. Bump manifest/release notes on package upgrades.
