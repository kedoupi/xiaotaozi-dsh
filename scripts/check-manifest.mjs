#!/usr/bin/env node
import { readdir, readFile, access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pluginsDir = join(root, "plugins");

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function fail(message) {
  throw new Error(message);
}

async function checkPlugin(dirName) {
  const dir = join(pluginsDir, dirName);
  const pkgPath = join(dir, "package.json");
  const patchPath = join(dir, "cordis.patch.yml");
  if (!(await exists(pkgPath))) fail(`${dirName}: missing package.json`);
  if (!(await exists(patchPath))) fail(`${dirName}: missing cordis.patch.yml`);

  const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
  if (typeof pkg.name !== "string" || !pkg.name.startsWith("dsh-")) {
    fail(`${dirName}: package.json name must start with dsh-`);
  }
  if (pkg.type !== "module") fail(`${dirName}: package.json type must be module`);
  if (pkg.dsh?.profile) fail(`${dirName}: plugin packages must not declare dsh.profile`);
  const patchRel = pkg.dsh?.bundle?.patch;
  if (typeof patchRel !== "string") fail(`${dirName}: missing dsh.bundle.patch`);
  if (!(await exists(join(dir, patchRel)))) {
    fail(`${dirName}: dsh.bundle.patch does not exist: ${patchRel}`);
  }
  const files = pkg.files ?? [];
  if (!files.includes("cordis.patch.yml") && !files.includes("./cordis.patch.yml")) {
    fail(`${dirName}: files[] must include cordis.patch.yml`);
  }

  const patch = await readFile(patchPath, "utf8");
  if (!patch.includes(`name: ${pkg.name}`)) {
    fail(`${dirName}: cordis.patch.yml name must match package.json name (${pkg.name})`);
  }

  const built = join(dir, "lib", "index.js");
  if (await exists(built)) {
    const js = await readFile(built, "utf8");
    if (js.includes("#region ../../node_modules") || js.includes("#region ../../../node_modules")) {
      fail(`${dirName}: lib/index.js bundled node_modules; set deps.neverBundle: true`);
    }
    if (js.includes("@deepseek-ai/dsh-tools")) {
      fail(`${dirName}: lib/index.js imports @deepseek-ai/dsh-tools; register a plain tool object instead`);
    }
    const declared = new Set(Object.keys(pkg.dependencies ?? {}));
    const importRe = /from\s+["'](@deepseek-ai\/[^"']+)["']/g;
    let match;
    while ((match = importRe.exec(js)) !== null) {
      const name = match[1].split("/").slice(0, 2).join("/");
      if (!declared.has(name)) {
        fail(`${dirName}: lib/index.js imports ${name}; move it from devDependencies to dependencies`);
      }
    }
  }
}

async function main() {
  if (!(await exists(pluginsDir))) {
    process.stdout.write("No plugins/ directory.\n");
    return;
  }
  const entries = await readdir(pluginsDir, { withFileTypes: true });
  const plugins = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  if (plugins.length === 0) {
    process.stdout.write("No plugins to check.\n");
    return;
  }
  for (const name of plugins) {
    await checkPlugin(name);
  }
  process.stdout.write(`Checked ${plugins.length} plugin manifest(s).\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
