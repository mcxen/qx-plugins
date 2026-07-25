/**
 * Pomodoro Island — declarative Workbench reference plugin.
 *
 * Business code owns timer state/history only. Qx renders list/detail/actions
 * and projects the same structured island data to docked or floating surfaces.
 */

const STATE_KEY = "pomodoro.state.v2";
const HISTORY_KEY = "pomodoro.history.v1";
const MAX_HISTORY = 120;

var qxLocale = "en";
var stopLocale = null;

function setLocale(context) {
  stopLocale?.();
  qxLocale = context?.locale?.current || "en";
  stopLocale = context?.locale?.onChange?.(({ current }) => {
    qxLocale = current || "en";
  }) || null;
}

function text(en, zh) {
  return qxLocale === "zh-CN" ? zh : en;
}

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
    islandVisible: true,
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
    islandVisible: raw.islandVisible !== false,
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
    return new Date(ts).toLocaleString(qxLocale);
  } catch {
    return String(ts);
  }
}

function kindLabel(kind) {
  return kind === "break" ? text("Short break", "短休息") : text("Focus session", "专注");
}

function nextKind(kind) {
  return kind === "break" ? "focus" : "break";
}

function startCommand(kind) {
  return kind === "break" ? "start-short-break" : "start-focus";
}

function startLabel(kind) {
  return kind === "break" ? text("Start Short Break", "开始短休息") : text("Start Focus", "开始专注");
}

function phaseLabel(phase) {
  if (phase === "running") return text("In progress", "进行中");
  if (phase === "paused") return text("Paused", "已暂停");
  if (phase === "complete") return text("Complete", "已完成");
  return text("Ready", "准备就绪");
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
  if (state.phase === "idle" || state.islandVisible === false) return null;
  if (state.phase === "complete") {
    const recommendedKind = nextKind(state.kind);
    return {
      primary: `${kindLabel(state.kind)} ${text("complete", "已完成")}`,
      secondary: recommendedKind === "break" ? text("Take a short break", "休息一下") : text("Ready to focus again", "准备再次专注"),
      progress: 100,
      tone: "success",
      action: {
        label: recommendedKind === "break" ? text("Start break", "开始休息") : text("Start focus", "开始专注"),
        command: startCommand(recommendedKind),
        icon: "play",
      },
    };
  }
  return {
    primary: kindLabel(state.kind),
    secondary: phaseLabel(state.phase),
    // Qx owns the animation and reduced-motion fallback. The absolute
    // countdown remains the timer truth and also drives the progress overlay.
    activity: state.phase === "running" ? "pulse" : undefined,
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
      label: state.phase === "paused" ? text("Resume", "继续") : text("Pause", "暂停"),
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
        title: `${kindLabel(latest.kind)} ${text("complete", "已完成")}`,
        body: latest.kind === "break" ? text("Time to focus again.", "该再次专注了。") : text("Take a short break.", "休息一下。"),
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
  setLocale(context);
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
  setLocale(context);
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
    islandVisible: true,
  });
  await publishIsland(context, state);
  armRuntimeTicker(context, state);
}

async function toggle(context) {
  setLocale(context);
  runtimeContext = context;
  const state = await readState(context);
  if (state.phase === "idle" || state.phase === "complete") {
    await start(context, state.phase === "complete" ? nextKind(state.kind) : state.kind);
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
  setLocale(context);
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
    kind: entry.kind === "break" ? "break" : "focus",
    title: kindLabel(entry.kind),
    subtitle: `${formatDate(entry.startedAt)} · ${formatRemaining(entry.elapsedMs || 0)}`,
    badge: completed ? "completed" : entry.outcome || "stopped",
    icon: entry.kind === "break" ? "☕" : "◉",
    tone: completed ? "success" : "warning",
    detail: {
      title: kindLabel(entry.kind),
      subtitle: formatDate(entry.startedAt),
      fields: [
        { label: text("Outcome", "结果"), value: entry.outcome || "—", tone: completed ? "success" : "warning" },
        { label: text("Started", "开始时间"), value: formatDate(entry.startedAt) },
        { label: text("Ended", "结束时间"), value: formatDate(entry.endedAt) },
        { label: text("Planned", "计划时长"), value: formatRemaining(entry.durationMs || 0) },
        { label: text("Elapsed", "已用时长"), value: formatRemaining(entry.elapsedMs || 0) },
      ],
    },
    actions: [{
      id: `again:${entry.kind}`,
      label: entry.kind === "break" ? text("Start another break", "再次开始休息") : text("Start another focus", "再次开始专注"),
      command: entry.kind === "break" ? "start-short-break" : "start-focus",
      primary: true,
    }],
    raw: entry,
  };
}

