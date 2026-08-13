import { PROVIDERS } from "./source/providers.js";

const CACHE_KEY = "agent-usage.snapshot.v1";
const CACHE_TTL_MS = 3 * 60 * 1000;
const panels = new WeakMap();

let locale = "en";
let stopLocale = null;

function setLocale(context, onChange) {
  stopLocale?.();
  locale = context?.locale?.current || "en";
  stopLocale = context?.locale?.onChange?.(({ current }) => {
    locale = current || "en";
    onChange?.();
  }) || null;
}

function text(en, zh) {
  return locale === "zh-CN" ? zh : en;
}

function safePercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : null;
}

function percent(value) {
  const number = safePercent(value);
  return number == null ? "—" : `${Math.round(number)}%`;
}

function planLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return text("Local session", "本机登录态");
  return raw.split(/[-_\s]+/).map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : "").join(" ");
}

function providerIcon(id) {
  return id === "codex" ? "⌬" : "✦";
}

function windowName(value) {
  const labels = {
    "5h": text("5-hour window", "5 小时窗口"),
    weekly: text("Weekly window", "每周窗口"),
    monthly: text("Monthly window", "每月窗口"),
    credits: text("Credits", "积分额度"),
    primary: text("Primary window", "主窗口"),
    secondary: text("Secondary window", "次窗口"),
    "review-primary": text("Code review · primary", "代码审查 · 主窗口"),
    "review-secondary": text("Code review · secondary", "代码审查 · 次窗口"),
  };
  return labels[value] || String(value || text("Usage window", "用量窗口"));
}

function relativeReset(iso) {
  if (!iso) return text("No reset reported", "未返回重置时间");
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return text("Unknown reset", "重置时间未知");
  const seconds = Math.round((timestamp - Date.now()) / 1000);
  if (seconds <= 0) return text("Reset due", "即将重置");
  if (seconds < 60) return text("in less than a minute", "不足 1 分钟后");
  if (seconds < 3600) {
    const minutes = Math.ceil(seconds / 60);
    return text(`in ${minutes} min`, `${minutes} 分钟后`);
  }
  if (seconds < 86400) {
    const hours = Math.ceil(seconds / 3600);
    return text(`in ${hours} hr`, `${hours} 小时后`);
  }
  const days = Math.ceil(seconds / 86400);
  return text(`in ${days} days`, `${days} 天后`);
}

function absoluteTime(timestamp) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return "—";
  return new Intl.DateTimeFormat(locale === "zh-CN" ? "zh-CN" : "en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function errorInfo(error, provider) {
  const message = String(error?.message || error || "unknown");
  if (message.startsWith("not_configured:")) {
    return provider === "codex"
      ? text("Sign in with the Codex CLI first.", "请先使用 Codex CLI 登录。")
      : text("Run `grok login` first.", "请先运行 `grok login`。");
  }
  if (message.startsWith("unauthorized:")) {
    return provider === "codex"
      ? text("The Codex session expired. Sign in again with the CLI.", "Codex 登录态已过期，请使用 CLI 重新登录。")
      : text("The Grok session expired. Run `grok login` again.", "Grok 登录态已过期，请重新运行 `grok login`。");
  }
  if (message.startsWith("http:")) {
    const status = message.split(":")[2] || "error";
    return text(`Service request failed (HTTP ${status}).`, `服务请求失败（HTTP ${status}）。`);
  }
  if (message.startsWith("grpc:")) {
    const status = message.split(":")[2] || "error";
    return text(`Grok returned gRPC status ${status}.`, `Grok 返回 gRPC 状态 ${status}。`);
  }
  if (message.startsWith("parse:")) {
    return text("The service response format changed and could not be read.", "服务响应格式已变化，暂时无法解析。");
  }
  if (message.startsWith("local_file:")) {
    return text("The local session file could not be read.", "无法读取本机登录态文件。");
  }
  return text("Usage is temporarily unavailable.", "用量暂时不可用。");
}

