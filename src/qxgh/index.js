/**
 * GitHub Actions + Releases — **business-only**, **public HTML only** (no REST API).
 * Data: GET https://github.com/{owner}/{repo}/actions|releases
 * UI: context.ui.mountWorkbench
 */

const CACHE_KEY = "qxgh.html.bundle.v1";
const DEFAULT_REPOS = "mcxen/qx\nmcxen/qx-plugins";
const UA = "QxGH/1.2 (+https://github.com/mcxen/qx; public page reader)";

// ── prefs / utils ──────────────────────────────────────────────────────────

async function pref(context, id, fallback = "") {
  try {
    const v = await context.getPreference(id);
    if (v == null || v === "") return fallback;
    if (typeof v === "boolean") return v;
    return String(v);
  } catch {
    return fallback;
  }
}

async function prefBool(context, id, fallback = true) {
  const v = await pref(context, id, fallback);
  if (typeof v === "boolean") return v;
  const s = String(v).toLowerCase();
  if (s === "false" || s === "0" || s === "no") return false;
  if (s === "true" || s === "1" || s === "yes") return true;
  return fallback;
}

function clampInt(raw, min, max, fallback) {
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function ageLabel(ts) {
  if (!ts) return "";
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function relativeTime(iso) {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return String(iso).slice(0, 16);
  return ageLabel(t);
}

function parseDurationSeconds(value) {
  const text = String(value || "").toLowerCase();
  let seconds = 0;
  let matched = false;
  const units = [
    [/(\d+(?:\.\d+)?)\s*h(?:ours?)?/g, 3600],
    [/(\d+(?:\.\d+)?)\s*m(?:in(?:utes?)?)?/g, 60],
    [/(\d+(?:\.\d+)?)\s*s(?:ec(?:onds?)?)?/g, 1],
  ];
  for (const [pattern, multiplier] of units) {
    for (const match of text.matchAll(pattern)) {
      seconds += Number(match[1]) * multiplier;
      matched = true;
    }
  }
  return matched && Number.isFinite(seconds) ? Math.round(seconds) : 0;
}

function formatDurationSeconds(value) {
  const total = Math.max(0, Math.round(Number(value) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function median(values) {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]
    : Math.round((ordered[middle - 1] + ordered[middle]) / 2);
}

function estimateRunProgress(run, runs, now = Date.now()) {
  if (!isActiveRun(run)) return { ...run, progress: null };
  if (run.status === "queued") {
    return {
      ...run,
      progress: {
        percent: 3,
        estimated: true,
        elapsedSeconds: 0,
        totalSeconds: 0,
        sampleCount: 0,
      },
    };
  }

  const usableHistory = (candidate) =>
    candidate.id !== run.id
    && candidate.repo === run.repo
    && !isActiveRun(candidate)
    && candidate.conclusion !== "cancelled"
    && parseDurationSeconds(candidate.duration) >= 5;
  const sameWorkflow = runs
    .filter((candidate) => usableHistory(candidate) && candidate.name === run.name)
    .slice(0, 8);
  const repoHistory = runs.filter(usableHistory).slice(0, 12);
  const history = sameWorkflow.length ? sameWorkflow : repoHistory;
  const samples = history.map((candidate) => parseDurationSeconds(candidate.duration));
  const historicalTotal = median(samples) || 10 * 60;
  const startedAt = Date.parse(run.createdAt || run.updatedAt || "");
  const elapsedSeconds = Number.isFinite(startedAt)
    ? Math.max(0, Math.round((now - startedAt) / 1000))
    : 0;
  const effectiveTotal = Math.max(historicalTotal, elapsedSeconds / 0.92);
  const percent = Math.max(4, Math.min(92, Math.round((elapsedSeconds / effectiveTotal) * 100)));
  return {
    ...run,
    progress: {
      percent,
      estimated: true,
      elapsedSeconds,
      totalSeconds: historicalTotal,
      sampleCount: samples.length,
      scope: sameWorkflow.length ? "workflow" : samples.length ? "repository" : "fallback",
    },
  };
}

function estimateRuns(runs, now = Date.now()) {
  return (runs || []).map((run) => estimateRunProgress(run, runs || [], now));
}

function decodeEntities(s) {
  return String(s ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, " ");
}

function attr(tag, name) {
  const re = new RegExp("\\b" + name + "\\s*=\\s*[\"']([^\"']*)[\"']", "i");
  return re.exec(tag)?.[1] || "";
}

function parseRepos(raw) {
  return Array.from(
    new Set(
      String(raw || "")
        .split(/[\n,;]+/)
        .map((s) => s.trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/, ""))
        .filter(Boolean)
        .map((s) => {
          const parts = s.split("/").filter(Boolean);
          if (parts.length < 2) return null;
          return `${parts[0]}/${parts[1]}`;
        })
        .filter(Boolean),
    ),
  );
}

// ── Public HTML fetch (github.com only) ────────────────────────────────────

async function fetchPage(context, url) {
  const resp = await context.http.fetch(url, {
    method: "GET",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": UA,
      "Accept-Language": "en-US,en;q=0.9",
    },
    timeoutMs: 25000,
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  const text = typeof resp.text === "function" ? await resp.text() : String(resp.body || "");
  if (!text || text.length < 200) throw new Error(`Empty page: ${url}`);
  // Avoid mistaking API error JSON for HTML
  if (text.trimStart().startsWith("{") && text.includes('"message"')) {
    throw new Error(`Not an HTML page: ${url}`);
  }
  return text;
}

// ── Parsers ────────────────────────────────────────────────────────────────

/**
 * Parse workflow runs from /owner/repo/actions HTML.
 * Primary signal: <a href=".../actions/runs/ID" aria-label="STATUS: Run N of WORKFLOW. TITLE">
 */
function parseActionsHtml(html, repo) {
  const runs = [];
  const seen = new Set();
  const re = /<a\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const path = attr(m[0], "href");
    const id = /\/actions\/runs\/(\d+)/i.exec(path)?.[1];
    const ariaLabel = attr(m[0], "aria-label");
    if (!id || !ariaLabel || !/^\//.test(path)) continue;
    if (seen.has(id)) continue;
    if (path.includes("/workflow")) continue;
    seen.add(id);

    const label = decodeEntities(ariaLabel).replace(/\s+/g, " ").trim();
    // "failed:  Run 59 of Windows Compatibility. [ImgBot] Optimize images"
    // "completed successfully:  Run 112 of Release Desktop Clients. v0.5.36: …"
    // "currently running: …" / "queued: …"
    let status = "unknown";
    let conclusion = null;
    let rest = label;
    const colon = label.indexOf(":");
    if (colon > 0) {
      const head = label.slice(0, colon).toLowerCase().trim();
      rest = label.slice(colon + 1).trim();
      if (head.includes("successfully") || head === "completed successfully") {
        status = "completed";
        conclusion = "success";
      } else if (head.includes("failed") || head.includes("failure")) {
        status = "completed";
        conclusion = "failure";
      } else if (head.includes("cancelled") || head.includes("canceled")) {
        status = "completed";
        conclusion = "cancelled";
      } else if (head.includes("running") || head.includes("in progress")) {
        status = "in_progress";
      } else if (head.includes("queued") || head.includes("waiting") || head.includes("pending")) {
        status = "queued";
      } else if (head.includes("completed")) {
        status = "completed";
        conclusion = "neutral";
      } else {
        status = head.replace(/\s+/g, "_").slice(0, 40);
      }
    }

    let runNumber = null;
    let workflow = "";
    let title = rest;
    const runMatch = rest.match(/^Run\s+(\d+)\s+of\s+(.+?)(?:\.\s+(.*))?$/i);
    if (runMatch) {
      runNumber = Number(runMatch[1]);
      workflow = (runMatch[2] || "").trim();
      title = (runMatch[3] || workflow || rest).trim();
    }

    // datetime near this anchor (best-effort)
    const window = html.slice(m.index, m.index + 2800);
    const dt = window.match(/datetime="(\d{4}-\d{2}-\d{2}T[^"]+)"/);
    const duration =
      (window.match(/>(\d+h\s*\d+m|\d+m\s*\d+s|\d+s)</) || [])[1] ||
      (window.match(/(\d+h\s+\d+m|\d+m\s+\d+s|\d+\s*seconds?)/i) || [])[1] ||
      "";

    runs.push({
      kind: "run",
      id,
      repo,
      name: workflow || title || `Run ${id}`,
      displayTitle: title || workflow || `Run #${runNumber || id}`,
      status,
      conclusion,
      branch: "",
      event: "",
      actor: "",
      htmlUrl: `https://github.com${path}`,
      createdAt: dt?.[1] || null,
      updatedAt: dt?.[1] || null,
      runNumber,
      duration: duration ? String(duration).trim() : "",
      progress: null,
      source: "html",
    });
  }
  return runs;
}

function parseRunDurationHtml(html) {
  const match = String(html || "").match(
    /Total duration<\/span>[\s\S]{0,500}?(\d+h(?:\s*\d+m)?|\d+m(?:\s*\d+s)?|\d+\s*seconds?)/i,
  );
  return match?.[1] ? String(match[1]).replace(/\s+/g, " ").trim() : "";
}

async function hydrateRunDurations(context, runs, previousRuns = []) {
  const previous = new Map(
    previousRuns
      .filter((run) => run?.id && run.duration)
      .map((run) => [String(run.id), run.duration]),
  );
  for (const run of runs) {
    if (!run.duration && previous.has(String(run.id))) {
      run.duration = previous.get(String(run.id));
    }
  }
  const candidates = runs
    .filter((run) =>
      !isActiveRun(run)
      && run.conclusion !== "cancelled"
      && !parseDurationSeconds(run.duration)
      && run.htmlUrl
    )
    .slice(0, 8);
  await Promise.all(candidates.map(async (run) => {
    try {
      const html = await fetchPage(context, run.htmlUrl);
      run.duration = parseRunDurationHtml(html);
    } catch {
      // A missing duration sample must not fail the Actions list.
    }
  }));
  return runs;
}

/**
 * Parse releases from /owner/repo/releases HTML.
 */
function parseReleasesHtml(html, repo) {
  const releases = [];
  const seen = new Set();
  // <a href="/owner/repo/releases/tag/v0.5.36" ...>v0.5.36</a>
  const re = /<a\b[^>]*href=["'](\/[^"'#?]+\/releases\/tag\/([^"'#?]+))["'][^>]*>[\s\S]*?<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const path = m[1];
    const tag = decodeEntities(decodeURIComponent(m[2]));
    if (seen.has(tag)) continue;
    seen.add(tag);
    const name = decodeEntities(
      m[0].replace(/^[\s\S]*?>|<\/a>[\s\S]*$/gi, "").replace(/<[^>]+>/g, ""),
    ).trim() || tag;

    const window = html.slice(Math.max(0, m.index - 400), m.index + 2200);
    const isLatest = /Label--success[^>]*>\s*Latest/i.test(window) || /\/releases\/latest/.test(window.slice(0, 500));
    const dt = window.match(/datetime="(\d{4}-\d{2}-\d{2}T[^"]+)"/);
    const prerelease = /pre-?release/i.test(window.slice(0, 800));

    releases.push({
      kind: "release",
      id: tag,
      repo,
      name,
      tag,
      draft: false,
      prerelease,
      latest: isLatest && releases.length === 0,
      htmlUrl: `https://github.com${path}`,
      publishedAt: dt?.[1] || null,
      assets: null,
      author: "",
      source: "html",
    });
  }

  // Fallback: any /releases/tag/ links
  if (!releases.length) {
    const re2 = /href="(\/[^"]+\/releases\/tag\/([^"#?]+))"/gi;
    while ((m = re2.exec(html)) !== null) {
      const tag = decodeEntities(decodeURIComponent(m[2]));
      if (seen.has(tag)) continue;
      seen.add(tag);
      releases.push({
        kind: "release",
        id: tag,
        repo,
        name: tag,
        tag,
        draft: false,
        prerelease: false,
        latest: false,
        htmlUrl: `https://github.com${m[1]}`,
        publishedAt: null,
        assets: null,
        author: "",
        source: "html",
      });
    }
  }

  if (releases[0]) releases[0].latest = true;
  return releases;
}

function isActiveStatus(status) {
  const s = String(status || "");
  return s === "in_progress" || s === "queued" || s === "pending" || s === "waiting" || s === "requested";
}

function isActiveRun(run) {
  return isActiveStatus(run?.status);
}

// ── Load bundle ────────────────────────────────────────────────────────────

async function fetchRepoBundle(context, full, previousRuns = []) {
  const actionsUrl = `https://github.com/${full}/actions`;
  const releasesUrl = `https://github.com/${full}/releases`;
  const errors = [];
  let runs = [];
  let releases = [];

  try {
    const html = await fetchPage(context, actionsUrl);
    runs = parseActionsHtml(html, full);
    if (!runs.length) errors.push(`${full} actions: no runs parsed (page layout?)`);
    else await hydrateRunDurations(
      context,
      runs,
      previousRuns.filter((run) => run.repo === full),
    );
  } catch (e) {
    errors.push(`${full} actions: ${e.message || e}`);
  }

  try {
    const html = await fetchPage(context, releasesUrl);
    releases = parseReleasesHtml(html, full);
    if (!releases.length) errors.push(`${full} releases: no tags parsed`);
  } catch (e) {
    errors.push(`${full} releases: ${e.message || e}`);
  }

  return { runs, releases, errors };
}

async function fetchAll(context, { repos, previousRuns = [] }) {
  if (!repos.length) {
    throw new Error("No repositories configured. Set owner/repo in plugin preferences.");
  }
  const runs = [];
  const releases = [];
  const errors = [];

  for (const full of repos) {
    const part = await fetchRepoBundle(context, full, previousRuns);
    runs.push(...part.runs);
    releases.push(...part.releases);
    errors.push(...part.errors);
  }

  // Keep page order within repo; across repos by first-seen updatedAt
  runs.sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));
  // releases: keep tag order from page (already roughly newest-first)

  const bundle = {
    repos,
    runs,
    releases,
    savedAt: Date.now(),
    error: errors.length ? errors.join(" · ").slice(0, 280) : null,
    fromCache: false,
    mode: "html",
  };

  try {
    if (context.storage?.persist?.set) {
      await context.storage.persist.set(CACHE_KEY, {
        repos: bundle.repos,
        runs: bundle.runs,
        releases: bundle.releases,
        savedAt: bundle.savedAt,
        error: bundle.error,
        mode: "html",
      });
    }
  } catch {
    /* optional */
  }
  return bundle;
}

async function loadBundle(context, { force = false } = {}) {
  const repos = parseRepos(await pref(context, "repos", DEFAULT_REPOS));
  const cacheMin = clampInt(await pref(context, "cacheMinutes", "2"), 0, 120, 2);
  const ttl = cacheMin * 60 * 1000;

  let cached = null;
  try {
    if (context.storage?.persist?.get) cached = await context.storage.persist.get(CACHE_KEY);
  } catch {
    cached = null;
  }

  const sameRepos = (cached?.repos || []).join("\n") === repos.join("\n");
  const age = cached?.savedAt ? Date.now() - cached.savedAt : Infinity;

  if (!force && sameRepos && ttl > 0 && age < ttl && cached?.runs) {
    return { ...cached, repos, fromCache: true, mode: "html" };
  }

  if (!force && cached?.runs && sameRepos && age < 12 * 60 * 60 * 1000) {
    return {
      ...cached,
      repos,
      fromCache: true,
      mode: "html",
      _needsRefresh: true,
    };
  }

  return fetchAll(context, { repos, previousRuns: cached?.runs || [] });
}

function pickHottestRun(runs) {
  const active = (runs || []).filter(isActiveRun);
  if (!active.length) return null;
  active.sort((a, b) => {
    const rank = (r) => (r.status === "in_progress" ? 0 : 1);
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    return Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0);
  });
  return active[0];
}

