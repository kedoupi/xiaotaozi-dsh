#!/usr/bin/env node
import { createHash } from "node:crypto";
import { watch } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { repoRoot, sandboxEnv } from "./sandbox-home.mjs";
import { freeSandboxListenPort, listenPortFromArgs, spawnDshWeb } from "./sandbox-web.mjs";

export const HOST_RESTART_DEBOUNCE_MS = 800;
export const PLUGIN_SLUG = /^[a-z][a-z0-9-]*$/u;

const PLUGINS_ROOT = join(repoRoot, "plugins");

export function usage() {
  return `Sandbox dsh web on port 3081 with plugin watch.

Usage:
  node scripts/sandbox-dev.mjs [--once] [--filter <slug[,slug]>] [--open] [dsh web args...]

Default: build, tsdown --watch on plugins, start dsh web --no-open.
Client lib/client.js rebuilds stay in-process (HMR; hard-refresh if the UI did not update).
Host lib/index.js or cordis.patch.yml content changes restart dsh web.

  --once     Build once and start dsh web. No watch, no auto-restart.
  --filter   Only build/watch these plugin directory names (comma or repeat).
  --open     Do not pass --no-open to dsh web.
  --help     Print this message.

Stops leftover listeners on 3081 before start. Never touches official 3080 or ~/.dsh.
Does not relaunch after you kill this process.
`;
}

export function normalizePluginSlug(value) {
  if (typeof value !== "string") throw new Error("Plugin slug is required");
  const raw = value.trim();
  if (!raw) throw new Error("Plugin slug is required");
  const slug = raw.startsWith("dsh-") ? raw.slice(4) : raw;
  if (!PLUGIN_SLUG.test(slug) || slug.includes("--")) {
    throw new Error(`Invalid plugin slug: ${value}`);
  }
  return slug;
}

function pushFilters(filters, value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("--filter requires a plugin slug or comma list");
  }
  for (const part of value.split(",")) {
    filters.push(normalizePluginSlug(part));
  }
}

export function parseSandboxDevArgs(argv) {
  let once = false;
  let open = false;
  const filters = [];
  const extra = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") return { help: true };
    if (arg === "--once") {
      once = true;
      continue;
    }
    if (arg === "--open") {
      open = true;
      continue;
    }
    if (arg === "--filter") {
      const value = argv[i + 1];
      if (value === undefined || value === "" || value.startsWith("-")) {
        throw new Error("--filter requires a plugin slug or comma list");
      }
      pushFilters(filters, value);
      i += 1;
      continue;
    }
    if (arg.startsWith("--filter=")) {
      pushFilters(filters, arg.slice("--filter=".length));
      continue;
    }
    extra.push(arg);
  }
  const hasNoOpen = extra.some((arg) => arg === "--no-open" || arg.startsWith("--no-open="));
  if (!open && !hasNoOpen) extra.unshift("--no-open");
  return { once, open, filters, extra };
}

export function classifyWatchedPath(filePath, pluginsRoot = PLUGINS_ROOT) {
  if (typeof filePath !== "string" || !filePath) return "ignore";
  const rel = relative(resolve(pluginsRoot), resolve(filePath));
  if (!rel || rel.startsWith("..") || rel.startsWith(sep)) return "ignore";
  const parts = rel.split(sep);
  if (parts.includes("node_modules") || parts.includes(".git")) return "ignore";
  if (parts.length < 2) return "ignore";
  const rest = parts.slice(1).join("/");
  if (rest === "lib/client.js") return "client";
  if (rest === "lib/index.js" || rest === "cordis.patch.yml") return "host";
  return "ignore";
}

export function createChangeTracker() {
  const hashes = new Map();
  return {
    seed(path, hash) {
      if (typeof path === "string" && path) hashes.set(path, hash);
    },
    apply(path, kind, hash) {
      if (kind === "ignore" || typeof path !== "string" || !path) return "ignore";
      const previous = hashes.get(path);
      hashes.set(path, hash);
      if (hash === previous) return "unchanged";
      if (kind === "client") return "client";
      if (kind === "host") return "host";
      return "ignore";
    },
  };
}

export function createDebouncer(fn, delayMs, timers = globalThis) {
  let timer;
  const schedule = () => {
    timers.clearTimeout(timer);
    timer = timers.setTimeout(() => {
      timer = undefined;
      fn();
    }, delayMs);
  };
  const cancel = () => {
    timers.clearTimeout(timer);
    timer = undefined;
  };
  return { schedule, cancel };
}

export function pnpmFilterArgs(slugs = []) {
  if (!Array.isArray(slugs) || slugs.length === 0) return ["--filter", "./plugins/**"];
  return slugs.flatMap((slug) => ["--filter", `dsh-${normalizePluginSlug(slug)}`]);
}

export async function listWatchablePlugins(pluginsRoot = PLUGINS_ROOT, slugs = []) {
  const root = pluginsRoot ?? PLUGINS_ROOT;
  const entries = await readdir(root, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !PLUGIN_SLUG.test(entry.name)) continue;
    try {
      const info = await stat(join(root, entry.name, "tsdown.config.ts"));
      if (info.isFile()) found.push(entry.name);
    } catch {
      // skip packages without tsdown
    }
  }
  found.sort();
  if (!slugs.length) return found;
  const wanted = [...new Set(slugs.map(normalizePluginSlug))];
  const missing = wanted.filter((slug) => !found.includes(slug));
  if (missing.length > 0) {
    throw new Error(`Unknown plugin filter: ${missing.join(", ")}`);
  }
  return wanted;
}

