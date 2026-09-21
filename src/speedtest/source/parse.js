/** Ookla CLI JSONL parser ported from Raycast Speedtest. */

export function emptyLatency() {
  return { jitter: 0, high: 0, low: 0, iqm: 0 };
}

export function emptySpeed() {
  return {
    bandwidth: 0,
    bytes: 0,
    elapsed: 0,
    latency: emptyLatency(),
  };
}

export function emptyResult() {
  return {
    isp: "",
    packetLoss: 0,
    download: emptySpeed(),
    upload: emptySpeed(),
    interface: {
      isp: "",
      externalIp: "",
      internalIp: "",
      isVpn: false,
      macAddr: "",
      name: "",
    },
    ping: {
      high: 0,
      jitter: 0,
      latency: 0,
      low: 0,
      packetLoss: 0,
    },
    server: {
      country: "",
      host: "",
      id: 0,
      ip: "",
      location: "",
      name: "",
      port: 0,
    },
    result: {
      id: "",
      persisted: false,
      url: "",
    },
  };
}

export function emptyProgress() {
  return { download: undefined, upload: undefined, ping: undefined };
}

export function emptySamples() {
  return { download: [], upload: [] };
}

export function hasMeaningfulResult(result) {
  return Boolean(
    result?.isp
    || result?.server?.name
    || result?.download?.bandwidth
    || result?.upload?.bandwidth
    || result?.ping?.latency
    || result?.result?.url,
  );
}

export function cloneResult(result) {
  return JSON.parse(JSON.stringify(result || emptyResult()));
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function applySpeedtestEvent(state, event) {
  const type = event?.type;
  if (!type) return { ...state, changed: false };
  const result = cloneResult(state.result);
  const progress = { ...state.progress };
  const samples = {
    download: [...(state.samples?.download || [])],
    upload: [...(state.samples?.upload || [])],
  };
  let finished = Boolean(state.finished);

  if (type === "download" || type === "upload") {
    const speed = object(event[type]);
    result[type] = { ...emptySpeed(), ...speed, latency: { ...emptyLatency(), ...object(speed.latency) } };
    if (speed.progress) progress[type] = speed.progress;
    if (speed.bandwidth) samples[type] = [...samples[type], speed.bandwidth];
  } else if (type === "testStart") {
    result.interface = {
      isp: event.isp || "",
      ...object(event.interface),
    };
    result.isp = event.isp || "";
    result.server = { ...emptyResult().server, ...object(event.server) };
  } else if (type === "ping") {
    result.ping = { ...emptyResult().ping, ...object(event.ping) };
    if (event.ping?.progress) progress.ping = event.ping.progress;
  } else if (type === "result") {
    result.ping = { ...emptyResult().ping, ...object(event.ping) };
    result.download = { ...emptySpeed(), ...object(event.download), latency: { ...emptyLatency(), ...object(event.download?.latency) } };
    result.upload = { ...emptySpeed(), ...object(event.upload), latency: { ...emptyLatency(), ...object(event.upload?.latency) } };
    result.interface = {
      isp: event.isp || "",
      ...object(event.interface),
    };
    result.isp = event.isp || result.isp;
    result.server = { ...emptyResult().server, ...object(event.server) };
    result.result = { ...emptyResult().result, ...object(event.result) };
    progress.download = undefined;
    progress.upload = undefined;
    progress.ping = undefined;
    finished = true;
  } else {
    return { ...state, changed: false };
  }

  return { result, progress, samples, finished, changed: true };
}

export function consumeJsonLines(buffer, chunk) {
  const combined = `${buffer || ""}${chunk || ""}`;
  const lines = combined.split(/\r?\n/);
  const rest = lines.pop() ?? "";
  const events = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      throw new Error("Could not read data from Speedtest");
    }
  }
  return { rest, events };
}
