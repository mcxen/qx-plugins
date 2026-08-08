import "./styles.css";
import {
  detectLocale,
  detectTheme,
  persistLocale,
  persistTheme,
  t,
  type MessageKey,
  type Theme,
} from "./i18n";
import {
  localizePluginDescription,
  localizePluginName,
  pluginSearchBlob,
} from "./pluginLabels";
import type {
  Locale,
  PluginCatalog,
  PluginIndexEntry,
  PluginReleaseNote,
  Route,
  SortKey,
} from "./types";

const REMOTE_FALLBACK =
  "https://raw.githubusercontent.com/mcxen/qx-plugins/main/index.json";
const GITHUB_REPO = "https://github.com/mcxen/qx-plugins";
const GITHUB_INDEX =
  "https://raw.githubusercontent.com/mcxen/qx-plugins/main/index.json";
const CNB_INDEX =
  "https://cnb.cool/v.ip/qx-plugins/-/git/raw/main/index.json";
const CNB_REPO_ROOT = "https://cnb.cool/v.ip/qx-plugins";

const root = document.getElementById("app");
if (!root) throw new Error("#app missing");

const state = {
  locale: detectLocale() as Locale,
  theme: detectTheme() as Theme,
  catalog: null as PluginCatalog | null,
  error: null as string | null,
  query: "",
  sort: "updated" as SortKey,
  route: parseRoute() as Route,
  copyFlash: false as boolean,
  /** Detail-page screenshot index keyed by plugin id. */
  shotIndexById: {} as Record<string, number>,
};

