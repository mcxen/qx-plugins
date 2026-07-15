/**
 * Bing Wallpaper — native Qx plugin
 *
 * Rewritten from the broken Raycast conversion. Binary image download goes
 * through AppleScript + curl (host HTTP only returns text bodies), then
 * System Events sets the desktop picture.
 */

const PLUGIN_FILES = "/qx-plugin-files/raycast-bing-wallpaper";
const BING_API =
  "https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=8&pid=hp&uhd=1&uhdwidth=3840&uhdheight=2160";
const BING_API_MORE =
  "https://www.bing.com/HPImageArchive.aspx?format=js&idx=8&n=8&pid=hp&uhd=1&uhdwidth=3840&uhdheight=2160";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeApple(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function pictureName(urlSuffix) {
  const raw = String(urlSuffix || "");
  const start = raw.indexOf("OHR.");
  if (start >= 0) {
    const rest = raw.slice(start + 4);
    const end = rest.indexOf("_");
    return end > 0 ? rest.slice(0, end) : rest.slice(0, 40);
  }
  const first = 11;
  const last = raw.indexOf("_");
  if (last > first) return raw.slice(first, last);
  return "bing-wallpaper";
}

function imageUrl(urlSuffix, size = "preview") {
  let suffix = String(urlSuffix || "");
  if (size === "raw") {
    suffix = suffix.replace(/&w=\d+&h=\d+&rs=1&c=4/, "");
  } else if (size === "preview") {
    suffix = suffix
      .replace(/w=\d+/, "w=960")
      .replace(/h=\d+/, "h=540");
  } else if (size === "full") {
    // keep as-is
  }
  if (suffix.startsWith("http")) return suffix;
  return "https://www.bing.com" + suffix;
}

function copyrightUrl(urlSuffix) {
  const raw = String(urlSuffix || "");
  if (raw.startsWith("http")) return raw;
  return "https://www.bing.com" + raw;
}

async function fetchJson(context, url) {
  const res = await context.http.fetch(url, { method: "GET" });
  if (!res?.ok) {
    throw new Error(`HTTP ${res?.status || "?"} for ${url}`);
  }
  if (typeof res.json === "function") return res.json();
  return JSON.parse(String(res.body || ""));
}

async function loadWallpapers(context) {
  const first = await fetchJson(context, BING_API);
  let images = Array.isArray(first?.images) ? [...first.images] : [];
  try {
    const second = await fetchJson(context, BING_API_MORE);
    const more = Array.isArray(second?.images) ? second.images.slice(1) : [];
    images = images.concat(more);
  } catch {
    // second page is optional; Bing sometimes rate-limits older indices
  }
  return images.map((item, index) => ({
    id: String(item.hsh || item.startdate || index),
    title: item.title || pictureName(item.url),
    name: pictureName(item.url),
    startdate: item.startdate || "",
    copyright: item.copyright || "",
    copyrightlink: item.copyrightlink || "",
    url: item.url || "",
    preview: imageUrl(item.url, "preview"),
    full: imageUrl(item.url, "raw"),
  }));
}

async function runAppleScript(context, script) {
  const result = await context.qx.invokeRust("plugin_run_applescript", {
    script: String(script || ""),
  });
  return String(result ?? "").trim();
}

function downloadAndSetScript(filePath, imageHttpUrl, applyTo = "every") {
  const path = escapeApple(filePath);
  const url = escapeApple(imageHttpUrl);
  const target = applyTo === "current" ? "current desktop" : "every desktop";
  return `
set destPath to "${path}"
set imageURL to "${url}"
do shell script "mkdir -p " & quoted form of (do shell script "dirname " & quoted form of destPath)
do shell script "curl -fsSL --connect-timeout 20 --max-time 120 -A " & quoted form of "Qx Bing Wallpaper" & " -o " & quoted form of destPath & " -- " & quoted form of imageURL
set x to alias (POSIX file destPath)
try
  tell application "System Events"
    tell ${target}
      set picture to (x as text)
    end tell
  end tell
  return "ok"
on error errMsg
  return "error: " & errMsg
end try
`;
}

function downloadOnlyScript(filePath, imageHttpUrl) {
  const path = escapeApple(filePath);
  const url = escapeApple(imageHttpUrl);
  return `
set destPath to "${path}"
set imageURL to "${url}"
do shell script "mkdir -p " & quoted form of (do shell script "dirname " & quoted form of destPath)
do shell script "curl -fsSL --connect-timeout 20 --max-time 120 -A " & quoted form of "Qx Bing Wallpaper" & " -o " & quoted form of destPath & " -- " & quoted form of imageURL
return "ok"
`;
}

async function setOnlineWallpaper(context, wallpaper, options = {}) {
  const showToast = options.showToast !== false;
  const fileName = `${wallpaper.name || "bing"}-${wallpaper.startdate || "today"}.jpg`;
  const dest = `${PLUGIN_FILES}/${fileName}`;
  if (showToast) context.showToast("Downloading and setting wallpaper...");
  const result = await runAppleScript(
    context,
    downloadAndSetScript(dest, wallpaper.full, options.applyTo || "every"),
  );
  if (result === "ok") {
    if (showToast) context.showToast("Wallpaper set: " + (wallpaper.title || wallpaper.name));
    return true;
  }
  if (showToast) context.showToast("Set wallpaper failed: " + result);
  return false;
}

async function downloadWallpaper(context, wallpaper) {
  const fileName = `${wallpaper.name || "bing"}-${wallpaper.startdate || "today"}.jpg`;
  const dest = `/qx-home/Downloads/${fileName}`;
  context.showToast("Downloading to ~/Downloads...");
  const result = await runAppleScript(context, downloadOnlyScript(dest, wallpaper.full));
  if (result === "ok") {
    context.showToast("Saved: ~/Downloads/" + fileName);
    return true;
  }
  context.showToast("Download failed: " + result);
  return false;
}

function styles() {
  return `<style>
    *{box-sizing:border-box}
    body,html{margin:0;height:100%;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--qx-text-primary,#111);background:transparent}
    .wrap{height:100%;display:flex;flex-direction:column;gap:10px;padding:14px;overflow:hidden}
    .header{display:flex;align-items:center;justify-content:space-between;gap:10px}
    .header h1{margin:0;font-size:16px;font-weight:650}
    .header .meta{color:var(--qx-text-secondary,#666);font-size:12px}
    .toolbar{display:flex;gap:8px;flex-wrap:wrap}
    button,a.btn{border:1px solid var(--qx-border-1,#ddd);background:var(--qx-bg-component-1,#fff);color:inherit;border-radius:7px;padding:6px 10px;font:inherit;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}
    button.primary{background:var(--qx-accent,#2563eb);border-color:var(--qx-accent,#2563eb);color:#fff}
    button:disabled{opacity:.55;cursor:default}
    .status{min-height:18px;color:var(--qx-text-secondary,#666);font-size:12px}
    .status.error{color:var(--qx-danger,#c00)}
    .grid{flex:1;min-height:0;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;align-content:start}
    .card{border:1px solid var(--qx-border-1,#ddd);border-radius:10px;overflow:hidden;background:var(--qx-bg-component-1,#fff);display:flex;flex-direction:column;min-width:0}
    .card img{width:100%;aspect-ratio:16/9;object-fit:cover;background:var(--qx-bg-component-2,#eee);display:block}
    .card .body{padding:8px 10px 10px;display:flex;flex-direction:column;gap:6px;min-width:0}
    .card .title{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .card .copy{color:var(--qx-text-secondary,#666);font-size:11px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .card .actions{display:flex;flex-wrap:wrap;gap:6px}
    .card .actions button,.card .actions a.btn{padding:4px 7px;font-size:11px;border-radius:6px}
    .empty{padding:28px 12px;text-align:center;color:var(--qx-text-secondary,#666)}
  </style>`;
}

async function renderPanel(container, context) {
  container.innerHTML =
    styles() +
    `<div class="wrap">
      <div class="header">
        <h1>Bing Wallpaper</h1>
        <div class="toolbar">
          <button type="button" id="bw-refresh">Refresh</button>
          <button type="button" class="primary" id="bw-set-latest">Set Latest</button>
        </div>
      </div>
      <div class="status" id="bw-status">Loading wallpapers...</div>
      <div class="grid" id="bw-grid"><div class="empty">Loading...</div></div>
    </div>`;

  const statusEl = container.querySelector("#bw-status");
  const gridEl = container.querySelector("#bw-grid");
  let wallpapers = [];
  let busy = false;

  function setStatus(text, isError = false) {
    statusEl.textContent = text || "";
    statusEl.className = "status" + (isError ? " error" : "");
  }

  function setBusy(next) {
    busy = next;
    container.querySelectorAll("button").forEach((btn) => {
      if (btn.id === "bw-refresh") return;
      btn.disabled = next;
    });
  }

  async function setWallpaper(item) {
    if (busy || !item) return;
    setBusy(true);
    setStatus("Setting “" + (item.title || item.name) + "”...");
    try {
      const ok = await setOnlineWallpaper(context, item);
      setStatus(ok ? "Wallpaper set: " + (item.title || item.name) : "Failed to set wallpaper.", !ok);
    } catch (error) {
      setStatus(String(error), true);
    } finally {
      setBusy(false);
    }
  }

  async function saveWallpaper(item) {
    if (busy || !item) return;
    setBusy(true);
    try {
      await downloadWallpaper(context, item);
      setStatus("Saved “" + (item.name || item.title) + "” to Downloads");
    } catch (error) {
      setStatus(String(error), true);
    } finally {
      setBusy(false);
    }
  }

  function paint() {
    if (!wallpapers.length) {
      gridEl.innerHTML = `<div class="empty">No wallpapers loaded.</div>`;
      return;
    }
    gridEl.innerHTML = wallpapers
      .map((item, index) => {
        return `<article class="card" data-index="${index}">
          <img src="${escapeHtml(item.preview)}" alt="${escapeHtml(item.title)}" loading="lazy" referrerpolicy="no-referrer" />
          <div class="body">
            <div class="title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
            <div class="copy" title="${escapeHtml(item.copyright)}">${escapeHtml(item.copyright)}</div>
            <div class="actions">
              <button type="button" class="primary" data-action="set">Set Wallpaper</button>
              <button type="button" data-action="download">Download</button>
              <a class="btn" data-action="open" href="${escapeHtml(copyrightUrl(item.copyrightlink || item.full))}" target="_blank" rel="noreferrer">Info</a>
            </div>
          </div>
        </article>`;
      })
      .join("");
  }

  gridEl.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const actionEl = target.closest("[data-action]");
    if (!actionEl) return;
    const card = actionEl.closest("[data-index]");
    if (!card) return;
    const index = Number(card.getAttribute("data-index"));
    const item = wallpapers[index];
    if (!item) return;
    const action = actionEl.getAttribute("data-action");
    if (action === "set") {
      event.preventDefault();
      void setWallpaper(item);
    } else if (action === "download") {
      event.preventDefault();
      void saveWallpaper(item);
    } else if (action === "open") {
      event.preventDefault();
      const href = actionEl.getAttribute("href");
      if (href) void context.openUrl(href);
    }
  });

  async function refresh() {
    setStatus("Loading wallpapers...");
    gridEl.innerHTML = `<div class="empty">Loading...</div>`;
    try {
      wallpapers = await loadWallpapers(context);
      paint();
      setStatus(wallpapers.length + " wallpaper(s) from Bing");
    } catch (error) {
      wallpapers = [];
      gridEl.innerHTML = `<div class="empty">Failed to load: ${escapeHtml(error)}</div>`;
      setStatus(String(error), true);
    }
  }

  container.querySelector("#bw-refresh")?.addEventListener("click", () => void refresh());
  container.querySelector("#bw-set-latest")?.addEventListener("click", () => {
    if (wallpapers[0]) void setWallpaper(wallpapers[0]);
  });

  await refresh();
}

