import assert from "node:assert/strict";
import plugin from "../src/blueprint/index.js";

const PAT = "blueprint_pat_smoke_secret";
const requests = [];
const imageRequests = [];
const toasts = [];
let handlers;
let snapshot;
let nextVersion = 3;
let forceConflict = false;
let forceAuthError = false;
let delayNextGet = false;
let releaseDelayedGet = null;
let layoutPreference = "cards";
let densityPreference = "comfortable";
let showImagesPreference = true;
let notes = [{
  id: "note-1",
  title: "First note",
  content: "Existing content",
  pinned: false,
  background: "sage",
  reminderAt: null,
  archivedAt: null,
  version: 2,
  tags: [{ id: "tag-1", name: "work" }],
  images: [
    { assetId: "image-1", url: "/api/v1/assets/image-1/content", name: "image.png", mimeType: "image/png" },
    { assetId: "image-external", url: "https://evil.example/asset.png", name: "forged.png", mimeType: "image/png" },
  ],
  files: [{ assetId: "file-1", url: "/api/v1/assets/file-1/content", name: "brief.pdf", mimeType: "application/pdf" }],
  createdAt: "2026-08-31T08:00:00Z",
  updatedAt: "2026-08-31T09:00:00Z",
}];

function toolResult(value) {
  return { ok: true, status: 200, async json() { return { jsonrpc: "2.0", id: "smoke", result: { structuredContent: value } }; } };
}

