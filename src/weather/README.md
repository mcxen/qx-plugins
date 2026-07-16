# Weather (Qx plugin)

External weather panel for Qx — current conditions + multi-day forecast.

## Features

- **Open-Meteo** (default, free, no API key)
- Optional **OpenWeatherMap** when `apiKey` is set
- Multi-location cards
- **Stale-while-revalidate** cache (`storage.persist` + host `fetch_weather_*` disk cache)
- Auto IP location when locations preference is empty

## Preferences

| Id | Meaning |
|----|---------|
| `locations` | Cities or `lat,lon`, one per line / comma-separated |
| `units` | `celsius` (default) or `fahrenheit` |
| `provider` | `open-meteo` or `openweathermap` |
| `apiKey` | OpenWeatherMap key |
| `cacheMinutes` | Freshness window (default 30) |

## Permissions

- `http` — Open-Meteo / OWM / geocoding
- `invoke:fetch_weather*` / `get_cached_weather*` — host cache (shared with legacy built-in)
- `open-url`, `notifications`

## Host note

Built-in Weather panel is **off by default** in Qx ≥ 0.5.37; install this plugin from the marketplace or Import `weather.qx-plugin`.
