/** BluePrint Xianji — PAT-authenticated stateless MCP + host Workbench. */

const MCP_VERSION = "2026-07-28";
const META_PROTOCOL = "io.modelcontextprotocol/protocolVersion";
const META_CLIENT = "io.modelcontextprotocol/clientInfo";
const META_CAPABILITIES = "io.modelcontextprotocol/clientCapabilities";
const BACKGROUNDS = ["default", "sand", "sage", "blue", "rose", "violet"];

let locale = "en";
let stopLocale = null;

function setLocale(context) {
  stopLocale?.();
  locale = context?.locale?.current || "en";
  stopLocale = context?.locale?.onChange?.(({ current }) => {
    locale = current || "en";
  }) || null;
}

function text(en, zh) {
  return locale === "zh-CN" ? zh : en;
}

function message(error) {
  return String(error?.message || error || text("Unknown error", "未知错误"));
}

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    return (char === "x" ? value : ((value & 3) | 8)).toString(16);
  });
}

function normalizeEndpoint(value) {
  const raw = String(value || "").trim();
  if (!raw) throw new Error(text("Configure the BluePrint MCP endpoint.", "请先配置 BluePrint MCP 地址。"));
  let url;
  try {
    url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    throw new Error(text("The BluePrint MCP endpoint is invalid.", "BluePrint MCP 地址无效。"));
  }
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  if (!url.pathname.endsWith("/mcp")) url.pathname = `${url.pathname}/mcp`.replace(/\/+/g, "/");
  return url.toString();
}

async function config(context) {
  const endpoint = normalizeEndpoint(await context.getPreference("endpoint"));
  const pat = String((await context.getPreference("pat")) || "").trim();
  if (!pat) throw new Error(text("Configure a BluePrint personal access token.", "请先配置 BluePrint 个人访问令牌。"));
  return { endpoint, pat };
}

function requestMeta() {
  return {
    [META_PROTOCOL]: MCP_VERSION,
    [META_CLIENT]: { name: "qx-blueprint", version: "1.0.0" },
    [META_CAPABILITIES]: {},
  };
}