function toolError(detail) {
  return {
    ok: true,
    status: 200,
    async json() {
      return { jsonrpc: "2.0", id: "smoke", result: { isError: true, content: [{ type: "text", text: detail }] } };
    },
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function waitFor(predicate, label) {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

const tools = [
  "blueprint_list_xianji_notes",
  "blueprint_get_xianji_note",
  "blueprint_create_xianji_note",
  "blueprint_update_xianji_note",
  "blueprint_set_xianji_pinned",
  "blueprint_set_xianji_archived",
];

const context = {
  locale: { current: "en", onChange() { return () => {}; } },
  async getPreference(id) {
    if (id === "endpoint") return "https://blueprint.example.com";
    if (id === "pat") return PAT;
    if (id === "layout") return layoutPreference;
    if (id === "density") return densityPreference;
    if (id === "showImages") return showImagesPreference;
    return "";
  },
  http: {
    async fetch(url, options) {
      if (options.method === "GET") {
        imageRequests.push({ url, options });
        return { ok: true, status: 200, headers: { "content-type": "image/png" }, bodyBase64: "iVBORw0KGgo=" };
      }
      const body = JSON.parse(options.body);
      const name = body.params.name;
      requests.push({ url, options, body, name, args: clone(body.params.arguments || {}) });
      assert.equal(url, "https://blueprint.example.com/mcp");
      assert.equal(options.headers.Authorization, `Bearer ${PAT}`);
      assert.equal(options.headers["MCP-Protocol-Version"], "2026-07-28");
      assert.equal(options.headers["Mcp-Method"], "tools/call");
      assert.equal(options.headers["Mcp-Name"], name);
      assert.equal(options.body.includes(PAT), false, "PAT must not be serialized into MCP JSON");
      assert.equal(body.params._meta["io.modelcontextprotocol/protocolVersion"], "2026-07-28");
      if (forceAuthError) {
        return {
          ok: false,
          status: 500,
          async json() { return { message: `upstream echoed ${PAT}` }; },
        };
      }

      if (name === "blueprint_whoami") return toolResult({ workspaceName: "Smoke Workspace", scopes: ["content:read", "content:write"] });
      if (name === "blueprint_list_capabilities") return toolResult({ capabilities: [{ domain: "xianji", tools }] });
      if (name === "blueprint_list_xianji_notes") {
        const archived = Boolean(body.params.arguments.archived);
        return toolResult({ items: clone(notes.filter((note) => Boolean(note.archivedAt) === archived)) });
      }
      if (name === "blueprint_get_xianji_note") {
        if (delayNextGet) {
          delayNextGet = false;
          await new Promise((resolve) => { releaseDelayedGet = () => resolve(); });
        }
        return toolResult(clone(notes.find((note) => note.id === body.params.arguments.itemId)));
      }
      if (name === "blueprint_create_xianji_note") {
        const args = body.params.arguments;
        const created = {
          id: "note-2",
          ...clone(args),
          version: 1,
          archivedAt: null,
          tags: args.tags.map((tag, index) => ({ id: `new-tag-${index}`, name: tag })),
          images: [], files: [],
          createdAt: "2026-08-31T10:00:00Z",
          updatedAt: "2026-08-31T10:00:00Z",
        };
        notes.push(created);
        return toolResult(clone(created));
      }
      if (name === "blueprint_update_xianji_note") {
        const args = body.params.arguments;
        const previous = notes.find((note) => note.id === args.noteId);
        if (forceConflict) return toolError("version_conflict");
        assert.equal(args.baseVersion, previous.version);
        const updated = {
          ...previous,
          ...clone(args),
          version: nextVersion++,
          archivedAt: args.archived ? "2026-08-31T11:00:00Z" : null,
          tags: args.tags.map((tag, index) => ({ id: `tag-${index}`, name: tag })),
          images: args.images.map((assetId) => previous.images.find((item) => item.assetId === assetId) || { assetId }),
          files: args.files.map((assetId) => previous.files.find((item) => item.assetId === assetId) || { assetId }),
          updatedAt: "2026-08-31T11:00:00Z",
        };
        notes = notes.map((note) => note.id === updated.id ? updated : note);
        return toolResult(clone(updated));
      }
      if (name === "blueprint_set_xianji_pinned" || name === "blueprint_set_xianji_archived") {
        const args = body.params.arguments;
        const previous = notes.find((note) => note.id === args.noteId);
        const updated = {
          ...previous,
          pinned: name.endsWith("pinned") ? args.value : previous.pinned,
          archivedAt: name.endsWith("archived") && args.value ? "2026-08-31T11:30:00Z" : null,
          version: nextVersion++,
        };
        notes = notes.map((note) => note.id === updated.id ? updated : note);
        return toolResult(clone(updated));
      }
      throw new Error(`Unexpected tool ${name}`);
    },
  },
  ui: {
    mountWorkbench(initial, nextHandlers) {
      snapshot = initial;
      handlers = nextHandlers;
      return {
        update(next) { snapshot = next; },
        updateItems() {},
        getState() { return snapshot; },
      };
    },
  },
  showToast(value) { toasts.push(String(value)); },
  async openUrl() {},
};

const commandResult = await plugin.commands[0].run(context);
assert.deepEqual(commandResult, { workspaceName: "Smoke Workspace", readOnly: false });
assert.equal(toasts.some((value) => value.includes(PAT)), false, "PAT must not appear in connection feedback");
forceAuthError = true;
await assert.rejects(
  plugin.commands[0].run(context),
  (error) => !String(error?.message || error).includes(PAT) && String(error?.message || error).includes("[redacted]"),
  "connection failures must redact echoed PATs",
);
forceAuthError = false;

const container = {};
const lifecycle = plugin.panel.render(container, context);
await waitFor(() => snapshot?.loading === false && snapshot.items?.length === 1 && snapshot.items[0].detail?.images?.length === 1, "initial Xianji list and authenticated image");
assert.equal(snapshot.meta, "Smoke Workspace · Read & write");
assert.equal(snapshot.cache.mode, "disabled");
assert.deepEqual(snapshot.layout, { kind: "cards", columns: 3, density: "comfortable", showImages: true });
assert.equal(snapshot.items[0].detail.images[0].url.startsWith("data:image/png;base64,"), true);
assert.equal(snapshot.items[0].card.body, "Existing content");
assert.deepEqual(snapshot.items[0].card.tags, ["work"]);
assert.equal(typeof snapshot.items[0].card.timestamp, "string");
assert.notEqual(snapshot.items[0].card.timestamp, "—");
assert.equal(snapshot.items[0].image.url.startsWith("data:image/png;base64,"), true);
assert.equal(imageRequests.some(({ url }) => String(url).includes("evil.example")), false, "cross-origin image must not receive the PAT");

handlers.onAction("new-note");
assert.equal(snapshot.selectedId, "draft:new");
const createForm = snapshot.items.find((item) => item.id === "draft:new").detail.form;
assert.equal(createForm.controls.find((control) => control.id === "draft:content").type, "textarea");
assert.deepEqual(createForm.controls.map((control) => control.id), ["draft:content", "draft:title", "draft:tags"]);
handlers.onAction("advanced-options");
assert.ok(snapshot.items.find((item) => item.id === "draft:new").detail.form.controls.some((control) => control.id === "draft:background"));
handlers.onAction("advanced-options");
assert.equal(snapshot.items.find((item) => item.id === "draft:new").detail.form.controls.length, 3);
handlers.onInput("draft:title", "Created in Qx");
handlers.onInput("draft:content", "Line one\nLine two");
handlers.onInput("draft:tags", "qx, blueprint");
handlers.onAction("save-note");
await waitFor(() => requests.some((request) => request.name === "blueprint_create_xianji_note") && snapshot.loading === false && snapshot.items.some((item) => item.id === "note-2"), "create note");
const createRequest = requests.find((request) => request.name === "blueprint_create_xianji_note");
assert.equal(createRequest.args.content, "Line one\nLine two");
assert.deepEqual(createRequest.args.tags, ["qx", "blueprint"]);
assert.match(createRequest.args.operationId, /^[0-9a-f-]{36}$/i);

handlers.onAction("edit:note-1", { id: "note-1" });
await waitFor(() => snapshot.items.find((item) => item.id === "note-1")?.detail.form, "edit form");
handlers.onInput("draft:content", "Edited content");
handlers.onAction("save-note");
await waitFor(() => requests.some((request) => request.name === "blueprint_update_xianji_note") && snapshot.loading === false && !snapshot.items.find((item) => item.id === "note-1")?.detail?.form, "update note");
const updateRequest = requests.find((request) => request.name === "blueprint_update_xianji_note");
assert.equal(updateRequest.args.baseVersion, 2);
assert.deepEqual(updateRequest.args.images, ["image-1", "image-external"]);
assert.deepEqual(updateRequest.args.files, ["file-1"]);
assert.equal(updateRequest.args.content, "Edited content");

forceConflict = true;
handlers.onAction("edit:note-1", { id: "note-1" });
await waitFor(() => snapshot.items.find((item) => item.id === "note-1")?.detail?.form, "conflict edit form");
handlers.onInput("draft:content", "Draft that must survive conflict");
handlers.onAction("save-note");
await waitFor(() => snapshot.error?.includes("conflict"), "version conflict");
assert.equal(snapshot.items.find((item) => item.id === "note-1").detail.form.controls.find((control) => control.id === "draft:content").value, "Draft that must survive conflict");
handlers.onAction("cancel-edit");
handlers.onAction("edit:note-1", { id: "note-1" });
assert.equal(snapshot.items.find((item) => item.id === "note-1").detail.form.controls.find((control) => control.id === "draft:content").value, "Draft that must survive conflict");
assert.equal(snapshot.items.find((item) => item.id === "note-1").detail.form.actions.some((action) => action.id === "reload-latest"), true);
forceConflict = false;
handlers.onAction("reload-latest");
await waitFor(() => snapshot.items.find((item) => item.id === "note-1")?.detail?.form?.actions?.some((action) => action.id === "save-note"), "reload latest after conflict");

handlers.onAction("new-note");
handlers.onInput("draft:title", "Oversized");
handlers.onInput("draft:content", "x".repeat(65_537));
const createCountBeforeOversized = requests.filter((request) => request.name === "blueprint_create_xianji_note").length;
handlers.onAction("save-note");
assert.equal(snapshot.error.includes("64 KiB"), true);
assert.equal(requests.filter((request) => request.name === "blueprint_create_xianji_note").length, createCountBeforeOversized);
handlers.onAction("cancel-edit");

const inlineStart = await handlers.onEdit({ phase: "start", itemId: "note-1", sessionId: "inline-1", requestId: "inline-start" });
assert.equal(inlineStart.status, "ready");
assert.equal("phase" in inlineStart, false, "plugin returns domain-only edit results; SDK owns wire identity");
assert.equal(inlineStart.value, "Edited content");
const inlineInput = await handlers.onEdit({ phase: "input", itemId: "note-1", sessionId: "inline-1", requestId: "inline-input", value: "Inline content" });
assert.equal(inlineInput.status, "accepted");
const inlineOversizedInput = await handlers.onEdit({ phase: "input", itemId: "note-1", sessionId: "inline-1", requestId: "inline-too-large", value: "x".repeat(65_537) });
assert.equal(inlineOversizedInput.status, "error");
const inlineSave = await handlers.onEdit({ phase: "save", itemId: "note-1", sessionId: "inline-1", requestId: "inline-save", value: "Inline content" });
assert.equal(inlineSave.status, "saved");
assert.equal(requests.filter((request) => request.name === "blueprint_update_xianji_note").at(-1).args.content, "Inline content");
await waitFor(() => snapshot.meta?.includes("Read & write"), "inline save capability refresh");

const inlineConflictStart = await handlers.onEdit({ phase: "start", itemId: "note-1", sessionId: "inline-conflict", requestId: "inline-conflict-start" });
assert.equal(inlineConflictStart.status, "ready");
forceConflict = true;
const inlineConflict = await handlers.onEdit({ phase: "save", itemId: "note-1", sessionId: "inline-conflict", requestId: "inline-conflict-save", value: "Should remain local" });
assert.equal(inlineConflict.status, "conflict");
assert.equal(snapshot.error.includes("conflict"), true);
forceConflict = false;
const inlineCancel = await handlers.onEdit({ phase: "cancel", itemId: "note-1", sessionId: "inline-conflict", requestId: "inline-conflict-cancel" });
assert.equal(inlineCancel.status, "cancelled");

const selectionStart = await handlers.onEdit({ phase: "start", itemId: "note-1", sessionId: "inline-selection", requestId: "inline-selection-start" });
assert.equal(selectionStart.status, "ready");
const updateCountBeforeSelection = requests.filter((request) => request.name === "blueprint_update_xianji_note").length;
handlers.onSelect("note-2");
const selectionSave = await handlers.onEdit({ phase: "save", itemId: "note-1", sessionId: "inline-selection", requestId: "inline-selection-save", value: "Must not cross selection" });
assert.equal(selectionSave.status, "error");
assert.equal(requests.filter((request) => request.name === "blueprint_update_xianji_note").length, updateCountBeforeSelection);
const selectionCancel = await handlers.onEdit({ phase: "cancel", itemId: "note-1", sessionId: "inline-selection", requestId: "inline-selection-cancel" });
assert.equal(selectionCancel.status, "cancelled");

delayNextGet = true;
const staleStart = handlers.onEdit({ phase: "start", itemId: "note-1", sessionId: "inline-stale", requestId: "inline-stale-start" });
await waitFor(() => typeof releaseDelayedGet === "function", "delayed inline edit start");
const refreshPromise = handlers.onAction("refresh");
releaseDelayedGet();
releaseDelayedGet = null;
assert.equal((await staleStart).status, "error");
await refreshPromise;

plugin.panel.destroy(container);
const writableTools = tools.slice();
tools.splice(0, tools.length, "blueprint_list_xianji_notes", "blueprint_get_xianji_note");
layoutPreference = "list";
densityPreference = "compact";
showImagesPreference = false;
const readOnlyContainer = {};
plugin.panel.render(readOnlyContainer, context);
await waitFor(() => snapshot?.loading === false && snapshot.layout?.kind === "list" && snapshot.items?.length >= 1, "read-only Xianji list");
assert.deepEqual(snapshot.layout, { kind: "list", columns: 3, density: "compact", showImages: false });
assert.equal(snapshot.actions.some((action) => action.id === "new-note"), false);
assert.equal(snapshot.items[0].editor, undefined);
assert.equal(snapshot.items[0].actions.some((action) => action.id.startsWith("edit:")), false);
plugin.panel.destroy(readOnlyContainer);
tools.splice(0, tools.length, ...writableTools);

assert.equal(typeof lifecycle.destroy, "function");
console.log("BluePrint plugin smoke passed");
