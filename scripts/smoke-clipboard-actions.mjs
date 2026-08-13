#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const manifest = JSON.parse(
  await readFile(new URL("../src/clipboard-actions/manifest.json", import.meta.url), "utf8"),
);
const entryUrl = new URL("../src/clipboard-actions/index.js", import.meta.url);
entryUrl.searchParams.set("smoke", String(Date.now()));
const { default: plugin } = await import(pathToFileURL(entryUrl.pathname).href + entryUrl.search);

const manifestNames = manifest.commands.map((command) => command.name).sort();
const runtimeNames = plugin.commands.map((command) => command.name).sort();
assert.deepEqual(runtimeNames, manifestNames, "manifest and runtime command names must match");
assert.equal(manifest.commands.every((command) => command.mode === "no-view"), true);
assert.equal(manifest.preferences[0].default, "~/Pictures/Qx Clipboard");
assert.deepEqual(
  manifest.shortcuts.map((shortcut) => shortcut.enabled),
  [false, false],
  "global shortcuts must be opt-in",
);

function createContext({ locale = "en", clipboardText = "Hello\nQx", imagePath = "/tmp/current.png", directory = "~/Pictures/Qx Clipboard", existing = [] } = {}) {
  const invokes = [];
  const writes = [];
  const toasts = [];
  const files = new Set(existing);
  return {
    invokes,
    writes,
    toasts,
    files,
    context: {
      locale: { current: locale, onChange: () => () => {} },
      clipboard: {
        async read() {
          if (clipboardText instanceof Error) throw clipboardText;
          return clipboardText;
        },
        async write(value) {
          writes.push(value);
        },
      },
      async invoke(command, args) {
        invokes.push({ command, args });
        if (command === "plugin_perform_paste") return undefined;
        if (command === "read_clipboard_image_now") return imagePath;
        if (command === "plugin_file_read_base64") return "iVBORw0KGgo=";
        if (command === "plugin_file_exists") return files.has(args.path);
        if (command === "plugin_file_write_base64") {
          assert.equal(files.has(args.path), false, "save must not overwrite an existing file");
          assert.equal(typeof args.dataBase64, "string", "file write must use the Tauri camelCase argument");
          files.add(args.path);
          writes.push({ path: args.path, dataBase64: args.dataBase64 });
          return undefined;
        }
        throw new Error(`Unexpected invoke: ${command}`);
      },
      async getPreference(id) {
        assert.equal(id, "saveDirectory");
        return directory;
      },
      showToast(value) {
        toasts.push(String(value));
      },
    },
  };
}

const pasteCommand = plugin.commands.find((command) => command.name === "paste-clipboard-plain-text");
const saveCommand = plugin.commands.find((command) => command.name === "save-clipboard-image");
assert.ok(pasteCommand);
assert.ok(saveCommand);

const paste = createContext();
await pasteCommand.run(paste.context);
assert.deepEqual(paste.writes, ["Hello\nQx"], "plain paste must write the text representation first");
assert.deepEqual(
  paste.invokes.map((call) => call.command),
  ["plugin_perform_paste"],
  "plain paste must use the exact host paste invoke",
);
assert.match(paste.toasts[0], /Pasted as plain text/);

const zhPaste = createContext({ locale: "zh-CN" });
await pasteCommand.run(zhPaste.context);
assert.match(zhPaste.toasts[0], /已以纯文本粘贴/u, "success feedback must be localized");

const emptyPaste = createContext({ clipboardText: "" });
await assert.rejects(
  () => pasteCommand.run(emptyPaste.context),
  /clipboard does not contain non-empty text/i,
  "empty clipboard text must fail clearly",
);
assert.equal(emptyPaste.invokes.length, 0, "empty text must not invoke native paste");

const richReadFailure = createContext({ clipboardText: new Error("clipboard has no text format") });
await assert.rejects(
  () => pasteCommand.run(richReadFailure.context),
  /Cannot read clipboard text: clipboard has no text format/,
  "non-text clipboard failures must remain understandable",
);

const saved = createContext({ existing: ["~/Pictures/Qx Clipboard/clipboard-image-2026-01-02T03-04-05.png"] });
const firstSavedPath = await saveCommand.run(saved.context);
assert.match(firstSavedPath, /^~\/Pictures\/Qx Clipboard\/clipboard-image-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:-\d+)?\.png$/);
assert.ok(saved.invokes.some((call) => call.command === "read_clipboard_image_now"));
assert.ok(saved.invokes.some((call) => call.command === "plugin_file_read_base64"));
assert.ok(saved.invokes.some((call) => call.command === "plugin_file_exists"));
assert.ok(saved.invokes.some((call) => call.command === "plugin_file_write_base64"));
assert.equal(saved.files.has(firstSavedPath), true);

const secondSavedPath = await saveCommand.run(saved.context);
assert.notEqual(secondSavedPath, firstSavedPath, "a second save must choose a unique filename");
assert.equal(saved.files.has(secondSavedPath), true);

const zhSaved = createContext({ locale: "zh-CN", directory: "~/图片/Qx Clipboard" });
await saveCommand.run(zhSaved.context);
assert.match(zhSaved.toasts[0], /剪贴板图片已保存到/u, "image success feedback must be localized");

const noImage = createContext({ imagePath: null, locale: "zh-CN" });
await assert.rejects(
  () => saveCommand.run(noImage.context),
  /当前剪贴板没有图片/u,
  "missing clipboard image must fail with localized feedback",
);

const accessibilityFailure = createContext();
accessibilityFailure.context.invoke = async (command, args) => {
  if (command === "plugin_perform_paste") throw new Error("Accessibility permission is required to paste from Qx");
  return createContext().context.invoke(command, args);
};
await assert.rejects(
  () => pasteCommand.run(accessibilityFailure.context),
  /Accessibility permission is required/u,
  "host Accessibility errors must not be swallowed",
);

console.log("clipboard-actions smoke: ok");
