import { spawn } from "node:child_process";
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
  closed?: Promise<{ code: number; signal: NodeJS.Signals | null }>;
}

interface DshLaunch {
  command: string;
  prefixArgs: string[];
}

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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
  child.unref();
  if (child.pid === undefined || child.pid <= 1) {
    throw new Error("xtz 无法拉起 dsh web（没有 pid）");
  }
  return { pid: child.pid };
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
  if (child.pid === undefined || child.pid <= 1) {
    throw new Error("xtz 无法拉起 dsh web（没有 pid）");
  }
  const pid = child.pid;
  const closed = new Promise<{ code: number; signal: NodeJS.Signals | null }>((resolveClose) => {
    child.once("close", (code, signal) => {
      resolveClose({ code: code ?? exitCodeForSignal(signal), signal });
    });
    child.once("error", () => {
      resolveClose({ code: 1, signal: null });
    });
  });
  return { pid, closed };
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
  alive: (id: number) => boolean = processAlive,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms)),
): Promise<void> {
  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return;
    throw error;
  }
  for (let i = 0; i < 20; i += 1) {
    if (!alive(pid)) return;
    await wait(100);
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return;
    throw error;
  }
}
