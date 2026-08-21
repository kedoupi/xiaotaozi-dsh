#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function usage() {
  return `Link a plugin into a dsh profile and verify dump-config.

Usage:
  node scripts/link-plugin.mjs [--profile <name>] <slug>

Default profile: dsh-dev
`;
}

function parseArgs(argv) {
  let profile = "dsh-dev";
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") return { help: true };
    if (arg === "--profile") {
      profile = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--profile=")) {
      profile = arg.slice("--profile=".length);
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown flag: ${arg}`);
    }
    positional.push(arg);
  }
  return { profile, slug: positional[0] };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  if (!args.slug) throw new Error(usage());
  if (!args.profile) throw new Error("Missing --profile");

  const slug = args.slug.startsWith("dsh-") ? args.slug.slice(4) : args.slug;
  const dir = join(root, "plugins", slug);
  const pkgPath = join(dir, "package.json");
  if (!(await exists(pkgPath))) {
    throw new Error(`No plugin at plugins/${slug}`);
  }

  const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
  const built = join(dir, "lib", "index.js");
  if (!(await exists(built))) {
    process.stdout.write(`Building ${pkg.name}...\n`);
    run("pnpm", ["--filter", pkg.name, "build"], { cwd: root, stdio: "inherit" });
  }

  process.stdout.write(`Adding ${pkg.name} to profile ${args.profile}...\n`);
  run("dsh", ["plugin", "--profile", args.profile, "add", `./plugins/${slug}`], {
    cwd: root,
    stdio: "inherit",
  });

  const dump = run("dsh", ["--profile", args.profile, "--dump-config"], { cwd: root });
  const layer = `# == ${pkg.name}`;
  if (!dump.includes(layer)) {
    throw new Error(`dump-config missing ${layer}`);
  }
  process.stdout.write(`Verified ${layer} in profile ${args.profile}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
