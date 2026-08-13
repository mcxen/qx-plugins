/**
 * Clipboard Actions — focused no-view commands for the Qx clipboard ports.
 *
 * The host owns clipboard access, paste automation, path expansion, and
 * platform differences. This plugin only composes those stable ports.
 */

const DEFAULT_SAVE_DIRECTORY = "~/Pictures/Qx Clipboard";
const IMAGE_FILE_PREFIX = "clipboard-image";

// A command invocation is normally serialized by Qx. Keep the file existence
// check and write in one local queue as well, so two quick shortcut presses
// cannot select the same destination before either write completes.
let imageSaveQueue = Promise.resolve();

function currentLocale(context) {
  return context?.locale?.current === "zh-CN" ? "zh-CN" : "en";
}

function text(context, en, zh) {
  return currentLocale(context) === "zh-CN" ? zh : en;
}

function errorMessage(error) {
  if (error instanceof Error) return error.message;
  return String(error || "Unknown error");
}

function normalizeSaveDirectory(value) {
  const directory = String(value ?? "").trim();
  return directory || DEFAULT_SAVE_DIRECTORY;
}

function joinPath(directory, filename) {
  const trimmed = directory.replace(/[\\/]+$/u, "");
  // Preserve a Windows preference's separator while keeping virtual and
  // tilde paths portable for the host path resolver.
  const separator = trimmed.includes("\\") && !trimmed.includes("/") ? "\\" : "/";
  return `${trimmed || directory}${separator}${filename}`;
}

function sanitizeFilenamePart(value) {
  const safe = String(value ?? "")
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/gu, "-")
    .replace(/[. ]+$/gu, "")
    .trim();
  return safe || IMAGE_FILE_PREFIX;
}

function timestampStem(now = new Date()) {
  const iso = now.toISOString().replace(/\.\d{3}Z$/u, "");
  return sanitizeFilenamePart(`${IMAGE_FILE_PREFIX}-${iso.replace(/:/gu, "-")}`);
}

async function chooseUniquePath(context, directory, stem) {
  let suffix = 0;
  while (true) {
    const filename = `${stem}${suffix === 0 ? "" : `-${suffix}`}.png`;
    const path = joinPath(directory, filename);
    const exists = await context.invoke("plugin_file_exists", { path });
    if (!exists) return path;
    suffix += 1;
  }
}

async function pasteClipboardPlainText(context) {
  let clipboardText;
  try {
    clipboardText = await context.clipboard.read();
  } catch (error) {
    // Preserve the host's real unavailable/permission error while adding a
    // useful operation prefix for command history and status surfaces.
    throw new Error(`${text(context, "Cannot read clipboard text", "无法读取剪贴板文字")}: ${errorMessage(error)}`);
  }

  if (typeof clipboardText !== "string" || clipboardText.length === 0) {
    throw new Error(text(
      context,
      "The clipboard does not contain non-empty text.",
      "当前剪贴板没有非空文字。",
    ));
  }

  // Reading through context.clipboard.read() already requests the host's
  // plain-text representation. Writing it back removes any rich clipboard
  // payload before the host sends the native paste keystroke.
  await context.clipboard.write(clipboardText);
  // Do not catch this call: Accessibility / automation errors must remain the
  // host's real error instead of being reported as a false successful paste.
  await context.invoke("plugin_perform_paste");
  context.showToast?.(text(context, "Pasted as plain text", "已以纯文本粘贴"));
  return clipboardText;
}

async function saveClipboardImageImpl(context) {
  const sourcePath = await context.invoke("read_clipboard_image_now");
  if (typeof sourcePath !== "string" || sourcePath.trim().length === 0) {
    throw new Error(text(
      context,
      "The clipboard does not contain an image.",
      "当前剪贴板没有图片。",
    ));
  }

  const dataBase64 = await context.invoke("plugin_file_read_base64", {
    path: sourcePath,
  });
  if (typeof dataBase64 !== "string" || dataBase64.length === 0) {
    throw new Error(text(
      context,
      "The clipboard image could not be read.",
      "无法读取剪贴板图片。",
    ));
  }

  const directory = normalizeSaveDirectory(await context.getPreference("saveDirectory"));
  const path = await chooseUniquePath(context, directory, timestampStem());
  await context.invoke("plugin_file_write_base64", {
    path,
    dataBase64,
  });
  context.showToast?.(text(
    context,
    `Saved clipboard image to ${path}`,
    `剪贴板图片已保存到 ${path}`,
  ));
  return path;
}

function saveClipboardImage(context) {
  const run = imageSaveQueue.then(() => saveClipboardImageImpl(context));
  imageSaveQueue = run.catch(() => undefined);
  return run;
}

export const commands = [
  {
    name: "paste-clipboard-plain-text",
    title: "Paste Clipboard as Plain Text",
    async run(context) {
      return pasteClipboardPlainText(context);
    },
  },
  {
    name: "save-clipboard-image",
    title: "Save Clipboard Image",
    async run(context) {
      return saveClipboardImage(context);
    },
  },
];

export const internals = {
  DEFAULT_SAVE_DIRECTORY,
  chooseUniquePath,
  sanitizeFilenamePart,
  timestampStem,
};

// Keep the default export explicit so Qx's manifest/export contract checker
// can statically verify every declared command.
export default { commands: commands };
