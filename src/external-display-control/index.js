// Qx owns controls, navigation, themes and Actions; this module owns only brightness state.
const panels = new WeakMap();
const percent = (value) => Math.max(0, Math.min(100, Math.round(Number(value))));

function createPanel(context) {
  const zh = String(context.locale?.current || context.locale).startsWith("zh");
  const t = (en, cn) => zh ? cn : en;
  const state = {
    displays: [], selectedId: null, query: "", mode: "hardware", error: null,
    reading: false, writing: false, dead: false, generation: 0,
    queued: new Map(), pending: new Map(), timer: null, poll: null, view: null,
  };
  const method = (d) => d.backend === "software" ? t("Software dimming", "软件调光")
    : d.backend === "native" ? t("System brightness", "系统亮度") : "DDC/CI";
  const selected = () => state.displays.find((d) => d.id === state.selectedId);
  function paint() {
    if (state.dead) return;
    const displays = state.displays.filter((d) => (state.mode === "software") === (d.backend === "software"))
      .filter((d) => d.name.toLowerCase().includes(state.query.toLowerCase()));
    if (!displays.some((d) => d.id === state.selectedId)) state.selectedId = displays[0]?.id || null;
    const items = displays.map((d) => {
      const value = state.pending.get(d.id) ?? d.current;
      const available = d.supported && value != null;
      return {
        id: d.id, title: d.name,
        subtitle: value == null ? "—" : `${value}%`,
        detail: {
          title: d.name, subtitle: method(d),
          status: d.error ? { state: "error", label: d.error, error: d.error } : undefined,
          form: { controls: [{
            id: "brightness", label: `${t("Brightness", "亮度")} · ${value == null ? "—" : `${value}%`}`,
            type: "slider", value: String(value ?? 0), min: 0, max: 100, step: 1, disabled: !available,
          }] },
        },
      };
    });
    const d = selected();
    const actions = [{ id: "refresh", label: t("Refresh", "刷新"), menuKey: "r", kbd: "CmdOrCtrl+R" }];
    if (d?.supported && d.current != null) {
      actions.push({ id: "decrease", label: t("Decrease 5%", "降低 5%"), menuKey: "l" });
      actions.push({ id: "increase", label: t("Increase 5%", "提高 5%"), menuKey: "h" });
      if (d.backend === "software") actions.push({ id: "restore", label: t("Reset", "恢复"), menuKey: "s" });
    }
    state.view = context.ui.mountWorkbench({
      title: t("Display Brightness", "显示器亮度"), layout: { kind: "list" },
      cache: { mode: "disabled" }, query: state.query,
      queryPlaceholder: t("Find a display…", "查找显示器…"),
      selectedId: state.selectedId, items, actions, error: state.error,
      loading: state.reading && !state.displays.length,
      emptyText: t("No displays", "无显示器"),
      tabs: [
        { id: "hardware", label: t("Hardware", "硬件"), active: state.mode === "hardware" },
        { id: "software", label: t("Software", "软件"), active: state.mode === "software" },
      ],
      meta: state.writing ? t("Applying…", "正在调节…") : state.reading ? t("Refreshing…", "正在刷新…") : "",
    }, {
      onSelect(id) { state.selectedId = id; paint(); },
      onQuery(value) { state.query = value; paint(); },
      onTab(id) { if (!["hardware", "software"].includes(id)) return; state.mode = id; state.query = ""; paint(); },
      onInput(id, value, item) {
        if (id === "brightness") queue(item?.id || state.selectedId, value);
      },
      onAction(id) {
        const d = selected();
        if (id === "refresh") return refresh();
        if (!d) return;
        const value = state.pending.get(d.id) ?? d.current;
        if (id === "restore" && d.backend === "software") queue(d.id, 100);
        if (id === "increase") queue(d.id, value + 5);
        if (id === "decrease") queue(d.id, value - 5);
      },
    });
  }
  function queue(id, raw) {
    const d = state.displays.find((d) => d.id === id);
    if (state.dead || !d?.supported || !Number.isFinite(Number(raw))) return;
    const value = percent(raw);
    state.generation++;
    state.queued.set(id, value);
    state.pending.set(id, value);
    state.error = null;
    paint();
    if (!state.writing && state.timer == null) state.timer = context.setTimeout(flush, 80);
  }
  async function flush() {
    state.timer = null;
    if (state.dead || state.writing) return;
    state.writing = true;
    try {
      // One native request at a time; subsequent drag values replace the queued target.
      while (!state.dead && state.queued.size) {
        const [id, value] = state.queued.entries().next().value;
        state.queued.delete(id);
        try {
          await context.system.setDisplayBrightness(id, value);
          if (state.dead) return;
          const d = state.displays.find((d) => d.id === id);
          if (d) { d.current = value; d.rawCurrent = null; }
        } catch (error) {
          if (state.dead) return;
          state.error = String(error?.message || error);
          state.queued.delete(id);
        }
        if (!state.queued.has(id)) state.pending.delete(id);
        paint();
      }
    } finally {
      state.writing = false;
      if (!state.dead) { paint(); void refresh(); }
    }
  }
  async function refresh() {
    if (state.dead || state.reading || state.writing || state.queued.size) return;
    state.reading = true;
    const generation = state.generation;
    paint();
    try {
      const displays = await context.system.displayBrightness();
      if (state.dead || state.generation !== generation) return;
      if (!Array.isArray(displays)) throw new Error(t("Invalid display response", "显示器响应无效"));
      state.displays = displays;
    } catch (error) {
      if (!state.dead && state.generation === generation) state.error = String(error?.message || error);
    } finally {
      state.reading = false;
      paint();
    }
  }
  paint();
  void refresh();
  state.poll = context.setInterval(() => { if (!globalThis.document?.hidden) void refresh(); }, 5000);
  return { destroy() {
    state.dead = true;
    state.queued.clear(); state.pending.clear();
    if (state.timer != null) context.clearTimeout(state.timer);
    context.clearInterval(state.poll);
    state.view?.destroy();
  } };
}

export default {
  panel: {
    render(container, context) {
      panels.get(container)?.destroy();
      panels.set(container, createPanel(context));
    },
    destroy(container) { panels.get(container)?.destroy(); panels.delete(container); },
  },
};