function validWindow(value) {
  return value && typeof value === "object" && safePercent(value.remainingPercent) != null;
}

function validUsage(value) {
  return value
    && typeof value === "object"
    && ["codex", "grok"].includes(value.provider)
    && safePercent(value.remainingPercent) != null
    && Array.isArray(value.windows)
    && value.windows.every(validWindow);
}

function normalizeCache(value) {
  const cache = value && typeof value === "object" ? value : {};
  return {
    savedAt: Number(cache.savedAt) || 0,
    usage: (Array.isArray(cache.usage) ? cache.usage : []).filter(validUsage),
  };
}

function toneFor(remaining, allowed) {
  if (!allowed || remaining <= 10) return "danger";
  if (remaining <= 30) return "warning";
  if (remaining >= 65) return "success";
  return "accent";
}

function windowFields(windows) {
  return windows.flatMap((window) => [
    {
      id: `${window.id}-remaining`,
      label: windowName(window.label),
      value: text(`${percent(window.remainingPercent)} remaining`, `剩余 ${percent(window.remainingPercent)}`),
    },
    {
      id: `${window.id}-reset`,
      label: text("Resets", "重置"),
      value: relativeReset(window.resetAt),
    },
  ]);
}

function usageDetail(usage, warning) {
  const sections = [{
    title: text("Quota windows", "配额窗口"),
    fields: windowFields(usage.windows),
  }];
  if (usage.codeReviewWindows?.length) {
    sections.push({
      title: text("Code review", "代码审查"),
      fields: windowFields(usage.codeReviewWindows),
    });
  }
  for (const limit of usage.additionalLimits || []) {
    sections.push({ title: limit.label, fields: windowFields(limit.windows || []) });
  }
  const accountFields = [
    { label: text("Account", "账户"), value: usage.accountName || usage.account || "—" },
    { label: text("Plan", "套餐"), value: planLabel(usage.plan) },
    { label: text("Updated", "更新时间"), value: absoluteTime(usage.fetchedAt) },
  ];
  if (usage.teamId) accountFields.push({ label: text("Team", "团队"), value: usage.teamId });
  if (usage.credits) {
    accountFields.push({
      label: text("Additional credits", "额外积分"),
      value: usage.credits.unlimited
        ? text("Unlimited", "无限")
        : usage.credits.available
          ? usage.credits.balance || text("Available", "可用")
          : text("Not enabled", "未启用"),
    });
  }
  sections.push({ title: text("Session", "登录态"), fields: accountFields });
  if (warning) {
    sections.push({
      title: text("Refresh status", "刷新状态"),
      fields: [{ label: text("Cached result", "缓存结果"), value: warning }],
    });
  }
  return {
    title: usage.title,
    subtitle: text(
      `${percent(usage.remainingPercent)} remaining across the active quota windows`,
      `当前配额窗口最低剩余 ${percent(usage.remainingPercent)}`,
    ),
    sections,
  };
}

function summaryText(usage) {
  const lines = [
    `${usage.title} · ${percent(usage.remainingPercent)} ${text("remaining", "剩余")}`,
    `${text("Plan", "套餐")}: ${planLabel(usage.plan)}`,
  ];
  for (const window of usage.windows || []) {
    lines.push(`${windowName(window.label)}: ${percent(window.remainingPercent)} · ${relativeReset(window.resetAt)}`);
  }
  return lines.join("\n");
}

