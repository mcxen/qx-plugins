#!/usr/bin/env node
import { mkdir, readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yazl from "yazl";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const sourceRoot = path.join(repoRoot, "src");
const rawBase = process.env.QX_PLUGIN_RAW_BASE || "https://raw.githubusercontent.com/mcxen/qx-plugins/main";
const today = new Date().toISOString().slice(0, 10);

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (fallback !== null) return fallback;
    throw error;
  }
}

async function sha256(filePath) {
  const hash = crypto.createHash("sha256");
  await new Promise((resolve, reject) => {
    createReadStream(filePath)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", resolve);
  });
  return hash.digest("hex");
}

async function listPackageFiles(pluginDir, prefix = "") {
  const entries = await readdir(path.join(pluginDir, prefix), { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  const files = [];
  for (const entry of entries) {
    const relativePath = prefix ? path.posix.join(prefix, entry.name) : entry.name;
    if (entry.isDirectory()) {
      files.push(...await listPackageFiles(pluginDir, relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

async function packagePlugin(pluginDir, archivePath) {
  const files = await listPackageFiles(pluginDir);
  if (files.length === 0) {
    throw new Error(`plugin directory has no files: ${pluginDir}`);
  }
  const fixedTime = new Date("2000-01-01T00:00:00Z");
  await Promise.all(files.map((file) => utimes(path.join(pluginDir, file), fixedTime, fixedTime)));
  await new Promise((resolve, reject) => {
    const zipfile = new yazl.ZipFile();
    const output = createWriteStream(archivePath);
    output.on("close", resolve);
    output.on("error", reject);
    zipfile.outputStream.on("error", reject);
    zipfile.outputStream.pipe(output);
    for (const file of files) {
      zipfile.addFile(path.join(pluginDir, file), file, {
        compress: false,
        mtime: fixedTime,
        mode: 0o100644,
      });
    }
    zipfile.end();
  });
}

async function pluginDirs() {
  if (!existsSync(sourceRoot)) return [];
  const entries = await readdir(sourceRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(sourceRoot, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

async function main() {
  await mkdir(repoRoot, { recursive: true });
  const previous = await readJson(path.join(repoRoot, "index.json"), { schema_version: 1, plugins: [] });
  const previousById = new Map((previous.plugins || []).map((entry) => [entry.id, entry]));
  const plugins = [];
  const packaged = [];

  for (const pluginDir of await pluginDirs()) {
    const manifestPath = path.join(pluginDir, "manifest.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = await readJson(manifestPath);
    const id = manifest.id || path.basename(pluginDir);
    const archiveName = `${id}.qx-plugin`;
    const archivePath = path.join(repoRoot, archiveName);
    await rm(archivePath, { force: true });
    await packagePlugin(pluginDir, archivePath);

    const checksum = await sha256(archivePath);
    const size = (await stat(archivePath)).size;
    const previousEntry = previousById.get(id);
    const updatedAt = previousEntry?.checksum_sha256 === checksum
      ? previousEntry.updated_at || today
      : today;

    plugins.push({
      id,
      name: manifest.name || id,
      version: manifest.version || "1.0.0",
      description: manifest.description || "",
      download_url: `${rawBase}/${archiveName}`,
      size_bytes: size,
      checksum_sha256: checksum,
      required_permissions: Array.isArray(manifest.permissions) ? manifest.permissions : [],
      updated_at: updatedAt,
      author: manifest.author || "",
      min_app_version: manifest.min_app_version || manifest.minAppVersion || previousEntry?.min_app_version || "0.4.28",
    });
    packaged.push({ id, archive: archiveName, size_bytes: size, checksum_sha256: checksum });
  }

  plugins.sort((a, b) => a.name.localeCompare(b.name));
  await writeFile(
    path.join(repoRoot, "index.json"),
    `${JSON.stringify({ schema_version: 1, plugins }, null, 2)}\n`,
  );
  process.stdout.write(`${JSON.stringify({ packaged }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
