import { todayDate, civil, dateKey, schedules } from "./source/calendar.js";
import { renderCalendar, text } from "./source/view.js";

const sessions = new WeakMap();
export default {
  commands: [],
  panel: {
    render(container, context) {
      sessions.get(container)?.();
      let alive = true;
      const today = todayDate();
      const state = { year: today.getUTCFullYear(), month: today.getUTCMonth(), locale: context.locale.current,
        preferences: { weekStart: "1", showWeeks: true, viewMode: "1", showLunar: true } };
      let output;
      let actions;
      let lastToday = dateKey(today);
      const t = (en, zh) => text(state.locale, en, zh);
      function actionList() {
        return [
          { id: "today", label: t("Current month", "当前月份"), menuKey: "t", kbd: "CmdOrCtrl+T" },
          { id: "previous-month", label: t("Previous month", "上个月"), menuKey: "p", kbd: "CmdOrCtrl+ArrowLeft" },
          { id: "next-month", label: t("Next month", "下个月"), menuKey: "n", kbd: "CmdOrCtrl+ArrowRight" },
          { id: "previous-year", label: t("Previous year", "上一年"), menuKey: "y", kbd: "CmdOrCtrl+Shift+ArrowLeft" },
          { id: "next-year", label: t("Next year", "下一年"), menuKey: "u", kbd: "CmdOrCtrl+Shift+ArrowRight" },
          { id: "copy", label: t("Copy calendar", "复制日历"), menuKey: "c", kbd: "CmdOrCtrl+Shift+C" },
          { id: "source", label: t("Official holiday notice", "查看官方调休通知"), menuKey: "s", disabled: !schedules[state.year] },
        ].map((action) => ({ ...action, primary: false }));
      }
      function paint(resetScroll = false) {
        if (!alive) return;
        const old = container.querySelector("article");
        const scrollTop = resetScroll ? 0 : old?.scrollTop || 0;
        const focused = old === document.activeElement;
        output = renderCalendar(state);
        container.innerHTML = output.html;
        const article = container.querySelector("article");
        if (focused) article.focus({ preventScroll: true });
        article.scrollTop = scrollTop;
        actions?.update(actionList(), output.title);
      }
      async function onAction(id) {
        if (!alive) return;
        try {
          if (id === "copy") {
            await context.clipboard.write(output.markdown);
            if (alive) context.showToast(t("Calendar copied", "已复制日历"));
            return;
          }
          if (id === "source") {
            if (schedules[state.year]) await context.openUrl(schedules[state.year].source);
            return;
          }
          const deltas = { "previous-month": -1, "next-month": 1, "previous-year": -12, "next-year": 12 };
          if (id !== "today" && !(id in deltas)) return;
          const next = id === "today" ? todayDate() : civil(state.year, state.month + deltas[id]);
          if (next.getUTCFullYear() < 1900 || next.getUTCFullYear() > 2100) {
            context.showToast(t("Supported years: 1900–2100", "支持查看 1900–2100 年"));
            return;
          }
          state.year = next.getUTCFullYear(); state.month = next.getUTCMonth();
          paint(true);
        } catch (error) {
          if (alive) context.showToast(`${t("Operation failed", "操作失败")}: ${error.message || error}`);
        }
      }
      paint();
      actions = context.ui.mountActions(actionList(), { onAction, selectionTitle: output.title });
      const unsubscribe = context.locale.onChange(({ current }) => { state.locale = current; paint(); });
      const timer = context.setInterval(() => {
        const key = dateKey(todayDate());
        if (key !== lastToday) { lastToday = key; paint(); }
      }, 60000);
      sessions.set(container, () => {
        alive = false; context.clearInterval(timer); unsubscribe(); actions.destroy(); container.replaceChildren();
      });
      void Promise.all(Object.keys(state.preferences).map(async (key) => {
        try { const value = await context.getPreference(key); if (alive && value != null) state.preferences[key] = value; }
        catch { /* Keep documented defaults when preferences are unavailable. */ }
      })).then(() => paint());
    },
    destroy(container) { sessions.get(container)?.(); sessions.delete(container); },
  },
};
