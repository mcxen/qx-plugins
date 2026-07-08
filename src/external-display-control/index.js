const M1DDC_URL = "https://github.com/waydabber/m1ddc";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function clampPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function invoke(context, cmd, args = {}) {
  return context.invoke(cmd, args);
}

const ICONS = {
  activity: [
    '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
  ],
  contrast: [
    '<circle cx="12" cy="12" r="10"/>',
    '<path d="M12 18a6 6 0 0 0 0-12v12z"/>',
  ],
  externalLink: [
    '<path d="M15 3h6v6"/>',
    '<path d="M10 14 21 3"/>',
    '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  ],
  github: [
    '<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/>',
    '<path d="M9 18c-4.51 2-5-2-7-2"/>',
  ],
  monitor: [
    '<rect width="20" height="14" x="2" y="3" rx="2"/>',
    '<line x1="8" x2="16" y1="21" y2="21"/>',
    '<line x1="12" x2="12" y1="17" y2="21"/>',
  ],
  refreshCw: [
    '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>',
    '<path d="M21 3v5h-5"/>',
    '<path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>',
    '<path d="M8 16H3v5"/>',
  ],
  sliders: [
    '<line x1="21" x2="14" y1="4" y2="4"/>',
    '<line x1="10" x2="3" y1="4" y2="4"/>',
    '<line x1="21" x2="12" y1="12" y2="12"/>',
    '<line x1="8" x2="3" y1="12" y2="12"/>',
    '<line x1="21" x2="16" y1="20" y2="20"/>',
    '<line x1="12" x2="3" y1="20" y2="20"/>',
    '<line x1="14" x2="14" y1="2" y2="6"/>',
    '<line x1="8" x2="8" y1="10" y2="14"/>',
    '<line x1="16" x2="16" y1="18" y2="22"/>',
  ],
  sun: [
    '<circle cx="12" cy="12" r="4"/>',
    '<path d="M12 2v2"/>',
    '<path d="M12 20v2"/>',
    '<path d="m4.93 4.93 1.41 1.41"/>',
    '<path d="m17.66 17.66 1.41 1.41"/>',
    '<path d="M2 12h2"/>',
    '<path d="M20 12h2"/>',
    '<path d="m6.34 17.66-1.41 1.41"/>',
    '<path d="m19.07 4.93-1.41 1.41"/>',
  ],
  volume2: [
    '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>',
    '<path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>',
    '<path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
  ],
};

function icon(name, className = "") {
  return `<svg class="lucide ${className}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name].join("")}</svg>`;
}

const STYLES = `
  <style>
    @keyframes display-spin { to { transform: rotate(360deg); } }
    @keyframes display-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .42; } }
    .display-root { display:flex; flex-direction:column; height:100%; min-height:0; color:var(--foreground,var(--qx-text-primary)); background:transparent; font:13px -apple-system,BlinkMacSystemFont,sans-serif; }
    .display-topbar { display:flex; align-items:center; gap:8px; padding:8px 10px; border-bottom:1px solid var(--border,var(--qx-border-1)); }
    .display-brand { display:flex; align-items:center; gap:8px; min-width:0; font-weight:700; white-space:nowrap; }
    .display-brand .lucide { color:var(--primary,var(--qx-accent)); }
    .display-status { flex:1; min-width:0; color:var(--muted-foreground,var(--qx-text-tertiary)); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .display-button { display:inline-flex; align-items:center; justify-content:center; gap:6px; height:30px; padding:0 10px; border:1px solid var(--border,var(--qx-border-1)); border-radius:var(--radius,var(--qx-control-radius)); background:var(--secondary,var(--qx-bg-component-2)); color:var(--secondary-foreground,var(--qx-text-primary)); font:inherit; cursor:pointer; white-space:nowrap; -webkit-app-region:no-drag; }
    .display-button:hover { background:var(--accent,var(--qx-bg-component-3)); color:var(--accent-foreground,var(--qx-text-primary)); }
    .display-button:focus-visible { outline:2px solid var(--ring,var(--qx-accent)); outline-offset:2px; }
    .display-button.primary { background:var(--primary,var(--qx-accent)); color:var(--primary-foreground); border-color:var(--primary,var(--qx-accent)); }
    .display-button.icon-only { width:30px; padding:0; }
    .display-button[disabled] { opacity:.62; cursor:default; }
    .display-button.is-loading .lucide { animation:display-spin .9s linear infinite; }
    .display-body { flex:1; min-height:0; overflow:auto; padding:10px; display:flex; flex-direction:column; gap:10px; }
    .display-empty { margin:auto; max-width:560px; padding:18px; border:1px solid var(--border,var(--qx-border-1)); border-radius:8px; background:var(--card,var(--qx-bg-component-1)); color:var(--muted-foreground,var(--qx-text-secondary)); line-height:1.5; }
    .display-empty-title { display:flex; align-items:center; gap:8px; margin:0 0 8px; color:var(--card-foreground,var(--qx-text-primary)); font-size:16px; font-weight:700; }
    .display-empty-title .lucide { color:var(--primary,var(--qx-accent)); animation:display-pulse 1.8s ease-in-out infinite; }
    .display-install-actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }
    .display-card { border:1px solid var(--border,var(--qx-border-1)); border-radius:8px; background:var(--card,var(--qx-bg-component-1)); overflow:hidden; }
    .display-card-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; padding:10px 12px; border-bottom:1px solid var(--border,var(--qx-border-1)); }
    .display-card-title { display:flex; align-items:center; gap:8px; min-width:0; }
    .display-card-icon { width:30px; height:30px; border-radius:var(--radius,var(--qx-control-radius)); display:flex; align-items:center; justify-content:center; background:var(--secondary,var(--qx-bg-component-2)); color:var(--primary,var(--qx-accent)); flex:0 0 auto; }
    .display-name { font-size:14px; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .display-meta { color:var(--muted-foreground,var(--qx-text-tertiary)); font-size:12px; margin-top:2px; }
    .display-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:8px; padding:10px 12px 0; }
    .display-stat { border:1px solid var(--border,var(--qx-border-1)); border-radius:var(--radius,var(--qx-control-radius)); padding:8px; background:var(--secondary,var(--qx-bg-component-2)); }
    .display-stat-label { display:flex; align-items:center; gap:6px; color:var(--muted-foreground,var(--qx-text-tertiary)); font-size:11px; text-transform:uppercase; letter-spacing:.06em; }
    .display-stat-value { margin-top:4px; font-size:18px; font-weight:700; }
    .display-control { padding:12px; border-top:1px solid var(--border,var(--qx-border-1)); }
    .display-control-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px; }
    .display-control-title { display:flex; align-items:center; gap:6px; font-weight:650; }
    .display-control-value { color:var(--muted-foreground,var(--qx-text-secondary)); }
    .display-control-row { display:grid; grid-template-columns:auto auto minmax(120px,1fr) auto auto; gap:6px; align-items:center; }
    .display-step { min-width:34px; padding:0 8px; font-variant-numeric:tabular-nums; }
    .display-track { position:relative; height:20px; border-radius:999px; background:var(--secondary,var(--qx-bg-component-2)); border:1px solid var(--border,var(--qx-border-1)); cursor:pointer; overflow:hidden; }
    .display-track:focus-visible { outline:2px solid var(--ring,var(--qx-accent)); outline-offset:2px; }
    .display-fill { position:absolute; inset:0 auto 0 0; width:0; background:var(--primary,var(--qx-accent)); opacity:.22; border-right:1px solid var(--primary,var(--qx-accent)); }
    .display-thumb { position:absolute; top:50%; width:12px; height:12px; border-radius:999px; transform:translate(-50%,-50%); background:var(--primary,var(--qx-accent)); box-shadow:0 0 0 2px var(--card,var(--qx-bg-component-1)); }
    .display-raw { margin:10px 12px 12px; padding:8px; border-radius:var(--radius,var(--qx-control-radius)); border:1px solid var(--border,var(--qx-border-1)); background:var(--muted,var(--qx-bg-component-2)); color:var(--muted-foreground,var(--qx-text-tertiary)); font:11px ui-monospace,SFMono-Regular,Menlo,monospace; white-space:pre-wrap; max-height:140px; overflow:auto; }
    .display-error { color:var(--destructive,var(--qx-danger)); }
    @media (max-width: 560px) {
      .display-control-row { grid-template-columns:auto auto auto auto; }
      .display-track { grid-column:1 / -1; grid-row:1; }
      .display-status { display:none; }
      .display-button span { display:none; }
    }
  </style>
`;

function controlValue(display, key) {
  const value = display[key];
  if (!value) return null;
  return clampPercent(value.current);
}

function button(label, iconName, className = "") {
  const element = document.createElement("button");
  element.type = "button";
  element.className = `display-button ${className}`.trim();
  element.innerHTML = `${iconName ? icon(iconName) : ""}<span>${escapeHtml(label)}</span>`;
  return element;
}

function renderControl(parent, state, display, key, label, iconName, refresh) {
  const value = controlValue(display, key);
  if (value === null) return;

  const wrap = document.createElement("div");
  wrap.className = "display-control";
  wrap.innerHTML = `
    <div class="display-control-head">
      <div class="display-control-title">${icon(iconName)}${escapeHtml(label)}</div>
      <div class="display-control-value">${value}%</div>
    </div>
  `;

  const row = document.createElement("div");
  row.className = "display-control-row";

  const applyValue = async (next) => {
    const valueToSet = clampPercent(next);
    state.status.textContent = `Setting ${label.toLowerCase()}...`;
    state.loading = true;
    state.refreshButton.classList.add("is-loading");
    try {
      await invoke(state.context, "qx_external_displays_set_control", {
        displayId: display.id,
        control: key,
        value: valueToSet,
      });
      state.status.textContent = `${label} set to ${valueToSet}%`;
      await refresh();
    } catch (error) {
      state.status.innerHTML = `<span class="display-error">${escapeHtml(String(error))}</span>`;
    } finally {
      state.loading = false;
      state.refreshButton.classList.remove("is-loading");
    }
  };

  [
    [-10, null],
    [-1, null],
  ].forEach(([step]) => {
    const stepButton = button(String(step), null, "display-step");
    stepButton.onclick = () => applyValue(value + step);
    row.appendChild(stepButton);
  });

  const track = document.createElement("div");
  track.className = "display-track";
  track.setAttribute("role", "slider");
  track.setAttribute("aria-label", label);
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", "100");
  track.setAttribute("aria-valuenow", String(value));
  track.tabIndex = 0;
  track.innerHTML = `<div class="display-fill" style="width:${value}%"></div><div class="display-thumb" style="left:${value}%"></div>`;
  track.onclick = (event) => {
    const rect = track.getBoundingClientRect();
    applyValue(((event.clientX - rect.left) / rect.width) * 100);
  };
  track.onkeydown = (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      applyValue(value - 1);
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      applyValue(value + 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      applyValue(0);
    } else if (event.key === "End") {
      event.preventDefault();
      applyValue(100);
    }
  };
  row.appendChild(track);

  [
    [1, "+1"],
    [10, "+10"],
  ].forEach(([step, labelText]) => {
    const stepButton = button(labelText, null, "display-step");
    stepButton.onclick = () => applyValue(value + step);
    row.appendChild(stepButton);
  });

  wrap.appendChild(row);
  parent.appendChild(wrap);
}

function stat(label, value, iconName) {
  return `
    <div class="display-stat">
      <div class="display-stat-label">${icon(iconName)}${escapeHtml(label)}</div>
      <div class="display-stat-value">${value === null ? "N/A" : `${escapeHtml(value)}%`}</div>
    </div>
  `;
}

function renderDisplay(body, state, display, refresh) {
  const card = document.createElement("section");
  card.className = "display-card";
  const brightness = controlValue(display, "brightness");
  const contrast = controlValue(display, "contrast");
  const volume = controlValue(display, "volume");

  card.innerHTML = `
    <div class="display-card-head">
      <div class="display-card-title">
        <div class="display-card-icon">${icon("monitor")}</div>
        <div>
          <div class="display-name">${escapeHtml(display.name)}</div>
          <div class="display-meta">DDC display ${escapeHtml(display.id)} · ${escapeHtml(state.driver?.label || "driver")}</div>
        </div>
      </div>
    </div>
    <div class="display-grid">
      ${stat("Brightness", brightness, "sun")}
      ${stat("Contrast", contrast, "contrast")}
      ${stat("Volume", volume, "volume2")}
    </div>
  `;

  renderControl(card, state, display, "brightness", "Brightness", "sun", refresh);
  renderControl(card, state, display, "contrast", "Contrast", "contrast", refresh);
  renderControl(card, state, display, "volume", "Volume", "volume2", refresh);

  const raw = document.createElement("pre");
  raw.className = "display-raw";
  raw.textContent = display.raw || "No raw display details returned by the DDC driver.";
  card.appendChild(raw);
  body.appendChild(card);
}

function renderEmpty(body, state, message) {
  body.innerHTML = `
    <div class="display-empty">
      <div class="display-empty-title">${icon("activity")}External display DDC/CI is not ready</div>
      <div>${escapeHtml(message)}</div>
      <div style="margin-top:10px;">Install a compatible open-source CLI and make sure the display, cable, hub, and monitor settings support DDC/CI.</div>
      <div class="display-install-actions"></div>
    </div>
  `;
  const actions = body.querySelector(".display-install-actions");
  const installDriver = async (driver, buttonElement) => {
    if (state.loading) return;
    state.loading = true;
    buttonElement.disabled = true;
    buttonElement.classList.add("is-loading");
    state.status.textContent = `Installing ${driver} with Homebrew...`;
    try {
      await invoke(state.context, "qx_external_displays_install_driver", {
        req: { driver },
      });
      state.status.textContent = `${driver} installed. Detecting displays...`;
      state.loading = false;
      await state.refresh();
    } catch (error) {
      state.status.innerHTML = `<span class="display-error">${escapeHtml(String(error))}</span>`;
    } finally {
      state.loading = false;
      buttonElement.disabled = false;
      buttonElement.classList.remove("is-loading");
    }
  };
  const m1 = button("Install m1ddc", "github", "primary");
  const ddcctl = button("Install ddcctl", "externalLink");
  m1.onclick = () => installDriver("m1ddc", m1);
  ddcctl.onclick = () => installDriver("ddcctl", ddcctl);
  actions.append(m1, ddcctl);
}

function renderPanel(container, context) {
  const state = { context, driver: null, status: null, refreshButton: null, loading: false, refresh: null };
  container.innerHTML = STYLES + `
    <div class="display-root">
      <div class="display-topbar">
        <div class="display-brand">${icon("monitor")}<span>External Displays</span></div>
        <div class="display-status">Loading...</div>
        <button class="display-button" data-action="refresh">${icon("refreshCw")}<span>Refresh</span></button>
        <button class="display-button" data-action="help">${icon("github")}<span>GitHub</span></button>
      </div>
      <div class="display-body"></div>
    </div>
  `;

  state.status = container.querySelector(".display-status");
  state.refreshButton = container.querySelector('[data-action="refresh"]');
  const body = container.querySelector(".display-body");
  const helpButton = container.querySelector('[data-action="help"]');

  async function refresh() {
    if (state.loading) return;
    state.loading = true;
    state.refreshButton.disabled = true;
    state.refreshButton.classList.add("is-loading");
    body.innerHTML = "";
    state.status.textContent = "Detecting DDC driver...";
    try {
      state.driver = await invoke(context, "qx_external_displays_driver");
      if (!state.driver) {
        state.status.textContent = "No DDC CLI found";
        renderEmpty(body, state, "Qx looks for m1ddc first, then ddcctl, in Homebrew and system binary paths.");
        return;
      }
      state.status.textContent = `Using ${state.driver.label} at ${state.driver.path}`;
      const displays = await invoke(context, "qx_external_displays_list");
      body.innerHTML = "";
      if (!Array.isArray(displays) || displays.length === 0) {
        renderEmpty(body, state, `${state.driver.label} is installed, but no controllable external display was reported.`);
        return;
      }
      displays.forEach((display) => renderDisplay(body, state, display, refresh));
      state.status.textContent = `${displays.length} controllable display(s) · ${state.driver.label}`;
    } catch (error) {
      state.status.innerHTML = `<span class="display-error">${escapeHtml(String(error))}</span>`;
      renderEmpty(body, state, String(error));
    } finally {
      state.loading = false;
      state.refreshButton.disabled = false;
      state.refreshButton.classList.remove("is-loading");
    }
  }

  state.refresh = refresh;
  state.refreshButton.onclick = refresh;
  helpButton.onclick = () => context.openUrl(M1DDC_URL);
  refresh();
}

export default {
  commands: [
    {
      name: "open-displays",
      title: "External Display Control",
      async run(context) {
        const driver = await invoke(context, "qx_external_displays_driver");
        context.showToast(driver ? `External Display Control uses ${driver.label}` : "Install m1ddc or ddcctl first.");
      },
    },
    {
      name: "install-help",
      title: "External Display Control: Install DDC CLI",
      async run(context) {
        await context.openUrl(M1DDC_URL);
      },
    },
  ],
  panel: {
    title: "External Display Control",
    render(container, context) {
      renderPanel(container, context);
    },
    destroy(container) {
      container.innerHTML = "";
    },
  },
};
