/**
 * Pomodoro Island — declarative Workbench reference plugin.
 *
 * Business code owns timer state/history only. Qx renders list/detail/actions
 * and projects the same structured island data to docked or floating surfaces.
 */

const STATE_KEY = "pomodoro.state.v2";
const HISTORY_KEY = "pomodoro.history.v1";
const MAX_HISTORY = 120;

let runtimeTimerId = null;
let runtimeContext = null;
let runtimeState = null;
let completingSessionId = null;

function defaultState() {
  return {
    phase: "idle",
    kind: "focus",
    durationMs: 25 * 60 * 1000,
    remainingMs: 25 * 60 * 1000,
    startedAt: null,
    endsAt: null,
    sessionId: null,
  };
}

function normalizeState(value) {
  const fallback = defaultState();
  const raw = value && typeof value === "object" ? value : {};
  const phase = ["idle", "running", "paused", "complete"].includes(raw.phase)
    ? raw.phase
    : fallback.phase;
  const durationMs = Number.isFinite(Number(raw.durationMs)) && Number(raw.durationMs) > 0
    ? Number(raw.durationMs)
    : fallback.durationMs;
  return {
    phase,
    kind: raw.kind === "break" ? "break" : "focus",
    durationMs,
    remainingMs: Number.isFinite(Number(raw.remainingMs))
      ? Math.max(0, Math.min(durationMs, Number(raw.remainingMs)))
      : durationMs,
    startedAt: Number.isFinite(Number(raw.startedAt)) ? Number(raw.startedAt) : null,
    endsAt: Number.isFinite(Number(raw.endsAt)) ? Number(raw.endsAt) : null,
    sessionId: raw.sessionId ? String(raw.sessionId) : null,
  };
}

function preferenceMinutes(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(180, parsed) : fallback;
}

function currentRemaining(state, now = Date.now()) {
  if (state.phase === "running" && state.endsAt) return Math.max(0, state.endsAt - now);
  return Math.max(0, state.remainingMs);
}

