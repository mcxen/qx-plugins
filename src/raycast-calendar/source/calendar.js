// Civil dates use UTC noon so travel, DST and the machine timezone cannot
// shift a displayed calendar date. Only today's date follows the local clock.
export const civil = (year, month, day = 1) => new Date(Date.UTC(year, month, day, 12));
export const dateKey = (date) => date.toISOString().slice(0, 10);
export const todayDate = (now = new Date()) => civil(now.getFullYear(), now.getMonth(), now.getDate());

let lunarFormatter;
export function lunarDate(date, locale = "zh-CN") {
  try {
    lunarFormatter ??= new Intl.DateTimeFormat("zh-CN-u-ca-chinese", {
      year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
    });
    if (lunarFormatter.resolvedOptions().calendar !== "chinese") return null;
    const parts = Object.fromEntries(lunarFormatter.formatToParts(date).map(({ type, value }) => [type, value]));
    const day = Number(parts.day);
    if (!parts.month || !parts.relatedYear || !Number.isInteger(day) || day < 1 || day > 30) return null;
    const digits = "一二三四五六七八九";
    const name = day === 10 ? "初十" : day === 20 ? "二十" : day === 30 ? "三十"
      : `${day < 10 ? "初" : day < 20 ? "十" : "廿"}${digits[(day - 1) % 10]}`;
    const chinese = locale === "zh-CN";
    return {
      short: chinese ? (day === 1 ? parts.month : name) : `${parts.month} ${day}`,
      full: chinese ? `${parts.yearName || parts.relatedYear}年${parts.month}${name}`
        : `Lunar ${parts.relatedYear} · ${parts.month} ${day}`,
    };
  } catch { return null; }
}

export function monthWeeks(year, month, weekStart = 1) {
  const offset = (civil(year, month).getUTCDay() - weekStart + 7) % 7;
  const count = Math.ceil((offset + civil(year, month + 1, 0).getUTCDate()) / 7);
  return Array.from({ length: count }, (_, row) =>
    Array.from({ length: 7 }, (_, col) => civil(year, month, 1 - offset + row * 7 + col)));
}

export function weekNumber(date, weekStart = 1) {
  const anchor = civil(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  if (weekStart === 0) {
    const start = civil(anchor.getUTCFullYear(), 0, 1);
    return Math.floor(((anchor - start) / 86400000 + start.getUTCDay()) / 7) + 1;
  }
  anchor.setUTCDate(anchor.getUTCDate() + 3 - (anchor.getUTCDay() + 6) % 7);
  return 1 + Math.floor((anchor - civil(anchor.getUTCFullYear(), 0, 1)) / 604800000);
}

// Published State Council schedule, not inferred from lunar festivals/weekends.
// Add a year only after checking its official notice. Missing years stay unknown.
export const schedules = {
  2026: {
    source: "https://www.beijing.gov.cn/cs/gncs/zcwj/202603/t20260327_4568275.html",
    document: "国办发明电〔2025〕7号",
    holidays: [
      ["元旦", "New Year", "01-01", "01-03", ["01-04"]],
      ["春节", "Spring Festival", "02-15", "02-23", ["02-14", "02-28"]],
      ["清明节", "Qingming", "04-04", "04-06", []],
      ["劳动节", "Labour Day", "05-01", "05-05", ["05-09"]],
      ["端午节", "Dragon Boat Festival", "06-19", "06-21", []],
      ["中秋节", "Mid-Autumn Festival", "09-25", "09-27", []],
      ["国庆节", "National Day", "10-01", "10-07", ["09-20", "10-10"]],
    ],
  },
};

export function holidayFor(date, locale = "zh-CN") {
  const key = dateKey(date);
  const schedule = schedules[date.getUTCFullYear()];
  for (const [zh, en, from, to, work] of schedule?.holidays || []) {
    const name = locale === "zh-CN" ? zh : en;
    if (work.includes(key.slice(5))) return { kind: "work", name };
    if (key.slice(5) >= from && key.slice(5) <= to) return { kind: "rest", name };
  }
  return null;
}
