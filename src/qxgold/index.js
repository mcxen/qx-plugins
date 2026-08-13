const PRICE_URL = "https://api.jdjygold.com/gw/generic/hj/h5/m/latestPrice?reqData={}";
const CACHE_KEY = "qxgold.history.v1";
const MAX_POINTS = 720;

let locale = "en";
function setLocale(context) {
  locale = context?.locale?.current || "en";
}
function text(en, zh) { return locale === "zh-CN" ? zh : en; }
function number(value, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
}
function formatTime(value) {
  const date = new Date(Number(value));
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(date);
}
function readHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => Number.isFinite(Number(item?.price)) && Number.isFinite(Number(item?.time)))
    .map((item) => ({
      price: Number(item.price),
      yesterdayPrice: Number(item.yesterdayPrice),
      change: Number(item.change),
      changeRate: String(item.changeRate || ""),
      time: Number(item.time),
      productSku: String(item.productSku || ""),
    }));
}
function trimHistory(history, days) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return [...history]
    .filter((item) => Number(item.time) >= cutoff)
    .sort((a, b) => Number(a.time) - Number(b.time))
    .slice(-MAX_POINTS);
}
function mergeHistory(history, sample, days) {
  const byTime = new Map(readHistory(history).map((item) => [Number(item.time), item]));
  byTime.set(Number(sample.time), sample);
  return trimHistory([...byTime.values()], days);
}
function historyRange(history) {
  if (history.length < 2) return text("Waiting for more real samples", "等待更多真实采样");
  return `${formatTime(history[0].time)} – ${formatTime(history.at(-1).time)}`;
}
function historyStats(history) {
  const prices = history.map((item) => Number(item.price)).filter(Number.isFinite);
  return {
    low: prices.length ? Math.min(...prices) : null,
    high: prices.length ? Math.max(...prices) : null,
  };
}

async function preference(context, id, fallback) {
  try { return String(await context.getPreference(id) || fallback); } catch { return fallback; }
}
async function islandEnabled(context) {
  return (await preference(context, "showInIsland", "on")) !== "off";
}
async function loadCache(context) {
  try { return readHistory(await context.storage.persist.get(CACHE_KEY)); } catch { return []; }
}
async function saveCache(context, history) {
  try { await context.storage.persist.set(CACHE_KEY, history); } catch { /* cache is optional */ }
}
async function fetchPrice(context) {
  const response = await context.http.fetch(PRICE_URL, {
    method: "GET", timeoutMs: 20_000,
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 QX Gold/1.0" },
  });
  if (!response?.ok) throw new Error(`Gold API HTTP ${response?.status || "error"}`);
  const payload = await response.json();
  const data = payload?.resultData?.datas;
  if (payload?.resultCode !== 0 || !data?.price) throw new Error(payload?.resultMsg || text("Gold data unavailable", "金价数据不可用"));
  return {
    price: Number(data.price),
    yesterdayPrice: Number(data.yesterdayPrice),
    change: Number(data.upAndDownAmt),
    changeRate: String(data.upAndDownRate || ""),
    time: Number(data.time) || Date.now(),
    productSku: String(data.productSku || ""),
  };
}

