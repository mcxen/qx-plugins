/**
 * Weather marketplace plugin.
 * Data: host invoke (shared disk cache) → Open-Meteo/OWM via context.http.
 * UI cache: storage.persist SWR for instant panel reopen.
 */

const CACHE_KEY = "weather.bundle.v1";
const DEFAULT_TTL_MS = 30 * 60 * 1000;
const STALE_MS = 12 * 60 * 60 * 1000;

const STYLES = `
<style>
  .wx-root { display:flex; flex-direction:column; height:100%; font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--qx-text-primary,#e8e8e8); margin:0; }
  .wx-bar { display:flex; align-items:center; gap:8px; padding:8px 12px; border-bottom:1px solid var(--qx-border-1,#2a2a2a); flex-shrink:0; }
  .wx-title { font-weight:600; font-size:14px; flex:1; }
  .wx-btn { padding:4px 12px; border-radius:6px; border:1px solid var(--qx-border-1,#333); background:var(--qx-bg-component-2,#1c1c1c); color:var(--qx-text-primary); cursor:pointer; font:inherit; font-size:12px; }
  .wx-btn:hover { background:var(--qx-bg-component-3,#262626); }
  .wx-btn:disabled { opacity:0.5; cursor:default; }
  .wx-btn.primary { background:var(--qx-accent,#5b9aff); border-color:var(--qx-accent,#5b9aff); color:#fff; }
  .wx-status { padding:4px 12px; font-size:11px; color:var(--qx-text-tertiary,#777); flex-shrink:0; }
  .wx-status.stale { color:var(--qx-accent,#5b9aff); }
  .wx-status.err { color:var(--qx-danger,#e55); }
  .wx-body { flex:1; min-height:0; overflow:auto; padding:12px; }
  .wx-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:12px; }
  .wx-card { border:1px solid var(--qx-border-1,#2a2a2a); border-radius:12px; background:linear-gradient(160deg,var(--qx-bg-component-2,#1a1a1a),var(--qx-bg-component-1,#121212)); padding:14px 16px; }
  .wx-loc { font-size:12px; color:var(--qx-text-tertiary,#888); margin-bottom:4px; }
  .wx-temp { font-size:40px; font-weight:300; letter-spacing:-1px; line-height:1.1; }
  .wx-cond { font-size:13px; color:var(--qx-text-secondary,#aaa); text-transform:capitalize; margin:4px 0 10px; }
  .wx-meta { display:flex; flex-wrap:wrap; gap:10px; font-size:11px; color:var(--qx-text-tertiary,#777); margin-bottom:12px; }
  .wx-days { display:flex; flex-direction:column; gap:6px; }
  .wx-day { display:flex; align-items:center; gap:8px; font-size:12px; }
  .wx-day-label { width:36px; color:var(--qx-text-tertiary,#888); }
  .wx-day-cond { flex:1; color:var(--qx-text-secondary,#aaa); text-transform:capitalize; }
  .wx-day-range { color:var(--qx-text-primary); font-variant-numeric:tabular-nums; }
  .wx-empty { display:flex; align-items:center; justify-content:center; height:100%; color:var(--qx-text-tertiary,#666); text-align:center; padding:24px; line-height:1.5; }
  .wx-emoji { font-size:28px; margin-bottom:6px; }
</style>
`;

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function cToF(c) {
  return Math.round((c * 9) / 5 + 32);
}

function toUnit(c, units) {
  return units === "fahrenheit" ? cToF(c) : Math.round(c);
}

function unitSymbol(units) {
  return units === "fahrenheit" ? "°F" : "°C";
}

