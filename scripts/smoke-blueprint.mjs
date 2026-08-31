import assert from "node:assert/strict";
import plugin from "../src/blueprint/index.js";

const PAT = "blueprint_pat_smoke_secret";
const requests = [];
let handlers;
let snapshot;
let nextVersion = 3;
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
  images: [{ assetId: "image-1", url: "/api/v1/assets/image-1/content", name: "image.png", mimeType: "image/png" }],
  files: [{ assetId: "file-1", url: "/api/v1/assets/file-1/content", name: "brief.pdf", mimeType: "application/pdf" }],
  createdAt: "2026-08-31T08:00:00Z",
  updatedAt: "2026-08-31T09:00:00Z",
}];

function toolResult(value) {
  return { ok: true, status: 200, async json() { return { jsonrpc: "2.0", id: "smoke", result: { structuredContent: value } }; } };
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
    return "";
  },
  http: {
    async fetch(url, options) {
      if (options.method === "GET") {
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

      if (name === "blueprint_whoami") return toolResult({ workspaceName: "Smoke Workspace", scopes: ["content:read", "content:write"] });
      if (name === "blueprint_list_capabilities") return toolResult({ capabilities: [{ domain: "xianji", tools }] });
      if (name === "blueprint_list_xianji_notes") {
        const archived = Boolean(body.params.arguments.archived);
        return toolResult({ items: clone(notes.filter((note) => Boolean(note.archivedAt) === archived)) });
      }
      if (name === "blueprint_get_xianji_note") {
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
  showToast() {},
  async openUrl() {},
};

const lifecycle = plugin.panel.render({}, context);
await waitFor(() => snapshot?.loading === false && snapshot.items?.length === 1, "initial Xianji list");
assert.equal(snapshot.meta, "Smoke Workspace · Read & write");
assert.equal(snapshot.cache.mode, "disabled");
assert.equal(snapshot.items[0].detail.images[0].url.startsWith("data:image/png;base64,"), true);

handlers.onAction("new-note");
assert.equal(snapshot.selectedId, "draft:new");
const createForm = snapshot.items.find((item) => item.id === "draft:new").detail.form;
assert.equal(createForm.controls.find((control) => control.id === "draft:content").type, "textarea");
handlers.onInput("draft:title", "Created in Qx");
handlers.onInput("draft:content", "Line one\nLine two");
handlers.onInput("draft:tags", "qx, blueprint");
handlers.onAction("save-note");
await waitFor(() => requests.some((request) => request.name === "blueprint_create_xianji_note") && snapshot.loading === false, "create note");
const createRequest = requests.find((request) => request.name === "blueprint_create_xianji_note");
assert.equal(createRequest.args.content, "Line one\nLine two");
assert.deepEqual(createRequest.args.tags, ["qx", "blueprint"]);
assert.match(createRequest.args.operationId, /^[0-9a-f-]{36}$/i);

handlers.onAction("edit:note-1", { id: "note-1" });
await waitFor(() => snapshot.items.find((item) => item.id === "note-1")?.detail.form, "edit form");
handlers.onInput("draft:content", "Edited content");
handlers.onAction("save-note");
await waitFor(() => requests.some((request) => request.name === "blueprint_update_xianji_note"), "update note");
const updateRequest = requests.find((request) => request.name === "blueprint_update_xianji_note");
assert.equal(updateRequest.args.baseVersion, 2);
assert.deepEqual(updateRequest.args.images, ["image-1"]);
assert.deepEqual(updateRequest.args.files, ["file-1"]);
assert.equal(updateRequest.args.content, "Edited content");

lifecycle.destroy();
console.log("BluePrint plugin smoke passed");