export default {
  panel: {
    title: "QX Gold 金价追踪",
    render(container, context) {
      setLocale(context);
      const state = { history: [], current: null, loading: false, error: null, view: null, dead: false, timer: null };
      const paint = () => {
        if (state.dead) return;
        const current = state.current || state.history.at(-1);
        const price = current?.price;
        const stats = historyStats(state.history);
        const chart = state.history.length >= 2 ? {
          type: "line",
          title: text("Real sampled history", "真实采样历史"),
          subtitle: historyRange(state.history),
          unit: text("CNY / gram", "元/克"),
          valueLabel: text("Latest", "最新"),
          value: `${number(price)} 元/克`,
          points: state.history.map((point) => ({
            label: formatTime(point.time),
            value: point.price,
          })),
        } : undefined;
        const item = current ? {
          id: "gold",
          title: text("JD Gold · Accumulated Gold", "京东金融 · 积存金"),
          subtitle: `${number(price)} 元/克 · ${formatTime(current.time)}`,
          badge: current.change >= 0 ? `▲ ${number(current.change)} (${current.changeRate})` : `▼ ${number(current.change)} (${current.changeRate})`,
          tone: current.change >= 0 ? "accent" : "neutral",
          detail: {
            title: text("Gold Price Trend", "金价走势"),
            subtitle: `${number(price)} 元/克 · ${text("Updated", "更新于")} ${formatTime(current.time)}`,
            status: state.loading ? { state: "loading", label: text("Refreshing gold price…", "正在刷新金价…") } : undefined,
            chart,
            fields: [
              { label: text("Current", "当前价"), value: `${number(price)} 元/克` },
              { label: text("Change", "涨跌额"), value: `${number(current.change)} 元` },
              { label: text("Change rate", "涨跌幅"), value: current.changeRate || "—" },
              { label: text("Yesterday", "昨收"), value: `${number(current.yesterdayPrice)} 元/克` },
              { label: text("Sample high", "采样最高"), value: stats.high == null ? "—" : `${number(stats.high)} 元/克` },
              { label: text("Sample low", "采样最低"), value: stats.low == null ? "—" : `${number(stats.low)} 元/克` },
              { label: text("Samples", "采样数"), value: String(state.history.length) },
            ],
            sections: [{
              title: text("Data provenance", "数据来源"),
              body: text(
                "The public JD endpoint provides the latest quote only. The chart is built from real samples collected by this plugin and retained locally.",
                "京东公开接口只提供最新报价；曲线由插件实际采集的真实样本组成并保存在本地。",
              ),
              fields: [
                { label: text("Endpoint", "接口"), value: "api.jdjygold.com" },
                { label: text("History window", "历史范围"), value: historyRange(state.history) },
              ],
            }],
          },
        } : { id: "gold", title: text("JD Gold", "京东积存金"), subtitle: text("No data", "暂无数据") };
        const showIsland = state.islandEnabled && current;
        const snapshot = {
          revision: Date.now(), title: "QX Gold 金价追踪", query: "", layout: { kind: "list" },
          loading: state.loading && !state.current, error: state.error, meta: current ? `${number(price)} 元/克` : text("Waiting for data", "等待数据"),
          selectedId: "gold", items: [item], emptyText: text("No gold price data", "暂无金价数据"),
          actions: [{ id: "refresh", label: text("Refresh", "刷新"), menuKey: "R", kbd: "CmdOrCtrl+R", primary: true, disabled: state.loading }],
          // Workbench projects this through the community plugin Island port.
          // When disabled, publish null so the plugin releases its slot.
          island: showIsland ? {
            primary: "QX Gold",
            secondary: `${number(price)} 元/克 · ${current.change >= 0 ? "▲" : "▼"} ${number(current.change)} (${current.changeRate})`,
            tone: "neutral",
            activity: state.loading ? "pulse" : undefined,
          } : null,
        };
        if (state.view) state.view.update(snapshot);
        else state.view = context.ui.mountWorkbench(snapshot, { onAction: (id) => { if (id === "refresh") void refresh(); }, onSelect: () => {} });
      };
      const refresh = async () => {
        if (state.loading) return;
        state.loading = true; state.error = null; paint();
        try {
          const sample = await fetchPrice(context);
          state.current = sample;
          state.history = mergeHistory(state.history, sample, Number(await preference(context, "historyDays", "7")) || 7);
          await saveCache(context, state.history);
        } catch (error) { state.error = String(error?.message || error); }
        finally { state.loading = false; paint(); }
      };
      void (async () => {
        state.islandEnabled = await islandEnabled(context);
        state.history = trimHistory(await loadCache(context), Number(await preference(context, "historyDays", "7")) || 7);
        state.current = state.history.at(-1) || null; paint(); await refresh();
        const interval = Math.max(30, Number(await preference(context, "refreshIntervalSeconds", "60")) || 60) * 1000;
        state.timer = setInterval(() => void refresh(), interval);
      })();
      return { destroy() { state.dead = true; clearInterval(state.timer); state.view = null; container.innerHTML = ""; } };
    },
  },
};
