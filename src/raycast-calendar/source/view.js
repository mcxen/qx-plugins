import { civil, dateKey, todayDate, lunarDate, monthWeeks, weekNumber, schedules, holidayFor } from "./calendar.js";

const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const text = (locale, en, zh) => locale === "zh-CN" ? zh : en;

export const styles = `
.quick-calendar{box-sizing:border-box;height:100%;overflow:auto;padding:16px;color:var(--qx-text-primary);font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-variant-numeric:tabular-nums}
.quick-calendar h2{font-size:16px;margin:0 0 12px;font-weight:600}
.quick-calendar h3{font-size:13px;margin:20px 0 8px;font-weight:600}
.quick-calendar table{border-collapse:collapse;width:100%;table-layout:fixed}
.quick-calendar th{font-weight:500;color:var(--qx-text-secondary);font-size:11px;padding:6px 2px;text-align:center}
.quick-calendar td{border-top:1px solid var(--qx-border-1);padding:8px 2px;text-align:center;vertical-align:top}
.quick-calendar .week{width:25px;color:var(--qx-text-tertiary);font-size:11px}
.quick-calendar .day{display:block;font-size:15px;line-height:22px}
.quick-calendar .lunar{display:block;font-size:10px;line-height:16px;color:var(--qx-text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.quick-calendar .today{background:var(--qx-accent-soft);box-shadow:inset 0 0 0 1px var(--qx-accent);border-radius:var(--qx-control-radius)}
.quick-calendar .rest .day,.quick-calendar .rest .mark{color:var(--qx-danger)}
.quick-calendar .work .day,.quick-calendar .work .mark{color:var(--qx-accent)}
.quick-calendar .mark{display:block;min-height:14px;font-size:10px;line-height:14px}
.quick-calendar .note{color:var(--qx-text-secondary);font-size:11px;line-height:1.6;margin:8px 0;overflow-wrap:anywhere}
.quick-calendar .schedule th,.quick-calendar .schedule td{text-align:left;padding:8px 6px;overflow-wrap:anywhere;font-size:12px}
.quick-calendar .schedule th:first-child{width:24%}
.quick-calendar.compact{max-width:600px;margin:auto;padding:12px}
.quick-calendar.compact td{padding-top:4px;padding-bottom:4px}
@media(max-width:420px){.quick-calendar{padding:10px}.quick-calendar .day{font-size:13px}.quick-calendar .schedule th,.quick-calendar .schedule td{font-size:11px;padding:6px 3px}}
`;

export function renderCalendar({ year, month, locale, preferences }, now = new Date()) {
  const t = (en, zh) => text(locale, en, zh);
  const title = civil(year, month).toLocaleDateString(locale, { year: "numeric", month: "long", timeZone: "UTC" });
  const today = dateKey(todayDate(now));
  const start = preferences.weekStart === "0" ? 0 : 1;
  const showWeeks = preferences.showWeeks !== false;
  const showLunar = preferences.showLunar !== false;
  const weeks = monthWeeks(year, month, start);
  const weekHeader = showWeeks ? `<th class="week" scope="col">#</th>` : "";
  const heading = weeks[0].map((day) => `<th scope="col">${escape(day.toLocaleDateString(locale, { weekday: "short", timeZone: "UTC" }))}</th>`).join("");
  let lunarUnavailable = false;
  const rows = weeks.map((week) => `<tr>${showWeeks ? `<td class="week">${weekNumber(week[0], start)}</td>` : ""}${week.map((day) => {
    if (day.getUTCMonth() !== month) return "<td></td>";
    const lunar = showLunar ? lunarDate(day, locale) : null;
    if (showLunar && !lunar) lunarUnavailable = true;
    const holiday = holidayFor(day, locale);
    const marker = holiday ? (holiday.kind === "rest" ? t("Off", "休") : t("Work", "班")) : "";
    const label = [dateKey(day), lunar?.full, holiday?.name, marker, dateKey(day) === today ? t("Today", "今天") : ""].filter(Boolean).join(" · ");
    return `<td class="${holiday?.kind || ""} ${dateKey(day) === today ? "today" : ""}" title="${escape(label)}" aria-label="${escape(label)}" ${dateKey(day) === today ? 'aria-current="date"' : ""}><span class="day">${day.getUTCDate()}</span>${showLunar ? `<span class="lunar">${escape(lunar?.short || "—")}</span>` : ""}<span class="mark">${marker}</span></td>`;
  }).join("")}</tr>`).join("");
  const schedule = schedules[year];
  const scheduleRows = (schedule?.holidays || []).map(([zh, en, from, to, work]) =>
    `<tr><td>${escape(t(en, zh))}</td><td>${from} – ${to}</td><td>${work.length ? work.join(t(", ", "、")) : t("None", "无")}</td></tr>`).join("");
  const unknown = t("No mainland China holiday schedule included for this year.", "此年份暂未收录中国大陆放假调休安排。");
  const notice = schedule ? t("Off = holiday · Work = make-up working day", "休：放假 · 班：调休补班") : unknown;
  const html = `<style>${styles}</style><article class="quick-calendar ${preferences.viewMode === "0" ? "compact" : ""}" tabindex="0" aria-label="${escape(title)}"><h2>${escape(title)}</h2><table aria-label="${escape(title)}"><thead><tr>${weekHeader}${heading}</tr></thead><tbody>${rows}</tbody></table><p class="note">${notice}</p>${lunarUnavailable ? `<p class="note">${t("Chinese calendar is unavailable in this runtime.", "当前运行环境不支持农历显示。")}</p>` : ""}<h3>${year} ${t("China holidays & make-up workdays", "中国节假日调休表")}</h3>${schedule ? `<table class="schedule"><thead><tr><th scope="col">${t("Holiday", "节日")}</th><th scope="col">${t("Days off", "放假日期")}</th><th scope="col">${t("Make-up workdays", "补班日期")}</th></tr></thead><tbody>${scheduleRows}</tbody></table><p class="note">${t("State Council", "国务院办公厅")} · ${schedule.document}</p>` : `<p class="note">${unknown}</p>`}</article>`;
  // Markdown export carries both date annotations and the full annual schedule.
  const headers = weeks[0].map((day) => day.toLocaleDateString(locale, { weekday: "short", timeZone: "UTC" }));
  if (showWeeks) headers.unshift("#");
  const markdownRows = weeks.map((week) => {
    const cells = week.map((day) => {
      if (day.getUTCMonth() !== month) return "";
      const lunar = showLunar ? lunarDate(day, locale) : null;
      const holiday = holidayFor(day, locale);
      return [day.getUTCDate(), lunar?.short, holiday ? `${holiday.name} ${holiday.kind === "rest" ? t("Off", "休") : t("Work", "班")}` : ""].filter(Boolean).join(" ");
    });
    if (showWeeks) cells.unshift(weekNumber(week[0], start));
    return `| ${cells.join(" | ")} |`;
  });
  const markdown = [`## ${title}`, `| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...markdownRows, "", notice, "", `### ${year} ${t("China holidays & make-up workdays", "中国节假日调休表")}`,
    ...(schedule ? [`| ${t("Holiday | Days off | Make-up workdays", "节日 | 放假日期 | 补班日期")} |`, "| --- | --- | --- |", ...schedule.holidays.map(([zh, en, from, to, work]) => `| ${t(en, zh)} | ${from} – ${to} | ${work.join(", ") || t("None", "无")} |`), "", `[${schedule.document}](${schedule.source})`] : [unknown])].join("\n");
  return { html, markdown, title };
}
