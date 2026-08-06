const TEXT = {
  en: {
    title: "Display Brightness",
    refresh: "Refresh",
    loading: "Loading…",
    native: "macOS native",
    ddc: "Hardware DDC/CI",
    builtIn: "Built-in",
    external: "External",
    brightness: "Brightness",
    unsupported: "Brightness control is unavailable for this display.",
    noDisplays: "No controllable displays are available.",
    noDisplaysHint: "Built-in panels use macOS native brightness. External monitors use Qx's embedded DDC/CI transport when the monitor and connection expose it.",
    setting: "Setting brightness…",
    setTo: (value) => `Brightness set to ${value}%`,
    error: (value) => String(value),
  },
  zh: {
    title: "显示器亮度",
    refresh: "刷新",
    loading: "加载中…",
    native: "macOS 原生",
    ddc: "硬件 DDC/CI",
    builtIn: "内置",
    external: "外接",
    brightness: "亮度",
    unsupported: "此显示器暂不支持亮度控制。",
    noDisplays: "没有可控制的显示器。",
    noDisplaysHint: "内置屏幕使用 macOS 原生亮度；外接显示器在硬件和连接支持时使用 Qx 内置的 DDC/CI 通道，无需安装外部命令行工具。",
    setting: "正在设置亮度…",
    setTo: (value) => `亮度已设置为 ${value}%`,
    error: (value) => String(value),
  },
};

let locale = "en";
function setLocale(context) {
  locale = context?.locale === "zh-CN" || context?.locale === "zh" ? "zh" : "en";
}
function text(key, ...args) {
  const value = TEXT[locale][key] ?? TEXT.en[key] ?? key;
  return typeof value === "function" ? value(...args) : value;
}
function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}
function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function icon(name) {
  const paths = {
    monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  };
  return `<svg class="qx-display-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ""}</svg>`;
}

