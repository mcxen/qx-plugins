import {
  ActivitySpeedQualityBandwidth,
  convertBitsToMbps,
  currentPhase,
  phaseLabel,
  pingToString,
  prettyValue,
  sampleChartPoints,
  speedToAvailableActivityQuality,
  speedToString,
} from "./format.js";
import { hasMeaningfulResult } from "./parse.js";

function known(value) {
  if (value == null || value === "") return "";
  const text = String(value);
  return text === "?" ? "" : text;
}

function field(label, value) {
  const text = known(value);
  if (!text) return null;
  return { label, value: text };
}

function fields(...list) {
  return list.filter(Boolean);
}

function metric(formatted, running) {
  const text = known(formatted);
  if (text) return text;
  return running ? "…" : "—";
}

function phaseProgress(progress, running) {
  if (!running || progress == null || progress >= 1) return undefined;
  return Math.max(0, Math.min(100, Math.round(Number(progress) * 100)));
}

function qualityList(speed, activity) {
  const mbps = {
    download: convertBitsToMbps(speed.download?.bandwidth),
    upload: convertBitsToMbps(speed.upload?.bandwidth),
  };
  return speedToAvailableActivityQuality(mbps, activity);
}

function qualityText(speed, activity, running, zh) {
  const qualities = qualityList(speed, activity);
  if (qualities.length) return qualities.join(" ");
  if (running || !speed.download?.bandwidth || !speed.upload?.bandwidth) {
    return running ? "…" : "—";
  }
  return zh ? "带宽不足" : "Not enough bandwidth";
}

function speedChart(samples, title, latest, zh) {
  const points = sampleChartPoints(samples);
  if (points.length < 2) return undefined;
  return {
    type: "line",
    title,
    subtitle: zh ? `${points.length} 个真实采样` : `${points.length} real samples`,
    unit: "Mbps",
    valueLabel: zh ? "最新" : "Latest",
    value: known(latest) || undefined,
    points,
  };
}

function shortUrl(url) {
  const value = known(url);
  if (!value) return "";
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value.length > 28 ? `${value.slice(0, 25)}…` : value;
  }
}

export function buildActions({ running, result, zh }) {
  const url = result?.result?.url;
  return [
    {
      id: "restart",
      label: zh ? "重新测速" : "Restart",
      menuKey: "R",
      kbd: "CmdOrCtrl+R",
      disabled: running,
    },
    {
      id: "open-result",
      label: zh ? "在浏览器打开结果" : "Open Results in Browser",
      menuKey: "O",
      kbd: "CmdOrCtrl+O",
      disabled: !url,
    },
    {
      id: "copy-summary",
      label: zh ? "复制摘要" : "Copy Summary to Clipboard",
      menuKey: "C",
      kbd: "CmdOrCtrl+C",
    },
    {
      id: "copy-section",
      label: zh ? "复制当前分区" : "Copy Section to Clipboard",
      menuKey: "N",
      kbd: "CmdOrCtrl+Shift+C",
    },
    {
      id: "clear-cache",
      label: zh ? "清除 CLI 缓存" : "Clear CLI Cache",
      menuKey: "X",
      kbd: "CmdOrCtrl+Backspace",
      tone: "danger",
      disabled: running,
    },
  ];
}

