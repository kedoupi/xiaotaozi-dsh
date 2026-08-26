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
  const env = officialDshEnv(home);
  const localBins = join(packageRoot, "node_modules", ".bin");
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
  const currentPath = env[pathKey];
  env[pathKey] = currentPath ? `${localBins}${delimiter}${currentPath}` : localBins;

  return await new Promise((resolveResult) => {
    const child = spawn(launch.command, [...launch.prefixArgs, ...args], {
      cwd: options.cwd ?? process.cwd(),
      env,
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
