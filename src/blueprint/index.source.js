/** BluePrint Xianji — PAT-authenticated stateless MCP + host Workbench source. */

import { MAX_MEDIA_CACHE_BYTES, MAX_MEDIA_ITEM_BYTES, assetUrl, createTransport } from "./source/transport.js";
import { assetIds, tagNames, parseTags, noteDraft, deriveWorkbenchUrl, buildNoteForm, formatDate as formatNoteDate, backgroundLabel as labelBackground } from "./source/projection.js";
const formatDate = (value) => formatNoteDate(value, locale);
const backgroundLabel = (value) => labelBackground(value, text);

// A host may destroy a panel without using the value returned by render().
// Keep the explicit lifecycle at the manifest boundary as the source of truth.
const panelLifecycles = new WeakMap();

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

function message(error, secret = "") {
  const value = String(error?.message || error || text("Unknown error", "未知错误"));
  return secret ? value.split(secret).join("[redacted]") : value;
}

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    return (char === "x" ? value : ((value & 3) | 8)).toString(16);
  });
}

function transport(context) { return createTransport(context, { text, message, uuid }); }
const config = (context) => transport(context).config();
const browsingPreferences = (context) => transport(context).browsingPreferences();
const callTool = (context, auth, name, args) => transport(context).callTool(auth, name, args);
const discoverConnection = (context, auth) => transport(context).discoverConnection(auth);
const checkConnection = (context) => transport(context).checkConnection();