function activeItem(state, historyCount) {
  if (state.phase === "idle") return null;
  const phase = phaseLabel(state.phase);
  const tone = state.phase === "complete"
    ? "success"
    : state.phase === "paused"
      ? "warning"
      : "accent";
  return {
    id: `current:${state.sessionId || state.kind}`,
    kind: state.kind,
    title: kindLabel(state.kind),
    subtitle: `${formatRemaining(currentRemaining(state))} · ${phase}`,
    badge: phase,
    icon: state.kind === "break" ? "☕" : "◉",
    tone,
    progress: progressFor(state),
    detail: currentDetail(state, historyCount),
    raw: { current: true, state },
  };
}

function currentDetail(state, historyCount) {
  const remaining = currentRemaining(state);
  const body = state.phase === "running"
    ? text("Focus is running. You can pause or stop it from Actions, the bottom bar, or the QxIsland.", "专注正在进行中。你可以从操作区、底栏或 QxIsland 暂停或停止。")
    : state.phase === "paused"
      ? text("The timer is paused. Resume it from Actions or the QxIsland when you are ready.", "计时器已暂停，准备好后可从操作区或 QxIsland 继续。")
      : state.phase === "complete"
        ? text("This session is complete. Start another focus round or take a short break.", "本次已完成。可以再次专注或短暂休息。")
        : text("Start a focus round from Actions to begin timing.", "从操作区开始一轮专注以启动计时。");
  return {
    title: kindLabel(state.kind),
    subtitle: `${formatRemaining(remaining)} · ${phaseLabel(state.phase)}`,
    body,
    fields: [
      { label: text("State", "状态"), value: phaseLabel(state.phase), tone: state.phase === "complete" ? "success" : state.phase === "paused" ? "warning" : "accent" },
      { label: text("Remaining", "剩余"), value: formatRemaining(remaining) },
      { label: text("Progress", "进度"), value: `${Math.round(progressFor(state))}%` },
      { label: text("History", "历史"), value: historyCount },
      { label: text("Started", "开始时间"), value: formatDate(state.startedAt) },
      {
        label: "Island",
        value: state.phase === "idle" || state.islandVisible === false
          ? text("Hidden from Actions", "已从操作区隐藏")
          : text("Docked / floating by Qx settings", "由 Qx 设置控制停靠/浮动"),
      },
    ],
  };
}

function panelActions(state, hasHistory) {
  let actions;
  if (state.phase === "running" || state.phase === "paused") {
    actions = [
        {
          id: "toggle",
          label: state.phase === "paused" ? text("Resume", "继续") : text("Pause", "暂停"),
          command: "toggle-pomodoro",
          primary: true,
          kbd: "Enter",
        },
        { id: "stop", label: text("Stop", "停止"), command: "stop-pomodoro", tone: "danger" },
      ];
  } else if (state.phase === "complete") {
    const recommendedKind = nextKind(state.kind);
    actions = [
      {
        id: `next:${recommendedKind}`,
        label: startLabel(recommendedKind),
        command: startCommand(recommendedKind),
        primary: true,
        kbd: "Enter",
      },
      {
        id: `again:${state.kind}`,
        label: state.kind === "break" ? text("Repeat Short Break", "重复短休息") : text("Repeat Focus", "重复专注"),
        command: startCommand(state.kind),
      },
    ];
  } else {
    actions = [
        { id: "focus", label: text("Start Focus", "开始专注"), command: "start-focus", primary: true, kbd: "Enter" },
        { id: "break", label: text("Start Short Break", "开始短休息"), command: "start-short-break" },
      ];
  }
  if (state.phase !== "idle") {
    actions.push({
      id: "toggle-island",
      label: state.islandVisible === false
        ? text("Show Timer on Island", "在灵动岛显示计时器")
        : text("Hide Timer from Island", "从灵动岛隐藏计时器"),
    });
  }
  if (hasHistory) actions.push({ id: "clear-history", label: text("Clear History", "清除历史"), tone: "danger" });
  return actions;
}