function summaryLine(bundle) {
  const runs = bundle.runs || [];
  const active = runs.filter(isActiveRun).length;
  const fails = runs.filter((r) => r.conclusion === "failure").length;
  const ok = runs.filter((r) => r.conclusion === "success").length;
  const parts = [];
  if (active) parts.push(`${active} running`);
  if (fails) parts.push(`${fails} failed`);
  if (ok) parts.push(`${ok} ok`);
  if (!parts.length) parts.push(`${runs.length} runs`);
  parts.push("html");
  return parts.join(" · ");
}

async function publishIsland(context, run, enabled) {
  if (!context?.island) return;
  if (!enabled || !run) {
    try {
      await context.island.dismiss();
    } catch {
      /* ignore */
    }
    return;
  }
  const payload = {
    primary: String(run.repo),
    secondary: `${run.displayTitle || run.name} · ${run.progress?.estimated ? "estimated" : run.status}`,
    progress: run.progress?.percent,
    tone: "neutral",
    activity: "bounce",
  };
  try {
    await context.island.update(payload);
  } catch {
    try {
      await context.island.show(payload);
    } catch {
      /* optional */
    }
  }
}

function islandForRun(run, enabled) {
  if (!enabled || !run) return null;
  return {
    primary: String(run.repo),
    secondary: `${run.displayTitle || run.name} · ${run.progress?.estimated ? "estimated" : run.status}`,
    progress: run.progress?.percent,
    tone: "neutral",
    action: { label: "Refresh", command: "refresh-qxgh" },
  };
}

