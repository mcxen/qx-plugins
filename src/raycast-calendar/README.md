# Quick Calendar

Qx community plugin, retaining the original `raycast-calendar` installation ID
and the monthly browsing intent of [fuksman's Calendar](https://github.com/raycast/extensions/tree/master/extensions/calendar).
The runtime now uses Qx ports directly, without the frozen Raycast shim.

- 月历显示公历与中国农历（含闰月），今天高亮；设置可关闭农历。
- 「休」表示官方放假区间，「班」表示调休补班，普通周末不加调休标记。
- 月历下方列出全年放假与补班日期；Actions 可打开官方原文、切换月份/年份、回到当前月份、复制 Markdown 日历和调休表。
- 保留周一/周日起始、周数、紧凑/宽阔偏好；界面跟随 Qx 中英文设置。

Lunar dates are calculated offline using the runtime's `Intl` Chinese calendar,
with civil dates anchored to UTC noon to avoid timezone/DST shifts. The current
day follows the local clock. Browsing supports 1900–2100; an unsupported runtime
shows an explicit lunar-unavailable message rather than Gregorian substitutes.

Holiday data currently includes **2026 mainland China only**, verified against
[国办发明电〔2025〕7号](https://www.beijing.gov.cn/cs/gncs/zcwj/202603/t20260327_4568275.html)
on 2026-09-06. Other years explicitly show that no schedule is included; neither
lunar festivals nor weekends are used to invent official days off. New annual
notices require a plugin data update. No HTTP requests are needed to view dates.

Build: `npm run build:calendar`; check: `npm run smoke:calendar`;
package: `npm run package:one -- --only=raycast-calendar`.
