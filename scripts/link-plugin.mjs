#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { repoRoot, sandboxEnv, sandboxHome } from "./sandbox-home.mjs";

function usage() {
  return `Link a plugin into the sandbox dsh profile and verify dump-config.

Usage:
  node scripts/link-plugin.mjs [--profile <name>] <slug>

Default profile: dsh-dev
Sandbox home: ${sandboxHome()}
Does not touch ~/.dsh.
`;
}

export function parseArgs(argv) {
  let profile = "dsh-dev";
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") return { help: true };
    if (arg === "--profile") {
      const value = argv[i + 1];
      if (value === undefined || value === "" || value.startsWith("-")) {
        throw new Error("--profile requires a non-empty profile name");
      }
      profile = value;
      i += 1;
      continue;
    }
    if (arg.startsWith("--profile=")) {
      const value = arg.slice("--profile=".length);
      if (value === "") throw new Error("--profile requires a non-empty profile name");
      profile = value;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown flag: ${arg}`);
    }
    positional.push(arg);
  }
  if (positional.length !== 1) {
    throw new Error(positional.length === 0 ? "Missing plugin slug" : "Expected exactly one plugin slug");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(profile) || profile.includes("..")) {
    throw new Error(`Invalid profile name: ${profile}`);
  }
  const input = positional[0];
  const slug = input.startsWith("dsh-") ? input.slice(4) : input;
  if (!/^[a-z][a-z0-9-]*$/u.test(slug) || slug.includes("--")) {
    throw new Error(`Invalid plugin slug: ${input}`);
  }
  return { profile, slug };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: sandboxEnv(),
    cwd: repoRoot,
    // pnpm/dsh are .cmd shims on Windows; spawnSync only resolves them
    // through a shell; spawnSync only resolves .cmd shims that way.
    shell: process.platform === "win32",
    ...options,
  });
  if (result.status !== 0) {
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    throw new Error(output || `${command} ${args.join(" ")} failed`);
  }
  return result.stdout ?? "";
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  const slug = args.slug;
  const dir = join(repoRoot, "plugins", slug);
  const pkgPath = join(dir, "package.json");
  if (!(await exists(pkgPath))) {
    throw new Error(`No plugin at plugins/${slug}`);
  }

  const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
  process.stdout.write(`Building ${pkg.name}...\n`);
  run("pnpm", ["--filter", pkg.name, "build"], { stdio: "inherit" });

  process.stdout.write(`DSH_HOME=${sandboxHome()}\n`);
  process.stdout.write(`Adding ${pkg.name} to sandbox profile ${args.profile}...\n`);
  run("dsh", ["plugin", "--profile", args.profile, "add", `./plugins/${slug}`], {
    stdio: "inherit",
  });

  const dump = run("dsh", ["--profile", args.profile, "--dump-config"]);
  const layer = `# == ${pkg.name}`;
  if (!dump.includes(layer)) {
    throw new Error(`dump-config missing ${layer}`);
  }
  process.stdout.write(`Verified ${layer} in sandbox profile ${args.profile}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
