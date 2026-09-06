import assert from "node:assert/strict";
import { civil, dateKey, lunarDate, todayDate, monthWeeks, holidayFor, schedules } from "../src/raycast-calendar/source/calendar.js";
import { renderCalendar } from "../src/raycast-calendar/source/view.js";
import plugin from "../src/raycast-calendar/index.js";

assert.equal(lunarDate(civil(2026, 1, 17)).full, "丙午年正月初一");
assert.equal(lunarDate(civil(2026, 1, 16)).full, "乙巳年腊月廿九");
assert.equal(lunarDate(civil(2025, 6, 25)).short, "闰六月");
assert.equal(lunarDate(civil(2026, 8, 25)).short, "十五");
assert.equal(lunarDate(civil(2026, 1, 26)).short, "初十");
assert.equal(lunarDate(civil(2026, 2, 8)).short, "二十");
assert.equal(lunarDate(civil(2026, 1, 17), "en").full, "Lunar 2026 · 正月 1");
assert.equal(holidayFor(civil(2026, 8, 20)).kind, "work");
assert.equal(holidayFor(civil(2026, 9, 10)).kind, "work");
assert.equal(holidayFor(civil(2026, 8, 25)).kind, "rest");
assert.equal(holidayFor(civil(2026, 8, 19)), null);
assert.equal(holidayFor(civil(2027, 0, 1)), null);
let rest = 0, work = 0;
for (let i = 1; i <= 365; i++) {
  const holiday = holidayFor(civil(2026, 0, i));
  rest += holiday?.kind === "rest"; work += holiday?.kind === "work";
}
assert.equal(rest, 33); assert.equal(work, 6);
assert.equal(schedules[2026].holidays.length, 7);
for (const start of [0, 1]) for (const year of [2024, 2025, 2026, 2027]) for (let month = 0; month < 12; month++) {
  const weeks = monthWeeks(year, month, start);
  assert.equal(weeks[0][0].getUTCDay(), start);
  assert(weeks.length >= 4 && weeks.length <= 6);
  const current = weeks.flat().filter((d) => d.getUTCMonth() === month);
  assert.equal(current.length, civil(year, month + 1, 0).getUTCDate());
  assert.equal(new Set(current.map(dateKey)).size, current.length);
}
const preferences = { weekStart: "1", showWeeks: true, viewMode: "1", showLunar: true };
const state = { year: 2026, month: 8, locale: "zh-CN", preferences };
const view = renderCalendar(state, new Date(2026, 8, 6, 1));
assert.match(view.html, /国庆节/); assert.match(view.html, /09-20、10-10/);
assert.match(view.html, /2026-09-20[^\"]*班/);
assert.match(view.markdown, /中秋节 休/); assert.match(view.markdown, /国庆节 班/);
assert.match(view.html, /aria-current="date"/);
assert.equal(dateKey(todayDate(new Date(2026, 8, 6, 1))), "2026-09-06");
assert.doesNotMatch(renderCalendar({ ...state, preferences: { ...preferences, showLunar: false } }).html, /class="lunar"/);
assert.match(renderCalendar({ ...state, year: 2027 }).html, /暂未收录/);
assert.match(renderCalendar({ ...state, locale: "en" }).html, /Make-up workdays/);

// Exercise the shipped bundle, including late preference responses after destroy.
globalThis.document = { activeElement: null };
function fixture(deferred = false) {
  const article = { scrollTop: 0, focus() {} };
  const container = { innerHTML: "", querySelector: () => article, replaceChildren() { this.innerHTML = ""; } };
  let handlers, localeListener, interval, resolvePreference;
  let disposed = 0, copied = "", opened = "";
  const pending = new Promise((resolve) => { resolvePreference = resolve; });
  const context = {
    locale: { current: "zh-CN", onChange(fn) { localeListener = fn; return () => disposed++; } },
    getPreference: () => deferred ? pending : Promise.resolve(null),
    ui: { mountActions(actions, next) {
      assert.equal(new Set(actions.map((a) => a.menuKey)).size, actions.length);
      handlers = next;
      return { update() {}, destroy() { disposed++; } };
    } },
    setInterval(fn) { interval = fn; return 1; }, clearInterval() { disposed++; },
    clipboard: { async write(value) { copied = value; } },
    async openUrl(value) { opened = value; }, showToast() {},
  };
  return { container, context, get handlers() { return handlers; }, get disposed() { return disposed; },
    get copied() { return copied; }, get opened() { return opened; },
    locale: (value) => localeListener({ current: value }), tick: () => interval(), resolvePreference };
}
const f = fixture(); plugin.panel.render(f.container, f.context);
await new Promise((resolve) => setImmediate(resolve));
assert.match(f.container.innerHTML, /中国节假日调休表/);
await f.handlers.onAction("next-month"); await f.handlers.onAction("previous-month");
await f.handlers.onAction("today"); await f.handlers.onAction("copy");
assert.match(f.copied, /调休表/);
await f.handlers.onAction("source");
if (new Date().getFullYear() === 2026) assert.equal(f.opened, schedules[2026].source);
f.locale("en"); assert.match(f.container.innerHTML, /China holidays/); f.tick();
plugin.panel.destroy(f.container); assert.equal(f.disposed, 3); assert.equal(f.container.innerHTML, "");
const late = fixture(true); plugin.panel.render(late.container, late.context); plugin.panel.destroy(late.container);
late.resolvePreference(false); await new Promise((resolve) => setImmediate(resolve));
assert.equal(late.container.innerHTML, ""); assert.equal(late.disposed, 3);
console.log("calendar smoke passed: lunar boundaries/leap month, official schedule, month grids, locales, export and lifecycle");