function formatRemaining(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatDate(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

function kindLabel(kind) {
  return kind === "break" ? "Short break" : "Focus session";
}

function phaseLabel(phase) {
  if (phase === "running") return "In progress";
  if (phase === "paused") return "Paused";
  if (phase === "complete") return "Complete";
  return "Ready";
}

function progressFor(state) {
  if (state.phase === "idle") return 0;
  if (state.phase === "complete") return 100;
  if (state.durationMs <= 0) return 0;
  return Math.max(0, Math.min(100, ((state.durationMs - currentRemaining(state)) / state.durationMs) * 100));
}

async function readState(context) {
  try {
    return normalizeState(await context.storage.persist.get(STATE_KEY));
  } catch {
    return defaultState();
  }
}

async function writeState(context, state) {
  runtimeState = normalizeState(state);
  await context.storage.persist.set(STATE_KEY, runtimeState);
  return runtimeState;
}

async function readHistory(context) {
  try {
    const value = await context.storage.persist.get(HISTORY_KEY);
    return Array.isArray(value) ? value.slice(0, MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

async function appendHistory(context, state, outcome, endedAt = Date.now()) {
  if (!state.startedAt || !state.sessionId) return;
  const history = await readHistory(context);
  const elapsedMs = Math.max(0, Math.min(state.durationMs, state.durationMs - currentRemaining(state, endedAt)));
  const entry = {
    id: state.sessionId,
    kind: state.kind,
    outcome,
    startedAt: state.startedAt,
    endedAt,
    durationMs: state.durationMs,
    elapsedMs: outcome === "completed" ? state.durationMs : elapsedMs,
  };
  const next = [entry, ...history.filter((item) => item?.id !== entry.id)].slice(0, MAX_HISTORY);
  await context.storage.persist.set(HISTORY_KEY, next);
}

function islandModel(state) {
  if (state.phase === "idle") return null;
  if (state.phase === "complete") {
    return {
      primary: `${kindLabel(state.kind)} complete`,
      secondary: "Ready for the next round",
      progress: 100,
      tone: "success",
      action: {
        label: "Again",
        command: state.kind === "break" ? "start-short-break" : "start-focus",
        icon: "play",
      },
    };
  }
  return {
    primary: kindLabel(state.kind),
    secondary: phaseLabel(state.phase),
    countdown: state.phase === "paused"
      ? {
          remainingMs: currentRemaining(state),
          durationMs: state.durationMs,
          paused: true,
        }
      : {
          endsAt: state.endsAt || undefined,
          remainingMs: state.endsAt ? undefined : currentRemaining(state),
          durationMs: state.durationMs,
          paused: false,
        },
    tone: state.phase === "paused" ? "warning" : "neutral",
    action: {
      label: state.phase === "paused" ? "Resume" : "Pause",
      command: "toggle-pomodoro",
      icon: state.phase === "paused" ? "play" : "pause",
    },
  };
}

async function publishIsland(context, state) {
  const model = islandModel(state);
  try {
    if (!model) {
      await context.island.dismiss();
      return;
    }
    await context.island.update(model).catch(() => context.island.show(model));
  } catch {
    /* Island is optional; timer/history remain valid. */
  }
}

function clearRuntimeTicker(context = runtimeContext) {
  if (runtimeTimerId != null && context) context.clearInterval(runtimeTimerId);
  runtimeTimerId = null;
}

async function complete(context, state) {
  if (!state.sessionId || completingSessionId === state.sessionId) return;
  completingSessionId = state.sessionId;
  try {
    const latest = await readState(context);
    if (latest.phase !== "running" || latest.sessionId !== state.sessionId) return;
    clearRuntimeTicker(context);
    await appendHistory(context, latest, "completed");
    const completeState = await writeState(context, {
      ...latest,
      phase: "complete",
      remainingMs: 0,
      endsAt: null,
    });
    await publishIsland(context, completeState);
    try {
      await context.notification.show({
        title: `${kindLabel(latest.kind)} complete`,
        body: latest.kind === "break" ? "Time to focus again." : "Take a short break.",
      });
    } catch {
      /* notifications are best effort */
    }
  } finally {
    completingSessionId = null;
  }
}

function armRuntimeTicker(context, state) {
  clearRuntimeTicker(context);
  runtimeContext = context;
  runtimeState = state;
  if (state.phase !== "running") return;
  runtimeTimerId = context.setInterval(async () => {
    if (!runtimeState || runtimeState.phase !== "running") return;
    runtimeState.remainingMs = currentRemaining(runtimeState);
    if (runtimeState.remainingMs <= 0) {
      await complete(context, runtimeState);
    }
  }, 1000);
}

/**
 * Host-scheduled recovery heartbeat. The panel is not involved: it reconciles
 * an expired persisted deadline after panel close, app wake or runtime reload.
 */
async function reconcileBackgroundTimer(context) {
  runtimeContext = context;
  const state = await readState(context);
  runtimeState = state;
  if (state.phase === "running") {
    if (currentRemaining(state) <= 0) {
      await complete(context, state);
      return;
    }
    await publishIsland(context, state);
    if (runtimeTimerId == null) armRuntimeTicker(context, state);
    return;
  }
  clearRuntimeTicker(context);
  await publishIsland(context, state);
}

async function start(context, kind) {
  runtimeContext = context;
  const previous = await readState(context);
  if (previous.phase === "running" || previous.phase === "paused") {
    await appendHistory(context, previous, "replaced");
  }
  const isBreak = kind === "break";
  const prefId = isBreak ? "shortBreakMinutes" : "focusMinutes";
  const minutes = preferenceMinutes(await context.getPreference(prefId), isBreak ? 5 : 25);
  const durationMs = minutes * 60 * 1000;
  const now = Date.now();
  const state = await writeState(context, {
    phase: "running",
    kind: isBreak ? "break" : "focus",
    durationMs,
    remainingMs: durationMs,
    startedAt: now,
    endsAt: now + durationMs,
    sessionId: `${now}-${isBreak ? "break" : "focus"}`,
  });
  await publishIsland(context, state);
  armRuntimeTicker(context, state);
}

async function toggle(context) {
  runtimeContext = context;
  const state = await readState(context);
  if (state.phase === "idle" || state.phase === "complete") {
    await start(context, state.kind);
    return;
  }
  if (state.phase === "running") {
    const paused = await writeState(context, {
      ...state,
      phase: "paused",
      remainingMs: currentRemaining(state),
      endsAt: null,
    });
    clearRuntimeTicker(context);
    await publishIsland(context, paused);
    return;
  }
  const resumed = await writeState(context, {
    ...state,
    phase: "running",
    endsAt: Date.now() + state.remainingMs,
  });
  await publishIsland(context, resumed);
  armRuntimeTicker(context, resumed);
}

async function stop(context) {
  runtimeContext = context;
  const state = await readState(context);
  clearRuntimeTicker(context);
  if (state.phase === "running" || state.phase === "paused") {
    await appendHistory(context, state, "stopped");
  }
  await writeState(context, {
    ...state,
    phase: "idle",
    remainingMs: state.durationMs,
    startedAt: null,
    endsAt: null,
    sessionId: null,
  });
  await publishIsland(context, defaultState());
}

function historyItem(entry) {
  const completed = entry.outcome === "completed";
  return {
    id: String(entry.id),
    title: kindLabel(entry.kind),
    subtitle: `${formatDate(entry.startedAt)} · ${formatRemaining(entry.elapsedMs || 0)}`,
    badge: completed ? "completed" : entry.outcome || "stopped",
    icon: entry.kind === "break" ? "☕" : "◉",
    tone: completed ? "success" : "warning",
    detail: {
      title: kindLabel(entry.kind),
      subtitle: formatDate(entry.startedAt),
      fields: [
        { label: "Outcome", value: entry.outcome || "—", tone: completed ? "success" : "warning" },
        { label: "Started", value: formatDate(entry.startedAt) },
        { label: "Ended", value: formatDate(entry.endedAt) },
        { label: "Planned", value: formatRemaining(entry.durationMs || 0) },
        { label: "Elapsed", value: formatRemaining(entry.elapsedMs || 0) },
      ],
    },
    actions: [{
      id: `again:${entry.kind}`,
      label: entry.kind === "break" ? "Start another break" : "Start another focus",
      command: entry.kind === "break" ? "start-short-break" : "start-focus",
      primary: true,
    }],
    raw: entry,
  };
}

function currentDetail(state, historyCount) {
  const remaining = currentRemaining(state);
  return {
    title: kindLabel(state.kind),
    subtitle: `${formatRemaining(remaining)} · ${phaseLabel(state.phase)}`,
    body: "The panel publishes pure business data. Qx owns the list, detail, keyboard navigation, Actions and island surfaces.",
    fields: [
      { label: "State", value: phaseLabel(state.phase), tone: state.phase === "complete" ? "success" : state.phase === "paused" ? "warning" : "accent" },
      { label: "Remaining", value: formatRemaining(remaining) },
      { label: "Progress", value: `${Math.round(progressFor(state))}%` },
      { label: "History", value: historyCount },
      { label: "Island", value: state.phase === "idle" ? "Hidden" : "Docked / floating by Qx settings" },
    ],
  };
}

function panelActions(state, hasHistory) {
  const actions = state.phase === "running" || state.phase === "paused"
    ? [
        {
          id: "toggle",
          label: state.phase === "paused" ? "Resume" : "Pause",
          command: "toggle-pomodoro",
          primary: true,
          kbd: "Enter",
        },
        { id: "stop", label: "Stop", command: "stop-pomodoro", tone: "danger" },
      ]
    : [
        { id: "focus", label: "Start Focus", command: "start-focus", primary: true, kbd: "Enter" },
        { id: "break", label: "Start Short Break", command: "start-short-break" },
      ];
  if (hasHistory) actions.push({ id: "clear-history", label: "Clear History", tone: "danger" });
  return actions;
}

function renderPanel(container, context) {
  let destroyed = false;
  let state = defaultState();
  let history = [];
  let selectedId = null;
  let query = "";
  let tab = "all";
  let pollTimer = null;

  const visibleHistory = () => {
    const normalizedQuery = query.trim().toLowerCase();
    return history
      .filter((entry) => tab === "all" || entry.kind === tab)
      .map(historyItem)
      .filter((item) => !normalizedQuery || `${item.title} ${item.subtitle} ${item.badge}`.toLowerCase().includes(normalizedQuery));
  };

  const paint = () => {
    if (destroyed) return;
    const items = visibleHistory();
    if (selectedId && !items.some((item) => item.id === selectedId)) selectedId = null;
    context.ui.mountWorkbench({
      title: "Pomodoro",
      meta: `${phaseLabel(state.phase)} · ${history.length} sessions`,
      query,
      queryPlaceholder: "Filter history…",
      tabs: [
        { id: "all", label: `All (${history.length})`, active: tab === "all" },
        { id: "focus", label: "Focus", active: tab === "focus" },
        { id: "break", label: "Breaks", active: tab === "break" },
      ],
      items,
      selectedId,
      detail: currentDetail(state, history.length),
      actions: panelActions(state, history.length > 0),
      island: islandModel(state),
      backgroundPoll: { command: "pomodoro-heartbeat" },
      emptyText: "No sessions yet — start a focus round from Actions",
    }, {
      onTab: (id) => {
        tab = id || "all";
        selectedId = null;
        paint();
      },
      onQuery: (value) => {
        query = value;
        paint();
      },
      onSelect: (id) => {
        selectedId = id;
        paint();
      },
      onAction: async (id) => {
        if (id !== "clear-history") return;
        await context.storage.persist.set(HISTORY_KEY, []);
        history = [];
        selectedId = null;
        context.showToast("Pomodoro history cleared");
        paint();
      },
      onBackgroundPoll: () => void refresh(),
    });
  };

  const refresh = async () => {
    if (destroyed) return;
    const [nextState, nextHistory] = await Promise.all([readState(context), readHistory(context)]);
    if (destroyed) return;
    state = nextState;
    history = nextHistory;
    paint();
  };

  paint();
  void refresh();
  pollTimer = context.setInterval(() => void refresh(), 750);

  return () => {
    destroyed = true;
    if (pollTimer != null) context.clearInterval(pollTimer);
  };
}

let destroyPanel = null;

export default {
  commands: [
    { name: "start-focus", title: "Pomodoro: Start Focus", run: (context) => start(context, "focus") },
    { name: "start-short-break", title: "Pomodoro: Start Short Break", run: (context) => start(context, "break") },
    { name: "toggle-pomodoro", title: "Pomodoro: Pause or Resume", run: toggle },
    { name: "stop-pomodoro", title: "Pomodoro: Stop", run: stop },
    { name: "pomodoro-heartbeat", title: "Pomodoro: Background Heartbeat", run: reconcileBackgroundTimer },
  ],
  panel: {
    title: "Pomodoro",
    render(container, context) {
      destroyPanel?.();
      destroyPanel = renderPanel(container, context);
    },
    destroy(container) {
      destroyPanel?.();
      destroyPanel = null;
      container.innerHTML = "";
    },
  },
};