function createPanel(container, context) {
  const state = {
    tab: "all",
    query: "",
    selectedId: "codex",
    results: new Map(),
    loading: false,
    savedAt: 0,
    generation: 0,
    viewRevision: 0,
    dead: false,
    view: null,
    refreshPromise: null,
  };

  const providerById = (id) => PROVIDERS.find((provider) => provider.id === id);

  const visibleResults = () => {
    const query = state.query.trim().toLocaleLowerCase();
    return PROVIDERS.filter((provider) => state.tab === "all" || state.tab === provider.id)
      .filter((provider) => {
        const result = state.results.get(provider.id);
        const usage = result?.usage;
        return !query || [provider.title, usage?.account, usage?.accountName, usage?.plan]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase()
          .includes(query);
      });
  };

  const itemFor = (provider) => {
    const result = state.results.get(provider.id);
    const usage = result?.usage;
    const warning = result?.error ? errorInfo(result.error, provider.id) : null;
    if (!usage) {
      return {
        id: provider.id,
        title: provider.title,
        subtitle: warning || text("Waiting for a local session…", "正在等待本机登录态…"),
        icon: providerIcon(provider.id),
        badge: warning ? text("Sign in", "登录") : text("Checking", "检查中"),
        tone: warning ? "neutral" : "accent",
        detail: {
          title: provider.title,
          subtitle: warning || text("Checking the local CLI session", "正在检查本机 CLI 登录态"),
          sections: [{
            title: text("Setup", "设置"),
            fields: [{
              label: text("Local session", "本机登录态"),
              value: provider.id === "codex"
                ? text("Sign in with the Codex CLI", "使用 Codex CLI 登录")
                : text("Run `grok login`", "运行 `grok login`"),
            }],
          }],
        },
        actions: [{
          id: `open:${provider.id}`,
          label: text("Open Dashboard", "打开用量页面"),
          menuKey: "o",
          kbd: "CmdOrCtrl+O",
        }],
      };
    }
    return {
      id: provider.id,
      title: provider.title,
      subtitle: [usage.accountName || usage.account, planLabel(usage.plan)].filter(Boolean).join(" · "),
      meta: warning
        ? text("Cached · refresh failed", "缓存 · 刷新失败")
        : text(`Updated ${absoluteTime(usage.fetchedAt)}`, `更新于 ${absoluteTime(usage.fetchedAt)}`),
      icon: providerIcon(provider.id),
      badge: text(`${percent(usage.remainingPercent)} left`, `剩余 ${percent(usage.remainingPercent)}`),
      progress: usage.remainingPercent,
      tone: warning ? "warning" : toneFor(usage.remainingPercent, usage.allowed),
      detail: usageDetail(usage, warning),
      actions: [
        {
          id: `copy:${provider.id}`,
          label: text("Copy Summary", "复制摘要"),
          menuKey: "c",
          kbd: "CmdOrCtrl+C",
        },
        {
          id: `open:${provider.id}`,
          label: text("Open Dashboard", "打开用量页面"),
          menuKey: "o",
          kbd: "CmdOrCtrl+O",
        },
      ],
    };
  };

  const paint = () => {
    if (state.dead) return;
    const providers = visibleResults();
    if (!providers.some((provider) => provider.id === state.selectedId)) {
      state.selectedId = providers[0]?.id || null;
    }
    const configuredCount = PROVIDERS.filter((provider) => state.results.get(provider.id)?.usage).length;
    const view = {
      revision: ++state.viewRevision,
      title: text("Agent Usage", "Agent 用量"),
      layout: { kind: "list" },
      query: state.query,
      queryPlaceholder: text("Filter providers or accounts…", "筛选服务商或账户…"),
      tabs: [
        { id: "all", label: text("All", "全部"), active: state.tab === "all" },
        { id: "codex", label: "Codex", active: state.tab === "codex" },
        { id: "grok", label: "Grok", active: state.tab === "grok" },
      ],
      loading: state.loading && configuredCount === 0,
      meta: configuredCount
        ? text(`${configuredCount}/2 sessions · ${absoluteTime(state.savedAt)}`, `${configuredCount}/2 个登录态 · ${absoluteTime(state.savedAt)}`)
        : text("Local CLI sessions", "本机 CLI 登录态"),
      selectedId: state.selectedId,
      items: providers.map(itemFor),
      emptyText: state.loading
        ? text("Checking local sessions…", "正在检查本机登录态…")
        : text("No providers match this filter.", "没有符合筛选条件的服务商。"),
      actions: [{
        id: "refresh",
        label: text("Refresh All", "刷新全部"),
        menuKey: "r",
        kbd: "CmdOrCtrl+R",
        disabled: state.loading,
      }],
      island: state.loading ? {
        primary: text("Refreshing usage", "正在刷新用量"),
        secondary: text("Codex and Grok", "Codex 与 Grok"),
        activity: "spinner",
      } : null,
    };
    if (state.view) state.view.update(view);
    else {
      state.view = context.ui.mountWorkbench(view, {
        onQuery(value) {
          state.query = String(value || "");
          paint();
        },
        onTab(id) {
          if (!["all", "codex", "grok"].includes(id)) return;
          state.tab = id;
          state.query = "";
          paint();
        },
        onSelect(id) {
          state.selectedId = String(id || "");
          paint();
        },
        onAction(id, item) {
          if (id === "refresh") {
            void refresh(true);
            return;
          }
          const [action, explicitProvider] = String(id || "").split(":");
          const providerId = explicitProvider || String(item?.id || state.selectedId || "");
          const provider = providerById(providerId);
          const usage = state.results.get(providerId)?.usage;
          if (action === "copy" && usage) {
            void context.clipboard.write(summaryText(usage)).then(
              () => context.showToast(text("Usage summary copied.", "用量摘要已复制。")),
              () => context.showToast(text("Could not copy the usage summary.", "无法复制用量摘要。")),
            );
          } else if (action === "open" && provider) {
            void context.openUrl(provider.dashboard);
          }
        },
      });
    }
  };

  const persist = async () => {
    const usage = PROVIDERS.map((provider) => state.results.get(provider.id)?.usage).filter(validUsage);
    try {
      await context.storage.persist.set(CACHE_KEY, { savedAt: state.savedAt, usage });
    } catch {
      // Cache is optional; live results remain usable.
    }
  };

  const refresh = (force = false) => {
    if (state.refreshPromise) return state.refreshPromise;
    if (!force && state.savedAt && Date.now() - state.savedAt <= CACHE_TTL_MS) return Promise.resolve();
    state.loading = true;
    state.generation += 1;
    const revision = state.generation;
    paint();
    const request = Promise.all(PROVIDERS.map(async (provider) => {
      try {
        return { provider, usage: await provider.fetch(context), error: null };
      } catch (error) {
        return { provider, usage: null, error };
      }
    })).then(async (results) => {
      if (state.dead || revision !== state.generation) return;
      const now = Date.now();
      for (const result of results) {
        const previous = state.results.get(result.provider.id);
        state.results.set(result.provider.id, {
          usage: result.usage || previous?.usage || null,
          error: result.error,
        });
      }
      if (results.some((result) => result.usage)) state.savedAt = now;
      await persist();
    }).finally(() => {
      if (!state.dead && revision === state.generation) {
        state.loading = false;
        state.refreshPromise = null;
        paint();
      }
    });
    state.refreshPromise = request;
    return request;
  };

  const hydrate = async () => {
    try {
      const cache = normalizeCache(await context.storage.persist.get(CACHE_KEY));
      if (state.dead) return;
      state.savedAt = cache.savedAt;
      for (const usage of cache.usage) state.results.set(usage.provider, { usage, error: null });
      paint();
    } catch {
      // A missing or malformed cache simply falls through to the live refresh.
    }
    await refresh(false);
  };

  setLocale(context, paint);
  paint();
  void hydrate();

  return {
    destroy() {
      state.dead = true;
      state.generation += 1;
      state.view = null;
      stopLocale?.();
      stopLocale = null;
      container.innerHTML = "";
    },
  };
}

const plugin = {
  panel: {
    title: "Agent Usage",
    render(container, context) {
      panels.get(container)?.destroy();
      panels.set(container, createPanel(container, context));
    },
    destroy(container) {
      panels.get(container)?.destroy();
      panels.delete(container);
    },
  },
};

export default plugin;
export { normalizeCache, summaryText };