function renderPanel(container, context) {
  setLocale(context);
  let destroyed = false;
  let state = defaultState();
  let history = [];
  let selectedId = null;
  let query = "";
  let tab = "all";
  let pollTimer = null;
  let activeItemId = null;

  const visibleHistory = () => {
    const normalizedQuery = query.trim().toLowerCase();
    const current = activeItem(state, history.length);
    const rows = [
      ...(current ? [current] : []),
      ...history.map(historyItem),
    ];
    return rows
      .filter((entry) => tab === "all" || entry.kind === tab)
      .filter((item) => !normalizedQuery || `${item.title} ${item.subtitle} ${item.badge}`.toLowerCase().includes(normalizedQuery));
  };

  const paint = () => {
    if (destroyed) return;
    const items = visibleHistory();
    if (selectedId && !items.some((item) => item.id === selectedId)) selectedId = null;
    context.ui.mountWorkbench({
      title: "Pomodoro",
      meta: `${phaseLabel(state.phase)} · ${history.length} ${text("sessions", "个会话")}`,
      query,
      queryPlaceholder: text("Filter history…", "筛选历史…"),
      tabs: [
        { id: "all", label: `${text("All", "全部")} (${history.length})`, active: tab === "all" },
        { id: "focus", label: text("Focus", "专注"), active: tab === "focus" },
        { id: "break", label: text("Breaks", "休息"), active: tab === "break" },
      ],
      items,
      selectedId,
      detail: currentDetail(state, history.length),
      actions: panelActions(state, history.length > 0),
      island: islandModel(state),
      backgroundPoll: { command: "pomodoro-heartbeat" },
      emptyText: text("No sessions yet — start a focus round from Actions", "还没有会话，请从操作区开始一轮专注"),
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
        if (id === "toggle-island") {
          state = await writeState(context, {
            ...state,
            islandVisible: state.islandVisible === false,
          });
          await publishIsland(context, state);
          context.showToast(state.islandVisible === false
            ? text("Pomodoro hidden from Island", "番茄钟已从灵动岛隐藏")
            : text("Pomodoro shown on Island", "番茄钟已显示在灵动岛"));
          paint();
          return;
        }
        if (id === "clear-history") {
          await context.storage.persist.set(HISTORY_KEY, []);
          history = [];
          selectedId = null;
          context.showToast(text("Pomodoro history cleared", "番茄钟历史已清除"));
          paint();
        }
      },
      onCommandComplete: () => void refresh(),
      onBackgroundPoll: () => void refresh(),
    });
  };

  const refresh = async () => {
    if (destroyed) return;
    const [nextState, nextHistory] = await Promise.all([readState(context), readHistory(context)]);
    if (destroyed) return;
    state = nextState;
    history = nextHistory;
    const nextActiveItemId = activeItem(nextState, nextHistory.length)?.id || null;
    if (nextActiveItemId !== activeItemId) {
      activeItemId = nextActiveItemId;
      selectedId = nextActiveItemId || (selectedId?.startsWith("current:") ? null : selectedId);
    }
    paint();
  };

  paint();
  void refresh();
  pollTimer = context.setInterval(() => {
    if (state.phase === "running") paint();
  }, 1000);

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
