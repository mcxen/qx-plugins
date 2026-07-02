#!/usr/bin/env node
import { appendFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

function usage() {
  console.error(`Usage:
  node scripts/convert-raycast-url.mjs <raycast-github-tree-url> [--out <dir>] [--package] [--publish] [--keep-temp]

Example:
  node scripts/convert-raycast-url.mjs https://github.com/raycast/extensions/tree/870667fc671801a467deb7c4c7fc72992efe3820/extensions/bing-wallpaper --out dist/raycast-converted --package --publish`);
}

function parseArgs(argv) {
  const args = [...argv];
  const sourceUrl = args.shift();
  if (!sourceUrl || sourceUrl === "-h" || sourceUrl === "--help") {
    usage();
    process.exit(sourceUrl ? 0 : 1);
  }

  const result = {
    sourceUrl,
    out: path.resolve(repoRoot, "dist/raycast-converted"),
    shouldPackage: false,
    publish: false,
    keepTemp: false,
  };

  while (args.length > 0) {
    const arg = args.shift();
    if (arg === "--out") {
      const value = args.shift();
      if (!value) throw new Error("--out requires a directory");
      result.out = path.resolve(value);
    } else if (arg === "--package") {
      result.shouldPackage = true;
    } else if (arg === "--publish") {
      result.publish = true;
      result.shouldPackage = true;
    } else if (arg === "--keep-temp") {
      result.keepTemp = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return result;
}

function parseRaycastTreeUrl(input) {
  const url = new URL(String(input).trim());
  if (url.protocol !== "https:" || url.hostname !== "github.com") {
    throw new Error("Raycast URL must be an https://github.com URL");
  }

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] !== "raycast" || parts[1] !== "extensions" || parts[2] !== "tree") {
    throw new Error("Only github.com/raycast/extensions tree URLs are supported");
  }

  const extensionIndex = parts.lastIndexOf("extensions");
  if (extensionIndex < 4 || extensionIndex + 1 >= parts.length) {
    throw new Error("URL must point to /tree/<ref>/extensions/<extension-name>");
  }

  const reference = parts.slice(3, extensionIndex).join("/");
  const extensionPathParts = parts.slice(extensionIndex);
  if (!reference || extensionPathParts.length !== 2) {
    throw new Error("URL must point to one Raycast extension directory");
  }

  const extensionName = extensionPathParts[1];
  if (!/^[a-zA-Z0-9._-]+$/.test(extensionName)) {
    throw new Error(`Unsupported Raycast extension name: ${extensionName}`);
  }

  return {
    owner: parts[0],
    repo: parts[1],
    reference,
    extensionPath: extensionPathParts.join("/"),
    extensionName,
    repoUrl: `https://github.com/${parts[0]}/${parts[1]}.git`,
  };
}

function run(command, args, options = {}) {
  const display = [command, ...args].join(" ");
  console.error(`$ ${display}`);
  const result = spawnSync(command, args, {
    cwd: options.cwd || repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.stdout?.trim()) console.error(result.stdout.trim());
  if (result.stderr?.trim()) console.error(result.stderr.trim());
  if (result.status !== 0) {
    throw new Error(`${display} failed with exit code ${result.status}`);
  }
  return result.stdout || "";
}

async function writeGithubOutput(values) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  const lines = Object.entries(values).map(([key, value]) => {
    const safeValue = String(value ?? "").replace(/\n/g, "%0A");
    return `${key}=${safeValue}`;
  });
  await appendFile(outputPath, `${lines.join("\n")}\n`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const source = parseRaycastTreeUrl(options.sourceUrl);
  const tmp = await mkdtemp(path.join(os.tmpdir(), "qx-raycast-url-"));
  const repoDir = path.join(tmp, "repo");

  try {
    run("git", ["clone", "--filter=blob:none", "--sparse", source.repoUrl, repoDir], { cwd: tmp });
    run("git", ["-C", repoDir, "checkout", source.reference], { cwd: tmp });
    run("git", ["-C", repoDir, "sparse-checkout", "set", source.extensionPath], { cwd: tmp });

    const extensionDir = path.join(repoDir, source.extensionPath);
    if (!existsSync(path.join(extensionDir, "package.json"))) {
      throw new Error(`Raycast extension package.json was not found at ${source.extensionPath}`);
    }

    const converter = path.join(scriptDir, "convert-raycast-extension.mjs");
    const convertArgs = [converter, extensionDir, "--out", options.out];
    if (options.shouldPackage) convertArgs.push("--package");
    const convertStdout = run(process.execPath, convertArgs, { cwd: repoRoot });
    const convertResult = JSON.parse(convertStdout.trim());
    const manifestPath = path.join(convertResult.pluginDir, "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

    if (options.publish) {
      const destDir = path.join(repoRoot, "src", manifest.id);
      await rm(destDir, { recursive: true, force: true });
      await mkdir(path.dirname(destDir), { recursive: true });
      await cp(convertResult.pluginDir, destDir, { recursive: true });
      run(process.execPath, [path.join(scriptDir, "package-plugins.mjs")], { cwd: repoRoot });
    }

    const archivePath = options.publish
      ? path.join(repoRoot, `${manifest.id}.qx-plugin`)
      : convertResult.archive;
    const result = {
      sourceUrl: options.sourceUrl,
      reference: source.reference,
      extensionPath: source.extensionPath,
      pluginId: manifest.id,
      pluginName: manifest.name,
      pluginDir: options.publish ? path.join(repoRoot, "src", manifest.id) : convertResult.pluginDir,
      archive: archivePath || "",
      published: options.publish,
    };

    await mkdir(options.out, { recursive: true });
    await writeFile(path.join(options.out, "conversion-result.json"), `${JSON.stringify(result, null, 2)}\n`);
    await writeGithubOutput({
      plugin_id: result.pluginId,
      plugin_name: result.pluginName,
      archive: path.basename(result.archive),
      source_url: result.sourceUrl,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    if (!options.keepTemp) {
      await rm(tmp, { recursive: true, force: true });
    } else {
      console.error(`Kept temp directory: ${tmp}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
