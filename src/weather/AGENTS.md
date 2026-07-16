# Weather — Agent Guide

> Packaged with the plugin. Read before editing.

## Surfaces

| Surface | Role |
|---------|------|
| **Panel** | Multi-location cards + forecast (required) |
| **Commands** | Open / force refresh |
| **Cache** | `storage.persist` SWR + host `fetch_weather_*` when available |
| **HTTP** | Open-Meteo / geocoding / optional OpenWeatherMap |

## Layout

```text
src/weather/
├── AGENTS.md
├── manifest.json
├── index.js
└── README.md
```

## Invariants

1. `manifest.panel` + `export default.panel` always present.
2. Prefer host invoke for cache sharing; fall back to `context.http` Open-Meteo.
3. Preferences own locations/units/provider/apiKey (not Qx Settings weather page).
4. Do not block first paint on multi-city network; show cache first.

## Permissions

`http`, `open-url`, `notifications`, `invoke:fetch_weather*`, `invoke:get_cached_weather*`, `invoke:detect_location`

## Checklist

- [ ] Bump version  
- [ ] `npm run package:plugins`  
- [ ] Install to `~/.qx/plugins/weather`  
- [ ] Open panel → data or clear empty-state (not "Panel not registered")  
