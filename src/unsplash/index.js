/**
 * Qx marketplace plugin: Unsplash
 * Host ports: context.http, context.cli, plugin_file_*, plugin_run_applescript
 */

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toBase64(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function expandHomePath(path) {
  const raw = String(path || "").trim() || "~/Downloads";
  if (raw === "~") return "/qx-home";
  if (raw.startsWith("~/")) return `/qx-home/${raw.slice(2)}`;
  if (raw.startsWith("/qx-home")) return raw;
  return raw;
}

async function getAccessKey(context) {
  const key = String((await context.getPreference("accessKey")) || "").trim();
  if (!key) {
    throw new Error(
      "Set Unsplash Access Key in plugin preferences (https://unsplash.com/oauth/applications).",
    );
  }
  return key;
}

async function apiGet(context, path) {
  const key = await getAccessKey(context);
  const url = path.startsWith("http") ? path : `https://api.unsplash.com${path}`;
  const res = await context.http.fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Client-ID ${key}`,
      "Accept-Version": "v1",
    },
    timeoutMs: 30_000,
  });
  if (!res.ok) {
    let detail = res.body || `HTTP ${res.status}`;
    try {
      const err = JSON.parse(res.body || "{}");
      if (err.errors?.[0]) detail = err.errors[0];
      else if (err.error) detail = err.error;
    } catch {
      /* ignore */
    }
    throw new Error(String(detail).slice(0, 300));
  }
  return res.json();
}

function pickUrl(photo, size) {
  const urls = photo?.urls || {};
  return urls[size] || urls.full || urls.regular || urls.small || urls.thumb || "";
}

function mapPhoto(photo) {
  return {
    id: String(photo.id),
    description: photo.description || photo.alt_description || photo.id,
    color: photo.color || "#888",
    width: photo.width,
    height: photo.height,
    user: photo.user?.name || photo.user?.username || "Unknown",
    userLink: photo.user?.links?.html || "",
    pageUrl: photo.links?.html || `https://unsplash.com/photos/${photo.id}`,
    downloadLocation: photo.links?.download_location || "",
    thumb: pickUrl(photo, "small") || pickUrl(photo, "thumb"),
    preview: pickUrl(photo, "regular") || pickUrl(photo, "small"),
    urls: photo.urls || {},
  };
}

async function searchPhotos(context, query, page = 1) {
  const q = String(query || "").trim() || "nature";
  const params = new URLSearchParams({
    query: q,
    page: String(page),
    per_page: "24",
  });
  const data = await apiGet(context, `/search/photos?${params}`);
  const results = Array.isArray(data.results) ? data.results.map(mapPhoto) : [];
  return {
    results,
    totalPages: Number(data.total_pages) || 1,
  };
}

async function randomPhoto(context) {
  const data = await apiGet(context, "/photos/random?count=1");
  const photo = Array.isArray(data) ? data[0] : data;
  if (!photo?.id) throw new Error("No random photo returned");
  return mapPhoto(photo);
}

async function triggerDownloadEndpoint(context, downloadLocation) {
  if (!downloadLocation) return;
  try {
    await apiGet(context, downloadLocation);
  } catch {
    /* analytics endpoint — ignore failures */
  }
}

