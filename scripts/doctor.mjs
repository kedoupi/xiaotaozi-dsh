#!/usr/bin/env node
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { access, readdir, readFile, realpath } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { repoRoot, sandboxHome } from "./sandbox-home.mjs";

function usage() {
  return `Check Harness homes for workspace and externals links.

Usage:
  node scripts/doctor.mjs [--home <path>]

Default daily home: ~/.dsh
Also scans the repo sandbox .dsh-home.
Does not modify anything.
Exit 1 if a daily profile depends on this repo, or if a sandbox profile
link:s anything under externals/.
`;
}

export function parseArgs(argv) {
  let home = join(homedir(), ".dsh");
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") return { help: true };
    if (arg === "--home") {
      const value = argv[i + 1];
      if (value === undefined || value === "" || value.startsWith("-")) {
        throw new Error("--home requires a non-empty path");
      }
      home = value;
      i += 1;
      continue;
    }
    if (arg.startsWith("--home=")) {
      const value = arg.slice("--home=".length);
      if (value === "") throw new Error("--home requires a non-empty path");
      home = value;
      continue;
    }
    throw new Error(`Unknown flag: ${arg}`);
  }
  return { home: resolve(home) };
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function localLinkTarget(spec, pkgPath) {
  if (typeof spec !== "string" || (!spec.startsWith("link:") && !spec.startsWith("file:"))) return undefined;
  const raw = spec.slice(spec.indexOf(":") + 1);
  if (raw === "") return undefined;
  let decoded;
  try {
    decoded = spec.startsWith("file://") ? fileURLToPath(spec) : decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  return resolve(dirname(pkgPath), decoded);
}

async function canonicalPath(path) {
  try {
    return await realpath(path);
  } catch {
    return resolve(path);
  }
}

export function isPathContained(path, root) {
  const rel = relative(resolve(root), resolve(path));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export async function classifyLocalLink(spec, pkgPath, root) {
  const target = localLinkTarget(spec, pkgPath);
  if (target === undefined) return { workspace: false, externals: false };
  const [candidate, workspaceRoot, externalsRoot] = await Promise.all([
    canonicalPath(target),
    canonicalPath(root),
    canonicalPath(join(root, "externals")),
  ]);
  return {
    workspace: isPathContained(candidate, workspaceRoot),
    externals: isPathContained(candidate, externalsRoot),
  };
}

async function collectProfileHits(home, classify) {
  const profilesDir = join(home, "profiles");
  if (!(await exists(profilesDir))) return [];
  const entries = await readdir(profilesDir, { withFileTypes: true });
  const hits = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const pkgPath = join(profilesDir, entry.name, "package.json");
    if (!(await exists(pkgPath))) continue;
    const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
    const deps = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
      ...(pkg.optionalDependencies ?? {}),
    };
    for (const [name, spec] of Object.entries(deps)) {
      if (await classify(spec, pkgPath)) hits.push({ profile: entry.name, name, spec });
    }
  }
  return hits;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const dailyHome = args.home;
  const root = repoRoot;
  let failed = false;

  if (!(await exists(dailyHome))) {
    process.stdout.write(`Daily home not found: ${dailyHome}\n`);
  } else {
    const dailyHits = await collectProfileHits(dailyHome, async (spec, pkgPath) => (
      await classifyLocalLink(spec, pkgPath, root)
    ).workspace);
    if (dailyHits.length === 0) {
      process.stdout.write(`Daily home ${dailyHome} is not linked to ${root}\n`);
    } else {
      failed = true;
      process.stderr.write("Daily Harness is linked to this workspace.\n");
      process.stderr.write(`  home: ${dailyHome}\n`);
      process.stderr.write(`  repo: ${root}\n`);
      process.stderr.write("Uninstall those link: deps and add git path instead.\n");
      process.stderr.write("Do not run: dsh plugin --profile web add ./plugins/<slug>\n\n");
      for (const hit of dailyHits) {
        process.stderr.write(`  profile ${hit.profile}: ${hit.name} = ${hit.spec}\n`);
      }
    }
  }

  const sandbox = sandboxHome();
  const externalHits = await collectProfileHits(sandbox, async (spec, pkgPath) => (
    await classifyLocalLink(spec, pkgPath, root)
  ).externals);
  if (externalHits.length === 0) {
    process.stdout.write(`Sandbox ${sandbox} does not link externals/\n`);
  } else {
    failed = true;
    process.stderr.write("Sandbox profile links a path under externals/. Do not vendor third-party trees.\n");
    process.stderr.write(`  home: ${sandbox}\n`);
    process.stderr.write("Remove those link: deps. List the plugin in the market catalog instead.\n\n");
    for (const hit of externalHits) {
      process.stderr.write(`  profile ${hit.profile}: ${hit.name} = ${hit.spec}\n`);
    }
  }

  if (failed) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