function parseRoute(): Route {
  const hash = location.hash.replace(/^#\/?/, "");
  if (!hash || hash === "home") return { name: "home" };
  if (hash === "sources" || hash === "setup") return { name: "sources" };
  const m = hash.match(/^p\/([^/]+)/);
  if (m) return { name: "detail", id: decodeURIComponent(m[1]) };
  return { name: "home" };
}

function setRoute(route: Route, push = true): void {
  state.route = route;
  const next =
    route.name === "home"
      ? "#/"
      : route.name === "sources"
        ? "#/sources"
        : `#/p/${encodeURIComponent(route.id)}`;
  if (push) history.pushState(null, "", next);
  render();
  window.scrollTo(0, 0);
}

function tr(key: MessageKey): string {
  return t(state.locale, key);
}

/** Deep link handled by installed Qx (`qx://plugins/install`). */
function buildQxInstallLink(plugin: PluginIndexEntry): string {
  const params = new URLSearchParams();
  if (plugin.download_url) params.set("url", plugin.download_url);
  if (plugin.id) params.set("id", plugin.id);
  return `qx://plugins/install?${params.toString()}`;
}

function formatBytes(n?: number): string {
  if (n == null || !Number.isFinite(n)) return tr("unknown");
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(raw?: string): string {
  if (!raw) return tr("unknown");
  // Prefer YYYY-MM-DD as-is for stability across locales
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toISOString().slice(0, 10);
}

function releaseNotes(r: PluginReleaseNote): string {
  const locs = r.notes_localizations || {};
  if (state.locale === "zh-CN") {
    return locs["zh-CN"] || locs.zh || locs.en || r.notes || "";
  }
  return locs.en || locs["zh-CN"] || r.notes || "";
}

function initials(name: string): string {
  const clean = name.replace(/[^a-zA-Z0-9\u4e00-\u9fff]+/g, " ").trim();
  if (!clean) return "?";
  const parts = clean.split(/\s+/);
  if (/[\u4e00-\u9fff]/.test(parts[0])) return parts[0].slice(0, 1);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function iconHtml(plugin: PluginIndexEntry, large = false): string {
  const cls = large ? "plugin-icon" : "plugin-icon";
  if (plugin.icon_url) {
    return `<div class="${cls}" aria-hidden="true"><img src="${escapeAttr(plugin.icon_url)}" alt="" loading="lazy" /></div>`;
  }
  return `<div class="${cls}" aria-hidden="true"><span class="plugin-icon__fallback">${escapeHtml(initials(plugin.name || plugin.id))}</span></div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map((x) => parseInt(x, 10) || 0);
  const pb = b.replace(/^v/, "").split(".").map((x) => parseInt(x, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

function filteredPlugins(): PluginIndexEntry[] {
  const plugins = state.catalog?.plugins ?? [];
  const q = state.query.trim().toLowerCase();
  let list = plugins;
  if (q) {
    list = plugins.filter((p) => pluginSearchBlob(p).includes(q));
  }
  const sorted = [...list];
  sorted.sort((a, b) => {
    if (state.sort === "name") {
      return localizePluginName(a, state.locale).localeCompare(
        localizePluginName(b, state.locale),
        state.locale === "zh-CN" ? "zh-CN" : "en",
      );
    }
    if (state.sort === "version") return compareSemver(b.version, a.version);
    // updated
    const da = a.updated_at || "";
    const db = b.updated_at || "";
    if (da !== db) return db.localeCompare(da);
    return localizePluginName(a, state.locale).localeCompare(
      localizePluginName(b, state.locale),
      state.locale === "zh-CN" ? "zh-CN" : "en",
    );
  });
  return sorted;
}

function latestUpdate(plugins: PluginIndexEntry[]): string {
  let best = "";
  for (const p of plugins) {
    if (p.updated_at && p.updated_at > best) best = p.updated_at;
  }
  return best ? formatDate(best) : tr("unknown");
}

function headerHtml(): string {
  return `
    <header class="header">
      <div class="header__inner">
        <a class="brand" href="#/" data-nav="home">
          <img class="brand__mark" src="/qx-tray.svg" alt="" width="22" height="22" />
          <span class="brand__text">
            <span class="brand__name">Qx</span>
            <span class="brand__sep" aria-hidden="true">/</span>
            <span class="brand__store">${escapeHtml(tr("brandStore"))}</span>
          </span>
        </a>
        <div class="header__search">
          <svg class="header__search-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.3"/>
            <path d="M10.5 10.5L13.5 13.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
          <input
            type="search"
            id="search"
            placeholder="${escapeAttr(tr("searchPlaceholder"))}"
            value="${escapeAttr(state.query)}"
            autocomplete="off"
            spellcheck="false"
          />
        </div>
        <div class="header__actions">
          <a class="header__link header__link--always" href="#/sources" data-nav="sources">${escapeHtml(tr("navSources"))}</a>
          <div class="lang-toggle" role="group" aria-label="Language">
            <button type="button" data-locale="zh-CN" aria-pressed="${state.locale === "zh-CN"}">中文</button>
            <button type="button" data-locale="en" aria-pressed="${state.locale === "en"}">EN</button>
          </div>
          <button
            class="theme-toggle"
            type="button"
            data-theme-toggle
            aria-label="${escapeAttr(tr("themeToggle"))}"
            title="${escapeAttr(tr("themeToggle"))}"
          >
            <span class="theme-toggle__icon" aria-hidden="true">${state.theme === "dark" ? "☼" : "◐"}</span>
            <span class="theme-toggle__text">${escapeHtml(state.theme === "dark" ? tr("lightTheme") : tr("darkTheme"))}</span>
          </button>
          <a class="header__link" href="${GITHUB_REPO}" target="_blank" rel="noreferrer">${escapeHtml(tr("github"))}</a>
        </div>
      </div>
    </header>
  `;
}

function footerHtml(): string {
  return `
    <footer class="footer">
      <div class="footer__inner">
        <p>${escapeHtml(tr("footerNote"))}</p>
        <div class="footer__links">
          <a href="#/sources" data-nav="sources">${escapeHtml(tr("navSources"))}</a>
          <a href="${GITHUB_REPO}" target="_blank" rel="noreferrer">${escapeHtml(tr("source"))}</a>
          <a href="${GITHUB_REPO}/blob/main/index.json" target="_blank" rel="noreferrer">index.json</a>
        </div>
      </div>
    </footer>
  `;
}

function homeHtml(): string {
  if (!state.catalog && !state.error) {
    return `<main id="main" class="main"><div class="state-block"><p class="state-block__title">${escapeHtml(tr("loading"))}</p></div></main>`;
  }
  if (state.error) {
    return `
      <main id="main" class="main">
        <div class="state-block">
          <p class="state-block__title">${escapeHtml(tr("loadErrorTitle"))}</p>
          <p class="state-block__body">${escapeHtml(tr("loadErrorBody"))}</p>
        </div>
      </main>`;
  }

  const all = state.catalog!.plugins;
  const list = filteredPlugins();

  const cards = list
    .map(
      (p) => {
        const displayName = localizePluginName(p, state.locale);
        const displayDesc = localizePluginDescription(p, state.locale);
        return `
      <li class="plugin-card">
        <button type="button" class="plugin-card__btn" data-open="${escapeAttr(p.id)}">
          ${iconHtml(p)}
          <div class="plugin-card__body">
            <div class="plugin-card__top">
              <span class="plugin-card__name">${escapeHtml(displayName)}</span>
              <span class="plugin-card__version">v${escapeHtml(p.version)}</span>
            </div>
            <p class="plugin-card__desc">${escapeHtml(displayDesc)}</p>
            <div class="plugin-card__meta">
              <span>${escapeHtml(p.author || p.id)}</span>
              <span class="dot-sep">${escapeHtml(formatDate(p.updated_at))}</span>
            </div>
          </div>
        </button>
      </li>`;
      },
    )
    .join("");

  const empty =
    list.length === 0
      ? `<div class="state-block">
          <p class="state-block__title">${escapeHtml(tr("emptyTitle"))}</p>
          <p class="state-block__body">${escapeHtml(tr("emptyBody"))}</p>
        </div>`
      : `<ul class="catalog">${cards}</ul>`;

  return `
    <main id="main" class="main">
      <section class="opening" aria-labelledby="opening-title">
        <h1 id="opening-title" class="opening__title">${escapeHtml(tr("title"))}</h1>
        <p class="opening__lede">${escapeHtml(tr("lede"))}</p>
        <div class="stats">
          <div class="stat">
            <p class="stat__label">${escapeHtml(tr("statPlugins"))}</p>
            <p class="stat__value">${all.length}</p>
          </div>
          <div class="stat">
            <p class="stat__label">${escapeHtml(tr("statUpdated"))}</p>
            <p class="stat__value">${escapeHtml(latestUpdate(all))}</p>
          </div>
          <div class="stat">
            <p class="stat__label">${escapeHtml(tr("statSource"))}</p>
            <p class="stat__value" style="font-size:14px">${escapeHtml(tr("statSourceValue"))}</p>
          </div>
        </div>
      </section>

      <div class="toolbar">
        <p class="toolbar__count">
          ${escapeHtml(tr("showing"))}
          <strong>${list.length}</strong>
          ${escapeHtml(tr("of"))}
          <strong>${all.length}</strong>
        </p>
        <label class="sort">
          <span>${escapeHtml(tr("sort"))}</span>
          <select id="sort">
            <option value="updated" ${state.sort === "updated" ? "selected" : ""}>${escapeHtml(tr("sortUpdated"))}</option>
            <option value="name" ${state.sort === "name" ? "selected" : ""}>${escapeHtml(tr("sortName"))}</option>
            <option value="version" ${state.sort === "version" ? "selected" : ""}>${escapeHtml(tr("sortVersion"))}</option>
          </select>
        </label>
      </div>

      ${empty}
    </main>
  `;
}

function copyFieldHtml(value: string, label: string): string {
  return `
    <div class="doc-field">
      <span class="doc-field__label">${escapeHtml(label)}</span>
      <div class="doc-field__row">
        <code class="doc-code">${escapeHtml(value)}</code>
        <button type="button" class="btn btn--ghost doc-copy" data-copy="${escapeAttr(value)}">${escapeHtml(tr(state.copyFlash ? "sourcesCopied" : "sourcesCopy"))}</button>
      </div>
    </div>`;
}

function sourcesHtml(): string {
  return `
    <main id="main" class="main">
      <article class="doc">
        <button type="button" class="detail__back" data-nav="home">
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          ${escapeHtml(tr("back"))}
        </button>
        <header class="doc__hero">
          <h1 class="doc__title">${escapeHtml(tr("sourcesTitle"))}</h1>
          <p class="doc__lede">${escapeHtml(tr("sourcesLede"))}</p>
        </header>

        <section class="panel">
          <h2 class="panel__head">${escapeHtml(tr("sourcesWhereTitle"))}</h2>
          <div class="panel__body">
            <p class="doc__p">${escapeHtml(tr("sourcesWhereBody"))}</p>
          </div>
        </section>

        <div class="doc__grid">
          <section class="panel">
            <h2 class="panel__head">${escapeHtml(tr("sourcesGhTitle"))}</h2>
            <div class="panel__body">
              <p class="doc__p">${escapeHtml(tr("sourcesGhBody"))}</p>
              ${copyFieldHtml("Qx Official", tr("sourcesGhName"))}
              ${copyFieldHtml(GITHUB_INDEX, tr("sourcesGhUrl"))}
            </div>
          </section>

          <section class="panel">
            <h2 class="panel__head">${escapeHtml(tr("sourcesCnbTitle"))}</h2>
            <div class="panel__body">
              <p class="doc__p">${escapeHtml(tr("sourcesCnbBody"))}</p>
              ${copyFieldHtml("Qx CNB", tr("sourcesCnbName"))}
              ${copyFieldHtml(CNB_INDEX, tr("sourcesCnbUrl"))}
              <p class="doc__p doc__p--muted">${escapeHtml(tr("sourcesCnbAlt"))}</p>
              ${copyFieldHtml(CNB_REPO_ROOT, tr("sourcesCnbUrl"))}
            </div>
          </section>
        </div>

        <section class="panel">
          <h2 class="panel__head">${escapeHtml(tr("sourcesStepsTitle"))}</h2>
          <div class="panel__body">
            <ol class="doc-steps">
              <li>${escapeHtml(tr("sourcesStep1"))}</li>
              <li>${escapeHtml(tr("sourcesStep2"))}</li>
              <li>${escapeHtml(tr("sourcesStep3"))}</li>
              <li>${escapeHtml(tr("sourcesStep4"))}</li>
            </ol>
          </div>
        </section>

        <section class="panel">
          <h2 class="panel__head">${escapeHtml(tr("sourcesBothTitle"))}</h2>
          <div class="panel__body">
            <p class="doc__p">${escapeHtml(tr("sourcesBothBody"))}</p>
          </div>
        </section>

        <section class="panel">
          <h2 class="panel__head">${escapeHtml(tr("sourcesNoteTitle"))}</h2>
          <div class="panel__body">
            <p class="doc__p">${escapeHtml(tr("sourcesNoteBody"))}</p>
          </div>
        </section>
      </article>
    </main>
  `;
}

function detailHtml(id: string): string {
  const plugin = state.catalog?.plugins.find((p) => p.id === id);
  if (!plugin) {
    return `
      <main id="main" class="main">
        <button type="button" class="detail__back" data-nav="home">
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          ${escapeHtml(tr("back"))}
        </button>
        <div class="state-block" style="margin-top:24px">
          <p class="state-block__title">${escapeHtml(tr("emptyTitle"))}</p>
          <p class="state-block__body">${escapeHtml(id)}</p>
        </div>
      </main>`;
  }

  const perms = plugin.required_permissions || [];
  const releases = plugin.releases || [];
  const shots = plugin.screenshot_urls || [];
  const checksumLabel = state.copyFlash ? tr("copied") : tr("copyChecksum");
  const shotIndex = state.shotIndexById[plugin.id] || 0;
  const safeShotIndex = shots.length ? ((shotIndex % shots.length) + shots.length) % shots.length : 0;

  const shotCarousel =
    shots.length === 0
      ? ""
      : `
      <section class="panel shot-panel">
        <h2 class="panel__head">${escapeHtml(tr("screenshots"))}</h2>
        <div class="panel__body shot-body">
          <div class="shot-carousel" data-shot-id="${escapeAttr(plugin.id)}" data-shot-count="${shots.length}">
            <div class="shot-viewport">
              <div class="shot-track" style="transform:translate3d(-${safeShotIndex * 100}%,0,0)">
                ${shots
                  .map(
                    (src) => `
                  <div class="shot-slide">
                    <img src="${escapeAttr(src)}" alt="" loading="lazy" draggable="false" />
                  </div>`,
                  )
                  .join("")}
              </div>
            </div>
            ${
              shots.length > 1
                ? `
              <button type="button" class="shot-nav is-prev" data-shot-step="-1" aria-label="${escapeAttr(tr("shotPrev"))}">‹</button>
              <button type="button" class="shot-nav is-next" data-shot-step="1" aria-label="${escapeAttr(tr("shotNext"))}">›</button>
              <div class="shot-dots">
                ${shots
                  .map(
                    (_, i) =>
                      `<button type="button" class="shot-dot${i === safeShotIndex ? " is-active" : ""}" data-shot-goto="${i}" aria-label="${i + 1}"></button>`,
                  )
                  .join("")}
              </div>
              <div class="shot-counter">${safeShotIndex + 1} / ${shots.length}</div>`
                : ""
            }
          </div>
        </div>
      </section>`;

  const releaseItems =
    releases.length === 0
      ? `<p class="release__notes">${escapeHtml(tr("noReleases"))}</p>`
      : `<ul class="releases">${releases
          .map((r) => {
            const notes = releaseNotes(r);
            return `
            <li class="release">
              <div>
                <span class="release__ver">v${escapeHtml(r.version)}</span>
                <span class="release__date">${escapeHtml(formatDate(r.published_at))}</span>
              </div>
              <p class="release__notes">${escapeHtml(notes || tr("noReleases"))}</p>
            </li>`;
          })
          .join("")}</ul>`;

  const permItems =
    perms.length === 0
      ? `<p class="howto">${escapeHtml(tr("noPermissions"))}</p>`
      : `<ul class="perm-list">${perms
          .map((p) => `<li class="perm">${escapeHtml(p)}</li>`)
          .join("")}</ul>`;

  return `
    <main id="main" class="main">
      <article class="detail">
        <button type="button" class="detail__back" data-nav="home">
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          ${escapeHtml(tr("back"))}
        </button>

        <header class="detail__hero">
          ${iconHtml(plugin, true)}
          <div>
            <h1 class="detail__title">${escapeHtml(localizePluginName(plugin, state.locale))}</h1>
            <p class="detail__desc">${escapeHtml(localizePluginDescription(plugin, state.locale))}</p>
            <div class="detail__actions">
              <a class="btn btn--primary" href="${escapeAttr(buildQxInstallLink(plugin))}">${escapeHtml(tr("openInQx"))}</a>
              <a class="btn btn--ghost" href="${escapeAttr(plugin.download_url)}" target="_blank" rel="noreferrer">${escapeHtml(tr("download"))}</a>
              ${
                plugin.checksum_sha256
                  ? `<button type="button" class="btn btn--ghost" data-copy="${escapeAttr(plugin.checksum_sha256)}">${escapeHtml(checksumLabel)}</button>`
                  : ""
              }
            </div>
          </div>
        </header>

        ${shotCarousel}

        <div class="detail__grid">
          <section class="panel">
            <h2 class="panel__head">${escapeHtml(tr("releases"))}</h2>
            <div class="panel__body">${releaseItems}</div>
          </section>

          <div style="display:grid;gap:20px">
            <section class="panel">
              <h2 class="panel__head">${escapeHtml(tr("meta"))}</h2>
              <div class="panel__body">
                <ul class="meta-list">
                  <li><span class="meta-list__k">${escapeHtml(tr("version"))}</span><span class="meta-list__v meta-list__v--mono">v${escapeHtml(plugin.version)}</span></li>
                  <li><span class="meta-list__k">${escapeHtml(tr("author"))}</span><span class="meta-list__v">${escapeHtml(plugin.author || tr("unknown"))}</span></li>
                  <li><span class="meta-list__k">${escapeHtml(tr("updated"))}</span><span class="meta-list__v meta-list__v--mono">${escapeHtml(formatDate(plugin.updated_at))}</span></li>
                  <li><span class="meta-list__k">${escapeHtml(tr("minApp"))}</span><span class="meta-list__v meta-list__v--mono">${escapeHtml(plugin.min_app_version || tr("unknown"))}</span></li>
                  <li><span class="meta-list__k">${escapeHtml(tr("size"))}</span><span class="meta-list__v meta-list__v--mono">${escapeHtml(formatBytes(plugin.size_bytes))}</span></li>
                  <li><span class="meta-list__k">ID</span><span class="meta-list__v meta-list__v--mono">${escapeHtml(plugin.id)}</span></li>
                  ${
                    plugin.checksum_sha256
                      ? `<li><span class="meta-list__k">${escapeHtml(tr("checksum"))}</span><span class="meta-list__v meta-list__v--mono">${escapeHtml(plugin.checksum_sha256.slice(0, 16))}…</span></li>`
                      : ""
                  }
                </ul>
              </div>
            </section>

            <section class="panel">
              <h2 class="panel__head">${escapeHtml(tr("permissions"))}</h2>
              <div class="panel__body">${permItems}</div>
            </section>

            <section class="panel">
              <h2 class="panel__head">${escapeHtml(tr("install"))}</h2>
              <div class="panel__body">
                <div class="howto">
                  <p>${escapeHtml(tr("installSteps"))}</p>
                  <ol>
                    <li>Qx → Settings → Extensions</li>
                    <li>${escapeHtml(localizePluginName(plugin, state.locale))} <code>${escapeHtml(plugin.id)}</code></li>
                  </ol>
                </div>
              </div>
            </section>
          </div>
        </div>
      </article>
    </main>
  `;
}

function render(): void {
  document.documentElement.lang = state.locale === "zh-CN" ? "zh-CN" : "en";
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.style.colorScheme = state.theme;
  const body =
    state.route.name === "detail"
      ? detailHtml(state.route.id)
      : state.route.name === "sources"
        ? sourcesHtml()
        : homeHtml();
  root!.innerHTML = `${headerHtml()}${body}${footerHtml()}`;
  bind();
}

function bind(): void {
  const search = document.getElementById("search") as HTMLInputElement | null;
  if (search) {
    search.addEventListener("input", () => {
      state.query = search.value;
      // keep focus: re-render only catalog region would be better; full render ok for 17 items
      const start = search.selectionStart;
      render();
      const next = document.getElementById("search") as HTMLInputElement | null;
      if (next) {
        next.focus();
        if (start != null) next.setSelectionRange(start, start);
      }
    });
  }

  const sort = document.getElementById("sort") as HTMLSelectElement | null;
  if (sort) {
    sort.addEventListener("change", () => {
      state.sort = sort.value as SortKey;
      render();
    });
  }

  root!.querySelectorAll<HTMLButtonElement>("[data-locale]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const loc = btn.dataset.locale as Locale;
      state.locale = loc;
      persistLocale(loc);
      render();
    });
  });

  root!.querySelector<HTMLButtonElement>("[data-theme-toggle]")?.addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    persistTheme(state.theme);
    render();
  });

  root!.querySelectorAll<HTMLElement>("[data-nav='home']").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      setRoute({ name: "home" });
    });
  });

  root!.querySelectorAll<HTMLElement>("[data-nav='sources']").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      setRoute({ name: "sources" });
    });
  });

  root!.querySelectorAll<HTMLButtonElement>("[data-open]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.open;
      if (id) setRoute({ name: "detail", id });
    });
  });

  root!.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const value = btn.dataset.copy || "";
      try {
        await navigator.clipboard.writeText(value);
        state.copyFlash = true;
        render();
        setTimeout(() => {
          state.copyFlash = false;
          render();
        }, 1400);
      } catch {
        /* ignore */
      }
    });
  });

  bindShotCarousels();
}

function bindShotCarousels(): void {
  root!.querySelectorAll<HTMLElement>(".shot-carousel").forEach((carousel) => {
    const id = carousel.dataset.shotId || "";
    const count = Number(carousel.dataset.shotCount || "0");
    if (!id || count <= 0) return;

    const setIndex = (next: number) => {
      const normalized = ((next % count) + count) % count;
      state.shotIndexById[id] = normalized;
      render();
    };

    carousel.querySelectorAll<HTMLButtonElement>("[data-shot-step]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const step = Number(btn.dataset.shotStep || "0");
        setIndex((state.shotIndexById[id] || 0) + step);
      });
    });

    carousel.querySelectorAll<HTMLButtonElement>("[data-shot-goto]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        setIndex(Number(btn.dataset.shotGoto || "0"));
      });
    });

    // Pointer swipe on viewport
    const viewport = carousel.querySelector<HTMLElement>(".shot-viewport");
    if (!viewport || count <= 1) return;
    let startX = 0;
    let deltaX = 0;
    let active = false;
    let pointerId = -1;

    viewport.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      active = true;
      pointerId = e.pointerId;
      startX = e.clientX;
      deltaX = 0;
      viewport.setPointerCapture(pointerId);
    });
    viewport.addEventListener("pointermove", (e) => {
      if (!active || e.pointerId !== pointerId) return;
      deltaX = e.clientX - startX;
      const track = carousel.querySelector<HTMLElement>(".shot-track");
      if (track) {
        const base = -((state.shotIndexById[id] || 0) * 100);
        const pct = (deltaX / Math.max(viewport.clientWidth, 1)) * 100;
        track.style.transition = "none";
        track.style.transform = `translate3d(calc(${base}% + ${pct}%),0,0)`;
      }
    });
    const finish = (commit: boolean) => {
      if (!active) return;
      active = false;
      const threshold = Math.min(72, viewport.clientWidth * 0.18);
      if (commit && Math.abs(deltaX) >= threshold) {
        setIndex((state.shotIndexById[id] || 0) + (deltaX > 0 ? -1 : 1));
      } else {
        const track = carousel.querySelector<HTMLElement>(".shot-track");
        if (track) {
          const base = -((state.shotIndexById[id] || 0) * 100);
          track.style.transition = "";
          track.style.transform = `translate3d(${base}%,0,0)`;
        }
      }
    };
    viewport.addEventListener("pointerup", (e) => {
      if (e.pointerId !== pointerId) return;
      try {
        viewport.releasePointerCapture(pointerId);
      } catch {
        /* ignore */
      }
      finish(true);
    });
    viewport.addEventListener("pointercancel", () => finish(false));
  });
}

async function loadCatalog(): Promise<void> {
  try {
    const res = await fetch(`/catalog.json?t=${Date.now()}`, { cache: "no-cache" });
    if (res.ok) {
      state.catalog = (await res.json()) as PluginCatalog;
      state.error = null;
      return;
    }
  } catch {
    /* try remote */
  }

  try {
    const res = await fetch(REMOTE_FALLBACK, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const remote = (await res.json()) as PluginCatalog;
    state.catalog = remote;
    state.error = null;
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
  }
}

window.addEventListener("hashchange", () => {
  state.route = parseRoute();
  render();
});

window.addEventListener("popstate", () => {
  state.route = parseRoute();
  render();
});

async function boot(): Promise<void> {
  render();
  await loadCatalog();
  render();
}

void boot();