export function buildItems({ result, progress, samples, running, error, zh }) {
  const phase = currentPhase(running, result, error, progress);
  const status = error || result?.error || phaseLabel(phase, progress, zh);
  const speed = { download: result.download, upload: result.upload };
  const down = speedToString(result.download?.bandwidth);
  const up = speedToString(result.upload?.bandwidth);
  const ping = pingToString(result.ping?.latency);
  const isp = known(result.isp || result.interface?.isp);
  const server = known(result.server?.name);
  const failed = Boolean(error || result?.error);

  return [
    {
      id: "overview",
      title: zh ? "测速概览" : "Overview",
      subtitle: [isp, server].filter(Boolean).join(" · ") || status,
      icon: "⚡️",
      badge: failed
        ? (zh ? "失败" : "Failed")
        : `${metric(down, running)} ↓`,
      tone: failed ? "danger" : running ? "accent" : "success",
      status: running ? { state: "loading", label: status } : undefined,
      detail: {
        title: zh ? "测速概览" : "Speedtest",
        subtitle: status,
        chart: speedChart(samples.download, zh ? "下载带宽" : "Download bandwidth", down, zh)
          || speedChart(samples.upload, zh ? "上传带宽" : "Upload bandwidth", up, zh),
        fields: fields(
          field(zh ? "状态" : "Status", status),
          field("ISP", isp),
          field(zh ? "服务器" : "Server", server),
          field("Ping", metric(ping, running)),
          field(zh ? "下载" : "Download", metric(down, running)),
          field(zh ? "上传" : "Upload", metric(up, running)),
          field(zh ? "结果" : "Result", known(result.result?.url)),
        ),
        sections: [
          {
            title: zh ? "可用质量" : "Available quality",
            fields: fields(
              field(zh ? "语音通话" : "Voice Call", qualityText(speed, ActivitySpeedQualityBandwidth.voiceCall, running, zh)),
              field(zh ? "视频通话" : "Video Call", qualityText(speed, ActivitySpeedQualityBandwidth.videoCall, running, zh)),
              field(zh ? "流媒体" : "Streaming", qualityText(speed, ActivitySpeedQualityBandwidth.stream, running, zh)),
            ),
          },
        ],
      },
      raw: result,
    },
    {
      id: "isp",
      title: "ISP",
      subtitle: known(result.interface?.name) || known(result.interface?.externalIp),
      icon: "🌐",
      badge: metric(isp, running),
      detail: {
        title: zh ? "互联网服务提供商" : "Internet Service Provider",
        subtitle: isp || undefined,
        fields: fields(
          field(zh ? "名称" : "ISP", isp),
          field(zh ? "内部 IP" : "Internal IP", result.interface?.internalIp),
          field(zh ? "外部 IP" : "External IP", result.interface?.externalIp),
          field(zh ? "网卡" : "Name", result.interface?.name),
          field(zh ? "MAC 地址" : "Mac Address", result.interface?.macAddr),
          field(zh ? "是否 VPN" : "Is VPN", result.interface?.name ? prettyValue(result.interface?.isVpn, zh) : ""),
        ),
      },
      raw: result.interface,
    },
    {
      id: "server",
      title: zh ? "服务器" : "Server",
      subtitle: [known(result.server?.location), known(result.server?.country)].filter(Boolean).join(", "),
      icon: "🖥️",
      badge: metric(server, running),
      detail: {
        title: zh ? "测速服务器" : "Server",
        subtitle: server || undefined,
        fields: fields(
          field(zh ? "名称" : "Name", server),
          field(zh ? "位置" : "Location", result.server?.location),
          field(zh ? "国家/地区" : "Country", result.server?.country),
          field(zh ? "主机" : "Host", result.server?.host),
          field("IP", result.server?.ip),
          field(zh ? "端口" : "Port", result.server?.port ? String(result.server.port) : ""),
          field("ID", result.server?.id ? String(result.server.id) : ""),
        ),
      },
      raw: result.server,
    },
    {
      id: "ping",
      title: "Ping",
      subtitle: known(pingToString(result.ping?.jitter)) ? `${zh ? "抖动" : "Jitter"} ${pingToString(result.ping?.jitter)}` : "",
      icon: "📶",
      badge: metric(ping, running),
      progress: phaseProgress(progress.ping, running && phase === "ping"),
      status: phase === "ping" && running ? { state: "loading", label: status } : undefined,
      tone: "accent",
      detail: {
        title: zh ? "延迟" : "Ping",
        fields: fields(
          field(zh ? "延迟" : "Latency", known(ping)),
          field(zh ? "抖动" : "Jitter", known(pingToString(result.ping?.jitter))),
          field(zh ? "最低延迟" : "Low Latency", known(pingToString(result.ping?.low))),
          field(zh ? "最高延迟" : "High Latency", known(pingToString(result.ping?.high))),
          field(zh ? "丢包" : "Packet Loss", result.ping?.packetLoss ? String(result.ping.packetLoss) : ""),
        ),
      },
      raw: result.ping,
    },
    {
      id: "download",
      title: zh ? "下载" : "Download",
      subtitle: result.download?.bytes ? `${result.download.bytes} B` : "",
      icon: "⬇",
      badge: metric(down, running),
      progress: phaseProgress(progress.download, running && phase === "download"),
      status: phase === "download" && running ? { state: "loading", label: status } : undefined,
      tone: "accent",
      detail: {
        title: zh ? "下载" : "Download",
        chart: speedChart(samples.download, zh ? "下载带宽" : "Download bandwidth", down, zh),
        fields: fields(
          field(zh ? "带宽" : "Bandwidth", known(down)),
          field(zh ? "字节" : "Bytes", result.download?.bytes || ""),
          field(zh ? "耗时" : "Elapsed", result.download?.elapsed ? `${result.download.elapsed} ms` : ""),
          field("IQM", known(pingToString(result.download?.latency?.iqm))),
          field(zh ? "抖动" : "Jitter", known(pingToString(result.download?.latency?.jitter))),
          field(zh ? "最低延迟" : "Low Latency", known(pingToString(result.download?.latency?.low))),
          field(zh ? "最高延迟" : "High Latency", known(pingToString(result.download?.latency?.high))),
        ),
      },
      raw: result.download,
    },
    {
      id: "upload",
      title: zh ? "上传" : "Upload",
      subtitle: result.upload?.bytes ? `${result.upload.bytes} B` : "",
      icon: "⬆",
      badge: metric(up, running),
      progress: phaseProgress(progress.upload, running && phase === "upload"),
      status: phase === "upload" && running ? { state: "loading", label: status } : undefined,
      tone: "accent",
      detail: {
        title: zh ? "上传" : "Upload",
        chart: speedChart(samples.upload, zh ? "上传带宽" : "Upload bandwidth", up, zh),
        fields: fields(
          field(zh ? "带宽" : "Bandwidth", known(up)),
          field(zh ? "字节" : "Bytes", result.upload?.bytes || ""),
          field(zh ? "耗时" : "Elapsed", result.upload?.elapsed ? `${result.upload.elapsed} ms` : ""),
          field("IQM", known(pingToString(result.upload?.latency?.iqm))),
          field(zh ? "抖动" : "Jitter", known(pingToString(result.upload?.latency?.jitter))),
          field(zh ? "最低延迟" : "Low Latency", known(pingToString(result.upload?.latency?.low))),
          field(zh ? "最高延迟" : "High Latency", known(pingToString(result.upload?.latency?.high))),
        ),
      },
      raw: result.upload,
    },
    {
      id: "voice-call",
      title: zh ? "语音通话" : "Voice Call",
      subtitle: zh ? "SD / HD" : "SD / HD",
      icon: "📞",
      badge: qualityText(speed, ActivitySpeedQualityBandwidth.voiceCall, running, zh),
      detail: {
        title: zh ? "语音通话" : "Voice Call",
        fields: fields(
          field(zh ? "下载" : "Download", metric(down, running)),
          field(zh ? "上传" : "Upload", metric(up, running)),
          field(zh ? "可用画质" : "Quality", qualityText(speed, ActivitySpeedQualityBandwidth.voiceCall, running, zh)),
        ),
      },
      raw: speed,
    },
    {
      id: "video-call",
      title: zh ? "视频通话" : "Video Call",
      subtitle: "480 / 720 / 1080 / 4K",
      icon: "📹",
      badge: qualityText(speed, ActivitySpeedQualityBandwidth.videoCall, running, zh),
      detail: {
        title: zh ? "视频通话" : "Video Call",
        fields: fields(
          field(zh ? "下载" : "Download", metric(down, running)),
          field(zh ? "上传" : "Upload", metric(up, running)),
          field(zh ? "可用画质" : "Quality", qualityText(speed, ActivitySpeedQualityBandwidth.videoCall, running, zh)),
        ),
      },
      raw: speed,
    },
    {
      id: "streaming",
      title: zh ? "流媒体" : "Streaming",
      subtitle: "480 / 720 / 1080 / 4K",
      icon: "📺",
      badge: qualityText(speed, ActivitySpeedQualityBandwidth.stream, running, zh),
      detail: {
        title: zh ? "流媒体" : "Streaming",
        fields: fields(
          field(zh ? "下载" : "Download", metric(down, running)),
          field(zh ? "上传" : "Upload", metric(up, running)),
          field(zh ? "可用画质" : "Quality", qualityText(speed, ActivitySpeedQualityBandwidth.stream, running, zh)),
        ),
      },
      raw: speed,
    },
    {
      id: "result",
      title: zh ? "结果链接" : "Result Link",
      subtitle: shortUrl(result.result?.url),
      icon: "🔗",
      badge: known(result.result?.url) ? (zh ? "可打开" : "Open") : metric("", running),
      actions: known(result.result?.url) ? [{
        id: "open-result",
        label: zh ? "在浏览器打开结果" : "Open Results in Browser",
        menuKey: "O",
        kbd: "CmdOrCtrl+O",
      }] : undefined,
      detail: {
        title: zh ? "测速结果" : "Result",
        fields: fields(
          field("ID", result.result?.id),
          field("URL", result.result?.url),
          field(zh ? "已保存" : "Persisted", result.result?.url ? prettyValue(result.result?.persisted, zh) : ""),
        ),
      },
      raw: result,
    },
  ];
}

