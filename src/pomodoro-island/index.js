let timerId = null;
let activeContext = null;
let phase = "idle";
let sessionKind = "focus";
let durationMs = 25 * 60 * 1000;
let remainingMs = durationMs;
let endsAt = 0;

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
    ? { primary: "Short break", done: "Break complete" }
    : { primary: "Focus session", done: "Focus complete" };
}

function clearTicker(context = activeContext) {
  if (timerId != null && context) context.clearInterval(timerId);
  timerId = null;
}

async function publish(context) {
  const copy = labels();
  if (phase === "complete") {
    await context.island.update({
      primary: copy.done,
      secondary: "Ready for the next round",
      progress: 100,
      tone: "success",
      action: { label: "Again", command: sessionKind === "break" ? "start-short-break" : "start-focus" },
    });
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
}

async function finish(context) {
  clearTicker(context);
  remainingMs = 0;
  phase = "complete";
  await publish(context);
  await context.notification.show({
    title: labels().done,
    body: sessionKind === "break" ? "Time to focus again." : "Take a short break.",
  }).catch(() => {});
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
  sessionKind = kind;
  const prefId = kind === "break" ? "shortBreakMinutes" : "focusMinutes";
  const fallback = kind === "break" ? 5 : 25;
  const minutes = preferenceMinutes(await context.getPreference(prefId), fallback);
  durationMs = minutes * 60 * 1000;
  remainingMs = durationMs;
  endsAt = Date.now() + remainingMs;
  phase = "running";
  await context.island.show({
    primary: labels().primary,
    secondary: `${formatRemaining(remainingMs)} · In progress`,
    progress: 0,
    action: { label: "Pause", command: "toggle-pomodoro" },
  });
  timerId = context.setInterval(() => void tick(context), 1000);
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
  } else {
    phase = "running";
    endsAt = Date.now() + remainingMs;
    timerId = context.setInterval(() => void tick(context), 1000);
  }
  await publish(context);
}

async function stop(context) {
  clearTicker(context);
  phase = "idle";
  remainingMs = durationMs;
  await context.island.dismiss();
}

export default {
  commands: [
    { name: "start-focus", title: "Pomodoro: Start Focus", run: (context) => start(context, "focus") },
    { name: "start-short-break", title: "Pomodoro: Start Short Break", run: (context) => start(context, "break") },
    { name: "toggle-pomodoro", title: "Pomodoro: Pause or Resume", run: toggle },
    { name: "stop-pomodoro", title: "Pomodoro: Stop", run: stop },
  ],
};
