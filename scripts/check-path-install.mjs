#!/usr/bin/env node
import { spawn } from "node:child_process";
import { access, cp, lstat, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pluginsDir = join(root, "plugins");
const dependencyBags = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
const excludedNames = new Set(["node_modules", "lib", ".git"]);

function usage() {
  return `Simulate standalone Git path installs for plugin packages.

Usage:
  node scripts/check-path-install.mjs [--plugin <slug>]

Copies each selected plugin to os.tmpdir(), rejects workspace/local dependency
escapes, runs pnpm install --ignore-workspace so prepare builds lib/, validates
package files, and always removes the isolated directory.
`;
}

export function parseArgs(argv) {
  let plugin;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") return { help: true };
    if (arg === "--") continue;
    if (arg === "--plugin") {
      const value = argv[index + 1];
      if (value === undefined || value === "" || value.startsWith("-")) {
        throw new Error("--plugin requires a non-empty slug");
      }
      plugin = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--plugin=")) {
      plugin = arg.slice("--plugin=".length);
      if (plugin === "") throw new Error("--plugin requires a non-empty slug");
      continue;
    }
    throw new Error(`Unknown flag: ${arg}`);
  }
  if (plugin?.startsWith("dsh-")) plugin = plugin.slice(4);
  if (plugin !== undefined && (!/^[a-z][a-z0-9-]*$/u.test(plugin) || plugin.includes("--"))) {
    throw new Error(`Invalid plugin slug: ${plugin}`);
  }
  return { plugin };
}

export function localDependencyEscapes(pkg) {
  const hits = [];
  for (const bagName of dependencyBags) {
    for (const [name, rawSpec] of Object.entries(pkg[bagName] ?? {})) {
      const spec = typeof rawSpec === "string" ? rawSpec : rawSpec?.version;
      if (typeof spec === "string" && /^(?:workspace|link|file):/u.test(spec)) {
        hits.push(`${bagName}.${name}=${spec}`);
      }
    }
  }
  return hits;
}

export function isSafePackagePath(path) {
  if (typeof path !== "string" || path === "" || isAbsolute(path)) return false;
  const normalized = path.replaceAll("\\", "/").replace(/^\.\/+/u, "");
  return normalized.split("/").every((segment) => segment !== "..");
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function assertNoSymlinks(dir, base = dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) {
      throw new Error(`${relative(base, path)}: symbolic links are not allowed in isolated path installs`);
    }
    if (stat.isDirectory()) await assertNoSymlinks(path, base);
  }
}

/**
 * Every file path the manifest promises to ship: package.json, main, files[],
 * and all string leaves of exports (including nested conditional objects).
 */
export function packageFilePaths(pkg) {
  const paths = new Set(["package.json"]);
  if (typeof pkg.main === "string") paths.add(pkg.main);
  for (const path of pkg.files ?? []) {
    if (typeof path === "string") paths.add(path);
  }
  const visit = (target) => {
    if (typeof target === "string") {
      paths.add(target);
    } else if (Array.isArray(target)) {
      for (const item of target) visit(item);
    } else if (target !== null && typeof target === "object") {
      for (const value of Object.values(target)) visit(value);
    }
  };
  visit(pkg.exports ?? {});
  return [...paths];
}

async function assertPackageFiles(dir, pkg) {
  for (const path of packageFilePaths(pkg)) {
    if (!isSafePackagePath(path)) throw new Error(`${pkg.name}: unsafe package path ${JSON.stringify(path)}`);
    if (!(await exists(join(dir, path)))) throw new Error(`${pkg.name}: package file is missing after prepare: ${path}`);
  }
  if (!(await exists(join(dir, "lib", "index.js")))) {
    throw new Error(`${pkg.name}: prepare did not create lib/index.js`);
  }
}

export function runCommand(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} ${args.join(" ")} failed (${signal ?? `exit ${code}`})`));
    });
  });
}

async function checkPlugin(slug) {
  const source = join(pluginsDir, slug);
  const pkgPath = join(source, "package.json");
  if (!(await exists(pkgPath))) throw new Error(`No plugin at plugins/${slug}`);
  const sourcePkg = JSON.parse(await readFile(pkgPath, "utf8"));
  const escapes = localDependencyEscapes(sourcePkg);
  if (escapes.length > 0) {
    throw new Error(`${sourcePkg.name}: local dependency escapes are forbidden:\n  ${escapes.join("\n  ")}`);
  }
  if (typeof sourcePkg.scripts?.prepare !== "string" || sourcePkg.scripts.prepare.trim() === "") {
    throw new Error(`${sourcePkg.name}: scripts.prepare is required for Git path installs`);
  }

  const temporaryRoot = await mkdtemp(join(tmpdir(), `dsh-path-${slug}-`));
  const isolatedRepo = join(temporaryRoot, "repo");
  const isolated = join(isolatedRepo, "plugins", slug);
  try {
    await mkdir(dirname(isolated), { recursive: true });
    await cp(source, isolated, {
      recursive: true,
      filter: (path) => !excludedNames.has(basename(path)),
    });
    await assertNoSymlinks(isolated);
    await mkdir(join(temporaryRoot, "config"), { recursive: true });
    const npmrc = join(temporaryRoot, "empty.npmrc");
    await writeFile(npmrc, "", "utf8");
    const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    process.stdout.write(`Checking ${sourcePkg.name} in ${temporaryRoot}\n`);
    await runCommand(pnpm, [
      "install",
      "--ignore-workspace",
      "--no-frozen-lockfile",
      "--config.auto-install-peers=false",
      "--config.strict-dep-builds=false",
    ], {
      cwd: isolated,
      env: {
        ...process.env,
        CI: "true",
        DSH_HOME: join(temporaryRoot, ".dsh-unused"),
        XDG_CONFIG_HOME: join(temporaryRoot, "config"),
        npm_config_userconfig: npmrc,
        npm_config_update_notifier: "false",
      },
    });
    const installedPkg = JSON.parse(await readFile(join(isolated, "package.json"), "utf8"));
    await assertPackageFiles(isolated, installedPkg);
    process.stdout.write(`Verified standalone path install: ${sourcePkg.name}\n`);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  const entries = await readdir(pluginsDir, { withFileTypes: true });
  const plugins = args.plugin === undefined
    ? entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
    : [args.plugin];
  for (const slug of plugins) await checkPlugin(slug);
  process.stdout.write(`Checked ${plugins.length} standalone Git path install(s).\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