function islandToggleAction(run, enabled) {
  const visible = Boolean(enabled && run);
  return {
    id: "toggle-island",
    label: visible ? "Hide Active Run from Island" : "Show Active Run on Island",
  };
}

// ── Map → workbench ────────────────────────────────────────────────────────

function runIcon(status, conclusion) {
  if (isActiveStatus(status)) return "⏳";
  if (conclusion === "success") return "✅";
  if (conclusion === "failure") return "❌";
  if (conclusion === "cancelled") return "🚫";
  return "•";
}

function runTone(status, conclusion) {
  if (isActiveStatus(status)) return "accent";
  if (conclusion === "success") return "success";
  if (conclusion === "failure") return "danger";
  if (conclusion === "cancelled") return "warning";
  return "neutral";
}

function runToItem(run) {
  const statusText = isActiveRun(run) ? run.status : run.conclusion || run.status || "";
  const estimate = run.progress?.estimated && run.status !== "queued"
    ? `estimated ${run.progress.percent}% · ${formatDurationSeconds(run.progress.elapsedSeconds)} / ~${formatDurationSeconds(run.progress.totalSeconds)}`
    : "";
  const sub = [
    run.repo,
    run.name !== run.displayTitle ? run.name : "",
    estimate || run.duration || "",
    relativeTime(run.updatedAt),
  ]
    .filter(Boolean)
    .join(" · ");
  const item = {
    id: `run:${run.repo}:${run.id}`,
    title: run.displayTitle || run.name,
    subtitle: sub,
    badge: statusText,
    icon: runIcon(run.status, run.conclusion),
    tone: runTone(run.status, run.conclusion),
    progress: run.progress?.percent,
    raw: run,
  };
  item.detail = {
    title: run.displayTitle,
    subtitle: `${run.repo} · ${run.name}`,
    fields: [
      { label: "Status", value: run.status, tone: runTone(run.status, run.conclusion) },
      { label: "Conclusion", value: run.conclusion || "—" },
      { label: "Run", value: run.runNumber != null ? `#${run.runNumber}` : "—" },
      {
        label: isActiveRun(run) ? "Estimated progress" : "Duration",
        value: run.progress?.estimated
          ? run.status === "queued"
            ? "Queued · estimate starts when running"
            : `${run.progress.percent}% · ${formatDurationSeconds(run.progress.elapsedSeconds)} elapsed / ~${formatDurationSeconds(run.progress.totalSeconds)} expected`
          : run.duration || "—",
        tone: isActiveRun(run) ? "accent" : "neutral",
      },
      ...(run.progress?.estimated ? [{
        label: "Estimate basis",
        value: run.progress.sampleCount
          ? `${run.progress.sampleCount} recent ${run.progress.scope} run${run.progress.sampleCount === 1 ? "" : "s"}`
          : "Conservative 10-minute fallback",
      }] : []),
      { label: "Updated", value: run.updatedAt || "—" },
      { label: "Source", value: "public HTML page" },
    ],
  };
  item.actions = [{ id: "open-item", label: "Open Run", primary: true, kbd: "Enter" }];
  return item;
}