async function runSetLatest(context, { showToast = true } = {}) {
  const wallpapers = await loadWallpapers(context);
  if (!wallpapers.length) {
    if (showToast) context.showToast("No Bing wallpaper found.");
    return;
  }
  await setOnlineWallpaper(context, wallpapers[0], { showToast });
}

async function runSetRandom(context, { showToast = true } = {}) {
  const wallpapers = await loadWallpapers(context);
  if (!wallpapers.length) {
    if (showToast) context.showToast("No Bing wallpaper found.");
    return;
  }
  const pick = wallpapers[Math.floor(Math.random() * wallpapers.length)];
  await setOnlineWallpaper(context, pick, { showToast });
}

export default {
  commands: [
    {
      name: "set-bing-wallpaper",
      title: "Set Bing Wallpaper",
      description: "Browse and set Bing wallpapers.",
      async run(context) {
        context.showToast("Open Bing Wallpaper from the plugin panel.");
      },
    },
    {
      name: "auto-random-bing-wallpaper",
      title: "Auto Random Bing Wallpaper",
      description: "Set a random Bing wallpaper.",
      interval: "5m",
      async run(context) {
        await runSetRandom(context, { showToast: true });
      },
    },
    {
      name: "auto-switch-bing-wallpaper",
      title: "Auto Switch Bing Wallpaper",
      description: "Set the latest Bing wallpaper.",
      interval: "30m",
      async run(context) {
        await runSetLatest(context, { showToast: true });
      },
    },
  ],
  panel: {
    title: "Bing Wallpaper",
    render(container, context) {
      return renderPanel(container, context);
    },
    destroy(container) {
      if (container) container.innerHTML = "";
    },
  },
};
