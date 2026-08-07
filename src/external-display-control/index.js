const TEXT = {
  en: {
    title: "Display Brightness",
    refresh: "Refresh",
    refreshed: "Display brightness refreshed.",
    loading: "Loading…",
    native: "macOS native",
    ddc: "Hardware DDC/CI",
    builtIn: "Built-in",
    external: "External",
    brightness: "Brightness",
    unsupported: "Brightness control is unavailable for this display.",
    raw: (current, max) => `DDC value ${current}/${max}`,
    noDisplays: "No controllable displays are available.",
    noDisplaysHint: "Built-in panels use macOS native brightness. External monitors use Qx's embedded DDC/CI transport when the monitor and connection expose it.",
    setting: "Setting brightness…",
    setTo: (value) => `Brightness set to ${value}%`,
    error: (value) => String(value),
  },
  zh: {
    title: "显示器亮度",
    refresh: "刷新",
    refreshed: "显示器亮度已刷新。",
    loading: "加载中…",
    native: "macOS 原生",
    ddc: "硬件 DDC/CI",
    builtIn: "内置",
    external: "外接",
    brightness: "亮度",
    unsupported: "此显示器暂不支持亮度控制。",
    raw: (current, max) => `DDC 原始值 ${current}/${max}`,
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
const BRIGHTNESS_RAMP_INTERVAL_MS = 28;
function nextBrightnessRampValue(current, target) {
  const from = clamp(current);
  const to = clamp(target);
  const distance = Math.abs(to - from);
  if (distance === 0) return from;
  const step = distance > 24 ? 3 : distance > 8 ? 2 : 1;
  return from + Math.sign(to - from) * Math.min(step, distance);
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
  .qx-display-control{padding:12px}.qx-display-control-head{display:flex;justify-content:space-between;gap:8px;margin-bottom:8px}.qx-display-control-label{display:flex;align-items:center;gap:6px;font-weight:650}.qx-display-control-value{color:var(--muted-foreground,var(--qx-text-secondary));font-variant-numeric:tabular-nums}.qx-display-control-row{display:grid;grid-template-columns:auto minmax(120px,1fr) auto;gap:7px;align-items:center}.qx-display-step{height:29px;min-width:36px;padding:0 8px}.qx-display-track{position:relative;height:20px;border:1px solid var(--border,var(--qx-border-1));border-radius:999px;background:var(--secondary,var(--qx-bg-component-2));cursor:pointer;overflow:visible;isolation:isolate;touch-action:none;user-select:none;-webkit-user-select:none}.qx-display-track.is-dragging{cursor:grabbing}.qx-display-fill,.qx-display-trail{position:absolute;inset:0 auto 0 0;display:block;min-width:0;border-radius:999px;background-clip:padding-box;pointer-events:none}.qx-display-fill{z-index:0;overflow:hidden;background:linear-gradient(90deg,color-mix(in srgb,var(--primary,var(--qx-accent)) 12%,transparent),color-mix(in srgb,var(--primary,var(--qx-accent)) 31%,transparent));transition:width 220ms ease-out}.qx-display-trail{z-index:1;overflow:visible;background:linear-gradient(90deg,color-mix(in srgb,var(--primary,var(--qx-accent)) 16%,transparent),color-mix(in srgb,var(--primary,var(--qx-accent)) 36%,transparent));animation:qx-display-trail-fade 620ms ease-out both}.qx-display-fill:before,.qx-display-trail:before{position:absolute;z-index:0;top:0;right:0;width:20px;height:100%;border-radius:50%;content:""}.qx-display-fill:before{background:color-mix(in srgb,var(--primary,var(--qx-accent)) 31%,transparent)}.qx-display-trail:before{background:color-mix(in srgb,var(--primary,var(--qx-accent)) 40%,transparent)}.qx-display-trail.is-dragging{opacity:.84;animation:none}.qx-display-trail:after{position:absolute;z-index:1;top:50%;right:-20px;width:40px;height:32px;border-radius:50%;background:radial-gradient(ellipse at center,color-mix(in srgb,var(--primary,var(--qx-accent)) 82%,transparent) 0%,color-mix(in srgb,var(--primary,var(--qx-accent)) 46%,transparent) 30%,transparent 72%);box-shadow:0 0 18px color-mix(in srgb,var(--primary,var(--qx-accent)) 52%,transparent);content:"";filter:blur(1.5px);transform:translateY(-50%)}.qx-display-particles{position:absolute;inset:0;display:block;overflow:hidden;pointer-events:none}.qx-display-particle,.qx-display-ambient-particle{position:absolute;display:block;border-radius:50%;background:var(--foreground,var(--qx-text-primary));box-shadow:0 0 3px color-mix(in srgb,var(--primary,var(--qx-accent)) 90%,transparent),0 0 7px color-mix(in srgb,var(--primary,var(--qx-accent)) 48%,transparent);opacity:.42;animation:qx-display-firefly 2800ms ease-in-out infinite}.qx-display-ambient{position:absolute;z-index:1;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none;transition:width 220ms ease-out}.qx-display-ambient-particle{opacity:.58}.qx-display-trail .qx-display-particle,.qx-display-trail .qx-display-ambient-particle{animation-name:qx-display-trail-particle}.qx-display-thumb{position:absolute;z-index:2;top:50%;width:12px;height:12px;border-radius:999px;transform:translate(-50%,-50%);background:var(--primary,var(--qx-accent));box-shadow:0 0 0 2px var(--card,var(--qx-bg-component-1)),0 0 10px color-mix(in srgb,var(--primary,var(--qx-accent)) 62%,transparent);transition:left 220ms ease-out,box-shadow 220ms ease-out}.qx-display-track.is-dragging .qx-display-fill,.qx-display-track.is-dragging>.qx-display-ambient,.qx-display-track.is-dragging .qx-display-thumb{transition:none}.qx-display-unavailable{padding:12px;color:var(--muted-foreground,var(--qx-text-secondary));line-height:1.5}.qx-display-empty{margin:auto;max-width:560px;padding:18px;border:1px solid var(--border,var(--qx-border-1));border-radius:8px;background:var(--card,var(--qx-bg-component-1));color:var(--muted-foreground,var(--qx-text-secondary));line-height:1.5}.qx-display-empty strong{display:block;margin-bottom:7px;color:var(--card-foreground,var(--qx-text-primary));font-size:16px}.qx-display-error{color:var(--destructive,var(--qx-danger))}@keyframes qx-display-spin{to{transform:rotate(360deg)}}@keyframes qx-display-firefly{0%,100%{opacity:.22;transform:translate3d(0,1px,0) scale(.78)}45%{opacity:.88;transform:translate3d(1px,-1px,0) scale(1)}72%{opacity:.46;transform:translate3d(-1px,0,0) scale(.86)}}@keyframes qx-display-trail-fade{0%{opacity:.84}100%{opacity:0}}@keyframes qx-display-trail-particle{0%{opacity:.72;transform:translate3d(0,0,0) scale(1)}100%{opacity:0;transform:translate3d(5px,-3px,0) scale(.35)}}
  .qx-display-fill:before,.qx-display-trail:before,.qx-display-trail:after{display:none}.qx-display-fill{background:linear-gradient(180deg,color-mix(in srgb,var(--card,var(--qx-bg-component-1)) 34%,transparent),transparent 58%),linear-gradient(90deg,color-mix(in srgb,var(--primary,var(--qx-accent)) 12%,transparent),color-mix(in srgb,var(--primary,var(--qx-accent)) 31%,transparent))}.qx-display-trail{inset:auto;top:0;bottom:0;overflow:hidden;border-radius:999px;background:linear-gradient(90deg,color-mix(in srgb,var(--primary,var(--qx-accent)) 30%,transparent) 0%,color-mix(in srgb,var(--primary,var(--qx-accent)) 15%,transparent) 48%,transparent 100%);-webkit-mask-image:linear-gradient(90deg,#000 0%,rgba(0,0,0,.76) 46%,transparent 100%);mask-image:linear-gradient(90deg,#000 0%,rgba(0,0,0,.76) 46%,transparent 100%)}.qx-display-bloom{position:absolute;z-index:1;top:50%;width:38px;height:28px;border-radius:50%;background:radial-gradient(ellipse at center,color-mix(in srgb,var(--card,var(--qx-bg-component-1)) 92%,transparent) 0 10%,color-mix(in srgb,var(--primary,var(--qx-accent)) 58%,transparent) 28%,color-mix(in srgb,var(--primary,var(--qx-accent)) 20%,transparent) 52%,transparent 74%);box-shadow:0 0 12px color-mix(in srgb,var(--primary,var(--qx-accent)) 36%,transparent);pointer-events:none;filter:blur(1px);transform:translate(-50%,-50%);animation:qx-display-bloom-fade 620ms cubic-bezier(.2,.7,.2,1) both}.qx-display-bloom.is-dragging{opacity:1;animation:none}@keyframes qx-display-bloom-fade{0%{opacity:.92;transform:translate(-50%,-50%) scale(1)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.16)}}
  @media (prefers-reduced-motion:reduce){.qx-display-fill,.qx-display-ambient,.qx-display-thumb{transition:none}.qx-display-trail,.qx-display-bloom,.qx-display-particle,.qx-display-ambient-particle{animation:none}.qx-display-trail{opacity:.28}.qx-display-bloom{opacity:.34}}
  .qx-display-status{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
  @media(max-width:560px){.qx-display-button span{display:none}}
</style>`;

const DISPLAY_PARTICLES = Array.from({ length: 20 }, (_, index) => ({
  left: 6 + ((index * 43 + 17) % 90),
  top: 17 + ((index * 31 + 9) % 66),
  size: 1 + (index % 3),
  delay: -((index * 149) % 2600),
  duration: 2200 + ((index * 223) % 1700),
}));

function particleMarkup(className = "") {
  return `<div class="qx-display-particles ${className}" aria-hidden="true">${DISPLAY_PARTICLES.map((particle) => `<i class="qx-display-particle" style="left:${particle.left}%;top:${particle.top}%;width:${particle.size}px;height:${particle.size}px;animation-delay:${particle.delay}ms;animation-duration:${particle.duration}ms"></i>`).join("")}</div>`;
}

function ambientParticleItems() {
  return DISPLAY_PARTICLES.slice(0, 14).map((particle, index) => {
    const top = index % 2 === 0 ? -3 - (index % 4) : 21 + (index % 4);
    return `<i class="qx-display-ambient-particle" style="left:${particle.left}%;top:${top}px;width:${particle.size}px;height:${particle.size}px;animation-delay:${particle.delay}ms;animation-duration:${particle.duration}ms"></i>`;
  }).join("");
}

function displayValueText(display, value) {
  if (display.rawMax == null) return `${value}%`;
  const rawValue = display.rawCurrent != null && clamp(display.current) === value
    ? display.rawCurrent
    : Math.round((value / 100) * display.rawMax);
  return `${value}% · ${text("raw", rawValue, display.rawMax)}`;
}

function withPendingValue(state, display) {
  const pending = state.pendingValues.get(display.id);
  if (!pending) return display;
  if (display.current === pending.value) {
    state.pendingValues.delete(display.id);
    return display;
  }
  if (Date.now() >= pending.expiresAt) {
    state.pendingValues.delete(display.id);
    return display;
  }
  return {
    ...display,
    current: pending.value,
    rawCurrent: display.rawMax == null
      ? display.rawCurrent
      : Math.round((pending.value / 100) * display.rawMax),
  };
}

function button(label, className = "") {
  const element = document.createElement("button");
  element.type = "button";
  element.className = `qx-display-button ${className}`.trim();
  element.innerHTML = escapeHtml(label);
  return element;
}

function renderControl(parent, state, display) {
  const control = document.createElement("div");
  control.className = "qx-display-control";
  if (!display.supported || display.current == null) {
    const diagnostic = display.errorStage ? ` · ${display.errorStage}` : "";
    control.innerHTML = `<div class="qx-display-unavailable">${escapeHtml(display.error || text("unsupported"))}${escapeHtml(diagnostic)}</div>`;
    parent.appendChild(control);
    return null;
  }
  let currentDisplay = display;
  const value = clamp(display.current);
  let currentValue = value;
  let committedValue = value;
  let queuedValue = null;
  let writeInFlight = false;
  let writeTimer = null;
  let dragPointerId = null;
  let dragOriginValue = value;
  let dragTrail = null;
  let dragBloom = null;
  let dragListenersAttached = false;
  let suppressClick = false;
  control.innerHTML = `<div class="qx-display-control-head"><div class="qx-display-control-label">${icon("sun")}${escapeHtml(text("brightness"))}</div><div class="qx-display-control-value">${escapeHtml(displayValueText(currentDisplay, value))}</div></div>`;
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
  state.visualValues.set(display.id, value);
  track.innerHTML = `<div class="qx-display-fill" style="width:${value}%">${particleMarkup()}</div><div class="qx-display-ambient" style="width:${value}%" aria-hidden="true">${ambientParticleItems()}</div><div class="qx-display-thumb" style="left:${value}%"></div>`;
  const valueLabel = control.querySelector(".qx-display-control-value");
  const fill = track.querySelector(".qx-display-fill");
  const ambient = track.querySelector(":scope > .qx-display-ambient");
  const thumb = track.querySelector(".qx-display-thumb");
  const removeTrailEffects = () => {
    track.querySelectorAll(".qx-display-trail,.qx-display-bloom").forEach((element) => element.remove());
  };
  const createTrailEffects = (from, to, dragging = false) => {
    const start = clamp(from);
    const end = clamp(to);
    if (end <= start) return { trail: null, bloom: null };
    const trail = document.createElement("div");
    trail.className = `qx-display-trail${dragging ? " is-dragging" : ""}`;
    trail.style.left = `${start}%`;
    trail.style.width = `${end - start}%`;
    trail.innerHTML = particleMarkup("is-trail");
    track.insertBefore(trail, fill);
    const bloom = document.createElement("div");
    bloom.className = `qx-display-bloom${dragging ? " is-dragging" : ""}`;
    bloom.style.left = `${start}%`;
    track.insertBefore(bloom, thumb);
    return { trail, bloom };
  };
  const updateVisualValue = (next, showTrail = true) => {
    const previous = currentValue;
    currentValue = clamp(next);
    if (showTrail && currentValue < previous) {
      removeTrailEffects();
      const effects = createTrailEffects(currentValue, previous);
      state.scheduleTask(() => {
        effects.trail?.remove();
        effects.bloom?.remove();
      }, 620);
    }
    valueLabel.textContent = displayValueText(currentDisplay, currentValue);
    track.setAttribute("aria-valuenow", String(currentValue));
    fill.style.width = `${currentValue}%`;
    ambient.style.width = `${currentValue}%`;
    thumb.style.left = `${currentValue}%`;
    state.visualValues.set(display.id, currentValue);
  };
  const flushWrite = async () => {
    writeTimer = null;
    if (writeInFlight || queuedValue == null || state.destroyed) return;
    const targetValue = queuedValue;
    if (targetValue === committedValue) {
      queuedValue = null;
      state.pendingValues.delete(display.id);
      return;
    }
    const nextValue = nextBrightnessRampValue(committedValue, targetValue);
    writeInFlight = true;
    state.setWriteActive(1);
    state.status.textContent = text("setting");
    try {
      await state.context.system.setDisplayBrightness(display.id, nextValue);
      if (state.destroyed) return;
      committedValue = nextValue;
      state.status.textContent = nextValue === targetValue
        ? text("setTo", targetValue)
        : text("setting");
    } catch (error) {
      if (state.destroyed) return;
      queuedValue = null;
      state.pendingValues.delete(display.id);
      updateVisualValue(committedValue, false);
      state.status.innerHTML = `<span class="qx-display-error">${escapeHtml(text("error", error))}</span>`;
    } finally {
      writeInFlight = false;
      state.setWriteActive(-1);
      if (state.destroyed) return;
      if (queuedValue != null && queuedValue !== committedValue) {
        writeTimer = state.scheduleTask(flushWrite, BRIGHTNESS_RAMP_INTERVAL_MS);
      } else {
        queuedValue = null;
        state.scheduleRefresh(450);
        state.scheduleRefresh(1400);
      }
    }
  };
  const queueWrite = (next, immediate = false) => {
    queuedValue = clamp(next);
    state.pendingValues.set(display.id, {
      value: queuedValue,
      expiresAt: Date.now() + 2500,
    });
    if (immediate) {
      if (writeTimer != null) state.clearTask(writeTimer);
      writeTimer = null;
      flushWrite();
    } else if (!writeInFlight && writeTimer == null) {
      writeTimer = state.scheduleTask(flushWrite, 80);
    }
  };
  const apply = (next, immediate = true, showTrail = true) => {
    if (state.destroyed) return;
    const nextValue = clamp(next);
    if (nextValue === currentValue && queuedValue == null) return;
    updateVisualValue(nextValue, showTrail);
    queueWrite(nextValue, immediate);
  };
  const valueFromPointer = (event) => {
    const rect = track.getBoundingClientRect();
    return rect.width > 0 ? ((event.clientX - rect.left) / rect.width) * 100 : currentValue;
  };
  const updateDragTrail = () => {
    if (currentValue >= dragOriginValue) {
      dragTrail?.remove();
      dragBloom?.remove();
      dragTrail = null;
      dragBloom = null;
      return;
    }
    if (!dragTrail) {
      removeTrailEffects();
      const effects = createTrailEffects(currentValue, dragOriginValue, true);
      dragTrail = effects.trail;
      dragBloom = effects.bloom;
    }
    dragTrail.style.left = `${currentValue}%`;
    dragTrail.style.width = `${dragOriginValue - currentValue}%`;
    dragBloom.style.left = `${currentValue}%`;
  };
  const detachDragListeners = () => {
    if (!dragListenersAttached) return;
    dragListenersAttached = false;
    document.removeEventListener("pointermove", handleDocumentPointerMove, true);
    document.removeEventListener("pointerup", handleDocumentPointerUp, true);
    document.removeEventListener("pointercancel", handleDocumentPointerCancel, true);
    window.removeEventListener("blur", handleWindowBlur);
  };
  const finishDrag = (event, readEventPosition = true) => {
    if (dragPointerId == null || (event && event.pointerId !== dragPointerId)) return;
    event?.preventDefault();
    if (readEventPosition && Number.isFinite(event?.clientX)) {
      updateVisualValue(valueFromPointer(event), false);
    }
    updateDragTrail();
    queueWrite(currentValue, true);
    const finishedPointerId = dragPointerId;
    dragPointerId = null;
    detachDragListeners();
    try {
      if (track.hasPointerCapture(finishedPointerId)) track.releasePointerCapture(finishedPointerId);
    } catch {
      // WKWebView may revoke capture before it dispatches pointercancel.
    }
    state.activeDrags = Math.max(0, state.activeDrags - 1);
    track.classList.remove("is-dragging");
    if (dragTrail) {
      dragTrail.classList.remove("is-dragging");
      dragBloom?.classList.remove("is-dragging");
      const finishedTrail = dragTrail;
      const finishedBloom = dragBloom;
      dragTrail = null;
      dragBloom = null;
      state.scheduleTask(() => {
        finishedTrail.remove();
        finishedBloom?.remove();
      }, 620);
    }
  };
  function handleDocumentPointerMove(event) {
    if (event.pointerId !== dragPointerId) return;
    event.preventDefault();
    if (event.pointerType === "mouse" && event.buttons === 0) {
      finishDrag(event);
      return;
    }
    updateVisualValue(valueFromPointer(event), false);
    updateDragTrail();
    queueWrite(currentValue, false);
  }
  function handleDocumentPointerUp(event) {
    finishDrag(event);
  }
  function handleDocumentPointerCancel(event) {
    // WKWebView cancellation coordinates can be zeroed. Preserve the last
    // valid pointermove value instead of snapping the thumb to an edge.
    finishDrag(event, false);
  }
  function handleWindowBlur() {
    finishDrag(null, false);
  }
  const attachDragListeners = () => {
    if (dragListenersAttached) return;
    dragListenersAttached = true;
    document.addEventListener("pointermove", handleDocumentPointerMove, true);
    document.addEventListener("pointerup", handleDocumentPointerUp, true);
    document.addEventListener("pointercancel", handleDocumentPointerCancel, true);
    window.addEventListener("blur", handleWindowBlur);
  };
  minus.onclick = () => apply(currentValue - 1);
  plus.onclick = () => apply(currentValue + 1);
  track.onclick = (event) => {
    if (suppressClick) {
      suppressClick = false;
      event.preventDefault();
      return;
    }
    apply(valueFromPointer(event));
  };
  track.onpointerdown = (event) => {
    if (event.button !== 0 || event.isPrimary === false || state.destroyed || dragPointerId != null) return;
    event.preventDefault();
    track.focus({ preventScroll: true });
    dragPointerId = event.pointerId;
    state.activeDrags += 1;
    dragOriginValue = currentValue;
    suppressClick = true;
    track.classList.add("is-dragging");
    attachDragListeners();
    try {
      track.setPointerCapture(event.pointerId);
    } catch {
      // Document-level listeners keep the drag continuous when capture fails.
    }
    updateVisualValue(valueFromPointer(event), false);
    updateDragTrail();
    queueWrite(currentValue, false);
  };
  track.ondragstart = (event) => event.preventDefault();
  track.onkeydown = (event) => {
    if (["ArrowLeft", "ArrowDown"].includes(event.key)) { event.preventDefault(); apply(currentValue - 1); }
    if (["ArrowRight", "ArrowUp"].includes(event.key)) { event.preventDefault(); apply(currentValue + 1); }
    if (event.key === "Home") { event.preventDefault(); apply(0); }
    if (event.key === "End") { event.preventDefault(); apply(100); }
  };
  row.append(minus, track, plus);
  control.appendChild(row);
  parent.appendChild(control);
  return {
    destroy() {
      if (dragPointerId != null) finishDrag(null, false);
      detachDragListeners();
    },
    sync(nextDisplay) {
      currentDisplay = nextDisplay;
      if (dragPointerId != null || writeInFlight || queuedValue != null) return;
      committedValue = clamp(nextDisplay.current);
      updateVisualValue(committedValue, false);
    },
  };
}

function renderDisplay(body, state, display) {
  const card = document.createElement("section");
  card.className = "qx-display-card";
  const backend = display.backend === "native" ? text("native") : text("ddc");
  card.innerHTML = `<div class="qx-display-card-head"><div class="qx-display-card-icon">${icon("monitor")}</div><div><div class="qx-display-name">${escapeHtml(display.name)}</div><div class="qx-display-meta">${escapeHtml(backend)} · ${escapeHtml(text(display.isBuiltin ? "builtIn" : "external"))}</div></div></div>`;
  const controller = renderControl(card, state, display);
  body.appendChild(card);
  return controller;
}

function renderPanel(container, context) {
  setLocale(context);
  const state = {
    context,
    status: null,
    refreshing: false,
    destroyed: false,
    visualValues: new Map(),
    pendingValues: new Map(),
    controls: new Map(),
    refreshTimers: new Set(),
    activeWrites: 0,
    activeDrags: 0,
    structureKey: "",
    pollTimer: null,
    actions: null,
    scheduleTask: null,
    clearTask: null,
    setWriteActive: null,
    scheduleRefresh: null,
  };
  container.innerHTML = STYLES + `<div class="qx-display-root"><div class="qx-display-status" role="status" aria-live="polite">${escapeHtml(text("loading"))}</div><div class="qx-display-body"><div class="qx-display-empty">${escapeHtml(text("loading"))}</div></div></div>`;
  state.status = container.querySelector(".qx-display-status");
  const body = container.querySelector(".qx-display-body");
  const structureKeyFor = (displays) => JSON.stringify(displays.map((display) => ({
    id: display.id,
    name: display.name,
    backend: display.backend,
    isBuiltin: display.isBuiltin,
    supported: display.supported,
    hasValue: display.current != null,
    error: display.error || "",
  })));
  const renderDisplays = (displays) => {
    state.controls.forEach((controller) => controller.destroy());
    body.innerHTML = "";
    state.controls.clear();
    if (!displays.length) {
      body.innerHTML = `<div class="qx-display-empty"><strong>${escapeHtml(text("noDisplays"))}</strong><div>${escapeHtml(text("noDisplaysHint"))}</div></div>`;
      return;
    }
    displays.forEach((display) => {
      const controller = renderDisplay(body, state, display);
      if (controller) state.controls.set(display.id, controller);
    });
  };
  async function refresh({ manual = false } = {}) {
    if (state.refreshing || state.destroyed) return;
    if (state.activeWrites > 0 || state.activeDrags > 0) {
      if (manual) state.scheduleTask(() => refresh({ manual: true }), 180);
      return;
    }
    state.refreshing = true;
    try {
      const displays = (await context.system.displayBrightness()).map((display) => (
        withPendingValue(state, display)
      ));
      if (state.destroyed || state.activeWrites > 0 || state.activeDrags > 0) return;
      const nextStructureKey = structureKeyFor(displays);
      if (nextStructureKey !== state.structureKey) {
        state.structureKey = nextStructureKey;
        renderDisplays(displays);
      } else {
        displays.forEach((display) => state.controls.get(display.id)?.sync(display));
      }
      state.status.textContent = `${displays?.length || 0} · ${text("title")}`;
      if (manual) await context.showToast(text("refreshed"));
    } catch (error) {
      if (state.controls.size === 0) {
        body.innerHTML = `<div class="qx-display-empty"><strong>${escapeHtml(text("noDisplays"))}</strong><div class="qx-display-error">${escapeHtml(text("error", error))}</div></div>`;
      }
      state.status.innerHTML = `<span class="qx-display-error">${escapeHtml(text("error", error))}</span>`;
      if (manual) await context.showToast(text("error", error));
    } finally {
      state.refreshing = false;
    }
  }
  state.refresh = refresh;
  state.scheduleTask = (callback, delay) => {
    const timer = context.setTimeout(() => {
      state.refreshTimers.delete(timer);
      callback();
    }, delay);
    state.refreshTimers.add(timer);
    return timer;
  };
  state.clearTask = (timer) => {
    context.clearTimeout(timer);
    state.refreshTimers.delete(timer);
  };
  state.setWriteActive = (delta) => {
    state.activeWrites = Math.max(0, state.activeWrites + delta);
  };
  state.scheduleRefresh = (delay) => state.scheduleTask(() => refresh(), delay);
  state.actions = context.ui?.mountActions?.([{
    id: "refresh",
    label: text("refresh"),
    menuKey: "r",
    kbd: "CmdOrCtrl+R",
    primary: false,
  }], {
    selectionTitle: text("title"),
    onAction(id) {
      if (id === "refresh") void refresh({ manual: true });
    },
  }) || null;
  state.pollTimer = context.setInterval(() => {
    void refresh();
  }, 2000);
  state.destroy = () => {
    state.destroyed = true;
    if (state.pollTimer != null) context.clearInterval(state.pollTimer);
    state.actions?.destroy();
    state.refreshTimers.forEach((timer) => context.clearTimeout(timer));
    state.refreshTimers.clear();
    state.controls.forEach((controller) => controller.destroy());
    state.controls.clear();
  };
  container.__qxDisplayDestroy = state.destroy;
  refresh();
}

export default {
  commands: [{
    name: "open-displays",
    title: "Display Brightness",
    async run(context) {
      setLocale(context);
      // Avoid blocking command completion on DDC enumeration — the panel
      // refresh path owns that work once the host opens this plugin surface.
      try {
        const displays = await Promise.race([
          context.system.displayBrightness(),
          new Promise((_, reject) => {
            context.setTimeout(() => reject(new Error("display probe timeout")), 4000);
          }),
        ]);
        context.showToast(`${text("title")}: ${Array.isArray(displays) ? displays.length : 0}`);
      } catch (error) {
        context.showToast(text("error", error));
      }
    },
  }],
  panel: {
    title: "Display Brightness",
    render(container, context) { renderPanel(container, context); },
    destroy(container) {
      container.__qxDisplayDestroy?.();
      delete container.__qxDisplayDestroy;
      container.innerHTML = "";
    },
  },
};
