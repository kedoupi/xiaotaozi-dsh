import { execFile, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { constants as osConstants } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { officialDshEnv } from "./home";

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
  signal: NodeJS.Signals | null;
}

export interface RunDshOptions {
  capture?: boolean;
  cwd?: string;
}

export interface SpawnedDsh {
  pid: number;
  identity?: string;
  closed?: Promise<{ code: number; signal: NodeJS.Signals | null }>;
}

export type StopProcessResult =
  | "stopped"
  | "not-running"
  | "identity-mismatch"
  | "identity-unavailable";

interface DshLaunch {
  command: string;
  prefixArgs: string[];
}

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function execFileText(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  timeoutMs = 5_000,
): Promise<string | null> {
  return new Promise((resolveText) => {
    execFile(
      command,
      args,
      { encoding: "utf8", timeout: timeoutMs, windowsHide: true, maxBuffer: 16 * 1024, env },
      (error, stdout) => {
        if (error) {
          resolveText(null);
          return;
        }
        const text = String(stdout ?? "").trim().replace(/\s+/g, " ");
        resolveText(text.length > 0 ? text : null);
      },
    );
  });
}

async function readLinuxProcessIdentity(pid: number): Promise<string | null> {
  try {
    const [stat, bootId] = await Promise.all([
      readFile(`/proc/${pid}/stat`, "utf8"),
      readFile("/proc/sys/kernel/random/boot_id", "utf8"),
    ]);
    const commandEnd = stat.lastIndexOf(")");
    if (commandEnd < 0) return null;
    // Fields following the command begin at field 3 (state). Start time is
    // field 22, therefore index 19 in this suffix.
    const fields = stat.slice(commandEnd + 1).trim().split(/\s+/);
    const startTime = fields[19];
    const boot = bootId.trim();
    if (!/^\d+$/.test(startTime ?? "") || boot.length === 0) return null;
    return `linux:${boot}:${startTime}`;
  } catch {
    return null;
  }
}

/** GHA windows-latest often spends >5s launching powershell.exe the first time. */
const WINDOWS_IDENTITY_TIMEOUT_MS = 25_000;

/**
 * Pull UTC DateTime ticks from PowerShell stdout. Banner/warning lines must
 * not fail closed as "no identity".
 */
export function parseWindowsIdentityTicks(stdout: string | null): string | null {
  if (stdout === null) return null;
  const match = stdout.match(/\d{10,}/);
  return match === null ? null : `win32:${match[0]}`;
}

