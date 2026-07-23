function zh() {
  return /^(zh-CN|zh-Hans|zh-SG|zh-MY|zh$)/i.test(String(navigator.language || ""));
}

function text(en, cn) {
  return zh() ? cn : en;
}

function number(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function percent(value) {
  return `${number(value).toFixed(1)}%`;
}

function bytes(value) {
  let amount = number(value);
  if (amount <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount.toFixed(unit < 2 ? 0 : 2)} ${units[unit]}`;
}

function optional(value, suffix = "") {
  if (value == null || value === "") return "—";
  return `${value}${suffix}`;
}

function yesNo(value) {
  if (value == null) return "—";
  return value ? text("Yes", "是") : text("No", "否");
}

function durationMinutes(value) {
  const minutes = number(value, -1);
  if (minutes < 0) return "—";
  if (minutes < 60) return text(`${Math.round(minutes)} min`, `${Math.round(minutes)} 分钟`);
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return text(`${hours} hr ${rest} min`, `${hours} 小时 ${rest} 分钟`);
}

function frequencyMhz(value) {
  const mhz = number(value, -1);
  if (mhz <= 0) return "—";
  return mhz >= 1000 ? `${(mhz / 1000).toFixed(2)} GHz` : `${Math.round(mhz)} MHz`;
}

function cacheKind(value) {
  if (value === "instruction") return text("Instruction", "指令");
  if (value === "data") return text("Data", "数据");
  if (value === "unified") return text("Unified", "统一");
  return value || text("Cache", "缓存");
}

function cacheScope(value) {
  if (!value) return "";
  if (value === "performance") return text("performance cores", "性能核");
  if (value === "efficiency") return text("efficiency cores", "能效核");
  if (value === "shared") return text("shared", "共享");
  return text(`CPUs ${value}`, `CPU ${value}`);
}

function cpuCacheFields(info) {
  const caches = Array.isArray(info.cpuCaches) ? info.cpuCaches : [];
  const fields = [];
  if (caches.length) {
    const levels = [...new Set(caches.map((cache) => number(cache.level)).filter(Boolean))]
      .sort((left, right) => left - right);
    fields.push({
      label: text("Cache hierarchy", "缓存层级"),
      value: levels.map((level) => `L${level}`).join(" / "),
    });
  }
  if (number(info.cpuCacheLineBytes) > 0) {
    fields.push({ label: text("Cache line", "缓存行"), value: bytes(info.cpuCacheLineBytes) });
  }
  caches.forEach((cache, index) => {
    const scope = cacheScope(cache.scope);
    fields.push({
      label: `L${number(cache.level)} ${cacheKind(cache.kind)}${scope ? ` · ${scope}` : ""}`,
      value: bytes(cache.sizeBytes),
      id: `cache-${index}`,
    });
  });
  return fields;
}

function powerState(power) {
  if (power.isCharging) return text("Charging", "正在充电");
  if (power.fullyCharged) return text("Fully charged", "已充满");
  if (power.externalConnected) return text("Connected to power", "已连接电源");
  return text("On battery", "使用电池");
}

const VIEW_IDS = ["hardware", "processes"];
const HARDWARE_IDS = ["system", "cpu", "memory", "power", "storage", "network"];
const LIVE_HARDWARE_IDS = new Set(["cpu", "memory", "power", "network"]);

function createPanel(context) {
  const state = {
    view: "hardware",
    query: "",
    items: [],
    selectedId: "system",
    loading: true,
    error: null,
    generation: 0,
    dead: false,
  };
  let systemSnapshotCache = null;
  let systemSnapshotRequest = null;
  let storageCache = null;
  let storageRequest = null;
  let statsRequest = null;

  const systemSnapshot = async (force = false) => {
    if (!force && systemSnapshotCache) return systemSnapshotCache;
    if (!force && systemSnapshotRequest) return systemSnapshotRequest;
    const request = Promise.all([
      context.system.env(),
      context.system.info(),
    ]).then(([environment, info]) => ({ environment, info }));
    systemSnapshotRequest = request;
    try {
      systemSnapshotCache = await request;
      return systemSnapshotCache;
    } finally {
      if (systemSnapshotRequest === request) systemSnapshotRequest = null;
    }
  };

  const storageSnapshot = async (force = false) => {
    if (!force && storageCache) return storageCache;
    if (!force && storageRequest) return storageRequest;
    const request = context.system.storage();
    storageRequest = request;
    try {
      storageCache = await request;
      return storageCache;
    } finally {
      if (storageRequest === request) storageRequest = null;
    }
  };

  // CPU and memory builders may render together in the Hardware list. Share
  // only the in-flight live request; the next interval still gets a new sample.
  const statsSnapshot = async () => {
    if (statsRequest) return statsRequest;
    const request = context.system.stats();
    statsRequest = request;
    try {
      return await request;
    } finally {
      if (statsRequest === request) statsRequest = null;
    }
  };

  const filteredItems = () => {
    const query = state.query.trim().toLocaleLowerCase();
    if (!query) return state.items;
    return state.items.filter((item) =>
      `${item.title} ${item.subtitle || ""} ${item.meta || ""}`
        .toLocaleLowerCase()
        .includes(query));
  };

  const selected = () =>
    filteredItems().find((item) => item.id === state.selectedId) || filteredItems()[0];

  const settingsSection = () => {
    if (state.view === "processes") return "apps";
    if (state.selectedId === "storage") return "storage";
    if (state.selectedId === "network") return "network";
    if (state.selectedId === "power") return "power";
    return "about";
  };

  const paint = () => {
    if (state.dead) return;
    const items = filteredItems();
    if (items.length && !items.some((item) => item.id === state.selectedId)) {
      state.selectedId = items[0].id;
    }
    context.ui.mountWorkbench({
      title: "Sysinfo",
      layout: { kind: "list" },
      query: state.query,
      queryPlaceholder: state.view === "processes"
        ? text("Filter processes…", "筛选进程…")
        : text("Filter hardware types…", "筛选硬件类型…"),
      tabs: [
        { id: "hardware", label: text("Hardware", "硬件"), active: state.view === "hardware" },
        { id: "processes", label: text("Processes", "进程"), active: state.view === "processes" },
      ],
      loading: state.loading,
      error: state.error,
      meta: `${items.length} ${text("items", "项")}`,
      emptyText: state.loading
        ? text("Reading system information…", "正在读取系统信息…")
        : text("No matching information", "没有匹配的信息"),
      selectedId: state.selectedId,
      items,
      actions: [
        { id: "refresh", label: text("Refresh", "刷新"), primary: true },
        { id: "open-settings", label: text("Open System Settings", "打开系统设置") },
      ],
    }, {
      onQuery(value) {
        state.query = value;
        paint();
      },
      onTab(id) {
        if (!VIEW_IDS.includes(id)) return;
        state.view = id;
        state.query = "";
        state.items = [];
        state.selectedId = id === "hardware" ? "system" : null;
        void reload();
      },
      onSelect(id) {
        state.selectedId = id;
        paint();
        if (state.view === "hardware" && LIVE_HARDWARE_IDS.has(id)) {
          void reload({ background: true, selectedOnly: true });
        }
      },
      onAction(id) {
        if (id === "refresh") {
          void reload({ forceStatic: true });
          return;
        }
        if (id === "open-settings") {
          void context.system.openSettings(settingsSection()).catch((error) => {
            context.showToast(String(error?.message || error));
          });
          return;
        }
        if (id === "kill") void killSelected();
      },
    });
  };

  const systemItems = async (force = false) => {
    const { environment, info } = await systemSnapshot(force);
    return [{
      id: "system",
      title: text("System", "系统"),
      subtitle: info.hostname || info.os || info.macOS || environment.platform,
      icon: "◉",
      badge: environment.arch,
      detail: {
        title: info.hostname,
        subtitle: info.os || info.macOS,
        fields: [
          { label: text("Platform", "平台"), value: info.platform || environment.platform },
          { label: text("Architecture", "架构"), value: info.architecture || environment.arch },
          { label: text("Processor", "处理器"), value: info.chip || "—" },
          { label: text("Memory", "内存"), value: info.memory || "—" },
          { label: text("Kernel", "内核"), value: info.kernel || "—" },
          { label: text("Kernel family", "内核类型"), value: info.kernelName || "—" },
          { label: text("Kernel release", "内核版本"), value: info.kernelVersion || "—" },
          { label: text("Serial", "序列号"), value: info.serialNumber || "—" },
        ],
      },
    }];
  };

  const cpuItems = async () => {
    const [{ info }, stats] = await Promise.all([
      systemSnapshot(),
      statsSnapshot(),
    ]);
    const used = number(stats.cpu);
    return [{
      id: "cpu",
      title: "CPU",
      subtitle: info.chip || "—",
      icon: "C",
      badge: percent(used),
      progress: used,
      tone: used >= 85 ? "danger" : used >= 65 ? "warning" : "accent",
      detail: {
        title: text("Processor", "处理器"),
        fields: [
          { label: text("Used", "已用"), value: percent(used) },
          { label: text("Free", "空闲"), value: percent(Math.max(0, 100 - used)) },
          { label: text("Model", "型号"), value: info.chip || "—" },
          { label: text("Physical cores", "物理核心"), value: optional(info.cpuPhysicalCores) },
          { label: text("Logical cores", "逻辑核心"), value: optional(info.cpuLogicalCores) },
          { label: text("Performance cores", "性能核心"), value: optional(info.cpuPerformanceCores) },
          { label: text("Efficiency cores", "能效核心"), value: optional(info.cpuEfficiencyCores) },
          { label: text("Maximum frequency", "最高频率"), value: frequencyMhz(info.cpuMaxFrequencyMhz) },
          ...cpuCacheFields(info),
        ],
      },
    }];
  };

  const memoryItems = async () => {
    const stats = await statsSnapshot();
    const used = number(stats.memory);
    const usedGb = number(stats.memoryUsedGb);
    const totalGb = number(stats.memoryTotalGb);
    return [{
      id: "memory",
      title: text("Memory", "内存"),
      subtitle: `${usedGb.toFixed(2)} / ${totalGb.toFixed(2)} GB`,
      icon: "M",
      badge: percent(used),
      progress: used,
      tone: used >= 90 ? "danger" : used >= 75 ? "warning" : "success",
      detail: {
        title: text("Memory", "内存"),
        fields: [
          { label: text("Used", "已用"), value: `${usedGb.toFixed(2)} GB` },
          { label: text("Free", "可用"), value: `${Math.max(0, totalGb - usedGb).toFixed(2)} GB` },
          { label: text("Total", "总计"), value: `${totalGb.toFixed(2)} GB` },
          { label: text("Utilization", "使用率"), value: percent(used) },
        ],
      },
    }];
  };

  const powerItems = async () => {
    const power = await context.system.power();
    const present = power.batteryPresent !== false && power.batteryLevel != null;
    if (!present) {
      return [{
        id: "power",
        title: text("Power", "电源"),
        subtitle: power.summary || text("This device reports no battery", "该设备未报告电池"),
        icon: "P",
        badge: power.source || "—",
        detail: {
          title: text("Power", "电源"),
          fields: [
            { label: text("Source", "来源"), value: power.source || "—" },
            { label: text("Battery present", "存在电池"), value: text("No", "否") },
          ],
        },
      }];
    }

    const level = number(power.batteryLevel);
    const health = power.maximumCapacityPercent;
    return [{
      id: "power",
      title: text("Power", "电源"),
      subtitle: `${powerState(power)} · ${power.source}`,
      icon: "P",
      badge: `${Math.round(level)}%`,
      progress: level,
      tone: power.isCharging || power.fullyCharged
        ? "success"
        : level <= 15
          ? "danger"
          : level <= 30
            ? "warning"
            : "accent",
      detail: {
        title: text("Battery & Power", "电池与电源"),
        subtitle: power.summary,
        sections: [
          {
            title: text("Charge", "电量"),
            fields: [
              { label: text("Battery", "电量"), value: `${Math.round(level)}%` },
              { label: text("State", "状态"), value: powerState(power) },
              { label: text("Source", "来源"), value: power.source || "—" },
              { label: text("External power", "外部电源"), value: yesNo(power.externalConnected) },
              { label: text("Charging", "充电中"), value: yesNo(power.isCharging) },
              { label: text("Fully charged", "已充满"), value: yesNo(power.fullyCharged) },
              {
                label: power.isCharging
                  ? text("Time to full", "充满剩余时间")
                  : text("Time remaining", "剩余使用时间"),
                value: durationMinutes(
                  power.isCharging ? power.timeToFullMinutes : power.timeRemainingMinutes,
                ),
              },
              { label: text("Adapter power", "适配器功率"), value: optional(power.powerWatts, " W") },
            ],
          },
          {
            title: text("Health", "健康"),
            fields: [
              { label: text("Condition", "状态"), value: optional(power.condition) },
              { label: text("Maximum capacity", "最大容量"), value: optional(health, "%") },
              { label: text("Cycle count", "循环次数"), value: optional(power.cycleCount) },
              { label: text("Temperature", "温度"), value: optional(power.temperatureCelsius?.toFixed?.(2), " °C") },
              { label: text("Design capacity", "设计容量"), value: optional(power.designCapacity, power.capacityUnit ? ` ${power.capacityUnit}` : "") },
              { label: text("Full charge capacity", "满充容量"), value: optional(power.fullChargeCapacity, power.capacityUnit ? ` ${power.capacityUnit}` : "") },
              { label: text("Remaining capacity", "剩余容量"), value: optional(power.remainingCapacity, power.capacityUnit ? ` ${power.capacityUnit}` : "") },
            ],
          },
        ],
      },
    }];
  };

  const storageItems = async (force = false) => {
    const storage = await storageSnapshot(force);
    const progress = Number.parseFloat(storage.percentUsed) || 0;
    return [{
      id: "storage",
      title: text("Storage", "存储"),
      subtitle: storage.summary,
      icon: "D",
      badge: storage.percentUsed,
      progress,
      tone: progress >= 90 ? "danger" : progress >= 75 ? "warning" : "accent",
      detail: {
        title: text("System Storage", "系统存储"),
        fields: [
          { label: text("Used", "已用"), value: storage.used },
          { label: text("Free", "可用"), value: storage.free },
          { label: text("Total", "总计"), value: storage.total },
          { label: text("Utilization", "使用率"), value: storage.percentUsed },
        ],
      },
    }];
  };

  const networkItems = async () => {
    const [network, counters] = await Promise.all([
      context.system.network(),
      context.system.networkCounters(),
    ]);
    const counterByName = new Map((counters.interfaces || []).map((item) => [item.name, item]));
    const devices = network.devices || [];
    const sections = devices.map((device) => {
      const counter = counterByName.get(device.name);
      return {
        title: device.name,
        fields: [
          { label: text("IPv4", "IPv4 地址"), value: device.ip },
          { label: text("Received", "已接收"), value: bytes(counter?.bytesIn) },
          { label: text("Sent", "已发送"), value: bytes(counter?.bytesOut) },
        ],
      };
    });
    return [{
      id: "network",
      title: text("Network", "网络"),
      subtitle: devices.length
        ? text(`${devices.length} active interfaces`, `${devices.length} 个活动接口`)
        : text("No active IPv4 interface", "没有活动的 IPv4 接口"),
      icon: "N",
      badge: `↓ ${bytes(counters.totalBytesIn)} · ↑ ${bytes(counters.totalBytesOut)}`,
      detail: {
        title: text("Network", "网络"),
        fields: [
          { label: text("Received", "已接收"), value: bytes(counters.totalBytesIn) },
          { label: text("Sent", "已发送"), value: bytes(counters.totalBytesOut) },
        ],
        sections,
      },
    }];
  };

  const processItems = async () => {
    const result = await context.system.processes.list();
    return (result.processes || [])
      .sort((a, b) => (b.cpu - a.cpu) || (b.mem - a.mem))
      .map((process) => ({
        id: `process-${process.pid}`,
        title: process.name,
        subtitle: `PID ${process.pid}`,
        icon: "●",
        badge: `${percent(process.cpu)} CPU · ${percent(process.mem)} MEM`,
        tone: process.cpu >= 80 ? "danger" : process.cpu >= 40 ? "warning" : "neutral",
        detail: {
          title: process.name,
          subtitle: `PID ${process.pid}`,
          fields: [
            { label: "CPU", value: percent(process.cpu) },
            { label: text("Memory", "内存"), value: percent(process.mem) },
            { label: "PID", value: process.pid },
          ],
        },
        actions: [
          { id: "kill", label: text("Terminate Process…", "结束进程…"), tone: "danger" },
        ],
        pid: process.pid,
      }));
  };

  const loadHardwareItem = async (id, forceStatic = false) => {
    if (id === "system") return (await systemItems(forceStatic))[0];
    if (id === "cpu") return (await cpuItems())[0];
    if (id === "memory") return (await memoryItems())[0];
    if (id === "power") return (await powerItems())[0];
    if (id === "storage") return (await storageItems(forceStatic))[0];
    if (id === "network") return (await networkItems())[0];
    return null;
  };

  const loadItems = async ({ forceStatic = false } = {}) => {
    if (state.view === "processes") return processItems();
    const items = await Promise.all(
      HARDWARE_IDS.map((id) => loadHardwareItem(id, forceStatic)),
    );
    return items.filter(Boolean);
  };

  const reload = async ({ background = false, forceStatic = false, selectedOnly = false } = {}) => {
    const generation = ++state.generation;
    if (!background) state.loading = true;
    state.error = null;
    if (!background) paint();
    try {
      const selectedItem = selectedOnly
        ? await loadHardwareItem(state.selectedId, false)
        : null;
      const items = selectedOnly ? null : await loadItems({ forceStatic });
      if (state.dead || generation !== state.generation) return;
      if (selectedOnly) {
        if (selectedItem) {
          state.items = state.items.map((item) =>
            item.id === selectedItem.id ? selectedItem : item);
        }
        return;
      }
      const previousSelection = state.selectedId;
      state.items = items;
      state.selectedId = items.some((item) => item.id === previousSelection)
        ? previousSelection
        : items[0]?.id || null;
    } catch (error) {
      if (state.dead || generation !== state.generation) return;
      state.error = String(error?.message || error);
    } finally {
      if (state.dead || generation !== state.generation) return;
      state.loading = false;
      paint();
    }
  };

  const killSelected = async () => {
    const item = selected();
    const pid = Number(item?.pid || String(item?.id || "").replace("process-", ""));
    if (!Number.isInteger(pid) || pid <= 0) return;
    const answer = await context.prompt(
      `${text("Terminate", "结束进程")} ${item.title} (PID ${pid})? ${text("Type YES to continue.", "输入 YES 继续。")}`,
      "",
    );
    if (answer !== "YES") return;
    try {
      await context.system.processes.kill(pid);
      context.showToast(`${text("Terminated", "已结束")} ${item.title}`);
      await reload();
    } catch (error) {
      context.showToast(String(error?.message || error));
    }
  };

  context.setInterval(() => {
    if (state.dead || state.loading) return;
    if (state.view === "processes") void reload({ background: true });
    else if (LIVE_HARDWARE_IDS.has(state.selectedId)) {
      void reload({ background: true, selectedOnly: true });
    }
  }, 5_000);

  return {
    paint,
    reload,
    destroy() {
      state.dead = true;
      state.generation += 1;
    },
  };
}

export default {
  commands: [
    {
      name: "open-sysinfo",
      title: "Sysinfo",
      async run(context) {
        context.showToast(text("Open Sysinfo from Extensions", "请从扩展中打开 Sysinfo"));
      },
    },
  ],
  panel: {
    title: "Sysinfo",
    async render(container, context) {
      const panel = createPanel(context);
      container.__qxSysinfo = panel;
      panel.paint();
      void panel.reload();
    },
    async destroy(container) {
      container.__qxSysinfo?.destroy?.();
      delete container.__qxSysinfo;
    },
  },
};
