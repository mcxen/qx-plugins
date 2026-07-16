/**
 * Pomodoro Island — timer commands + control panel + external island surface.
 * State is module-scoped so island actions and panel UI stay in sync.
 */

let timerId = null;
let activeContext = null;
let phase = "idle"; // idle | running | paused | complete
let sessionKind = "focus"; // focus | break
let durationMs = 25 * 60 * 1000;
let remainingMs = durationMs;
let endsAt = 0;
/** @type {null | (() => void)} */
let panelPaint = null;

function preferenceMinutes(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(180, parsed) : fallback;
}

function formatRemaining(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function labels() {
  return sessionKind === "break"
    ? { primary: "Short break", done: "Break complete", verb: "Break" }
    : { primary: "Focus session", done: "Focus complete", verb: "Focus" };
}

function clearTicker(context = activeContext) {
  if (timerId != null && context) context.clearInterval(timerId);
  timerId = null;
}

function notifyPanel() {
  try {
    panelPaint?.();
  } catch {
    /* panel may be unmounted */
  }
}

async function publish(context) {
  const copy = labels();
  if (!context?.island) {
    notifyPanel();
    return;
  }
  try {
    if (phase === "idle") {
      await context.island.dismiss().catch(() => {});
      notifyPanel();
      return;
    }
    if (phase === "complete") {
      await context.island.update({
        primary: copy.done,
        secondary: "Ready for the next round",
        progress: 100,
        tone: "success",
        action: {
          label: "Again",
          command: sessionKind === "break" ? "start-short-break" : "start-focus",
        },
      });
      notifyPanel();
      return;
    }
    const progress = durationMs <= 0 ? 0 : ((durationMs - remainingMs) / durationMs) * 100;
    await context.island.update({
      primary: copy.primary,
      secondary: `${formatRemaining(remainingMs)} · ${phase === "paused" ? "Paused" : "In progress"}`,
      progress,
      tone: phase === "paused" ? "warning" : "neutral",
      action: { label: phase === "paused" ? "Resume" : "Pause", command: "toggle-pomodoro" },
    });
  } catch {
    /* island optional if host lacks permission surface */
  }
  notifyPanel();
}

async function finish(context) {
  clearTicker(context);
  remainingMs = 0;
  phase = "complete";
  await publish(context);
  try {
    await context.notification.show({
      title: labels().done,
      body: sessionKind === "break" ? "Time to focus again." : "Take a short break.",
    });
  } catch {
    /* optional */
  }
}

async function tick(context) {
  if (phase !== "running") return;
  remainingMs = Math.max(0, endsAt - Date.now());
  if (remainingMs <= 0) {
    await finish(context);
    return;
  }
  await publish(context);
}

async function start(context, kind) {
  activeContext = context;
  clearTicker(context);
  sessionKind = kind === "break" ? "break" : "focus";
  const prefId = sessionKind === "break" ? "shortBreakMinutes" : "focusMinutes";
  const fallback = sessionKind === "break" ? 5 : 25;
  const minutes = preferenceMinutes(await context.getPreference(prefId), fallback);
  durationMs = minutes * 60 * 1000;
  remainingMs = durationMs;
  endsAt = Date.now() + remainingMs;
  phase = "running";
  try {
    await context.island.show({
      primary: labels().primary,
      secondary: `${formatRemaining(remainingMs)} · In progress`,
      progress: 0,
      action: { label: "Pause", command: "toggle-pomodoro" },
    });
  } catch {
    /* panel-only still works */
  }
  timerId = context.setInterval(() => void tick(context), 1000);
  notifyPanel();
}

async function toggle(context) {
  activeContext = context;
  if (phase === "idle" || phase === "complete") {
    await start(context, sessionKind);
    return;
  }
  if (phase === "running") {
    remainingMs = Math.max(0, endsAt - Date.now());
    phase = "paused";
    clearTicker(context);
  } else if (phase === "paused") {
    phase = "running";
    endsAt = Date.now() + remainingMs;
    timerId = context.setInterval(() => void tick(context), 1000);
  }
  await publish(context);
}

async function stop(context) {
  activeContext = context;
  clearTicker(context);
  phase = "idle";
  remainingMs = durationMs;
  try {
    await context.island.dismiss();
  } catch {
    /* ignore */
  }
  notifyPanel();
}

const STYLES = `
<style>
  .pomo-root { display:flex; flex-direction:column; height:100%; font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--qx-text-primary,#e8e8e8); margin:0; }
  .pomo-hero { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; padding:24px 16px; }
  .pomo-kind { font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:var(--qx-text-tertiary,#888); }
  .pomo-time { font-size:56px; font-weight:200; font-variant-numeric:tabular-nums; letter-spacing:2px; line-height:1; }
  .pomo-phase { font-size:13px; color:var(--qx-text-secondary,#aaa); }
  .pomo-bar { width:min(280px,80%); height:6px; border-radius:999px; background:var(--qx-bg-component-3,#2a2a2a); overflow:hidden; margin-top:8px; }
  .pomo-bar > i { display:block; height:100%; background:var(--qx-accent,#5b9aff); border-radius:999px; transition:width 0.4s linear; }
  .pomo-actions { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; padding:12px 16px 20px; border-top:1px solid var(--qx-border-1,#2a2a2a); }
  .pomo-btn { padding:8px 14px; border-radius:8px; border:1px solid var(--qx-border-1,#333); background:var(--qx-bg-component-2,#1c1c1c); color:var(--qx-text-primary); cursor:pointer; font:inherit; font-size:12px; }
  .pomo-btn:hover { background:var(--qx-bg-component-3,#262626); }
  .pomo-btn.primary { background:var(--qx-accent,#5b9aff); border-color:var(--qx-accent,#5b9aff); color:#fff; }
  .pomo-btn.danger { color:var(--qx-danger,#e55); border-color:var(--qx-danger,#e55); }
  .pomo-hint { font-size:11px; color:var(--qx-text-tertiary,#666); text-align:center; padding:0 16px 12px; }
</style>
`;

function renderControlPanel(container, context) {
  activeContext = context;
  container.innerHTML = STYLES + `<div class="pomo-root"></div>`;
  const root = container.querySelector(".pomo-root");

  function paint() {
    const copy = labels();
    const progress = phase === "idle"
      ? 0
      : phase === "complete"
        ? 100
        : durationMs <= 0
          ? 0
          : Math.min(100, ((durationMs - remainingMs) / durationMs) * 100);
    const phaseText =
      phase === "idle"
        ? "Ready"
        : phase === "running"
          ? "In progress · island active"
          : phase === "paused"
            ? "Paused"
            : "Complete";
    const displayMs = phase === "idle" ? durationMs : remainingMs;

    root.innerHTML = `
      <div class="pomo-hero">
        <div class="pomo-kind">${copy.verb}</div>
        <div class="pomo-time">${formatRemaining(displayMs)}</div>
        <div class="pomo-phase">${phaseText}</div>
        <div class="pomo-bar"><i style="width:${progress.toFixed(1)}%"></i></div>
      </div>
      <div class="pomo-actions">
        <button class="pomo-btn primary" type="button" data-act="focus">Start Focus</button>
        <button class="pomo-btn" type="button" data-act="break">Short Break</button>
        <button class="pomo-btn" type="button" data-act="toggle">${phase === "paused" ? "Resume" : "Pause"}</button>
        <button class="pomo-btn danger" type="button" data-act="stop">Stop</button>
      </div>
      <div class="pomo-hint">Timer also runs on the external Qx Island. Commands stay available from search.</div>
    `;

    root.querySelector('[data-act="focus"]').onclick = () => void start(context, "focus");
    root.querySelector('[data-act="break"]').onclick = () => void start(context, "break");
    root.querySelector('[data-act="toggle"]').onclick = () => void toggle(context);
    root.querySelector('[data-act="stop"]').onclick = () => void stop(context);
  }

  panelPaint = paint;
  paint();

  return () => {
    if (panelPaint === paint) panelPaint = null;
  };
}

let destroyPanel = null;

export default {
  commands: [
    {
      name: "start-focus",
      title: "Pomodoro: Start Focus",
      run: (context) => start(context, "focus"),
    },
    {
      name: "start-short-break",
      title: "Pomodoro: Start Short Break",
      run: (context) => start(context, "break"),
    },
    {
      name: "toggle-pomodoro",
      title: "Pomodoro: Pause or Resume",
      run: toggle,
    },
    {
      name: "stop-pomodoro",
      title: "Pomodoro: Stop",
      run: stop,
    },
  ],

  panel: {
    title: "Pomodoro",
    async render(container, context) {
      if (destroyPanel) {
        try {
          destroyPanel();
        } catch {
          /* ignore */
        }
      }
      destroyPanel = renderControlPanel(container, context);
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