function mapWmo(code, isDay = true) {
  const n = Number(code);
  if (n === 0) return isDay ? "clear" : "clear-night";
  if (n === 1 || n === 2) return isDay ? "partly-cloudy" : "partly-cloudy-night";
  if (n === 3) return "cloudy";
  if (n === 45 || n === 48) return "fog";
  if (n >= 51 && n <= 67) return "rain";
  if (n >= 71 && n <= 77) return "snow";
  if (n >= 80 && n <= 82) return "rain";
  if (n >= 85 && n <= 86) return "snow";
  if (n >= 95) return "thunderstorm";
  return "cloudy";
}

function mapOwm(id) {
  const n = Number(id);
  if (n >= 200 && n < 300) return "thunderstorm";
  if (n >= 300 && n < 600) return "rain";
  if (n >= 600 && n < 700) return "snow";
  if (n >= 700 && n < 800) return "fog";
  if (n === 800) return "clear";
  if (n === 801 || n === 802) return "partly-cloudy";
  return "cloudy";
}

function conditionLabel(code) {
  return String(code || "cloudy").replace(/-/g, " ");
}

function conditionEmoji(code) {
  const c = String(code || "");
  if (c.includes("thunder")) return "⛈️";
  if (c.includes("snow")) return "❄️";
  if (c.includes("rain") || c.includes("drizzle")) return "🌧️";
  if (c.includes("fog")) return "🌫️";
  if (c.includes("partly")) return "⛅";
  if (c.includes("cloud")) return "☁️";
  if (c.includes("night")) return "🌙";
  if (c.includes("clear")) return "☀️";
  return "🌤️";
}

function dayLabel(isoDate) {
  try {
    const d = new Date(`${isoDate}T12:00:00`);
    return d.toLocaleDateString(undefined, { weekday: "short" });
  } catch {
    return isoDate?.slice(5) || "";
  }
}