export function buildIsland({ running, result, progress, error, status, zh }) {
  if (!running) return null;
  const phase = currentPhase(running, result, error, progress);
  const label = status || phaseLabel(phase, progress, zh);
  let progressValue;
  if (phase === "ping" && progress.ping != null) progressValue = Math.round(progress.ping * 100);
  if (phase === "download" && progress.download != null) progressValue = Math.round(progress.download * 100);
  if (phase === "upload" && progress.upload != null) progressValue = Math.round(progress.upload * 100);
  return {
    primary: zh ? "网络测速" : "Speedtest",
    secondary: error ? String(error).slice(0, 80) : label,
    tone: error ? "danger" : "neutral",
    activity: "spinner",
    progress: Number.isFinite(progressValue) ? Math.max(0, Math.min(100, progressValue)) : undefined,
    progressStyle: "surface-fill",
  };
}

export function buildWorkbench(state) {
  const zh = state.zh;
  const running = Boolean(state.running);
  const error = state.error || state.result?.error || null;
  const needle = String(state.query || "").trim().toLocaleLowerCase();
  const items = buildItems({
    result: state.result,
    progress: state.progress,
    samples: state.samples,
    running,
    error,
    zh,
  }).filter((item) => {
    if (!needle) return true;
    return `${item.title} ${item.subtitle || ""} ${item.badge || ""}`.toLocaleLowerCase().includes(needle);
  });
  const selectedId = items.some((item) => item.id === state.selectedId)
    ? state.selectedId
    : items[0]?.id || "overview";
  const selected = items.find((item) => item.id === selectedId);
  const ready = hasMeaningfulResult(state.result);
  return {
    revision: state.revision,
    title: zh ? "网络测速" : "Speedtest",
    query: state.query || "",
    queryPlaceholder: zh ? "筛选测速结果" : "Filter results",
    layout: { kind: "list", density: "compact" },
    loading: running && !ready && !items.length,
    error: null,
    selectedId,
    items: items.map(({ raw, ...item }) => item),
    actions: buildActions({ running, result: state.result, zh }),
    emptyText: items.length
      ? undefined
      : error
        ? String(error)
        : (zh ? "没有匹配的测速项" : "No matching results"),
    island: buildIsland(state),
    cache: { key: "speedtest.panel.v1", mode: "stale-while-revalidate" },
    rawSelected: selected?.raw,
  };
}