function releaseToItem(rel) {
  const flags = [];
  if (rel.latest) flags.push("latest");
  if (rel.prerelease) flags.push("pre");
  const item = {
    id: `rel:${rel.repo}:${rel.tag}`,
    title: rel.name || rel.tag,
    subtitle: [rel.repo, rel.tag, flags.join(", "), relativeTime(rel.publishedAt)].filter(Boolean).join(" · "),
    badge: rel.latest ? "latest" : "release",
    icon: "🏷️",
    tone: "success",
    raw: rel,
  };
  item.detail = {
    title: rel.name || rel.tag,
    subtitle: `${rel.repo} · ${rel.tag}`,
    fields: [
      { label: "Latest", value: rel.latest ? "yes" : "no", tone: rel.latest ? "success" : "neutral" },
      { label: "Prerelease", value: rel.prerelease ? "yes" : "no" },
      { label: "Published", value: rel.publishedAt || "—" },
      { label: "Source", value: "public HTML page" },
    ],
  };
  item.actions = [{ id: "open-item", label: "Open Release", primary: true, kbd: "Enter" }];
  return item;
}

function filterByQuery(items, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return items;
  return items.filter((it) => `${it.title} ${it.subtitle} ${it.badge}`.toLowerCase().includes(q));
}

// ── Panel ──────────────────────────────────────────────────────────────────

