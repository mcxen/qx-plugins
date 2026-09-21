import { summaryLine } from "./source/format.js";
import { emptyProgress, emptyResult, emptySamples, hasMeaningfulResult } from "./source/parse.js";
import {
  LAST_RESULT_KEY,
  clearCliCache,
  createTestSession,
  ensureCli,
  ingestStdout,
  jobErrorMessage,
  startSpeedtestJob,
} from "./source/cli.js";
import { buildWorkbench } from "./source/workbench.js";

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

function zh() {
  return locale === "zh-CN";
}

function text(en, cn) {
  return zh() ? cn : en;
}

function toast(context, message) {
  return context.showToast?.(message) || context.notification?.show?.({ title: message });
}

async function loadLastResult(context) {
  try {
    const cached = await context.storage.persist.get(LAST_RESULT_KEY);
    if (cached?.result?.download) return cached;
  } catch {
    /* optional */
  }
  return null;
}

async function saveLastResult(context, snapshot) {
  try {
    await context.storage.persist.set(LAST_RESULT_KEY, {
      savedAt: Date.now(),
      result: snapshot.result,
      samples: snapshot.samples,
    });
  } catch {
    /* optional */
  }
}

function createPanel(context) {
  setLocale(context, () => paint());
  const state = {
    result: emptyResult(),
    progress: emptyProgress(),
    samples: emptySamples(),
    query: "",
    selectedId: "overview",
    running: false,
    error: null,
    status: "",
    revision: 0,
    generation: 0,
    dead: false,
    view: null,
    jobId: null,
    pollTimer: null,
    session: null,
  };

  function paint() {
    if (state.dead) return;
    state.revision += 1;
    const snapshot = buildWorkbench({
      ...state,
      zh: zh(),
    });
    const selectedRaw = snapshot.rawSelected;
    delete snapshot.rawSelected;
    state.selectedRaw = selectedRaw;
    if (state.view) state.view.update(snapshot);
    else {
      state.view = context.ui.mountWorkbench(snapshot, {
        onQuery: (value) => {
          state.query = String(value || "");
          paint();
        },
        onSelect: (id) => {
          state.selectedId = id;
          paint();
        },
        onAction: (id) => void runAction(id),
      });
    }
  }

  async function stopJob() {
    if (state.pollTimer) {
      context.clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
    if (state.jobId) {
      try { await context.cli.cancel(state.jobId); } catch { /* already finished */ }
      state.jobId = null;
    }
  }

  async function runTest() {
    const generation = ++state.generation;
    await stopJob();
    state.running = true;
    state.error = null;
    if (state.result?.error) {
      const { error: _staleError, ...lastResult } = state.result;
      state.result = lastResult;
    }
    state.status = text("Starting…", "正在启动…");
    state.progress = emptyProgress();
    state.session = createTestSession();
    if (!hasMeaningfulResult(state.result)) {
      state.result = emptyResult();
      state.samples = emptySamples();
    }
    paint();

    try {
      const env = await context.system.env();
      const program = await ensureCli(context, env, (phase) => {
        if (state.dead || generation !== state.generation) return;
        if (phase === "download") {
          state.status = text("Downloading Speedtest CLI…", "正在下载 Speedtest CLI…");
          paint();
        }
      });
      if (state.dead || generation !== state.generation) return;

      state.status = text("Measuring latency…", "正在测量延迟…");
      paint();
      const job = await startSpeedtestJob(context, program);
      if (state.dead || generation !== state.generation) {
        await context.cli.cancel(job.id).catch(() => {});
        return;
      }
      state.jobId = job.id;

      const applySnapshot = (snapshot) => {
        if (state.dead || generation !== state.generation || !state.session) return;
        try {
          ingestStdout(state.session, snapshot.stdout);
        } catch {
          state.error = text("Could not read data from Speedtest", "无法读取 Speedtest 数据");
          state.running = false;
          if (snapshot.id) context.cli.cancel(snapshot.id).catch(() => {});
          paint();
          return;
        }
        const takeSession = state.session.finished
          || hasMeaningfulResult(state.session.result)
          || !hasMeaningfulResult(state.result);
        if (takeSession) {
          state.result = state.session.result;
          state.samples = state.session.samples;
        }
        state.progress = state.session.progress;
        const failure = jobErrorMessage(snapshot);
        if (failure) {
          state.error = failure;
          state.result = { ...state.result, error: failure };
          state.running = false;
        } else if (!snapshot.running && state.session.finished) {
          state.running = false;
          state.status = text("Finished", "已完成");
        } else if (!snapshot.running && !state.session.finished && snapshot.state && snapshot.state !== "running" && snapshot.state !== "queued") {
          const message = describeOrFallback(snapshot);
          state.error = message;
          state.result = { ...state.result, error: message };
          state.running = false;
        }
        paint();
      };

      applySnapshot(job);
      if (!state.running) {
        if (!state.error) await saveLastResult(context, state);
        return;
      }

      const done = await context.cli.wait(job.id, {
        pollMs: 400,
        onUpdate: applySnapshot,
      });
      if (state.dead || generation !== state.generation) return;
      applySnapshot(done);
      state.jobId = null;
      if (!state.error && state.session?.finished) await saveLastResult(context, state);
      if (!state.error && !state.session?.finished && done.state !== "cancelled") {
        const message = jobErrorMessage(done) || text("Speedtest failed", "测速失败");
        state.error = message;
        state.result = { ...state.result, error: message };
        state.running = false;
        paint();
      }
    } catch (error) {
      if (state.dead || generation !== state.generation) return;
      state.error = String(error?.message || error);
      state.result = { ...state.result, error: state.error };
      state.running = false;
      paint();
    }
  }

  function describeOrFallback(snapshot) {
    return jobErrorMessage(snapshot) || text("Speedtest failed", "测速失败");
  }

  async function runAction(id) {
    if (id === "restart") {
      if (state.running) return;
      void runTest();
      return;
    }
    if (id === "open-result") {
      const url = state.result?.result?.url;
      if (url) await context.openUrl(url);
      return;
    }
    if (id === "copy-summary") {
      await context.clipboard.write(summaryLine(state.result));
      await toast(context, text("Summary copied", "已复制摘要"));
      return;
    }
    if (id === "copy-section") {
      const payload = state.selectedRaw || state.result;
      await context.clipboard.write(JSON.stringify(payload, null, 2));
      await toast(context, text("Section copied", "已复制当前分区"));
      return;
    }
    if (id === "clear-cache") {
      if (state.running) return;
      const typed = String(await context.prompt(
        text("Type YES to clear the Speedtest CLI cache", "输入 YES 以清除 Speedtest CLI 缓存"),
        "",
      ) || "").trim();
      if (typed !== "YES") return;
      try {
        await clearCliCache(context);
        await toast(context, text("Cache cleared successfully", "缓存已清除"));
      } catch (error) {
        await toast(context, text("Failed to clear cache", `清除缓存失败：${error?.message || error}`));
      }
    }
  }

  void (async () => {
    const cached = await loadLastResult(context);
    if (cached?.result) {
      state.result = { ...emptyResult(), ...cached.result };
      state.samples = cached.samples || emptySamples();
      paint();
    } else {
      paint();
    }
    await runTest();
  })();

  return {
    destroy() {
      state.dead = true;
      state.generation += 1;
      if (state.pollTimer) context.clearInterval(state.pollTimer);
      if (state.jobId) context.cli.cancel(state.jobId).catch(() => {});
      stopLocale?.();
      stopLocale = null;
      state.view = null;
    },
  };
}

export default {
  panel: {
    render(_container, context) {
      const runtime = createPanel(context);
      panels.set(_container, runtime);
      return runtime;
    },
    destroy(container) {
      panels.get(container)?.destroy();
      panels.delete(container);
    },
  },
};
