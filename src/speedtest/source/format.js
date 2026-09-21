/** Display helpers ported from Raycast Speedtest (tonka3000 et al.). */

export const ActivitySpeedQualityBandwidth = {
  voiceCall: {
    SD: { download: 0.05, upload: 0.05 },
    HD: { download: 0.1, upload: 0.1 },
  },
  videoCall: {
    "480": { download: 1, upload: 1 },
    "720": { download: 3, upload: 3 },
    "1080": { download: 5, upload: 5 },
    "4K": { download: 20, upload: 20 },
  },
  stream: {
    "480": { download: 1.5, upload: 1.5 },
    "720": { download: 5, upload: 5 },
    "1080": { download: 10, upload: 10 },
    "4K": { download: 25, upload: 25 },
  },
};

export function pingToString(ping) {
  if (!ping) return "?";
  return `${Number(ping).toFixed(1)} ms`;
}

export function speedToString(speed) {
  if (speed === undefined || speed === 0) return "?";
  let bits = speed * 8;
  const units = ["", "K", "M", "G", "T"];
  const places = [0, 1, 2, 3, 3];
  let unit = 0;
  while (bits >= 2000 && unit < 4) {
    unit += 1;
    bits /= 1000;
  }
  return `${bits.toFixed(places[unit])} ${units[unit]}bps`;
}

export function percentageToString(val) {
  if (val === undefined || val === null) return undefined;
  const v = Math.round(Number(val) * 100);
  if (!Number.isFinite(v) || v >= 100) return undefined;
  return `${v}%`;
}

export function convertBitsToMbps(speed) {
  if (!speed) return 0;
  return (speed * 8) / 1000 / 1000;
}

export function speedToAvailableActivityQuality({ download, upload }, activity) {
  const available = [];
  if (!download || !upload) return available;
  for (const quality of Object.keys(activity)) {
    if (download > activity[quality].download && upload > activity[quality].upload) {
      available.push(quality);
    }
  }
  return available;
}

export function describeCliFailure(stderr, code) {
  const text = String(stderr || "");
  if (text.includes("NoNetworkConnection")) {
    return "The Internet connection appears to be offline.";
  }
  if (/Too many requests|Limit reached/i.test(text)) {
    return "Speedtest rate limit reached. Ookla blocks frequent tests from the same network, wait a few minutes before running it again.";
  }
  const firstError = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\[[^\]]*\]\s*\[error\]\s*/, "").trim())
    .find((line) => line.length > 0);
  return firstError
    ? `Speedtest failed: ${firstError}`
    : `Something went wrong (speedtest exited with code ${code ?? "unknown"}). Please try again.`;
}

export function currentPhase(isLoading, result, error, progress) {
  if (error || result?.error) return "error";
  if (!isLoading) return "done";
  if (progress?.upload !== undefined) return "upload";
  if (progress?.download !== undefined) return "download";
  if (progress?.ping !== undefined) return "ping";
  return "starting";
}

export function phaseLabel(phase, progress, zh) {
  switch (phase) {
    case "starting":
      return zh ? "正在启动…" : "Starting…";
    case "ping":
      return zh ? "正在测量延迟…" : "Measuring latency…";
    case "download": {
      const pct = percentageToString(progress?.download);
      return zh ? `正在下载${pct ? ` ${pct}` : ""}` : `Downloading${pct ? ` ${pct}` : ""}`;
    }
    case "upload": {
      const pct = percentageToString(progress?.upload);
      return zh ? `正在上传${pct ? ` ${pct}` : ""}` : `Uploading${pct ? ` ${pct}` : ""}`;
    }
    case "done":
      return zh ? "已完成" : "Finished";
    case "error":
      return zh ? "失败" : "Failed";
    default:
      return zh ? "测速" : "Speedtest";
  }
}

export function prettyValue(value, zh) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "boolean") return value ? (zh ? "是" : "Yes") : (zh ? "否" : "No");
  return String(value);
}

export function summaryLine(result) {
  return [
    `ISP: ${result.isp || "?"}`,
    `Server: ${result.server?.name || "?"}`,
    `Ping: ${pingToString(result.ping?.latency)}`,
    `Download: ${speedToString(result.download?.bandwidth)}`,
    `Upload: ${speedToString(result.upload?.bandwidth)}`,
    `Result: ${result.result?.url || "?"}`,
  ].join("; ");
}

export function sampleChartPoints(samples) {
  const values = Array.isArray(samples) ? samples.map(convertBitsToMbps).filter((value) => Number.isFinite(value) && value > 0) : [];
  return values.map((value, index) => ({
    label: `#${index + 1}`,
    value,
  }));
}

export function bytesToBase64(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function joinPath(dirSep, ...parts) {
  const sep = dirSep || "/";
  return parts
    .filter((part) => part != null && part !== "")
    .map((part, index) => {
      const value = String(part);
      if (index === 0) return value.replace(/[\\/]+$/u, "");
      return value.replace(/^[\\/]+|[\\/]+$/gu, "");
    })
    .join(sep);
}
