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
  return Array.isArray(raw) ? raw.filter((item) => Number.isFinite(Number(item?.price))) : [];
}
function trimHistory(history, days) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return history.filter((item) => Number(item.time) >= cutoff).slice(-MAX_POINTS);
}
function chartDataUri(points) {
  const values = points.map((point) => Number(point.price)).filter(Number.isFinite);
  if (values.length < 2) return "";
  const width = 720;
  const height = 260;
  const pad = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(0.01, max - min);
  const coords = values.map((value, index) => {
    const x = pad + index * (width - pad * 2) / Math.max(1, values.length - 1);
    const y = height - pad - (value - min) * (height - pad * 2) / span;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const area = `${pad},${height - pad} ${coords.join(" ")} ${width - pad},${height - pad}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#172033"/><path d="M ${area}" fill="#2f81f733"/><polyline points="${coords.join(" ")}" fill="none" stroke="#68a7ff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><text x="${pad}" y="20" fill="#b7c7e6" font-family="sans-serif" font-size="14">CNY / gram · ${number(min)} — ${number(max)}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
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
  commands: [{
    name: "open-qxgold",
    title: "打开 QX Gold 金价追踪",
    async run(context) { await context.showToast?.(text("Open QX Gold from Extensions or search.", "请从扩展模块或搜索中打开 QX Gold。")); },
  }],
  panel: {
    title: "QX Gold 金价追踪",
    render(container, context) {
      setLocale(context);
      const state = { history: [], current: null, loading: false, error: null, view: null, dead: false, timer: null };
      const paint = () => {
        if (state.dead) return;
        const current = state.current || state.history.at(-1);
        const price = current?.price;
        const chart = chartDataUri(state.history);
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
            images: chart ? [{ url: chart, alt: text("Gold price line chart", "金价曲线") }] : [],
            fields: [
              { label: text("Current", "当前价"), value: `${number(price)} 元/克` },
              { label: text("Change", "涨跌额"), value: `${number(current.change)} 元` },
              { label: text("Change rate", "涨跌幅"), value: current.changeRate || "—" },
              { label: text("Yesterday", "昨收"), value: `${number(current.yesterdayPrice)} 元/克` },
              { label: text("Samples", "采样数"), value: String(state.history.length) },
            ],
          },
        } : { id: "gold", title: text("JD Gold", "京东积存金"), subtitle: text("No data", "暂无数据") };
        const showIsland = state.islandEnabled && current;
        const snapshot = {
          revision: Date.now(), title: "QX Gold 金价追踪", query: "", layout: { kind: "list" },
          loading: state.loading && !state.current, error: state.error, meta: current ? `${number(price)} 元/克` : text("Waiting for data", "等待数据"),
          selectedId: "gold", items: [item], emptyText: text("No gold price data", "暂无金价数据"),
          actions: [{ id: "refresh", label: text("Refresh", "刷新"), primary: true, disabled: state.loading }],
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
          state.history = trimHistory([...state.history, sample], Number(await preference(context, "historyDays", "7")) || 7);
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