function renderPanel(container, context) {
  let destroyed = false;
  let tab = "actions";
  let query = "";
  let selectedId = null;
  let selectedItem = null;
  let bundle = null;
  let loading = true;
  let pollTimer = null;
  let progressTimer = null;
  let loadSequence = 0;
  let islandEnabled = true;
  let islandOverride = null;

  const paint = () => {
    if (destroyed || !context.ui?.mountWorkbench) return;
    const runs = estimateRuns(bundle?.runs || []);
    const releases = bundle?.releases || [];
    const hottestRun = pickHottestRun(runs);
    let items = [];
    if (tab === "actions") items = runs.map(runToItem);
    else if (tab === "releases") items = releases.map(releaseToItem);
    else items = [...runs.map(runToItem), ...releases.map(releaseToItem)];
    items = filterByQuery(items, query);
    if (selectedId) {
      selectedItem = items.find((item) => item.id === selectedId) || null;
      if (!selectedItem) {
        selectedId = items[0]?.id || null;
        selectedItem = items[0] || null;
      }
    }
    if (!selectedId && items[0]) {
      selectedId = items[0].id;
      selectedItem = items[0];
    }

    let meta = loading && !bundle ? "Loading pages…" : summaryLine({ ...(bundle || {}), runs });
    if (loading && bundle) meta += " · refreshing";
    if (bundle?.fromCache) meta += ` · cached ${ageLabel(bundle.savedAt)}`;

    context.ui.mountWorkbench(
      {
        title: "QxGH",
        meta,
        loading: loading && !bundle,
        error: bundle?.error || null,
        query,
        queryPlaceholder: "Filter…",
        tabs: [
          { id: "actions", label: `Actions (${runs.length})`, active: tab === "actions" },
          { id: "releases", label: `Releases (${releases.length})`, active: tab === "releases" },
          { id: "both", label: "Both", active: tab === "both" },
        ],
        actions: [
          { id: "refresh", label: loading ? "Refreshing…" : "Refresh", primary: !selectedItem, disabled: loading },
          { id: "open-web", label: "Open Repository Page" },
          islandToggleAction(hottestRun, islandEnabled),
        ],
        items,
        selectedId,
        detail: selectedItem?.detail,
        island: islandForRun(hottestRun, islandEnabled),
        emptyText: loading ? "Loading GitHub pages…" : "No items — check repos in preferences",
      },
      {
        onTab: (id) => {
          tab = id || "actions";
          selectedId = null;
          selectedItem = null;
          paint();
        },
        onQuery: (value) => {
          query = value;
          paint();
        },
        onSelect: (id, item) => {
          selectedId = id;
          selectedItem = item;
          paint();
        },
        onAction: (id, item) => {
          const actionItem = item || selectedItem;
          if (id === "refresh") {
            void reload({ force: true });
            return;
          }
          if (id === "open-web") {
            const full = actionItem?.raw?.repo || bundle?.repos?.[0];
            const path = tab === "releases" ? "releases" : "actions";
            if (full && context.openUrl) void context.openUrl(`https://github.com/${full}/${path}`);
            return;
          }
          if (id === "open-item") {
            const url = actionItem?.raw?.htmlUrl;
            if (url && context.openUrl) void context.openUrl(url);
            else context.showToast("Select an item first");
            return;
          }
          if (id === "toggle-island") {
            const hot = pickHottestRun(estimateRuns(bundle?.runs || []));
            const nextIslandEnabled = !(islandEnabled && hot);
            islandEnabled = nextIslandEnabled;
            islandOverride = nextIslandEnabled;
            paint();
            void (async () => {
              await publishIsland(context, hot, nextIslandEnabled);
              if (!nextIslandEnabled) {
                context.showToast("QxGH removed from Island");
              } else {
                context.showToast(hot ? `Watching ${hot.repo}` : "No in-progress runs");
              }
            })();
          }
        },
      },
    );
  };

  async function reload({ force = false } = {}) {
    if (destroyed) return;
    const sequence = ++loadSequence;
    loading = true;
    paint();
    try {
      const preferenceEnabled = await prefBool(context, "islandWatch", true);
      islandEnabled = islandOverride ?? preferenceEnabled;
      let result = await loadBundle(context, { force });
      if (destroyed || sequence !== loadSequence) return;

      if (result._needsRefresh && !force) {
        bundle = result;
        loading = true;
        paint();
        try {
          result = await fetchAll(context, {
            repos: result.repos,
            previousRuns: result.runs || [],
          });
        } catch (err) {
          if (destroyed || sequence !== loadSequence) return;
          bundle = { ...result, error: String(err.message || err) };
          loading = false;
          paint();
          return;
        }
      }

      if (destroyed || sequence !== loadSequence) return;
      bundle = result;
      loading = false;
      if (selectedId) {
        const all = [
          ...(bundle.runs || []).map(runToItem),
          ...(bundle.releases || []).map(releaseToItem),
        ];
        selectedItem = all.find((x) => x.id === selectedId) || null;
        if (!selectedItem) selectedId = null;
      }
      paint();
    } catch (err) {
      if (destroyed || sequence !== loadSequence) return;
      bundle = bundle
        ? { ...bundle, error: String(err.message || err), fromCache: true }
        : {
            runs: [],
            releases: [],
            repos: [],
            error: String(err.message || err),
            savedAt: Date.now(),
            mode: "html",
          };
      loading = false;
      paint();
    }
  }

  void (async () => {
    const sec = clampInt(await pref(context, "pollSeconds", "45"), 0, 600, 45);
    if (sec > 0) {
      pollTimer = context.setInterval(() => {
        if (!destroyed) void reload({ force: true });
      }, sec * 1000);
    }
  })();

  progressTimer = context.setInterval(() => {
    if (!destroyed && pickHottestRun(bundle?.runs || [])) paint();
  }, 5_000);

  void reload({ force: false });

  return () => {
    destroyed = true;
    if (pollTimer != null) {
      try {
        context.clearInterval(pollTimer);
      } catch {
        /* ignore */
      }
      pollTimer = null;
    }
    if (progressTimer != null) {
      try {
        context.clearInterval(progressTimer);
      } catch {
        /* ignore */
      }
      progressTimer = null;
    }
  };
}

