function zh() {
  return /^(zh-CN|zh-Hans|zh-SG|zh-MY|zh$)/i.test(String(navigator.language || ""));
}

function text(en, cn) {
  return zh() ? cn : en;
}

function percent(value) {
  const number = Number(value || 0);
  return `${Number.isFinite(number) ? number.toFixed(1) : "0.0"}%`;
}

function bytes(value) {
  let amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount.toFixed(unit < 2 ? 0 : 2)} ${units[unit]}`;
}

function createPanel(context) {
  const state = {
    tab: "overview",
    query: "",
    items: [],
    selectedId: null,
    loading: true,
    error: null,
    generation: 0,
    dead: false,
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
    if (state.tab === "storage") return "storage";
    if (state.tab === "network") return "network";
    if (state.tab === "processes") return "apps";
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
      queryPlaceholder: state.tab === "processes"
        ? text("Filter processes…", "筛选进程…")
        : text("Filter system information…", "筛选系统信息…"),
      tabs: [
        { id: "overview", label: text("Overview", "概览"), active: state.tab === "overview" },
        { id: "storage", label: text("Storage", "存储"), active: state.tab === "storage" },
        { id: "network", label: text("Network", "网络"), active: state.tab === "network" },
        { id: "processes", label: text("Processes", "进程"), active: state.tab === "processes" },
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
        if (!["overview", "storage", "network", "processes"].includes(id)) return;
        state.tab = id;
        state.query = "";
        state.items = [];
        state.selectedId = null;
        void reload();
      },
      onSelect(id) {
        state.selectedId = id;
        paint();
      },
      onAction(id) {
        if (id === "refresh") {
          void reload();
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

  const overviewItems = async () => {
    const [environment, info, stats, power] = await Promise.all([
      context.system.env(),
      context.system.info(),
      context.system.stats(),
      context.system.power(),
    ]);
    return [
      {
        id: "identity",
        title: info.hostname || text("This computer", "这台电脑"),
        subtitle: info.os || info.macOS || environment.platform,
        icon: "◉",
        badge: environment.arch,
        detail: {
          title: info.hostname,
          subtitle: info.os || info.macOS,
          fields: [
            { label: text("Platform", "平台"), value: info.platform || environment.platform },
            { label: text("Architecture", "架构"), value: info.architecture || environment.arch },
            { label: text("Processor", "处理器"), value: info.chip || "—" },
            { label: text("Kernel", "内核"), value: info.kernel || "—" },
            { label: text("Serial", "序列号"), value: info.serialNumber || "—" },
          ],
        },
      },
      {
        id: "cpu",
        title: text("CPU", "处理器"),
        subtitle: info.chip || "—",
        icon: "C",
        badge: percent(stats.cpu),
        progress: stats.cpu,
        tone: stats.cpu >= 85 ? "danger" : stats.cpu >= 65 ? "warning" : "accent",
        detail: {
          title: text("Processor Load", "处理器负载"),
          fields: [
            { label: text("Current", "当前"), value: percent(stats.cpu) },
            { label: text("Model", "型号"), value: info.chip || "—" },
          ],
        },
      },
      {
        id: "memory",
        title: text("Memory", "内存"),
        subtitle: `${stats.memoryUsedGb.toFixed(2)} / ${stats.memoryTotalGb.toFixed(2)} GB`,
        icon: "M",
        badge: percent(stats.memory),
        progress: stats.memory,
        tone: stats.memory >= 90 ? "danger" : stats.memory >= 75 ? "warning" : "success",
        detail: {
          title: text("Memory Usage", "内存使用"),
          fields: [
            { label: text("Used", "已用"), value: `${stats.memoryUsedGb.toFixed(2)} GB` },
            { label: text("Total", "总计"), value: `${stats.memoryTotalGb.toFixed(2)} GB` },
            { label: text("Utilization", "使用率"), value: percent(stats.memory) },
          ],
        },
      },
      {
        id: "power",
        title: text("Power", "电源"),
        subtitle: power.summary || power.source,
        icon: "P",
        badge: power.batteryLevel == null ? "—" : `${power.batteryLevel}%`,
        tone: power.isCharging ? "success" : "neutral",
        detail: {
          title: text("Power", "电源"),
          fields: [
            { label: text("Source", "来源"), value: power.source },
            { label: text("Battery", "电池"), value: power.batteryLevel == null ? "—" : `${power.batteryLevel}%` },
            { label: text("Charging", "充电中"), value: power.isCharging },
            { label: text("Full", "已充满"), value: power.fullyCharged },
          ],
        },
      },
    ];
  };

  const storageItems = async () => {
    const storage = await context.system.storage();
    const progress = Number.parseFloat(storage.percentUsed) || 0;
    return [{
      id: "system-storage",
      title: text("System Storage", "系统存储"),
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
    const devices = (network.devices || []).map((device, index) => {
      const counter = counterByName.get(device.name);
      return {
        id: `network-${device.name}-${index}`,
        title: device.name,
        subtitle: device.ip,
        icon: "N",
        badge: counter ? `↓ ${bytes(counter.bytesIn)} · ↑ ${bytes(counter.bytesOut)}` : device.ip,
        detail: {
          title: device.name,
          subtitle: device.ip,
          fields: [
            { label: text("IPv4", "IPv4 地址"), value: device.ip },
            { label: text("Received", "已接收"), value: bytes(counter?.bytesIn) },
            { label: text("Sent", "已发送"), value: bytes(counter?.bytesOut) },
          ],
        },
      };
    });
    if (devices.length) return devices;
    return [{
      id: "network-total",
      title: text("Network Counters", "网络计数"),
      subtitle: text("No active IPv4 interface was reported", "未检测到活动的 IPv4 接口"),
      icon: "N",
      detail: {
        fields: [
          { label: text("Received", "已接收"), value: bytes(counters.totalBytesIn) },
          { label: text("Sent", "已发送"), value: bytes(counters.totalBytesOut) },
        ],
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

  const reload = async () => {
    const generation = ++state.generation;
    state.loading = true;
    state.error = null;
    paint();
    try {
      const items = state.tab === "storage"
        ? await storageItems()
        : state.tab === "network"
          ? await networkItems()
          : state.tab === "processes"
            ? await processItems()
            : await overviewItems();
      if (state.dead || generation !== state.generation) return;
      state.items = items;
      state.selectedId = items[0]?.id || null;
    } catch (error) {
      if (state.dead || generation !== state.generation) return;
      state.items = [];
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
