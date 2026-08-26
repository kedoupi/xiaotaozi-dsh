#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  repoRoot,
  SANDBOX_HOST,
  SANDBOX_PORT,
  SANDBOX_PROCESS_MARKER,
  sandboxAgentsHome,
  sandboxEnv,
  sandboxHome,
} from "./sandbox-home.mjs";

const execFileAsync = promisify(execFile);
const SANDBOX_LISTEN_PORT = Number.parseInt(SANDBOX_PORT, 10);
const DEFAULT_FREE_TIMEOUT_MS = 4_000;

function explicitValues(extra, name) {
  const values = [];
  const flag = `--${name}`;
  for (let i = 0; i < extra.length; i += 1) {
    const arg = extra[i];
    if (arg === flag) {
      if (i + 1 >= extra.length || typeof extra[i + 1] !== "string") {
        throw new Error(`${flag} requires a value`);
      }
      values.push(extra[i + 1]);
      i += 1;
    } else if (typeof arg === "string" && arg.startsWith(`${flag}=`)) {
      values.push(arg.slice(`${flag}=`.length));
    }
  }
  return values;
}

function assertFixedOption(extra, name, expected) {
  const values = explicitValues(extra, name);
  if (values.length > 1) throw new Error(`Specify --${name} at most once`);
  if (values.some((value) => value !== expected)) {
    throw new Error(`Sandbox dsh web is fixed to ${name} ${expected}`);
  }
  return values.length === 1;
}

export function dshWebArgs(extra = []) {
  const hasPort = assertFixedOption(extra, "port", SANDBOX_PORT);
  const hasHost = assertFixedOption(extra, "host", SANDBOX_HOST);
  return [
    "web",
    ...(hasPort ? [] : ["--port", SANDBOX_PORT]),
    ...(hasHost ? [] : ["--host", SANDBOX_HOST]),
    ...extra,
  ];
}

export function listenPortFromArgs(extra = []) {
  assertFixedOption(extra, "port", SANDBOX_PORT);
  assertFixedOption(extra, "host", SANDBOX_HOST);
  return SANDBOX_LISTEN_PORT;
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

export async function listListenPids(port, platform = process.platform) {
  const listenPort = Number(port);
  if (!Number.isInteger(listenPort) || listenPort < 1 || listenPort > 65_535) {
    throw new Error(`Invalid listen port: ${port}`);
  }
  if (platform === "win32") {
    const script = [
      "$ErrorActionPreference = 'Stop'",
      `@(Get-NetTCPConnection -LocalPort ${listenPort} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess) -join [Environment]::NewLine`,
    ].join("; ");
    try {
      const { stdout } = await execFileAsync("powershell.exe", [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        script,
      ], { timeout: 2_000 });
      return parseListenPids(stdout);
    } catch (error) {
      throw new Error(`Cannot safely inspect sandbox port ${listenPort} on Windows: ${error.message}`, { cause: error });
    }
  }
  try {
    const { stdout } = await execFileAsync("lsof", [
      "-nP",
      `-iTCP:${listenPort}`,
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

function parseCwd(stdout) {
  if (typeof stdout !== "string") return null;
  const line = stdout.split(/\r?\n/u).find((item) => item.startsWith("n"));
  return line?.slice(1) || null;
}

export async function inspectSandboxProcess(pid, platform = process.platform) {
  if (platform === "win32") {
    throw new Error("Windows cannot reliably verify a listener's cwd and sandbox environment");
  }
  try {
    const [{ stdout: command }, { stdout: cwdOutput }] = await Promise.all([
      execFileAsync("ps", ["eww", "-p", String(pid), "-o", "command="], { timeout: 2_000 }),
      execFileAsync("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], { timeout: 2_000 }),
    ]);
    return { command: command.trim(), cwd: parseCwd(cwdOutput) };
  } catch (error) {
    throw new Error(`Cannot safely inspect sandbox listener pid ${pid}: ${error.message}`, { cause: error });
  }
}

export function isSandboxDshProcess(info, options = {}) {
  const port = options.port ?? SANDBOX_LISTEN_PORT;
  const root = resolve(options.repoRoot ?? repoRoot);
  const marker = options.marker ?? SANDBOX_PROCESS_MARKER;
  if (port !== SANDBOX_LISTEN_PORT || typeof info?.command !== "string" || typeof info?.cwd !== "string") {
    return false;
  }
  if (resolve(info.cwd) !== root) return false;
  const command = info.command;
  const isDsh = /(?:^|[\s/\\])dsh(?:\.cmd)?(?:[\s/\\]|$)|@deepseek-ai[/+\\]dsh|[/\\]dsh[/\\]lib[/\\]bin\.js/iu.test(command);
  const isWeb = /(?:^|\s)web(?:\s|$)/u.test(command);
  const isSandboxPort = new RegExp(`(?:^|\\s)--port(?:=|\\s+)["']?${SANDBOX_PORT}(?:["']?(?:\\s|$))`, "u").test(command);
  const isSandboxHost = new RegExp(`(?:^|\\s)--host(?:=|\\s+)["']?${SANDBOX_HOST.replaceAll(".", "\\.")}(?:["']?(?:\\s|$))`, "u").test(command);
  const hasMarker = command.includes(`XIAOTAOZI_DSH_SANDBOX=${marker}`);
  return isDsh && isWeb && isSandboxPort && isSandboxHost && hasMarker;
}

async function assertOwnedSandboxPids(pids, port, verifyPid) {
  const unknown = [];
  for (const pid of pids) {
    let owned = false;
    try {
      owned = await verifyPid(pid, port);
    } catch (error) {
      throw new Error(`Cannot safely verify listener pid ${pid}; refusing to stop it: ${error.message}`, { cause: error });
    }
    if (!owned) unknown.push(pid);
  }
  if (unknown.length > 0) {
    throw new Error(`Sandbox port ${port} is owned by an unknown listener (pid ${unknown.join(", ")}); refusing to stop it`);
  }
}

export async function freeSandboxListenPort(port, options = {}) {
  const n = Number(port);
  if (n !== SANDBOX_LISTEN_PORT) {
    throw new Error(`Refusing to free port ${port}; the sandbox is fixed to ${SANDBOX_PORT}`);
  }
  const listPids = options.listPids ?? listListenPids;
  const verifyPid = options.verifyPid ?? (async (pid) => isSandboxDshProcess(await inspectSandboxProcess(pid), { port: n }));
  const kill = options.kill ?? ((pid, signal) => process.kill(pid, signal));
  const wait = options.sleep ?? sleep;
  const log = typeof options.log === "function" ? options.log : () => {};
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_FREE_TIMEOUT_MS;
  const selfPid = options.selfPid ?? process.pid;

  const initial = (await listPids(n)).filter((pid) => pid !== selfPid);
  if (initial.length === 0) return [];
  await assertOwnedSandboxPids(initial, n, verifyPid);

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
  await assertOwnedSandboxPids(leftover, n, verifyPid);
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
    process.stdout.write(`DSH_AGENTS_HOME=${sandboxAgentsHome()}\n`);
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