// ── Export ─────────────────────────────────────────────────────────────────

let destroyPanel = null;

export default {
  commands: [
    {
      name: "open-qxgh",
      title: "QxGH",
      async run(context) {
        context.showToast("Open QxGH from Extensions, or search “QxGH”");
      },
    },
    {
      name: "refresh-qxgh",
      title: "Refresh QxGH",
      async run(context) {
        try {
          const b = await loadBundle(context, { force: true });
          context.showToast(summaryLine(b).slice(0, 120));
          await publishIsland(
            context,
            pickHottestRun(estimateRuns(b.runs)),
            await prefBool(context, "islandWatch", true),
          );
        } catch (err) {
          context.showToast(String(err).slice(0, 120));
        }
      },
    },
    {
      name: "qxgh-status",
      title: "QxGH CI Summary",
      async run(context) {
        try {
          const b = await loadBundle(context, { force: false });
          const hot = pickHottestRun(estimateRuns(b.runs));
          let msg = summaryLine(b);
          if (hot) msg = `${hot.repo}: ${hot.displayTitle || hot.name} · ${msg}`;
          context.showToast(msg.slice(0, 140));
        } catch (err) {
          context.showToast(String(err).slice(0, 120));
        }
      },
    },
    {
      name: "qxgh-watch-island",
      title: "QxGH Watch on Island",
      async run(context) {
        try {
          const b = await loadBundle(context, { force: true });
          const hot = pickHottestRun(estimateRuns(b.runs));
          if (!hot) {
            await publishIsland(context, null, true);
            context.showToast("No in-progress runs on page");
            return;
          }
          await publishIsland(context, hot, true);
          context.showToast(`Watching ${hot.repo} · ${hot.displayTitle || hot.name}`.slice(0, 120));
        } catch (err) {
          context.showToast(String(err).slice(0, 120));
        }
      },
    },
  ],

  panel: {
    title: "QxGH",
    async render(container, context) {
      if (destroyPanel) {
        try {
          destroyPanel();
        } catch {
          /* ignore */
        }
      }
      if (!context.ui?.mountWorkbench) {
        container.innerHTML =
          "<p style='padding:16px;font:13px system-ui'>Needs host workbench (context.ui). Update Qx.</p>";
        destroyPanel = () => {
          container.innerHTML = "";
        };
        return;
      }
      destroyPanel = renderPanel(container, context);
    },
    destroy(container) {
      if (destroyPanel) {
        try {
          destroyPanel();
        } catch {
          /* ignore */
        }
        destroyPanel = null;
      }
      container.innerHTML = "";
    },
  },
};

// Node smoke-test helpers (not used in iframe)
export const __test = {
  estimateRunProgress,
  estimateRuns,
  islandToggleAction,
  parseActionsHtml,
  parseDurationSeconds,
  parseReleasesHtml,
  parseRunDurationHtml,
};
