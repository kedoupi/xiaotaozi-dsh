#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { access, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
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

export function xtzCliPath() {
  return join(repoRoot, "apps/cli/lib/cli.js");
}

function skipFlag(extra, index, name) {
  const arg = extra[index];
  if (arg === `--${name}`) return index + 2;
  if (typeof arg === "string" && arg.startsWith(`--${name}=`)) return index + 1;
  return index;
}

export function xtzSandboxArgs(extra = []) {
  listenPortFromArgs(extra);
  const xtzFlags = [];
  const passthrough = [];
  for (let i = 0; i < extra.length; i += 1) {
    const arg = extra[i];
    const afterPort = skipFlag(extra, i, "port");
    if (afterPort !== i) {
      i = afterPort - 1;
      continue;
    }
    const afterHost = skipFlag(extra, i, "host");
    if (afterHost !== i) {
      i = afterHost - 1;
      continue;
    }
    if (arg === "--no-open" || arg === "--foreground") {
      if (!xtzFlags.includes(arg)) xtzFlags.push(arg);
      continue;
    }
    passthrough.push(arg);
  }
  if (!xtzFlags.includes("--foreground")) xtzFlags.unshift("--foreground");
  const args = ["--sandbox", "start", ...xtzFlags];
  if (passthrough.length > 0) args.push("--", ...passthrough);
  return args;
}

function nodeSatisfiesEngine(version, floor) {
  const parsed = /^(\d+)\.(\d+)\.(\d+)\b/u.exec(String(version).trim());
  const floorParts = /^(\d+)\.(\d+)\.(\d+)$/u.exec(String(floor).trim());
  if (!parsed || !floorParts) return false;
  const major = Number(parsed[1]);
  const minor = Number(parsed[2]);
  const patch = Number(parsed[3]);
  const floorMajor = Number(floorParts[1]);
  const floorMinor = Number(floorParts[2]);
  const floorPatch = Number(floorParts[3]);
  if (major === floorMajor) {
    if (minor !== floorMinor) return minor > floorMinor;
    return patch >= floorPatch;
  }
  return major >= 24;
}

export async function pinnedNodePath() {
  const raw = JSON.parse(await readFile(join(repoRoot, "versions.json"), "utf8"));
  const expected = raw?.node;
  if (typeof expected !== "string" || expected.length === 0) {
    throw new Error("versions.json 缺少 node");
  }
  if (nodeSatisfiesEngine(process.versions.node, expected)) return process.execPath;
  try {
    const { stdout } = await execFileAsync("fnm", [
      "exec",
      `--using=${expected}`,
      "--",
      "node",
      "-p",
      "process.execPath",
    ], { timeout: 8_000 });
    const found = stdout.trim().split(/\r?\n/u).filter((line) => line.startsWith("/") || /^[A-Za-z]:[\\/]/u.test(line)).at(-1);
    if (typeof found === "string" && found.length > 0) return found;
  } catch {
    // try FNM_DIR layout next
  }
  const fnmDir = process.env.FNM_DIR;
  if (typeof fnmDir === "string" && fnmDir.length > 0) {
    const candidate = join(
      fnmDir,
      "node-versions",
      `v${expected}`,
      "installation",
      "bin",
      process.platform === "win32" ? "node.exe" : "node",
    );
    try {
      await access(candidate);
      return candidate;
    } catch {
      // fall through
    }
  }
  throw new Error(`沙箱 xtz 需要 Node.js ^${expected} 或 >=24；当前是 ${process.versions.node}。请先安装（fnm install ${expected} 或 Node 24+）。`);
}

export async function ensureXtzCli(options = {}) {
  const cliDir = join(repoRoot, "apps/cli");
  const cliJs = xtzCliPath();
  const dshPkg = join(cliDir, "node_modules", "@deepseek-ai", "dsh", "package.json");
  const log = typeof options.log === "function" ? options.log : () => {};
  const run = options.run ?? (async (args) => {
    await new Promise((resolvePromise, reject) => {
      const child = spawn("pnpm", args, {
        cwd: cliDir,
        env: sandboxEnv(),
        stdio: "inherit",
        shell: process.platform === "win32",
      });
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        if (signal) reject(new Error(`pnpm ${args.join(" ")} 被信号 ${signal} 中断`));
        else if (code !== 0) reject(new Error(`pnpm ${args.join(" ")} 失败（${code}）`));
        else resolvePromise();
      });
    });
  });
  try {
    await access(dshPkg);
  } catch {
    log("installing apps/cli");
    await run(["install"]);
  }
  let build = false;
  try {
    const lib = await stat(cliJs);
    const sources = await Promise.all([
      stat(join(cliDir, "package.json")),
      stat(join(cliDir, "src/app.ts")),
      stat(join(cliDir, "src/cli.ts")),
    ]);
    build = sources.some((source) => source.mtimeMs > lib.mtimeMs);
  } catch {
    build = true;
  }
  if (build) {
    log("building apps/cli");
    await run(["build"]);
  }
  return cliJs;
}

export function spawnSandboxWeb(extra = [], options = {}) {
  const cliJs = options.cliJs ?? xtzCliPath();
  const nodePath = options.nodePath ?? process.execPath;
  const args = xtzSandboxArgs(extra);
  const env = sandboxEnv();
  if (options.quiet !== true) {
    process.stdout.write(`DSH_HOME=${sandboxHome()}\n`);
    process.stdout.write(`DSH_AGENTS_HOME=${sandboxAgentsHome()}\n`);
    process.stdout.write(`${nodePath} ${cliJs} ${args.join(" ")}\n`);
  }
  const detached = options.detached ?? process.platform !== "win32";
  return spawn(nodePath, [cliJs, ...args], {
    cwd: repoRoot,
    env,
    stdio: "inherit",
    detached,
    shell: false,
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
  const [cliJs, nodePath] = await Promise.all([ensureXtzCli(), pinnedNodePath()]);
  const child = spawnSandboxWeb(extra, { cliJs, nodePath });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });
}