function createPanel(context) {
  setLocale(context);
  const state = {
    tab: "active",
    query: "",
    layout: "cards",
    density: "comfortable",
    showImages: true,
    notes: [],
    selectedId: null,
    editing: null,
    advanced: false,
    auth: null,
    identity: null,
    tools: new Set(),
    media: new Map(),
    mediaBytes: 0,
    mediaClock: 0,
    mediaLoading: new Set(),
    draftCache: new Map(),
    editSessions: new Map(),
    requestGeneration: 0,
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
  const canCreate = () => can("blueprint_create_xianji_note");
  const canUpdate = () => can("blueprint_update_xianji_note");
  const canWrite = () => can("blueprint_create_xianji_note") && can("blueprint_update_xianji_note");
  const selectedNote = () => state.notes.find((note) => String(note.id) === String(state.selectedId)) || null;

  const visibleNotes = () => {
    const needle = state.query.trim().toLowerCase();
    if (!needle) return state.notes;
    return state.notes.filter((note) => [note.title, note.content, ...tagNames(note)]
      .some((value) => String(value || "").toLowerCase().includes(needle)));
  };

  const form = (draft) => buildNoteForm({ draft, conflict: state.conflict, saving: state.saving, advancedOpen: state.advanced, text });

  const cloneDraft = (draft) => draft ? { ...draft, images: [...(draft.images || [])], files: [...(draft.files || [])] } : null;
  const draftKey = (draft) => draft?.id || "draft:new";
  const mediaFor = (note) => {
    const entry = state.media.get(String(note?.id));
    if (!entry) return [];
    entry.usedAt = ++state.mediaClock;
    return entry.items;
  };

  const detailFor = (note) => {
    if (!note) return undefined;
    if (state.editing && (state.editing.id === note.id || (!state.editing.id && note.id === "draft:new"))) {
      return {
        title: state.editing.title || text("Untitled note", "无标题随手记"),
        subtitle: state.editing.id ? undefined : text("Not saved", "尚未保存"),
        form: form(state.editing),
        fields: [
          { label: text("Images preserved", "保留图片"), value: state.editing.images.length },
          { label: text("Files preserved", "保留文件"), value: state.editing.files.length },
        ],
      };
    }
    return {
      // Keep an empty upstream title empty so the host Cards surface can omit
      // a fabricated heading; the detail view supplies its own fallback copy.
      title: String(note.title || ""),
      subtitle: formatDate(note.updatedAt),
      body: String(note.content || "") || text("No content", "暂无正文"),
      images: mediaFor(note),
      imageLayout: "horizontal",
      mediaPlacement: "after-body",
      fields: [
        { label: text("Tags", "标签"), value: tagNames(note).join(" · ") || "—" },
        { label: text("Pinned", "置顶"), value: Boolean(note.pinned) },
        { label: text("Archived", "归档"), value: Boolean(note.archivedAt) },
        { label: text("Reminder", "提醒"), value: note.reminderAt ? formatDate(note.reminderAt) : "—" },
        { label: text("Background", "背景"), value: backgroundLabel(note.background || "default") },
        { label: text("Files", "文件"), value: (note.files || []).map((file) => file.name).filter(Boolean).join(" · ") || "—" },
      ],
    };
  };

  const itemFor = (note) => {
    const draft = note.id === "draft:new";
    const tags = draft ? parseTags(state.editing?.tags) : tagNames(note);
    const media = draft ? [] : mediaFor(note);
    const body = draft ? String(state.editing?.content || "") : String(note.content || "");
    const actions = draft ? [] : [
      ...(canUpdate() ? [{ id: `edit:${note.id}`, label: text("Edit", "编辑"), menuKey: "E" }] : []),
      ...(can("blueprint_set_xianji_pinned") ? [{ id: `pin:${note.id}`, label: note.pinned ? text("Unpin", "取消置顶") : text("Pin", "置顶"), menuKey: "P" }] : []),
      ...(can("blueprint_set_xianji_archived") ? [{ id: `archive:${note.id}`, label: note.archivedAt ? text("Restore from archive", "取消归档") : text("Archive", "归档"), menuKey: "A" }] : []),
      { id: `open:${note.id}`, label: text("Open in BluePrint", "在 BluePrint 中打开"), menuKey: "O", kbd: "CmdOrCtrl+O" },
    ];
    return {
      id: String(note.id),
      title: String(note.title || ""),
      subtitle: draft ? text("New draft", "新草稿") : String(note.content || "").replace(/\s+/g, " ").slice(0, 140),
      meta: draft ? "" : formatDate(note.updatedAt),
      badge: tags.slice(0, 2).join(" · ") || (note.pinned ? text("Pinned", "置顶") : ""),
      tone: note.pinned ? "accent" : "neutral",
      image: state.showImages ? media[0] : undefined,
      images: state.showImages ? media : [],
      card: {
        body,
        tags,
        timestamp: draft ? undefined : formatDate(note.updatedAt),
        pinned: Boolean(note.pinned),
      },
      editor: canUpdate() && !draft ? {
        placeholder: text("Edit the note content…", "编辑随手记正文…"),
        rows: 10,
        maxBytes: 65_536,
        disabled: state.saving,
      } : undefined,
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
      layout: {
        kind: state.layout,
        columns: 3,
        density: state.density,
        showImages: state.showImages,
      },
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
        ...(canCreate() ? [{ id: "new-note", label: text("New note", "新建随手记"), menuKey: "N", primary: true, disabled: state.saving }] : []),
        { id: "refresh", label: text("Refresh", "刷新"), menuKey: "R", kbd: "CmdOrCtrl+R", primary: !canWrite(), disabled: state.loading || state.saving || state.editSessions.size > 0 },
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
      onSelect(id) {
        if (state.editSessions.size) invalidateEditSessions();
        state.selectedId = id;
        paint();
        void loadImages(selectedNote());
      },
      onInput(id, value) { updateDraft(id, value); },
      onEdit(event) { return handleEdit(event); },
      onAction(id, item) { void runAction(id, item?.id || state.selectedId); },
    });
  };

  function invalidateEditSessions() {
    if (!state.editSessions.size) return;
    for (const session of state.editSessions.values()) session.invalidated = true;
    state.requestGeneration += 1;
  }

  async function loadImages(note) {
    if (!note?.id || !state.auth || state.media.has(String(note.id)) || state.mediaLoading.has(String(note.id))) return;
    const images = (note.images || []).filter((image) => image?.url).slice(0, 12);
    if (!images.length) return;
    const key = String(note.id);
    const generation = state.generation;
    state.mediaLoading.add(key);
    try {
      const loaded = [];
      let loadedBytes = 0;
      for (const image of images) {
        if (state.dead || generation !== state.generation) return;
        try {
          const url = assetUrl(state.auth.endpoint, image.url);
          if (!url) continue;
          const response = await context.http.fetch(url, {
            method: "GET",
            headers: { Authorization: `Bearer ${state.auth.pat}`, Accept: "image/*" },
            timeoutMs: 20_000,
            maxBytes: MAX_MEDIA_ITEM_BYTES,
          });
          if (!response?.ok || !response.bodyBase64) continue;
          const encoded = String(response.bodyBase64);
          const byteSize = Math.ceil((encoded.length * 3) / 4);
          if (byteSize > MAX_MEDIA_ITEM_BYTES || loadedBytes + byteSize > MAX_MEDIA_CACHE_BYTES) continue;
          const mime = response.headers?.["content-type"] || response.headers?.["Content-Type"] || image.mimeType || "image/jpeg";
          loaded.push({
            url: `data:${String(mime).split(";")[0]};base64,${encoded}`,
            alt: image.name || "BluePrint image",
            aspectRatio: "auto",
            fit: "contain",
            zoomable: true,
          });
          loadedBytes += byteSize;
        } catch {
          // One unavailable attachment must not fail the note.
        }
      }
      if (!state.dead && generation === state.generation) {
        while (state.mediaBytes + loadedBytes > MAX_MEDIA_CACHE_BYTES && state.media.size) {
          const oldest = [...state.media.entries()].sort(([, left], [, right]) => left.usedAt - right.usedAt)[0];
          if (!oldest) break;
          state.media.delete(oldest[0]);
          state.mediaBytes -= oldest[1].bytes;
        }
        state.media.set(key, { items: loaded, bytes: loadedBytes, usedAt: ++state.mediaClock });
        state.mediaBytes += loadedBytes;
      }
    } finally {
      state.mediaLoading.delete(key);
      paint();
    }
  }

  async function refresh({ keepSelection = true } = {}) {
    const generation = ++state.generation;
    const requestGeneration = ++state.requestGeneration;
    state.loading = true;
    state.error = null;
    // Do not retain write affordances while a new PAT/capability discovery is
    // in flight or failed. Existing notes remain readable until the result is
    // replaced, but edits require a current live capability set.
    state.tools.clear();
    state.identity = null;
    paint();
    try {
      const auth = await config(context);
      state.auth = auth;
      const discovered = await discoverConnection(context, auth);
      const output = await callTool(context, auth, "blueprint_list_xianji_notes", {
        archived: state.tab === "archived",
      });
      if (state.dead || generation !== state.generation || requestGeneration !== state.requestGeneration) return;
      state.identity = discovered.identity;
      state.tools = discovered.tools;
      state.notes = Array.isArray(output?.items) ? output.items : [];
      if (!keepSelection || !state.notes.some((note) => String(note.id) === String(state.selectedId))) {
        state.selectedId = state.notes[0]?.id || null;
      }
      void loadImages(selectedNote());
    } catch (error) {
      if (!state.dead && generation === state.generation && requestGeneration === state.requestGeneration) {
        state.error = message(error, state.auth?.pat);
      }
    } finally {
      if (!state.dead && generation === state.generation && requestGeneration === state.requestGeneration) {
        state.loading = false;
        paint();
      }
    }
  }

  async function loadBrowsingPreferences() {
    try {
      const preferences = await browsingPreferences(context);
      if (state.dead) return;
      state.layout = preferences.layout;
      state.density = preferences.density;
      state.showImages = preferences.showImages;
      paint();
    } catch {
      // Missing or unreadable optional browsing preferences use safe defaults.
    }
  }

  async function switchTab(id) {
    if (state.saving) return;
    invalidateEditSessions();
    if (state.editing) {
      state.draftCache.set(draftKey(state.editing), {
        draft: cloneDraft(state.editing),
        conflict: state.conflict,
      });
    }
    state.requestGeneration += 1;
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

  function editResult(_event, status, extra = {}) {
    // The SDK adds phase/item/session/request identity to the wire response.
    // Keep the plugin result domain-only so a future host can tighten its
    // transport envelope without requiring every plugin to echo identity.
    return { status, ...extra };
  }

  async function handleEdit(event) {
    const itemId = String(event?.itemId || "");
    const sessionId = String(event?.sessionId || "");
    if (!itemId || !sessionId) {
      return editResult(event || { phase: "start" }, "error", { message: text("The edit session is invalid.", "编辑会话无效。") });
    }
    if (event.phase === "start") {
      if (!canUpdate()) {
        return editResult(event, "error", { message: text("This PAT is read-only.", "此 PAT 只有读取权限。") });
      }
      const existing = state.editSessions.get(sessionId);
      if (existing?.note && !existing.invalidated) {
        return editResult(event, "ready", {
          value: existing.value,
          revision: String(existing.note.version || "0"),
        });
      }
      const requestGeneration = ++state.requestGeneration;
      const session = { itemId, note: null, value: "", requestGeneration };
      state.editSessions.set(sessionId, session);
      try {
        const note = await fetchNote(itemId);
        if (state.dead || requestGeneration !== state.requestGeneration || state.editSessions.get(sessionId) !== session) {
          if (state.editSessions.get(sessionId) === session) state.editSessions.delete(sessionId);
          return editResult(event, "error", { message: text("The edit session expired.", "编辑会话已失效。") });
        }
        const value = String(note?.content || "");
        if (new TextEncoder().encode(value).byteLength > 65_536) {
          state.editSessions.delete(sessionId);
          return editResult(event, "error", { message: text("This note is larger than the 64 KiB editor limit.", "此随手记超过 64 KiB 编辑上限。") });
        }
        session.note = note;
        session.value = value;
        state.notes = state.notes.map((item) => item.id === note.id ? note : item);
        state.selectedId = note.id;
        paint();
        return editResult(event, "ready", { value, revision: String(note.version || "0") });
      } catch (error) {
        if (state.editSessions.get(sessionId) === session) state.editSessions.delete(sessionId);
        return editResult(event, "error", { message: message(error, state.auth?.pat) });
      }
    }

    const session = state.editSessions.get(sessionId);
    if (session?.invalidated) {
      if (event.phase === "cancel") {
        state.editSessions.delete(sessionId);
        return editResult(event, "cancelled");
      }
      return editResult(event, "error", { message: text("The edit session expired.", "编辑会话已失效。") });
    }
    if (!session || session.itemId !== itemId || !session.note) {
      return editResult(event, "error", { message: text("The edit session is no longer available.", "编辑会话已不可用。") });
    }
    if (event.phase === "input") {
      const value = String(event.value || "");
      if (new TextEncoder().encode(value).byteLength > 65_536) {
        return editResult(event, "error", { message: text("Content exceeds the 64 KiB BluePrint limit.", "正文超过 BluePrint 的 64 KiB 限制。") });
      }
      session.value = value;
      return editResult(event, "accepted");
    }
    if (event.phase === "cancel") {
      if (state.saving) return editResult(event, "error", { message: text("A save is still in progress.", "保存仍在进行中。") });
      state.editSessions.delete(sessionId);
      return editResult(event, "cancelled");
    }
    if (event.phase !== "save") {
      return editResult(event, "error", { message: text("Unsupported edit phase.", "不支持的编辑阶段。") });
    }

    const value = String(event.value ?? session.value);
    if (new TextEncoder().encode(value).byteLength > 65_536) {
      return editResult(event, "error", { message: text("Content exceeds the 64 KiB BluePrint limit.", "正文超过 BluePrint 的 64 KiB 限制。") });
    }
    if (state.saving) return editResult(event, "error", { message: text("A save is already in progress.", "已有保存正在进行中。") });
    session.value = value;
    state.saving = true;
    state.error = null;
    paint();
    const requestGeneration = ++state.requestGeneration;
    const note = session.note;
    const auth = state.auth;
    const operationId = uuid();
    try {
      const updated = await callTool(context, auth, "blueprint_update_xianji_note", {
        noteId: note.id,
        title: String(note.title || ""),
        content: value,
        pinned: Boolean(note.pinned),
        background: note.background || "default",
        reminderAt: note.reminderAt ? String(note.reminderAt) : "",
        archived: Boolean(note.archivedAt),
        tags: tagNames(note),
        images: assetIds(note.images),
        files: assetIds(note.files),
        baseVersion: Number(note.version) || 0,
        operationId,
      });
      if (state.dead || requestGeneration !== state.requestGeneration || state.editSessions.get(sessionId) !== session) {
        return editResult(event, "error", { message: text("The edit session expired.", "编辑会话已失效。") });
      }
      state.notes = state.notes.map((item) => item.id === updated.id ? updated : item);
      state.editSessions.delete(sessionId);
      state.error = null;
      context.showToast(text("BluePrint note saved", "BluePrint 随手记已保存"));
      paint();
      void refresh();
      return editResult(event, "saved", { value: String(updated.content || value), revision: String(updated.version || "0") });
    } catch (error) {
      if (state.dead || requestGeneration !== state.requestGeneration || state.editSessions.get(sessionId) !== session) {
        return editResult(event, "error", { message: text("The edit session expired.", "编辑会话已失效。") });
      }
      const detail = message(error, auth?.pat);
      const conflict = error?.code === "conflict" || /conflict|version/i.test(detail);
      state.error = conflict
        ? text("Version conflict: reload the latest note before saving again.", "版本冲突：请加载最新版随手记后再保存。")
        : detail;
      return editResult(event, conflict ? "conflict" : "error", { message: state.error });
    } finally {
      if (!state.dead) {
        state.saving = false;
        paint();
      }
    }
  }

  async function saveNote() {
    if (!state.editing || !state.auth || state.saving || state.conflict) return;
    const draft = cloneDraft(state.editing);
    const requestGeneration = ++state.requestGeneration;
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
      if (state.dead || requestGeneration !== state.requestGeneration) return;
      state.draftCache.delete(draftKey(draft));
      state.editing = null;
      state.conflict = false;
      state.tab = note?.archivedAt ? "archived" : "active";
      state.selectedId = note?.id || draft.id;
      context.showToast(text("BluePrint note saved", "BluePrint 随手记已保存"));
      await refresh();
    } catch (error) {
      const detail = message(error, state.auth?.pat);
      if (state.dead || requestGeneration !== state.requestGeneration) return;
      if (error?.code === "conflict" || /conflict|version/i.test(detail)) {
        state.conflict = true;
        state.draftCache.set(draftKey(draft), { draft: cloneDraft(draft), conflict: true });
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
    const requestGeneration = ++state.requestGeneration;
    const auth = state.auth;
    state.saving = true;
    state.error = null;
    paint();
    try {
      await callTool(context, auth, tool, {
        noteId: note.id,
        value,
        baseVersion: Number(note.version) || 0,
        operationId: uuid(),
      });
      if (state.dead || requestGeneration !== state.requestGeneration) return;
      await refresh();
    } catch (error) {
      if (state.dead || requestGeneration !== state.requestGeneration) return;
      const detail = message(error, auth.pat);
      state.error = error?.code === "conflict" || /conflict|version/i.test(detail)
        ? text("The note changed on BluePrint. Refresh before trying again.", "BluePrint 上的随手记已发生变化，请刷新后重试。")
        : detail;
    } finally {
      state.saving = false;
      paint();
    }
  }

  async function runAction(id, selectedId) {
    if (id === "advanced-options" && state.editing && !state.saving) { state.advanced = !state.advanced; return paint(); }
    if (id === "refresh") return refresh();
    if (id === "new-note") {
      state.advanced = false;
      state.editing = cloneDraft(state.draftCache.get("draft:new")?.draft) || noteDraft(null);
      state.draftCache.delete("draft:new");
      state.conflict = false;
      state.selectedId = "draft:new";
      state.error = null;
      return paint();
    }
    if (id === "save-note") return saveNote();
    if (id === "cancel-edit") {
      if (state.conflict && state.editing?.id) {
        state.draftCache.set(draftKey(state.editing), {
          draft: cloneDraft(state.editing),
          conflict: true,
        });
      } else if (state.editing) {
        state.draftCache.delete(draftKey(state.editing));
      }
      state.requestGeneration += 1;
      state.editing = null;
      state.conflict = false;
      state.selectedId = state.notes[0]?.id || null;
      state.error = null;
      return paint();
    }
    if (id === "reload-latest" && state.editing?.id) {
      const requestGeneration = ++state.requestGeneration;
      try {
        const note = await fetchNote(state.editing.id);
        if (state.dead || requestGeneration !== state.requestGeneration) return;
        state.notes = state.notes.map((item) => item.id === note.id ? note : item);
        state.draftCache.delete(draftKey(noteDraft(note)));
        state.editing = noteDraft(note);
        state.conflict = false;
        state.error = null;
      } catch (error) {
        if (state.dead || requestGeneration !== state.requestGeneration) return;
        state.error = message(error, state.auth?.pat);
      }
      return paint();
    }
    const [kind, rawId] = String(id).split(":", 2);
    const noteId = rawId || selectedId;
    const note = state.notes.find((item) => String(item.id) === String(noteId));
    if (!note) return;
    if (kind === "edit") {
      state.advanced = false;
      const cached = state.draftCache.get(String(note.id));
      if (cached?.draft) {
        state.editing = cloneDraft(cached.draft);
        state.selectedId = note.id;
        state.conflict = Boolean(cached.conflict);
        state.error = state.conflict
          ? text("Your saved draft needs the latest server version before it can be saved.", "保存的草稿需要先加载服务器最新版才能保存。")
          : null;
        return paint();
      }
      const requestGeneration = ++state.requestGeneration;
      try {
        const latest = await fetchNote(note.id);
        if (state.dead || requestGeneration !== state.requestGeneration) return;
        state.notes = state.notes.map((item) => item.id === latest.id ? latest : item);
        state.editing = noteDraft(latest);
        state.selectedId = latest.id;
        state.conflict = false;
        state.error = null;
      } catch (error) {
        if (state.dead || requestGeneration !== state.requestGeneration) return;
        state.error = message(error, state.auth?.pat);
      }
      return paint();
    }
    if (kind === "pin") return mutate("blueprint_set_xianji_pinned", note, !note.pinned);
    if (kind === "archive") return mutate("blueprint_set_xianji_archived", note, !note.archivedAt);
    if (kind === "open" && state.auth) return context.openUrl(deriveWorkbenchUrl(state.auth.endpoint, note.id));
  }

  paint();
  void loadBrowsingPreferences();
  void refresh({ keepSelection: false });
  return {
    destroy() {
      state.dead = true;
      state.generation += 1;
      state.requestGeneration += 1;
      state.media.clear();
      state.mediaBytes = 0;
      state.mediaLoading.clear();
      state.draftCache.clear();
      state.editSessions.clear();
      state.notes = [];
      state.auth = null;
      state.identity = null;
      state.tools.clear();
      state.view = null;
      stopLocale?.();
      stopLocale = null;
    },
  };
}

export default {
  commands: [
    {
      name: "check-blueprint-connection",
      title: "Check BluePrint Connection",
      async run(context) {
        return checkConnection(context);
      },
    },
  ],
  panel: {
    title: "BluePrint",
    render(container, context) {
      panelLifecycles.get(container)?.destroy();
      const lifecycle = createPanel(context);
      panelLifecycles.set(container, lifecycle);
      return lifecycle;
    },
    destroy(container) {
      panelLifecycles.get(container)?.destroy();
      panelLifecycles.delete(container);
    },
  },
};