async function downloadPhotoBytes(context, photo) {
  const size = String((await context.getPreference("downloadSize")) || "full");
  const url = photo.urls?.[size] || photo.urls?.full || photo.preview;
  if (!url) throw new Error("No download URL");
  await triggerDownloadEndpoint(context, photo.downloadLocation);
  const res = await context.http.fetch(url, { method: "GET", timeoutMs: 120_000 });
  if (!res.ok) throw new Error(`Download failed HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

async function writeBytes(context, virtualPath, bytes) {
  const dir = virtualPath.includes("/")
    ? virtualPath.slice(0, virtualPath.lastIndexOf("/"))
    : "/qx-home";
  await context.qx.invokeRust("plugin_file_ensure_dir", { path: dir });
  await context.qx.invokeRust("plugin_file_write_base64", {
    path: virtualPath,
    dataBase64: toBase64(bytes),
  });
  return virtualPath;
}

async function savePhoto(context, photo) {
  const dir = expandHomePath(await context.getPreference("downloadDir"));
  const bytes = await downloadPhotoBytes(context, photo);
  const path = `${dir.replace(/\/$/, "")}/unsplash-${photo.id}.jpg`;
  await writeBytes(context, path, bytes);
  return path;
}

function wallpaperScript(posixPath, applyTo) {
  // AppleScript: set desktop picture. Map /qx-home later by host when running.
  const target = applyTo === "current" ? "current" : "every";
  if (target === "current") {
    return `
set p to POSIX file "${posixPath}"
tell application "System Events"
  tell current desktop
    set picture to (p as text)
  end tell
end tell
return "ok"
`;
  }
  return `
set p to POSIX file "${posixPath}"
tell application "System Events"
  set theDesktops to a reference to every desktop
  repeat with d in theDesktops
    try
      set picture of d to (p as text)
    end try
  end repeat
end tell
return "ok"
`;
}

async function setWallpaper(context, photo) {
  const dir = expandHomePath(await context.getPreference("wallpaperDir"));
  const bytes = await downloadPhotoBytes(context, photo);
  const path = `${dir.replace(/\/$/, "")}/unsplash-${photo.id}.jpg`;
  await writeBytes(context, path, bytes);
  const applyTo = String((await context.getPreference("applyTo")) || "every");
  const platform = String(navigator.platform || "") + String(navigator.userAgent || "");
  const isMac = /mac/i.test(platform);

  if (isMac) {
    const result = await context.qx.invokeRust("plugin_run_applescript", {
      script: wallpaperScript(path, applyTo),
    });
    if (String(result).trim() !== "ok" && String(result).toLowerCase().includes("error")) {
      throw new Error(String(result));
    }
  } else {
    // Windows best-effort via PowerShell + absolute path rewrite is host-side;
    // file is under plugin mapping — open folder as fallback message.
    try {
      await context.cli.run({
        program: "powershell",
        args: [
          "-NoProfile",
          "-Command",
          // Path may be virtual; users on Windows should set download to absolute drive path.
          `Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class W { [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern int SystemParametersInfo(int u, int v, string p, int f); }'; [W]::SystemParametersInfo(20, 0, '${path.replace(/'/g, "''")}', 3)`,
        ],
        timeoutMs: 30_000,
      });
    } catch (e) {
      throw new Error(
        `Wallpaper saved to ${path}. Auto-set on Windows is best-effort: ${e.message || e}`,
      );
    }
  }
  return path;
}

function styles() {
  return `
    .us{box-sizing:border-box;height:100%;display:flex;flex-direction:column;gap:8px;padding:12px;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--qx-text-primary,#111);}
    .us *{box-sizing:border-box;}
    .us-bar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;}
    .us-bar input{flex:1;min-width:140px;height:32px;border:1px solid var(--qx-border-1,#ddd);border-radius:7px;padding:0 10px;background:var(--qx-bg-component-1,#fff);color:inherit;font:inherit;}
    .us-bar button,.us-act{height:30px;border:1px solid var(--qx-border-1,#ddd);border-radius:7px;background:var(--qx-bg-component-1,#fff);color:inherit;padding:0 10px;font:inherit;cursor:pointer;}
    .us-bar button:disabled,.us-act:disabled{opacity:.45;cursor:default;}
    .us-meta{color:var(--qx-text-secondary,#666);font-size:12px;}
    .us-err{color:var(--qx-danger,#b91c1c);white-space:pre-wrap;font-size:12px;}
    .us-grid{flex:1;min-height:0;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;align-content:start;}
    .us-card{border:1px solid var(--qx-border-1,#ddd);border-radius:8px;overflow:hidden;background:var(--qx-bg-component-1,#fff);padding:0;cursor:pointer;color:inherit;font:inherit;text-align:left;}
    .us-card.is-sel{outline:2px solid var(--qx-accent,#2563eb);}
    .us-card img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block;background:var(--qx-bg-component-2,#eee);}
    .us-card .cap{padding:6px 8px;display:flex;flex-direction:column;gap:2px;min-width:0;}
    .us-card strong,.us-card small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .us-card small{color:var(--qx-text-secondary,#666);}
    .us-actions{display:flex;gap:6px;flex-wrap:wrap;}
  `;
}

function render(container, context, state) {
  const items = state.results;
  const selected = items[state.selected] || null;
  const cards = items
    .map((p, i) => {
      return `<button type="button" class="us-card${i === state.selected ? " is-sel" : ""}" data-i="${i}">
        <img src="${esc(p.thumb || p.preview)}" alt="" loading="lazy" />
        <span class="cap">
          <strong>${esc(p.description)}</strong>
          <small>${esc(p.user)}</small>
        </span>
      </button>`;
    })
    .join("");

  container.innerHTML = `
    <style>${styles()}</style>
    <div class="us">
      <div class="us-bar">
        <input data-q placeholder="Search Unsplash photos…" value="${esc(state.query)}" />
        <button type="button" data-act="search">Search</button>
        <button type="button" data-act="random">Random</button>
      </div>
      <div class="us-meta">${state.loading ? "Loading…" : `${items.length} photos · page ${state.page}`}${state.keyHint ? "" : " · set Access Key in preferences"}</div>
      ${state.error ? `<div class="us-err">${esc(state.error)}</div>` : ""}
      <div class="us-grid">${cards || `<div class="us-meta">No results</div>`}</div>
      <div class="us-actions">
        <button type="button" data-act="wallpaper" ${!selected ? "disabled" : ""}>Set Wallpaper</button>
        <button type="button" data-act="save" ${!selected ? "disabled" : ""}>Download</button>
        <button type="button" data-act="copy" ${!selected ? "disabled" : ""}>Copy Link</button>
        <button type="button" data-act="open" ${!selected ? "disabled" : ""}>Open on Unsplash</button>
        <button type="button" data-act="more" ${state.page >= state.totalPages ? "disabled" : ""}>More</button>
      </div>
    </div>
  `;

  const input = container.querySelector("[data-q]");
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      state.query = input.value;
      state.page = 1;
      state.load();
    }
  });

  container.querySelector('[data-act="search"]')?.addEventListener("click", () => {
    state.query = input?.value || state.query;
    state.page = 1;
    state.load();
  });
  container.querySelector('[data-act="random"]')?.addEventListener("click", () => state.loadRandom());
  container.querySelector('[data-act="wallpaper"]')?.addEventListener("click", () => state.setWallpaper());
  container.querySelector('[data-act="save"]')?.addEventListener("click", () => state.save());
  container.querySelector('[data-act="copy"]')?.addEventListener("click", () => state.copyLink());
  container.querySelector('[data-act="open"]')?.addEventListener("click", () => state.openPage());
  container.querySelector('[data-act="more"]')?.addEventListener("click", () => {
    state.page += 1;
    state.load(true);
  });
  container.querySelectorAll(".us-card").forEach((el) => {
    el.addEventListener("click", () => {
      state.selected = Number(el.getAttribute("data-i"));
      render(container, context, state);
    });
  });
}

function createState(container, context) {
  const state = {
    query: "nature",
    page: 1,
    totalPages: 1,
    results: [],
    selected: 0,
    loading: false,
    error: "",
    keyHint: true,
    dead: false,
    _loadGen: 0,

    async load(append = false) {
      if (state.dead) return;
      const gen = ++state._loadGen;
      state.loading = true;
      state.error = "";
      render(container, context, state);
      try {
        await getAccessKey(context);
        if (state.dead || gen !== state._loadGen) return;
        state.keyHint = true;
        const { results, totalPages } = await searchPhotos(context, state.query, state.page);
        if (state.dead || gen !== state._loadGen) return;
        state.totalPages = totalPages;
        state.results = append ? state.results.concat(results) : results;
        if (!append) state.selected = 0;
      } catch (e) {
        if (state.dead || gen !== state._loadGen) return;
        if (!append) state.results = [];
        state.error = String(e?.message || e);
        state.keyHint = !/Access Key/i.test(state.error);
      } finally {
        if (state.dead || gen !== state._loadGen) return;
        state.loading = false;
        render(container, context, state);
      }
    },

    async loadRandom() {
      state.loading = true;
      state.error = "";
      render(container, context, state);
      try {
        const photo = await randomPhoto(context);
        state.results = [photo];
        state.selected = 0;
        state.page = 1;
        state.totalPages = 1;
      } catch (e) {
        state.error = String(e?.message || e);
      } finally {
        state.loading = false;
        render(container, context, state);
      }
    },

    current() {
      return state.results[state.selected] || null;
    },

    async setWallpaper() {
      const photo = state.current();
      if (!photo) return;
      state.loading = true;
      state.error = "";
      render(container, context, state);
      try {
        const path = await setWallpaper(context, photo);
        context.showToast(`Wallpaper set (${path})`);
      } catch (e) {
        state.error = String(e?.message || e);
        context.showToast(state.error);
      } finally {
        state.loading = false;
        render(container, context, state);
      }
    },

    async save() {
      const photo = state.current();
      if (!photo) return;
      state.loading = true;
      state.error = "";
      render(container, context, state);
      try {
        const path = await savePhoto(context, photo);
        context.showToast(`Saved ${path}`);
      } catch (e) {
        state.error = String(e?.message || e);
        context.showToast(state.error);
      } finally {
        state.loading = false;
        render(container, context, state);
      }
    },

    async copyLink() {
      const photo = state.current();
      if (!photo?.pageUrl) return;
      await context.clipboard.write(photo.pageUrl);
      context.showToast("Link copied");
    },

    async openPage() {
      const photo = state.current();
      if (!photo?.pageUrl) return;
      await context.openUrl(photo.pageUrl);
    },
  };
  return state;
}

export default {
  commands: [
    {
      name: "open-search",
      title: "Unsplash: Search Photos",
      async run(context) {
        context.showToast("Open Unsplash from the plugin panel (search Unsplash).");
      },
    },
    {
      name: "set-random-wallpaper",
      title: "Unsplash: Set Random Wallpaper",
      mode: "no-view",
      async run(context) {
        try {
          const photo = await randomPhoto(context);
          const path = await setWallpaper(context, photo);
          context.showToast(`Random wallpaper set: ${photo.user}`);
          console.info("[unsplash] wallpaper", path, photo.id);
        } catch (e) {
          context.showToast(String(e?.message || e));
        }
      },
    },
  ],

  panel: {
    title: "Unsplash",
    // Host renderPanel times out if this awaits network I/O. Paint UI and load async.
    async render(container, context) {
      if (!context.http?.fetch) {
        container.innerHTML =
          '<div style="padding:16px;color:var(--qx-danger)">Host missing context.http</div>';
        return;
      }
      const state = createState(container, context);
      container.__usState = state;
      void state.load();
    },
    destroy(container) {
      const state = container.__usState;
      if (state) {
        state.dead = true;
        container.__usState = undefined;
      }
      container.innerHTML = "";
    },
  },
};
