import assert from "node:assert/strict";
import plugin, { __test } from "../src/qxgh/index.js";

assert.equal(__test.parseDurationSeconds("1h 2m"), 3720);
assert.equal(__test.parseDurationSeconds("4m 30s"), 270);
assert.equal(__test.parseDurationSeconds("18 seconds"), 18);
assert.equal(
  __test.parseRunDurationHtml('<span>Total duration</span><strong>20m 17s</strong>'),
  "20m 17s",
);

const now = Date.parse("2026-07-23T14:10:00Z");
const history = [
  {
    id: "91",
    repo: "mcxen/qx",
    name: "Release Desktop Clients",
    status: "completed",
    conclusion: "success",
    duration: "4m 0s",
  },
  {
    id: "92",
    repo: "mcxen/qx",
    name: "Release Desktop Clients",
    status: "completed",
    conclusion: "failure",
    duration: "6m 0s",
  },
];
const active = {
  id: "93",
  repo: "mcxen/qx",
  name: "Release Desktop Clients",
  status: "in_progress",
  conclusion: null,
  createdAt: "2026-07-23T14:08:00Z",
  updatedAt: "2026-07-23T14:08:00Z",
};
const estimated = __test.estimateRunProgress(active, [active, ...history], now);
assert.equal(estimated.progress.estimated, true);
assert.equal(estimated.progress.totalSeconds, 300);
assert.equal(estimated.progress.elapsedSeconds, 120);
assert.equal(estimated.progress.percent, 40);
assert.equal(estimated.progress.sampleCount, 2);
assert.equal(estimated.progress.scope, "workflow");

const queued = __test.estimateRunProgress(
  { ...active, id: "94", status: "queued" },
  history,
  now,
);
assert.equal(queued.progress.percent, 3);

const completed = __test.estimateRunProgress(history[0], history, now);
assert.equal(completed.progress, null);

const activeStartedAt = new Date(Date.now() - 120_000).toISOString();
const actionsHtml = `
  <a href="/mcxen/qx/actions/runs/103" aria-label="currently running: Run 3 of Build. Active build"></a>
  <relative-time datetime="${activeStartedAt}"></relative-time>
  <a href="/mcxen/qx/actions/runs/102" aria-label="completed successfully: Run 2 of Build. Previous build"></a>
  <relative-time datetime="2026-07-23T14:00:00Z"></relative-time>
  <a href="/mcxen/qx/actions/runs/101" aria-label="failed: Run 1 of Build. Older build"></a>
  <relative-time datetime="2026-07-23T13:50:00Z"></relative-time>
`;
const releasesHtml = `
  <a href="/mcxen/qx/releases/tag/v1.0.0">v1.0.0</a>
  <relative-time datetime="2026-07-23T13:00:00Z"></relative-time>
`;
let snapshot = null;
let handlers = null;
let openedUrl = "";
const panelContext = {
  http: {
    fetch: async (url) => ({
      ok: true,
      status: 200,
      text: async () => {
        if (String(url).endsWith("/actions")) return actionsHtml;
        if (String(url).endsWith("/releases")) return releasesHtml;
        if (String(url).includes("/runs/102")) return `<span>Total duration</span><b>4m 0s</b>${" ".repeat(250)}`;
        if (String(url).includes("/runs/101")) return `<span>Total duration</span><b>6m 0s</b>${" ".repeat(250)}`;
        return `<span>Total duration</span><b>1m 0s</b>${" ".repeat(250)}`;
      },
    }),
  },
  storage: { persist: { get: async () => null, set: async () => {} } },
  ui: {
    mountWorkbench(next, nextHandlers) {
      snapshot = next;
      handlers = nextHandlers;
      return { update() {}, updateItems() {}, getState: () => snapshot };
    },
  },
  getPreference(id) {
    if (id === "repos") return "mcxen/qx";
    if (id === "pollSeconds" || id === "cacheMinutes") return "0";
    if (id === "islandWatch") return false;
    return "";
  },
  setInterval: () => 1,
  clearInterval() {},
  openUrl(url) {
    openedUrl = url;
  },
  showToast() {},
  island: { dismiss: async () => {} },
};
const panelContainer = { innerHTML: "" };
await plugin.panel.render(panelContainer, panelContext);
const started = Date.now();
while (!snapshot?.items?.length || snapshot.meta?.includes("Loading")) {
  if (Date.now() - started > 5_000) throw new Error("Timed out loading QxGH panel smoke");
  await new Promise((resolve) => setTimeout(resolve, 10));
}
assert.ok(snapshot.items[0].progress >= 39 && snapshot.items[0].progress <= 42);
assert.match(snapshot.items[0].detail.fields[4].value, /2 recent workflow runs/);
handlers.onAction("open-item", snapshot.items[1]);
assert.match(openedUrl, /actions\/runs\/102$/);
handlers.onAction("refresh", snapshot.items[0]);
assert.ok(snapshot.items.length > 0);
assert.equal(snapshot.loading, false);
assert.match(snapshot.meta, /refreshing/);
plugin.panel.destroy(panelContainer);

console.log("QxGH smoke ok: duration parsing/hydration, live estimate, stable refresh and clicked-item actions");