const STYLES = `<style>
  .qx-display-root{height:100%;display:flex;flex-direction:column;min-height:0;color:var(--foreground,var(--qx-text-primary));font:13px -apple-system,BlinkMacSystemFont,sans-serif}
  .qx-display-top{display:flex;align-items:center;gap:9px;padding:9px 11px;border-bottom:1px solid var(--border,var(--qx-border-1))}
  .qx-display-title{display:flex;align-items:center;gap:8px;font-weight:700;white-space:nowrap}.qx-display-title .qx-display-icon{color:var(--primary,var(--qx-accent))}
  .qx-display-status{flex:1;min-width:0;color:var(--muted-foreground,var(--qx-text-tertiary));overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .qx-display-button{height:30px;display:inline-flex;align-items:center;gap:6px;padding:0 10px;border:1px solid var(--border,var(--qx-border-1));border-radius:var(--radius,var(--qx-control-radius));background:var(--secondary,var(--qx-bg-component-2));color:var(--secondary-foreground,var(--qx-text-primary));font:inherit;cursor:pointer}.qx-display-button:hover{background:var(--accent,var(--qx-bg-component-3))}.qx-display-button:focus-visible,.qx-display-track:focus-visible{outline:2px solid var(--ring,var(--qx-accent));outline-offset:2px}.qx-display-button[disabled]{opacity:.55;cursor:default}.qx-display-button.loading .qx-display-icon{animation:qx-display-spin .8s linear infinite}
  .qx-display-body{flex:1;min-height:0;overflow:auto;padding:11px;display:flex;flex-direction:column;gap:10px}.qx-display-card{border:1px solid var(--border,var(--qx-border-1));border-radius:8px;background:var(--card,var(--qx-bg-component-1));overflow:hidden}
  .qx-display-card-head{display:flex;align-items:center;gap:9px;padding:11px 12px;border-bottom:1px solid var(--border,var(--qx-border-1))}.qx-display-card-icon{width:30px;height:30px;display:grid;place-items:center;border-radius:var(--radius,var(--qx-control-radius));background:var(--secondary,var(--qx-bg-component-2));color:var(--primary,var(--qx-accent))}.qx-display-icon{width:16px;height:16px}.qx-display-name{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.qx-display-meta{margin-top:2px;color:var(--muted-foreground,var(--qx-text-tertiary));font-size:12px}
  .qx-display-control{padding:12px}.qx-display-control-head{display:flex;justify-content:space-between;gap:8px;margin-bottom:8px}.qx-display-control-label{display:flex;align-items:center;gap:6px;font-weight:650}.qx-display-control-value{color:var(--muted-foreground,var(--qx-text-secondary));font-variant-numeric:tabular-nums}.qx-display-control-row{display:grid;grid-template-columns:auto minmax(120px,1fr) auto;gap:7px;align-items:center}.qx-display-step{height:29px;min-width:36px;padding:0 8px}.qx-display-track{position:relative;height:20px;border:1px solid var(--border,var(--qx-border-1));border-radius:999px;background:var(--secondary,var(--qx-bg-component-2));cursor:pointer;overflow:hidden}.qx-display-fill{position:absolute;inset:0 auto 0 0;background:var(--primary,var(--qx-accent));opacity:.24}.qx-display-thumb{position:absolute;top:50%;width:12px;height:12px;border-radius:999px;transform:translate(-50%,-50%);background:var(--primary,var(--qx-accent));box-shadow:0 0 0 2px var(--card,var(--qx-bg-component-1))}.qx-display-unavailable{padding:12px;color:var(--muted-foreground,var(--qx-text-secondary));line-height:1.5}.qx-display-empty{margin:auto;max-width:560px;padding:18px;border:1px solid var(--border,var(--qx-border-1));border-radius:8px;background:var(--card,var(--qx-bg-component-1));color:var(--muted-foreground,var(--qx-text-secondary));line-height:1.5}.qx-display-empty strong{display:block;margin-bottom:7px;color:var(--card-foreground,var(--qx-text-primary));font-size:16px}.qx-display-error{color:var(--destructive,var(--qx-danger))}@keyframes qx-display-spin{to{transform:rotate(360deg)}}
  @media(max-width:560px){.qx-display-status{display:none}.qx-display-button span{display:none}}
</style>`;

function button(label, className = "") {
  const element = document.createElement("button");
  element.type = "button";
  element.className = `qx-display-button ${className}`.trim();
  element.innerHTML = escapeHtml(label);
  return element;
}

function renderControl(parent, state, display, refresh) {
  const control = document.createElement("div");
  control.className = "qx-display-control";
  if (!display.supported || display.current == null) {
    control.innerHTML = `<div class="qx-display-unavailable">${escapeHtml(display.error || text("unsupported"))}</div>`;
    parent.appendChild(control);
    return;
  }
  const value = clamp(display.current);
  control.innerHTML = `<div class="qx-display-control-head"><div class="qx-display-control-label">${icon("sun")}${escapeHtml(text("brightness"))}</div><div class="qx-display-control-value">${value}%</div></div>`;
  const row = document.createElement("div");
  row.className = "qx-display-control-row";
  const minus = button("−", "qx-display-step");
  const plus = button("+", "qx-display-step");
  const track = document.createElement("div");
  track.className = "qx-display-track";
  track.tabIndex = 0;
  track.setAttribute("role", "slider");
  track.setAttribute("aria-label", text("brightness"));
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", "100");
  track.setAttribute("aria-valuenow", String(value));
  track.innerHTML = `<div class="qx-display-fill" style="width:${value}%"></div><div class="qx-display-thumb" style="left:${value}%"></div>`;
  const apply = async (next) => {
    if (state.loading) return;
    const nextValue = clamp(next);
    state.loading = true;
    state.status.textContent = text("setting");
    try {
      await state.context.system.setDisplayBrightness(display.id, nextValue);
      state.status.textContent = text("setTo", nextValue);
      await refresh();
    } catch (error) {
      state.status.innerHTML = `<span class="qx-display-error">${escapeHtml(text("error", error))}</span>`;
    } finally {
      state.loading = false;
    }
  };
  minus.onclick = () => apply(value - 1);
  plus.onclick = () => apply(value + 1);
  track.onclick = (event) => {
    const rect = track.getBoundingClientRect();
    apply(((event.clientX - rect.left) / rect.width) * 100);
  };
  track.onkeydown = (event) => {
    if (["ArrowLeft", "ArrowDown"].includes(event.key)) { event.preventDefault(); apply(value - 1); }
    if (["ArrowRight", "ArrowUp"].includes(event.key)) { event.preventDefault(); apply(value + 1); }
    if (event.key === "Home") { event.preventDefault(); apply(0); }
    if (event.key === "End") { event.preventDefault(); apply(100); }
  };
  row.append(minus, track, plus);
  control.appendChild(row);
  parent.appendChild(control);
}