async function mcpRequest(context, auth, method, params, name) {
  const body = {
    jsonrpc: "2.0",
    id: uuid(),
    method,
    params: { ...(params || {}), _meta: requestMeta() },
  };
  const headers = {
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${auth.pat}`,
    "Content-Type": "application/json",
    "MCP-Protocol-Version": MCP_VERSION,
    "Mcp-Method": method,
  };
  if (name) headers["Mcp-Name"] = name;
  const response = await context.http.fetch(auth.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    timeoutMs: 25_000,
  });
  if (!response?.ok) {
    if (response?.status === 401) throw new Error(text("BluePrint rejected the PAT.", "BluePrint 拒绝了此 PAT。"));
    if (response?.status === 403) throw new Error(text("BluePrint denied this request.", "BluePrint 拒绝了此次请求。"));
    throw new Error(`BluePrint MCP HTTP ${response?.status || "error"}`);
  }
  const payload = await response.json();
  if (payload?.error) throw new Error(String(payload.error.message || payload.error.code || "MCP error"));
  return payload?.result;
}

async function callTool(context, auth, name, argumentsValue = {}) {
  const result = await mcpRequest(context, auth, "tools/call", {
    name,
    arguments: argumentsValue,
  }, name);
  if (result?.isError) {
    const detail = (result.content || [])
      .filter((part) => part?.type === "text")
      .map((part) => part.text)
      .join("\n") || "BluePrint tool error";
    const error = new Error(detail);
    error.code = /conflict|version/i.test(detail) ? "conflict" : "tool_error";
    throw error;
  }
  return result?.structuredContent ?? null;
}

function formatDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

function tagNames(note) {
  return (note?.tags || []).map((tag) => String(tag?.name || tag || "").trim()).filter(Boolean);
}

function assetIds(items) {
  return (items || []).map((item) => String(item?.assetId || item || "").trim()).filter(Boolean);
}

function parseTags(value) {
  return [...new Set(String(value || "").split(/[,，\n]/).map((tag) => tag.trim()).filter(Boolean))];
}

function noteDraft(note) {
  return {
    id: note?.id || null,
    title: String(note?.title || ""),
    content: String(note?.content || ""),
    tags: tagNames(note).join(", "),
    background: BACKGROUNDS.includes(note?.background) ? note.background : "default",
    reminderAt: note?.reminderAt ? String(note.reminderAt) : "",
    pinned: Boolean(note?.pinned),
    archived: Boolean(note?.archivedAt),
    baseVersion: Number(note?.version) || 0,
    images: assetIds(note?.images),
    files: assetIds(note?.files),
  };
}

function deriveWorkbenchUrl(endpoint, noteId) {
  const url = new URL(endpoint);
  if ((url.hostname === "127.0.0.1" || url.hostname === "localhost") && url.port === "8787") {
    url.port = "3210";
  }
  url.pathname = "/";
  url.search = `?view=xianji&xianji=${encodeURIComponent(noteId)}`;
  url.hash = "";
  return url.toString();
}

function createPanel(context) {
  setLocale(context);
  const state = {
    tab: "active",
    query: "",
    notes: [],
    selectedId: null,
    editing: null,
    auth: null,
    identity: null,
    tools: new Set(),
    media: new Map(),
    mediaLoading: new Set(),
    loading: true,
    saving: false,
    error: null,
    conflict: false,
    revision: 0,
    generation: 0,
    view: null,
    dead: false,
  };

  const can = (tool) => state.tools.has(tool);
  const canWrite = () => can("blueprint_create_xianji_note") && can("blueprint_update_xianji_note");
  const selectedNote = () => state.notes.find((note) => String(note.id) === String(state.selectedId)) || null;

  const visibleNotes = () => {
    const needle = state.query.trim().toLowerCase();
    if (!needle) return state.notes;
    return state.notes.filter((note) => [note.title, note.content, ...tagNames(note)]
      .some((value) => String(value || "").toLowerCase().includes(needle)));
  };

  const form = (draft) => ({
    title: draft.id ? text("Edit Xianji note", "编辑随手记") : text("New Xianji note", "新建随手记"),
    description: state.conflict
      ? text("A newer server version exists. Your draft is retained; reload the latest version before editing again.", "服务器已有新版本。当前草稿已保留；请先加载最新版再继续编辑。")
      : text("Save uses the complete Xianji model with baseVersion conflict protection.", "保存使用随手记完整模型，并受 baseVersion 冲突保护。"),
    controls: [
      { id: "draft:title", label: text("Title", "标题"), value: draft.title, type: "text", disabled: state.saving || state.conflict },
      { id: "draft:content", label: text("Content", "正文"), value: draft.content, type: "textarea", rows: 14, disabled: state.saving || state.conflict },
      { id: "draft:tags", label: text("Tags", "标签"), value: draft.tags, type: "text", placeholder: text("comma separated", "使用逗号分隔"), disabled: state.saving || state.conflict },
      { id: "draft:background", label: text("Background", "背景"), value: draft.background, type: "select", disabled: state.saving || state.conflict, options: BACKGROUNDS.map((value) => ({ label: value, value })) },
      { id: "draft:reminderAt", label: text("Reminder", "提醒"), value: draft.reminderAt, type: "text", placeholder: "2026-09-01T09:00:00+08:00", disabled: state.saving || state.conflict },
      { id: "draft:pinned", label: text("Pinned", "置顶"), value: draft.pinned ? "yes" : "no", type: "select", disabled: state.saving || state.conflict, options: [{ label: text("Yes", "是"), value: "yes" }, { label: text("No", "否"), value: "no" }] },
      ...(draft.id ? [{ id: "draft:archived", label: text("Archived", "归档"), value: draft.archived ? "yes" : "no", type: "select", disabled: state.saving || state.conflict, options: [{ label: text("Yes", "是"), value: "yes" }, { label: text("No", "否"), value: "no" }] }] : []),
    ],
    actions: state.conflict ? [
      { id: "reload-latest", label: text("Load latest version", "加载最新版"), primary: true },
      { id: "cancel-edit", label: text("Keep draft and close", "保留草稿并关闭") },
    ] : [
      { id: "save-note", label: state.saving ? text("Saving…", "正在保存…") : text("Save note", "保存随手记"), primary: true, disabled: state.saving },
      { id: "cancel-edit", label: text("Cancel", "取消"), disabled: state.saving },
    ],
  });

  const mediaFor = (note) => state.media.get(String(note?.id)) || [];

  const detailFor = (note) => {
    if (!note) return undefined;
    if (state.editing && (state.editing.id === note.id || (!state.editing.id && note.id === "draft:new"))) {
      return {
        title: state.editing.title || text("Untitled note", "无标题随手记"),
        subtitle: state.editing.id ? `v${state.editing.baseVersion}` : text("Not saved", "尚未保存"),
        form: form(state.editing),
        fields: [
          { label: text("Images preserved", "保留图片"), value: state.editing.images.length },
          { label: text("Files preserved", "保留文件"), value: state.editing.files.length },
        ],
      };
    }
    return {
      title: String(note.title || text("Untitled note", "无标题随手记")),
      subtitle: `${formatDate(note.updatedAt)} · v${Number(note.version) || 0}`,
      body: String(note.content || "") || text("No content", "暂无正文"),
      images: mediaFor(note),
      imageLayout: "horizontal",
      mediaPlacement: "after-body",
      fields: [
        { label: text("Tags", "标签"), value: tagNames(note).join(" · ") || "—" },
        { label: text("Pinned", "置顶"), value: Boolean(note.pinned) },
        { label: text("Archived", "归档"), value: Boolean(note.archivedAt) },
        { label: text("Reminder", "提醒"), value: note.reminderAt ? formatDate(note.reminderAt) : "—" },
        { label: text("Background", "背景"), value: note.background || "default" },
        { label: text("Files", "文件"), value: (note.files || []).map((file) => file.name).filter(Boolean).join(" · ") || "—" },
      ],
    };
  };

  const itemFor = (note) => {
    const draft = note.id === "draft:new";
    const tags = draft ? parseTags(state.editing?.tags) : tagNames(note);
    const actions = draft ? [] : [
      ...(canWrite() ? [{ id: `edit:${note.id}`, label: text("Edit", "编辑"), menuKey: "E" }] : []),
      ...(can("blueprint_set_xianji_pinned") ? [{ id: `pin:${note.id}`, label: note.pinned ? text("Unpin", "取消置顶") : text("Pin", "置顶"), menuKey: "P" }] : []),
      ...(can("blueprint_set_xianji_archived") ? [{ id: `archive:${note.id}`, label: note.archivedAt ? text("Restore from archive", "取消归档") : text("Archive", "归档"), menuKey: "A" }] : []),
      { id: `open:${note.id}`, label: text("Open in BluePrint", "在 BluePrint 中打开"), menuKey: "O", kbd: "CmdOrCtrl+O" },
    ];
    return {
      id: String(note.id),
      title: String(note.title || text("Untitled note", "无标题随手记")),
      subtitle: draft ? text("New draft", "新草稿") : String(note.content || "").replace(/\s+/g, " ").slice(0, 140),
      meta: draft ? "" : formatDate(note.updatedAt),
      badge: tags.slice(0, 2).join(" · ") || (note.pinned ? text("Pinned", "置顶") : ""),
      tone: note.pinned ? "accent" : "neutral",
      detail: detailFor(note),
      actions,
      raw: note,
    };
  };

  const paint = () => {
    if (state.dead) return;
    const notes = visibleNotes();
    const display = state.editing && !state.editing.id
      ? [{ id: "draft:new", title: state.editing.title, content: state.editing.content }, ...notes]
      : notes;
    const snapshot = {
      revision: ++state.revision,
      title: "BluePrint",
      query: state.query,
      queryPlaceholder: text("Search Xianji notes", "搜索随手记"),
      tabs: [
        { id: "active", label: text("Notes", "随手记"), active: state.tab === "active" },
        { id: "archived", label: text("Archived", "已归档"), active: state.tab === "archived" },
      ],
      loading: state.loading && !display.length,
      error: state.error,
      meta: state.identity
        ? `${state.identity.workspaceName || "BluePrint"} · ${canWrite() ? text("Read & write", "可读写") : text("Read only", "只读")}`
        : text("PAT-authenticated MCP", "PAT 鉴权 MCP"),
      selectedId: state.selectedId,
      items: display.map(itemFor),
      emptyText: state.loading ? text("Connecting to BluePrint…", "正在连接 BluePrint…") : text("No Xianji notes", "暂无随手记"),
      actions: [
        ...(canWrite() ? [{ id: "new-note", label: text("New note", "新建随手记"), menuKey: "N", primary: true, disabled: state.saving }] : []),
        { id: "refresh", label: text("Refresh", "刷新"), menuKey: "R", kbd: "CmdOrCtrl+R", primary: !canWrite(), disabled: state.loading || state.saving },
      ],
      cache: { mode: "disabled" },
      island: state.loading || state.saving ? {
        primary: "BluePrint",
        secondary: state.saving ? text("Saving note…", "正在保存随手记…") : text("Loading Xianji…", "正在加载随手记…"),
        activity: "spinner",
        tone: "neutral",
      } : null,
    };
    if (state.view) state.view.update(snapshot);
    else state.view = context.ui.mountWorkbench(snapshot, {
      onQuery(value) { state.query = String(value || ""); paint(); },
      onTab(id) { void switchTab(id); },
      onSelect(id) { state.selectedId = id; paint(); void loadImages(selectedNote()); },
      onInput(id, value) { updateDraft(id, value); },
      onAction(id, item) { void runAction(id, item?.id || state.selectedId); },
    });
  };

  async function loadImages(note) {
    if (!note?.id || !state.auth || state.media.has(String(note.id)) || state.mediaLoading.has(String(note.id))) return;
    const images = (note.images || []).filter((image) => image?.url).slice(0, 12);
    if (!images.length) return;
    const key = String(note.id);
    const generation = state.generation;
    state.mediaLoading.add(key);
    try {
      const loaded = [];
      for (const image of images) {
        if (state.dead || generation !== state.generation) return;
        try {
          const url = new URL(image.url, state.auth.endpoint).toString();
          const response = await context.http.fetch(url, {
            method: "GET",
            headers: { Authorization: `Bearer ${state.auth.pat}`, Accept: "image/*" },
            timeoutMs: 20_000,
            maxBytes: 16 * 1024 * 1024,
          });
          if (!response?.ok || !response.bodyBase64) continue;
          const mime = response.headers?.["content-type"] || response.headers?.["Content-Type"] || image.mimeType || "image/jpeg";
          loaded.push({
            url: `data:${String(mime).split(";")[0]};base64,${response.bodyBase64}`,
            alt: image.name || "BluePrint image",
            aspectRatio: "auto",
            fit: "contain",
            zoomable: true,
          });
        } catch {
          // One unavailable attachment must not fail the note.
        }
      }
      if (!state.dead && generation === state.generation) state.media.set(key, loaded);
    } finally {
      state.mediaLoading.delete(key);
      paint();
    }
  }

  async function discover(auth) {
    const [identity, capabilities] = await Promise.all([
      callTool(context, auth, "blueprint_whoami", {}),
      callTool(context, auth, "blueprint_list_capabilities", {}),
    ]);
    const tools = new Set((capabilities?.capabilities || []).flatMap((entry) => entry?.tools || []));
    return { identity, tools };
  }

  async function refresh({ keepSelection = true } = {}) {
    const generation = ++state.generation;
    state.loading = true;
    state.error = null;
    paint();
    try {
      const auth = await config(context);
      const discovered = await discover(auth);
      const output = await callTool(context, auth, "blueprint_list_xianji_notes", {
        archived: state.tab === "archived",
      });
      if (state.dead || generation !== state.generation) return;
      state.auth = auth;
      state.identity = discovered.identity;
      state.tools = discovered.tools;
      state.notes = Array.isArray(output?.items) ? output.items : [];
      if (!keepSelection || !state.notes.some((note) => String(note.id) === String(state.selectedId))) {
        state.selectedId = state.notes[0]?.id || null;
      }
      void loadImages(selectedNote());
    } catch (error) {
      if (!state.dead && generation === state.generation) state.error = message(error);
    } finally {
      if (!state.dead && generation === state.generation) {
        state.loading = false;
        paint();
      }
    }
  }

  async function switchTab(id) {
    if (state.saving) return;
    state.tab = id === "archived" ? "archived" : "active";
    state.query = "";
    state.editing = null;
    state.conflict = false;
    state.selectedId = null;
    await refresh({ keepSelection: false });
  }

  function updateDraft(id, value) {
    if (!state.editing || state.saving || state.conflict || !id.startsWith("draft:")) return;
    const key = id.slice("draft:".length);
    if (key === "pinned" || key === "archived") state.editing[key] = value === "yes";
    else state.editing[key] = String(value || "");
    paint();
  }

  async function fetchNote(id) {
    return callTool(context, state.auth, "blueprint_get_xianji_note", { itemId: id });
  }

  async function saveNote() {
    if (!state.editing || !state.auth || state.saving || state.conflict) return;
    const draft = state.editing;
    if (!draft.title.trim() && !draft.content.trim() && !draft.images.length && !draft.files.length) {
      state.error = text("A note needs a title, content, image, or file.", "随手记至少需要标题、正文、图片或文件。 ");
      paint();
      return;
    }
    if (new TextEncoder().encode(draft.content).byteLength > 65_536) {
      state.error = text("Content exceeds the 64 KiB BluePrint limit.", "正文超过 BluePrint 的 64 KiB 限制。 ");
      paint();
      return;
    }
    state.saving = true;
    state.error = null;
    paint();
    const operationId = uuid();
    try {
      const common = {
        title: draft.title.trim(),
        content: draft.content,
        pinned: draft.pinned,
        background: draft.background,
        reminderAt: draft.reminderAt.trim(),
        tags: parseTags(draft.tags),
        images: draft.images,
        files: draft.files,
        operationId,
      };
      const note = draft.id
        ? await callTool(context, state.auth, "blueprint_update_xianji_note", {
            noteId: draft.id,
            ...common,
            archived: draft.archived,
            baseVersion: draft.baseVersion,
          })
        : await callTool(context, state.auth, "blueprint_create_xianji_note", common);
      state.editing = null;
      state.conflict = false;
      state.tab = note?.archivedAt ? "archived" : "active";
      state.selectedId = note?.id || draft.id;
      context.showToast(text("BluePrint note saved", "BluePrint 随手记已保存"));
      await refresh();
    } catch (error) {
      const detail = message(error);
      if (error?.code === "conflict" || /conflict|version/i.test(detail)) {
        state.conflict = true;
        state.error = text("Version conflict: your draft was retained.", "版本冲突：你的草稿已保留。 ");
      } else {
        state.error = detail;
      }
    } finally {
      state.saving = false;
      paint();
    }
  }

  async function mutate(tool, note, value) {
    if (!state.auth || state.saving) return;
    state.saving = true;
    state.error = null;
    paint();
    try {
      await callTool(context, state.auth, tool, {
        noteId: note.id,
        value,
        baseVersion: Number(note.version) || 0,
        operationId: uuid(),
      });
      await refresh();
    } catch (error) {
      state.error = message(error);
    } finally {
      state.saving = false;
      paint();
    }
  }

  async function runAction(id, selectedId) {
    if (id === "refresh") return refresh();
    if (id === "new-note") {
      state.editing = noteDraft(null);
      state.conflict = false;
      state.selectedId = "draft:new";
      state.error = null;
      return paint();
    }
    if (id === "save-note") return saveNote();
    if (id === "cancel-edit") {
      state.editing = null;
      state.conflict = false;
      state.selectedId = state.notes[0]?.id || null;
      state.error = null;
      return paint();
    }
    if (id === "reload-latest" && state.editing?.id) {
      try {
        const note = await fetchNote(state.editing.id);
        state.notes = state.notes.map((item) => item.id === note.id ? note : item);
        state.editing = noteDraft(note);
        state.conflict = false;
        state.error = null;
      } catch (error) {
        state.error = message(error);
      }
      return paint();
    }
    const [kind, rawId] = String(id).split(":", 2);
    const noteId = rawId || selectedId;
    const note = state.notes.find((item) => String(item.id) === String(noteId));
    if (!note) return;
    if (kind === "edit") {
      try {
        const latest = await fetchNote(note.id);
        state.notes = state.notes.map((item) => item.id === latest.id ? latest : item);
        state.editing = noteDraft(latest);
        state.selectedId = latest.id;
        state.conflict = false;
        state.error = null;
      } catch (error) {
        state.error = message(error);
      }
      return paint();
    }
    if (kind === "pin") return mutate("blueprint_set_xianji_pinned", note, !note.pinned);
    if (kind === "archive") return mutate("blueprint_set_xianji_archived", note, !note.archivedAt);
    if (kind === "open" && state.auth) return context.openUrl(deriveWorkbenchUrl(state.auth.endpoint, note.id));
  }

  paint();
  void refresh({ keepSelection: false });
  return {
    destroy() {
      state.dead = true;
      state.generation += 1;
      state.media.clear();
      state.view = null;
      stopLocale?.();
    },
  };
}

export default {
  panel: {
    title: "BluePrint",
    render(_container, context) {
      return createPanel(context);
    },
  },
};
