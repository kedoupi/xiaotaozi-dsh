#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { OFFICIAL_PORT, repoRoot, SANDBOX_PORT, sandboxEnv, sandboxHome } from "./sandbox-home.mjs";

const execFileAsync = promisify(execFile);
const OFFICIAL_LISTEN_PORT = Number.parseInt(OFFICIAL_PORT, 10);
const DEFAULT_FREE_TIMEOUT_MS = 4_000;

export function dshWebArgs(extra = []) {
  const hasPort = extra.some((arg, index) => arg === "--port" || extra[index - 1] === "--port" || arg.startsWith("--port="));
  return ["web", ...(hasPort ? [] : ["--port", SANDBOX_PORT]), ...extra];
}

export function listenPortFromArgs(extra = []) {
  for (let i = 0; i < extra.length; i += 1) {
    const arg = extra[i];
    if (arg === "--port") {
      const port = Number.parseInt(extra[i + 1], 10);
      if (Number.isInteger(port) && port > 0) return port;
    } else if (typeof arg === "string" && arg.startsWith("--port=")) {
      const port = Number.parseInt(arg.slice("--port=".length), 10);
      if (Number.isInteger(port) && port > 0) return port;
    }
  }
  return Number.parseInt(SANDBOX_PORT, 10);
}

export function parseListenPids(stdout) {
  if (typeof stdout !== "string" || !stdout.trim()) return [];
  const pids = new Set();
  for (const token of stdout.split(/\s+/u)) {
    const pid = Number.parseInt(token, 10);
    if (Number.isInteger(pid) && pid > 1) pids.add(pid);
  }
  return [...pids];
}

function sleep(ms, wait = (fn, delay) => setTimeout(fn, delay)) {
  return new Promise((resolvePromise) => wait(resolvePromise, ms));
}

export async function listListenPids(port) {
  try {
    const { stdout } = await execFileAsync("lsof", [
      "-nP",
      `-iTCP:${port}`,
      "-sTCP:LISTEN",
      "-t",
    ], { timeout: 2_000 });
    return parseListenPids(stdout);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error("lsof is required to free the sandbox listen port");
    }
    if (error?.code === 1) return [];
    throw error;
  }
}

export async function freeSandboxListenPort(port, options = {}) {
  const n = Number(port);
  if (!Number.isInteger(n) || n < 1 || n > 65_535) {
    throw new Error(`Invalid sandbox listen port: ${port}`);
  }
  if (n === OFFICIAL_LISTEN_PORT) {
    throw new Error("Refusing to free official port 3080");
  }
  const listPids = options.listPids ?? listListenPids;
  const kill = options.kill ?? ((pid, signal) => process.kill(pid, signal));
  const wait = options.sleep ?? sleep;
  const log = typeof options.log === "function" ? options.log : () => {};
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_FREE_TIMEOUT_MS;
  const selfPid = options.selfPid ?? process.pid;

  const initial = (await listPids(n)).filter((pid) => pid !== selfPid);
  if (initial.length === 0) return [];

  log(`port ${n} in use by pid ${initial.join(", ")}; stopping leftover sandbox`);
  for (const pid of initial) {
    try {
      kill(pid, "SIGTERM");
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const remaining = (await listPids(n)).filter((pid) => pid !== selfPid);
    if (remaining.length === 0) return initial;
    await wait(100);
  }

  const leftover = (await listPids(n)).filter((pid) => pid !== selfPid);
  for (const pid of leftover) {
    try {
      kill(pid, "SIGKILL");
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
  }
  await wait(100);
  const still = (await listPids(n)).filter((pid) => pid !== selfPid);
  if (still.length > 0) {
    throw new Error(`Sandbox port ${n} is still in use by pid ${still.join(", ")}`);
  }
  return initial;
}

export function spawnDshWeb(extra = [], options = {}) {
  const args = dshWebArgs(extra);
  const env = sandboxEnv();
  if (options.quiet !== true) {
    process.stdout.write(`DSH_HOME=${sandboxHome()}\n`);
    process.stdout.write(`dsh ${args.join(" ")}\n`);
  }
  return spawn("dsh", args, {
    cwd: repoRoot,
    env,
    stdio: "inherit",
    // dsh is a .cmd shim on Windows; spawn only resolves it through a shell
    // (same handling as apps/desktop/scripts/bundle-runtime.mjs).
    shell: process.platform === "win32",
    ...options.spawn,
  });
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
  const extra = process.argv.slice(2);
  await freeSandboxListenPort(listenPortFromArgs(extra), {
    log: (message) => process.stdout.write(`${message}\n`),
  });
  const child = spawnDshWeb(extra);
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });
}