function renderDisplay(body, state, display, refresh) {
  const card = document.createElement("section");
  card.className = "qx-display-card";
  const backend = display.backend === "native" ? text("native") : text("ddc");
  card.innerHTML = `<div class="qx-display-card-head"><div class="qx-display-card-icon">${icon("monitor")}</div><div><div class="qx-display-name">${escapeHtml(display.name)}</div><div class="qx-display-meta">${escapeHtml(backend)} · ${escapeHtml(text(display.isBuiltin ? "builtIn" : "external"))}</div></div></div>`;
  renderControl(card, state, display, refresh);
  body.appendChild(card);
}

function renderPanel(container, context) {
  setLocale(context);
  const state = { context, status: null, refreshButton: null, loading: false };
  container.innerHTML = STYLES + `<div class="qx-display-root"><div class="qx-display-top"><div class="qx-display-title">${icon("monitor")}<span>${escapeHtml(text("title"))}</span></div><div class="qx-display-status">${escapeHtml(text("loading"))}</div><button class="qx-display-button" data-action="refresh">${icon("refresh")}<span>${escapeHtml(text("refresh"))}</span></button></div><div class="qx-display-body"></div></div>`;
  state.status = container.querySelector(".qx-display-status");
  state.refreshButton = container.querySelector('[data-action="refresh"]');
  const body = container.querySelector(".qx-display-body");
  async function refresh() {
    if (state.loading) return;
    state.loading = true;
    state.refreshButton.disabled = true;
    state.refreshButton.classList.add("loading");
    state.status.textContent = text("loading");
    try {
      const displays = await context.system.displayBrightness();
      body.innerHTML = "";
      if (!Array.isArray(displays) || displays.length === 0) {
        body.innerHTML = `<div class="qx-display-empty"><strong>${escapeHtml(text("noDisplays"))}</strong><div>${escapeHtml(text("noDisplaysHint"))}</div></div>`;
      } else {
        displays.forEach((display) => renderDisplay(body, state, display, refresh));
      }
      state.status.textContent = `${displays?.length || 0} · ${text("title")}`;
    } catch (error) {
      body.innerHTML = `<div class="qx-display-empty"><strong>${escapeHtml(text("noDisplays"))}</strong><div class="qx-display-error">${escapeHtml(text("error", error))}</div></div>`;
      state.status.innerHTML = `<span class="qx-display-error">${escapeHtml(text("error", error))}</span>`;
    } finally {
      state.loading = false;
      state.refreshButton.disabled = false;
      state.refreshButton.classList.remove("loading");
    }
  }
  state.refresh = refresh;
  state.refreshButton.onclick = refresh;
  refresh();
}

export default {
  commands: [{
    name: "open-displays",
    title: "Display Brightness",
    async run(context) {
      setLocale(context);
      const displays = await context.system.displayBrightness();
      context.showToast(`${text("title")}: ${displays.length}`);
    },
  }],
  panel: {
    title: "Display Brightness",
    render(container, context) { renderPanel(container, context); },
    destroy(container) { container.innerHTML = ""; },
  },
};
