import {
  bytesToBase64,
  describeCliFailure,
  joinPath,
  sha256Hex,
} from "./format.js";
import {
  applySpeedtestEvent,
  consumeJsonLines,
  emptyProgress,
  emptyResult,
  emptySamples,
} from "./parse.js";

export const PLUGIN_ID = "speedtest";
export const CLI_VERSION = "1.2.0";
export const MAX_ARCHIVE_BYTES = 10 * 1024 * 1024;
export const CLI_DIR_VIRTUAL = `/qx-plugin-files/${PLUGIN_ID}/cli`;
export const TMP_DIR_VIRTUAL = `/qx-plugin-files/${PLUGIN_ID}/cli-tmp`;
export const LAST_RESULT_KEY = "speedtest.last-result.v1";

export const CLI_INFO = {
  macos: {
    pkg: "macosx-universal.tgz",
    sha256: "c9f8192149ebc88f8699998cecab1ce144144045907ece6f53cf50877f4de66f",
    name: "speedtest",
  },
  windows: {
    pkg: "win64.zip",
    sha256: "13e3d888b845d301a556419e31f14ab9bff57e3f06089ef2fd3bdc9ba6841efa",
    name: "speedtest.exe",
  },
};

export function cliInfoForPlatform(platform) {
  return platform === "windows" ? CLI_INFO.windows : CLI_INFO.macos;
}

export function cliDownloadUrl(info) {
  return `https://install.speedtest.net/app/cli/ookla-speedtest-${CLI_VERSION}-${info.pkg}`;
}

export function realPluginFilesRoot(env) {
  return joinPath(env.dirSep, env.homeDir, ".qx", "plugin-data", PLUGIN_ID, "files");
}

export function realCliPath(env, info) {
  return joinPath(env.dirSep, realPluginFilesRoot(env), "cli", info.name);
}

export function realCliDir(env) {
  return joinPath(env.dirSep, realPluginFilesRoot(env), "cli");
}

export function realTmpArchivePath(env, info) {
  return joinPath(env.dirSep, realPluginFilesRoot(env), "cli-tmp", info.pkg);
}

async function invokeFile(context, cmd, args) {
  return context.invoke(cmd, args);
}

export async function isCliInstalled(context, info) {
  const virtual = `${CLI_DIR_VIRTUAL}/${info.name}`;
  return Boolean(await invokeFile(context, "plugin_file_exists", { path: virtual }).catch(() => false));
}

async function makeExecutable(context, env, info) {
  if (String(env.platform || "").toLowerCase() === "windows") return;
  const chmod = await context.cli.run({
    program: "chmod",
    args: ["755", realCliPath(env, info)],
    timeoutMs: 10_000,
  });
  if (chmod.timedOut || chmod.status !== 0) {
    throw new Error("Could not chmod speedtest cli");
  }
}

export async function ensureCli(context, env, onStatus) {
  const platform = String(env.platform || "").toLowerCase();
  const info = cliInfoForPlatform(platform);
  if (await isCliInstalled(context, info)) {
    await makeExecutable(context, env, info);
    return realCliPath(env, info);
  }

  onStatus?.("download");
  const url = cliDownloadUrl(info);
  const response = await context.http.fetch(url, {
    method: "GET",
    headers: { Accept: "application/octet-stream", "User-Agent": "Qx-Speedtest/1.0" },
    timeoutMs: 120_000,
    maxBytes: MAX_ARCHIVE_BYTES,
  });
  if (!response.ok) {
    throw new Error("Could not install speedtest cli");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_ARCHIVE_BYTES) {
    throw new Error("Could not install speedtest cli");
  }
  const hash = await sha256Hex(bytes);
  if (hash !== info.sha256) {
    throw new Error("Could not extract tgz content of speedtest cli");
  }

  await invokeFile(context, "plugin_file_ensure_dir", { path: TMP_DIR_VIRTUAL });
  await invokeFile(context, "plugin_file_ensure_dir", { path: CLI_DIR_VIRTUAL });
  await invokeFile(context, "plugin_file_write_base64", {
    path: `${TMP_DIR_VIRTUAL}/${info.pkg}`,
    dataBase64: bytesToBase64(bytes),
  });

  const archivePath = realTmpArchivePath(env, info);
  const destDir = realCliDir(env);
  const extract = await context.cli.run({
    program: "tar",
    args: ["-xf", archivePath, "-C", destDir, info.name],
    timeoutMs: 30_000,
  });
  if (extract.timedOut || extract.status !== 0) {
    throw new Error("Could not extract tgz content of speedtest cli");
  }

  try {
    await makeExecutable(context, env, info);
  } catch (error) {
    await invokeFile(context, "plugin_file_empty_dir", { path: CLI_DIR_VIRTUAL }).catch(() => {});
    throw error;
  }

  await invokeFile(context, "plugin_file_empty_dir", { path: TMP_DIR_VIRTUAL }).catch(() => {});
  if (!(await isCliInstalled(context, info))) {
    throw new Error("Could not install speedtest cli");
  }
  return realCliPath(env, info);
}

export async function clearCliCache(context) {
  await invokeFile(context, "plugin_file_empty_dir", { path: CLI_DIR_VIRTUAL });
  await invokeFile(context, "plugin_file_empty_dir", { path: TMP_DIR_VIRTUAL }).catch(() => {});
}

export function createTestSession() {
  return {
    result: emptyResult(),
    progress: emptyProgress(),
    samples: emptySamples(),
    finished: false,
    parsedLength: 0,
    rest: "",
  };
}

export function ingestStdout(session, stdout) {
  const next = String(stdout || "");
  if (next.length < session.parsedLength) {
    session.parsedLength = 0;
    session.rest = "";
  }
  const chunk = next.slice(session.parsedLength);
  session.parsedLength = next.length;
  if (!chunk) return session;
  const { rest, events } = consumeJsonLines(session.rest, chunk);
  session.rest = rest;
  for (const event of events) {
    const applied = applySpeedtestEvent(session, event);
    session.result = applied.result;
    session.progress = applied.progress;
    session.samples = applied.samples;
    session.finished = applied.finished;
  }
  return session;
}

export async function startSpeedtestJob(context, program) {
  return context.cli.start({
    kind: "run",
    program,
    args: ["--format", "json", "--progress", "--accept-license", "--accept-gdpr"],
    timeoutMs: 180_000,
  });
}

export function jobErrorMessage(snapshot) {
  if (!snapshot) return "Speedtest failed";
  if (snapshot.timedOut) return describeCliFailure(snapshot.stderr, null);
  if (snapshot.state === "cancelled") return null;
  if (snapshot.state === "failed" || (snapshot.status != null && snapshot.status !== 0)) {
    return describeCliFailure(snapshot.stderr || snapshot.error, snapshot.status);
  }
  return null;
}