async function readWindowsProcessIdentity(pid: number): Promise<string | null> {
  const windowsRoot = process.env.SystemRoot ?? process.env.WINDIR ?? "C:\\Windows";
  const powershell = join(windowsRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const ticks = await execFileText(powershell, [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    `$ErrorActionPreference='Stop'; (Get-Process -Id ${pid}).StartTime.ToUniversalTime().Ticks`,
  ], process.env, WINDOWS_IDENTITY_TIMEOUT_MS);
  return parseWindowsIdentityTicks(ticks);
}

async function readPsProcessIdentity(pid: number, platform: NodeJS.Platform): Promise<string | null> {
  const startedAt = await execFileText(
    "/bin/ps",
    ["-p", String(pid), "-o", "lstart="],
    {
      ...process.env,
      LC_ALL: "C",
      LANG: "C",
      TZ: "UTC",
    },
  );
  return startedAt === null ? null : `${platform}:${startedAt}`;
}

/**
 * Returns an opaque process-generation identity rather than merely a PID.
 * Unsupported or unreadable process metadata fails closed with null.
 */
export async function readProcessIdentity(
  pid: number,
  platform: NodeJS.Platform = process.platform,
): Promise<string | null> {
  if (!Number.isInteger(pid) || pid <= 1) return null;
  if (platform === "linux") return readLinuxProcessIdentity(pid);
  if (platform === "win32") return readWindowsProcessIdentity(pid);
  if (platform === "darwin" || platform === "freebsd" || platform === "openbsd") {
    return readPsProcessIdentity(pid, platform);
  }
  return null;
}

async function requireSpawnIdentity(child: ReturnType<typeof spawn>): Promise<string> {
  const pid = child.pid;
  if (pid === undefined || pid <= 1) {
    throw new Error("xtz 无法拉起 dsh web（没有 pid）");
  }
  const identity = await readProcessIdentity(pid);
  if (identity !== null) return identity;
  // The ChildProcess handle names exactly the process just created, so this is
  // safe even when portable PID metadata inspection is unavailable.
  child.kill("SIGTERM");
  throw new Error(`无法读取刚启动进程 ${pid} 的身份；已终止进程。`);
}

function exitCodeForSignal(signal: NodeJS.Signals | null): number {
  if (signal === null) return 1;
  return 128 + (osConstants.signals[signal] ?? 0);
}

async function resolveDshLaunch(): Promise<DshLaunch> {
  try {
    const require = createRequire(import.meta.url);
    const packagePath = require.resolve("@deepseek-ai/dsh/package.json");
    const pkg = JSON.parse(await readFile(packagePath, "utf8")) as {
      bin?: string | Record<string, string>;
    };
    const relativeBin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.dsh;
    if (typeof relativeBin === "string" && relativeBin.length > 0) {
      return {
        command: process.execPath,
        prefixArgs: [resolve(dirname(packagePath), relativeBin)],
      };
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`xtz 自带的 DSH 无法解析：${detail}`);
  }
  throw new Error("xtz 自带的 DSH package 没有 dsh bin 入口");
}

export async function executeDsh(
  args: string[],
  home: string,
  options: RunDshOptions = {},
): Promise<CommandResult> {
  let launch: DshLaunch;
  try {
    launch = await resolveDshLaunch();
  } catch (error) {
    return {
      code: 127,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      signal: null,
    };
  }
  const capture = options.capture === true;
  return await new Promise((resolveResult) => {
    const child = spawn(launch.command, [...launch.prefixArgs, ...args], {
      cwd: options.cwd ?? process.cwd(),
      env: dshEnv(home),
      shell: false,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr?.on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", (error: NodeJS.ErrnoException) => {
      const code = error.code === "ENOENT" ? 127 : 1;
      resolveResult({ code, stdout, stderr: error.message, signal: null });
    });
    child.once("close", (code, signal) => {
      resolveResult({
        code: code ?? exitCodeForSignal(signal),
        stdout,
        stderr,
        signal,
      });
    });
  });
}

function dshEnv(home: string): NodeJS.ProcessEnv {
  const env = officialDshEnv(home);
  delete env.XIAOTAOZI_DSH_SANDBOX;
  const localBins = join(packageRoot, "node_modules", ".bin");
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
  const currentPath = env[pathKey];
  env[pathKey] = currentPath ? `${localBins}${delimiter}${currentPath}` : localBins;
  return env;
}

export async function spawnDshDetached(
  args: string[],
  home: string,
  cwd = process.cwd(),
  extraEnv: NodeJS.ProcessEnv = {},
): Promise<SpawnedDsh> {
  const launch = await resolveDshLaunch();
  const child = spawn(launch.command, [...launch.prefixArgs, ...args], {
    cwd,
    env: { ...dshEnv(home), ...extraEnv },
    shell: false,
    detached: true,
    stdio: "ignore",
  });
  const identity = await requireSpawnIdentity(child);
  child.unref();
  return { pid: child.pid as number, identity };
}

export async function spawnDshForeground(
  args: string[],
  home: string,
  cwd = process.cwd(),
  extraEnv: NodeJS.ProcessEnv = {},
): Promise<SpawnedDsh> {
  const launch = await resolveDshLaunch();
  const child = spawn(launch.command, [...launch.prefixArgs, ...args], {
    cwd,
    env: { ...dshEnv(home), ...extraEnv },
    shell: false,
    detached: false,
    stdio: "inherit",
  });
  const closed = new Promise<{ code: number; signal: NodeJS.Signals | null }>((resolveClose) => {
    child.once("close", (code, signal) => {
      resolveClose({ code: code ?? exitCodeForSignal(signal), signal });
    });
    child.once("error", () => {
      resolveClose({ code: 1, signal: null });
    });
  });
  const identity = await requireSpawnIdentity(child);
  const pid = child.pid as number;
  return { pid, identity, closed };
}

export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export async function stopProcess(
  pid: number,
  expectedIdentity: string,
  inspect: (id: number) => Promise<string | null> = readProcessIdentity,
  alive: (id: number) => boolean = processAlive,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms)),
): Promise<StopProcessResult> {
  if (!alive(pid)) return "not-running";
  const beforeTerm = await inspect(pid);
  if (beforeTerm === null) return alive(pid) ? "identity-unavailable" : "not-running";
  if (beforeTerm !== expectedIdentity) return "identity-mismatch";
  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return "stopped";
    return alive(pid) ? "identity-unavailable" : "stopped";
  }
  for (let i = 0; i < 20; i += 1) {
    if (!alive(pid)) return "stopped";
    const currentIdentity = await inspect(pid);
    if (currentIdentity === null) {
      return alive(pid) ? "identity-unavailable" : "stopped";
    }
    // The target exited and the operating system reused the PID while xtz was
    // waiting. Never signal the replacement process.
    if (currentIdentity !== expectedIdentity) return "stopped";
    await wait(100);
  }
  if (!alive(pid)) return "stopped";
  const beforeKill = await inspect(pid);
  if (beforeKill === null) return alive(pid) ? "identity-unavailable" : "stopped";
  if (beforeKill !== expectedIdentity) return "stopped";
  try {
    process.kill(pid, "SIGKILL");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return "stopped";
    return alive(pid) ? "identity-unavailable" : "stopped";
  }
  return "stopped";
}
