#!/usr/bin/env node
import { cp, readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function usage() {
  return `Create a new DeepSeek Harness plugin package.

Usage:
  pnpm new <name> [--kind host|mixed]

Examples:
  pnpm new greet
  pnpm new dsh-notify --kind host
  pnpm new sidebar --kind mixed

Name becomes directory plugins/<slug> and package dsh-<slug>.
`;
}

function parseArgs(argv) {
  let kind = "host";
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") return { help: true };
    if (arg === "--kind") {
      kind = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--kind=")) {
      kind = arg.slice("--kind=".length);
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown flag: ${arg}`);
    }
    positional.push(arg);
  }
  return { kind, name: positional[0] };
}

function normalizeName(raw) {
  const trimmed = String(raw ?? "").trim().toLowerCase();
  const slug = trimmed.startsWith("dsh-") ? trimmed.slice(4) : trimmed;
  if (!/^[a-z][a-z0-9-]*$/.test(slug) || slug.includes("--")) {
    throw new Error(`Invalid plugin name "${raw}". Use a lowercase slug like greet or notify-me.`);
  }
  return {
    slug,
    pkg: `dsh-${slug}`,
    id: slug,
    description: `DeepSeek Harness plugin: ${slug}`,
  };
}

async function pathExists(path) {
  try {
    await readdir(path);
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function walkFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(path)));
    } else {
      files.push(path);
    }
  }
  return files;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  if (!args.name) {
    throw new Error(usage());
  }
  if (args.kind !== "host" && args.kind !== "mixed") {
    throw new Error(`Unknown --kind ${args.kind}. Use host or mixed.`);
  }

  const names = normalizeName(args.name);
  const dest = join(root, "plugins", names.slug);
  if (await pathExists(dest)) {
    throw new Error(`Plugin already exists: ${dest}`);
  }

  const template = join(root, "templates", `${args.kind}-plugin`);
  if (!(await pathExists(template))) {
    throw new Error(`Missing template: ${template}`);
  }

  await mkdir(join(root, "plugins"), { recursive: true });
  await cp(template, dest, { recursive: true });

  const replacements = {
    __SLUG__: names.slug,
    __PACKAGE__: names.pkg,
    __ID__: names.id,
    __DESCRIPTION__: names.description,
  };

  for (const file of await walkFiles(dest)) {
    const original = await readFile(file, "utf8");
    let next = original;
    for (const [token, value] of Object.entries(replacements)) {
      next = next.split(token).join(value);
    }
    if (next !== original) {
      await writeFile(file, next);
    }
  }

  process.stdout.write(`Created ${names.pkg} at plugins/${names.slug}

Next: replace the greet sample, keep README.md (EN) and README.zh.md, then see docs/workflow.md
  pnpm install
  pnpm --filter ${names.pkg} test
  pnpm --filter ${names.pkg} build
  node scripts/link-plugin.mjs --profile dsh-dev ${names.slug}
  # Web UI: also --profile web, then pnpm dev
`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