function ageLabel(ts) {
  if (!ts) return "";
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

async function pref(context, id, fallback = "") {
  try {
    const v = await context.getPreference(id);
    if (v == null || v === "") return fallback;
    return String(v);
  } catch {
    return fallback;
  }
}

function parseLocations(raw) {
  return Array.from(
    new Set(
      String(raw || "")
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );
}

async function httpJson(context, url) {
  const resp = await context.http.fetch(url, { method: "GET", timeoutMs: 15000 });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  return resp.json();
}

async function geocode(context, query) {
  const q = query.trim();
  if (!q) return null;
  const m = q.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (m) {
    return {
      name: q,
      latitude: Number(m[1]),
      longitude: Number(m[2]),
      country: "",
    };
  }
  const data = await httpJson(
    context,
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`,
  );
  const hit = data?.results?.[0];
  if (!hit) throw new Error(`Location not found: ${q}`);
  return {
    name: hit.name,
    latitude: hit.latitude,
    longitude: hit.longitude,
    country: hit.country || "",
  };
}

async function autoLocate(context) {
  try {
    const loc = await context.invoke("detect_location");
    if (loc?.latitude != null) {
      return {
        name: loc.city || "Current location",
        latitude: loc.latitude,
        longitude: loc.longitude,
        country: loc.country || "",
      };
    }
  } catch {
    /* fall through */
  }
  // Public IP geo fallback
  try {
    const data = await httpJson(context, "https://ipapi.co/json/");
    if (data?.latitude != null) {
      return {
        name: data.city || data.region || "Near you",
        latitude: data.latitude,
        longitude: data.longitude,
        country: data.country_name || data.country || "",
      };
    }
  } catch {
    /* ignore */
  }
  throw new Error("Could not detect location. Set a city in plugin preferences.");
}

async function fetchOpenMeteo(context, location) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}`
    + `&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m,is_day`
    + `&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=7`;
  const data = await httpJson(context, url);
  const isDay = data.current?.is_day === 1;
  const current = {
    temperature: data.current.temperature_2m,
    tempMin: data.daily?.temperature_2m_min?.[0] ?? data.current.temperature_2m,
    tempMax: data.daily?.temperature_2m_max?.[0] ?? data.current.temperature_2m,
    conditionCode: mapWmo(data.current.weather_code, isDay),
    humidity: data.current.relative_humidity_2m,
    windSpeed: data.current.wind_speed_10m,
  };
  const forecast = (data.daily?.time || [])
    .slice(1)
    .map((date, i) => ({
      label: dayLabel(date),
      tempMin: data.daily.temperature_2m_min[i + 1],
      tempMax: data.daily.temperature_2m_max[i + 1],
      conditionCode: mapWmo(data.daily.weather_code[i + 1], true),
    }));
  return {
    location,
    current,
    forecast,
    updatedAt: new Date().toISOString(),
    provider: "open-meteo",
  };
}

async function fetchOwm(context, location, apiKey) {
  const url =
    `https://api.openweathermap.org/data/3.0/onecall?lat=${location.latitude}&lon=${location.longitude}`
    + `&appid=${encodeURIComponent(apiKey)}&units=metric&exclude=minutely,hourly,alerts`;
  const data = await httpJson(context, url);
  const owmCode = data.current?.weather?.[0]?.id ?? 800;
  const current = {
    temperature: data.current.temp,
    tempMin: data.daily?.[0]?.temp?.min ?? data.current.temp,
    tempMax: data.daily?.[0]?.temp?.max ?? data.current.temp,
    conditionCode: mapOwm(owmCode),
    humidity: data.current.humidity,
    windSpeed: data.current.wind_speed,
  };
  const forecast = (data.daily || []).slice(1, 7).map((d) => ({
    label: new Date(d.dt * 1000).toLocaleDateString(undefined, { weekday: "short" }),
    tempMin: d.temp.min,
    tempMax: d.temp.max,
    conditionCode: mapOwm(d.weather?.[0]?.id ?? 800),
  }));
  return {
    location,
    current,
    forecast,
    updatedAt: new Date().toISOString(),
    provider: "openweathermap",
  };
}

function normalizeHostPayload(data) {
  if (!data) return null;
  // Host uses camelCase serde already
  return {
    location: {
      name: data.location?.name || "",
      latitude: data.location?.latitude ?? 0,
      longitude: data.location?.longitude ?? 0,
      country: data.location?.country || "",
    },
    current: {
      temperature: data.current?.temperature ?? 0,
      tempMin: data.current?.tempMin ?? data.current?.temp_min ?? 0,
      tempMax: data.current?.tempMax ?? data.current?.temp_max ?? 0,
      conditionCode: data.current?.conditionCode || data.current?.condition_code || "cloudy",
      humidity: data.current?.humidity ?? 0,
      windSpeed: data.current?.windSpeed ?? data.current?.wind_speed ?? 0,
    },
    forecast: (data.forecast || []).map((d) => ({
      label: d.label,
      tempMin: d.tempMin ?? d.temp_min ?? 0,
      tempMax: d.tempMax ?? d.temp_max ?? 0,
      conditionCode: d.conditionCode || d.condition_code || "cloudy",
    })),
    updatedAt: data.updatedAt || data.updated_at || new Date().toISOString(),
    provider: data.provider || "host",
  };
}

async function fetchOne(context, locationQuery, provider, apiKey) {
  // 1) Host path (shared disk cache + settings provider if matching)
  try {
    if (locationQuery) {
      const data = await context.invoke("fetch_weather_for_location", { location: locationQuery });
      const n = normalizeHostPayload(data);
      if (n) return n;
    } else {
      const data = await context.invoke("fetch_weather");
      const n = normalizeHostPayload(data);
      if (n) return n;
    }
  } catch {
    /* fall through to pure HTTP */
  }

  // 2) Plugin-owned HTTP
  const location = locationQuery
    ? await geocode(context, locationQuery)
    : await autoLocate(context);
  if (provider === "openweathermap" && apiKey) {
    try {
      return await fetchOwm(context, location, apiKey);
    } catch {
      // fall back free provider
    }
  }
  return fetchOpenMeteo(context, location);
}

async function storageGet(context, key) {
  try {
    if (context.storage?.persist?.get) return await context.storage.persist.get(key);
    if (context.storage?.get) return await context.storage.get(key);
  } catch {
    /* ignore */
  }
  return null;
}

async function storageSet(context, key, value) {
  try {
    if (context.storage?.persist?.set) return await context.storage.persist.set(key, value);
    if (context.storage?.set) return await context.storage.set(key, value);
  } catch {
    /* ignore */
  }
}

async function loadBundle(context, { force = false } = {}) {
  const locationsRaw = await pref(context, "locations", "");
  const units = (await pref(context, "units", "celsius")).toLowerCase().includes("f")
    ? "fahrenheit"
    : "celsius";
  const provider = (await pref(context, "provider", "open-meteo")).toLowerCase().includes("openweather")
    ? "openweathermap"
    : "open-meteo";
  const apiKey = await pref(context, "apiKey", "");
  const cacheMinutes = Number(await pref(context, "cacheMinutes", "30"));
  const ttlMs = Number.isFinite(cacheMinutes) && cacheMinutes > 0
    ? Math.min(cacheMinutes, 180) * 60 * 1000
    : DEFAULT_TTL_MS;

  const locations = parseLocations(locationsRaw);
  const queries = locations.length > 0 ? locations : [""];

  const cached = await storageGet(context, CACHE_KEY);
  const age = cached?.savedAt ? Date.now() - cached.savedAt : Infinity;
  const usable = cached?.items?.length && age <= STALE_MS;
  const fresh = age <= ttlMs;

  if (usable && !force) {
    if (!fresh) {
      Promise.resolve()
        .then(async () => {
          const items = [];
          for (const q of queries) {
            try {
              items.push(await fetchOne(context, q, provider, apiKey));
            } catch {
              /* keep going */
            }
          }
          if (items.length) await storageSet(context, CACHE_KEY, { items, units, savedAt: Date.now() });
        })
        .catch(() => {});
    }
    return {
      items: cached.items,
      units: cached.units || units,
      fromCache: true,
      refreshing: !fresh,
      savedAt: cached.savedAt,
    };
  }

  const items = [];
  const errors = [];
  for (const q of queries) {
    try {
      items.push(await fetchOne(context, q, provider, apiKey));
    } catch (err) {
      errors.push(String(err));
    }
  }
  if (items.length === 0) {
    if (usable) {
      return {
        items: cached.items,
        units: cached.units || units,
        fromCache: true,
        refreshing: false,
        savedAt: cached.savedAt,
        error: errors[0],
      };
    }
    throw new Error(errors[0] || "Weather fetch failed");
  }

  await storageSet(context, CACHE_KEY, { items, units, savedAt: Date.now() });
  return {
    items,
    units,
    fromCache: false,
    refreshing: false,
    savedAt: Date.now(),
    error: errors.length ? errors[0] : null,
  };
}

function renderCard(weather, units) {
  const u = unitSymbol(units);
  const cur = weather.current;
  const loc = weather.location;
  const days = (weather.forecast || []).slice(0, 6)
    .map((d) => `
      <div class="wx-day">
        <span class="wx-day-label">${escapeHtml(d.label)}</span>
        <span class="wx-day-cond">${escapeHtml(conditionEmoji(d.conditionCode))} ${escapeHtml(conditionLabel(d.conditionCode))}</span>
        <span class="wx-day-range">${toUnit(d.tempMin, units)}–${toUnit(d.tempMax, units)}${u}</span>
      </div>
    `)
    .join("");

  return `
    <div class="wx-card">
      <div class="wx-loc">${escapeHtml(loc.name)}${loc.country ? ` · ${escapeHtml(loc.country)}` : ""}</div>
      <div class="wx-emoji">${conditionEmoji(cur.conditionCode)}</div>
      <div class="wx-temp">${toUnit(cur.temperature, units)}${u}</div>
      <div class="wx-cond">${escapeHtml(conditionLabel(cur.conditionCode))}</div>
      <div class="wx-meta">
        <span>H ${toUnit(cur.tempMax, units)}${u}</span>
        <span>L ${toUnit(cur.tempMin, units)}${u}</span>
        <span>💧 ${cur.humidity ?? "—"}%</span>
        <span>🌬 ${Math.round(cur.windSpeed ?? 0)} m/s</span>
      </div>
      <div class="wx-days">${days}</div>
    </div>
  `;
}

function renderPanel(container, context) {
  let destroyed = false;
  container.innerHTML = STYLES + `<div class="wx-root"></div>`;
  const root = container.querySelector(".wx-root");

  root.innerHTML = `
    <div class="wx-bar">
      <div class="wx-title">Weather</div>
      <button class="wx-btn" type="button" data-act="refresh">Refresh</button>
    </div>
    <div class="wx-status">Loading…</div>
    <div class="wx-body"><div class="wx-empty">Loading weather…</div></div>
  `;

  const statusEl = root.querySelector(".wx-status");
  const bodyEl = root.querySelector(".wx-body");
  const refreshBtn = root.querySelector("[data-act=refresh]");

  function setStatus(text, kind = "") {
    statusEl.className = "wx-status" + (kind ? ` ${kind}` : "");
    statusEl.textContent = text;
  }

  async function reload({ force = false } = {}) {
    if (destroyed) return;
    refreshBtn.disabled = true;
    if (force) setStatus("Refreshing…");
    try {
      const result = await loadBundle(context, { force });
      if (destroyed) return;
      const { items, units } = result;
      bodyEl.innerHTML = `<div class="wx-grid">${items.map((w) => renderCard(w, units)).join("")}</div>`;
      let msg = `${items.length} location${items.length === 1 ? "" : "s"}`;
      if (result.fromCache) {
        msg += ` · cached ${ageLabel(result.savedAt)}`;
        if (result.refreshing) msg += " · updating…";
        setStatus(msg, result.refreshing ? "stale" : "");
      } else if (result.error) {
        setStatus(`${msg} · partial: ${result.error}`, "err");
      } else {
        setStatus(msg);
      }
    } catch (err) {
      if (destroyed) return;
      bodyEl.innerHTML = `<div class="wx-empty">${escapeHtml(String(err))}<br><br>Set cities in Settings → Extensions → Weather.</div>`;
      setStatus(String(err), "err");
    } finally {
      refreshBtn.disabled = false;
    }
  }

  refreshBtn.onclick = () => void reload({ force: true });
  void reload({ force: false });

  return () => {
    destroyed = true;
  };
}

let destroyPanel = null;

export default {
  commands: [
    {
      name: "open-weather",
      title: "Weather",
      async run(context) {
        context.showToast("Open the Weather panel from Extensions");
      },
    },
    {
      name: "refresh-weather",
      title: "Refresh Weather",
      async run(context) {
        try {
          const result = await loadBundle(context, { force: true });
          const first = result.items[0];
          if (first) {
            const u = result.units === "fahrenheit" ? "°F" : "°C";
            context.showToast(
              `${first.location.name}: ${toUnit(first.current.temperature, result.units)}${u}`,
            );
          } else {
            context.showToast("Weather refreshed");
          }
        } catch (err) {
          context.showToast(String(err).slice(0, 120));
        }
      },
    },
  ],

  panel: {
    title: "Weather",
    async render(container, context) {
      if (destroyPanel) {
        try {
          destroyPanel();
        } catch {
          /* ignore */
        }
      }
      destroyPanel = renderPanel(container, context);
    },
    destroy(container) {
      if (destroyPanel) {
        try {
          destroyPanel();
        } catch {
          /* ignore */
        }
        destroyPanel = null;
      }
      container.innerHTML = "";
    },
  },
};