export async function fileHash(path) {
  try {
    const bytes = await readFile(path);
    return createHash("sha256").update(bytes).digest("hex");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function log(message) {
  process.stdout.write(`[sandbox-dev] ${message}\n`);
}

function spawnPnpm(args) {
  return spawn("pnpm", args, {
    cwd: repoRoot,
    env: sandboxEnv(),
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

function waitForChild(child) {
  return new Promise((resolvePromise) => {
    child.once("exit", (code, signal) => resolvePromise({ code, signal }));
  });
}

function stopChild(child, signal = "SIGTERM") {
  if (!child || child.killed || child.exitCode !== null) return;
  child.kill(signal);
}

function exitWith(code, signal) {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
}

async function runPnpm(args) {
  const child = spawnPnpm(args);
  const { code, signal } = await waitForChild(child);
  if (signal) exitWith(1, signal);
  if (code !== 0) process.exit(code ?? 1);
}

async function seedHashes(plugins, tracker) {
  for (const slug of plugins) {
    const dir = join(PLUGINS_ROOT, slug);
    for (const rel of ["lib/index.js", "cordis.patch.yml", "lib/client.js"]) {
      const path = join(dir, rel);
      tracker.seed(path, await fileHash(path));
    }
  }
}

async function killAndWait(child, timeoutMs = 4_000) {
  if (!child || child.exitCode !== null) return;
  const exited = waitForChild(child);
  stopChild(child, "SIGTERM");
  const result = await Promise.race([
    exited.then((value) => ({ ...value, timedOut: false })),
    new Promise((resolvePromise) => {
      setTimeout(() => resolvePromise({ timedOut: true }), timeoutMs);
    }),
  ]);
  if (result.timedOut) {
    stopChild(child, "SIGKILL");
    await exited;
  }
}

async function main() {
  let parsed;
  try {
    parsed = parseSandboxDevArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n${usage()}`);
    process.exit(1);
  }
  if (parsed.help) {
    process.stdout.write(usage());
    return;
  }

  const plugins = await listWatchablePlugins(PLUGINS_ROOT, parsed.filters);
  const filterArgs = pnpmFilterArgs(parsed.filters);
  const listenPort = listenPortFromArgs(parsed.extra);
  if (parsed.filters.length === 0) await runPnpm(["build"]);
  else await runPnpm([...filterArgs, "build"]);
  await freeSandboxListenPort(listenPort, { log });

  if (parsed.once) {
    const child = spawnDshWeb(parsed.extra);
    child.on("exit", (code, signal) => exitWith(code, signal));
    return;
  }

  log(`watching ${plugins.join(", ")}`);
  const tracker = createChangeTracker();
  await seedHashes(plugins, tracker);

  let webChild;
  let restarting = false;
  let pendingRestart = false;
  let shuttingDown = false;
  const watchers = [];
  const watchChild = spawnPnpm([...filterArgs, "--parallel", "exec", "tsdown", "--watch"]);

  const startWeb = () => {
    webChild = spawnDshWeb(parsed.extra);
    webChild.on("error", (error) => {
      log(`dsh web spawn failed: ${error.message}`);
    });
    webChild.on("exit", (code, signal) => {
      webChild = null;
      if (shuttingDown || restarting) return;
      log("dsh web exited; not relaunching");
      void shutdown(code ?? 1, signal);
    });
  };

  const restartWeb = async () => {
    if (shuttingDown) return;
    if (restarting) {
      pendingRestart = true;
      return;
    }
    restarting = true;
    do {
      pendingRestart = false;
      log("host plugin changed — restarting dsh web (IM sockets will reconnect)");
      await killAndWait(webChild);
      if (!shuttingDown) startWeb();
    } while (pendingRestart && !shuttingDown);
    restarting = false;
  };

  const hostDebounce = createDebouncer(() => {
    void restartWeb();
  }, HOST_RESTART_DEBOUNCE_MS);

  const onFsEvent = async (filePath) => {
    if (shuttingDown) return;
    try {
      const kind = classifyWatchedPath(filePath);
      if (kind === "ignore") return;
      const hash = await fileHash(filePath);
      const action = tracker.apply(filePath, kind, hash);
      if (action === "client") {
        log(`${relative(repoRoot, filePath)} rebuilt (HMR; hard-refresh if the UI did not update)`);
        return;
      }
      if (action === "host") hostDebounce.schedule();
    } catch (error) {
      if (error?.code === "ENOENT") return;
      log(`watch apply failed: ${error.message}`);
    }
  };

  for (const slug of plugins) {
    const dir = join(PLUGINS_ROOT, slug);
    const watcher = watch(dir, { recursive: true }, (_event, filename) => {
      if (!filename) return;
      void onFsEvent(join(dir, filename.toString()));
    });
    watcher.on("error", (error) => {
      log(`watch error (${slug}): ${error.message}`);
    });
    watchers.push(watcher);
  }

  const shutdown = async (code = 0, signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    hostDebounce.cancel();
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
    for (const watcher of watchers) watcher.close();
    stopChild(watchChild);
    await killAndWait(webChild);
    await killAndWait(watchChild, 2_000);
    if (signal === "SIGINT" || signal === "SIGTERM") process.exit(0);
    exitWith(code, signal);
  };

  watchChild.on("error", (error) => {
    log(`watch spawn failed: ${error.message}`);
    void shutdown(1);
  });
  watchChild.on("exit", (code, signal) => {
    if (shuttingDown) return;
    log("plugin watch exited; stopping sandbox");
    void shutdown(code ?? 1, signal);
  });

  process.on("SIGINT", () => {
    void shutdown(0, "SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown(0, "SIGTERM");
  });

  startWeb();
}

function isCli() {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (isCli()) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exit(1);
  });
}
