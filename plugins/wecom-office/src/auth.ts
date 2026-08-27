import { rm } from "node:fs/promises";
import { join } from "node:path";
import { formatCliOutput, parseAuthStatus, runWecomCli, type CliRunOptions, type CliRunResult } from "./cli.ts";
import { OfficeError } from "./errors.ts";

type Runner = (options: CliRunOptions) => Promise<CliRunResult>;

function runnerOf(options: { run?: Runner }): Runner {
  return options.run ?? runWecomCli;
}

function cliFields(options: Omit<CliRunOptions, "args" | "json">): Omit<CliRunOptions, "args" | "json"> {
  return {
    cliPath: options.cliPath,
    configDir: options.configDir,
    timeoutMs: options.timeoutMs,
    ...(options.env ? { env: options.env } : {}),
    ...(options.spawnImpl ? { spawnImpl: options.spawnImpl } : {}),
  };
}

export async function cliVersion(options: Omit<CliRunOptions, "args" | "json"> & { run?: Runner }): Promise<string | undefined> {
  try {
    const result = await runnerOf(options)({ ...cliFields(options), args: ["--version"] });
    if (result.exitCode !== 0) return undefined;
    return result.stdout.trim().split(/\r?\n/)[0]?.trim();
  } catch (error) {
    if (error instanceof OfficeError && error.code === "cli-missing") return undefined;
    throw error;
  }
}

export async function authStatus(options: Omit<CliRunOptions, "args" | "json"> & { run?: Runner }): Promise<"authorized" | "unauthorized"> {
  try {
    const result = await runnerOf(options)({ ...cliFields(options), args: ["auth", "show", "--status"] });
    if (result.exitCode !== 0) return "unauthorized";
    return parseAuthStatus(result.stdout);
  } catch (error) {
    if (error instanceof OfficeError && error.code === "cli-missing") throw error;
    return "unauthorized";
  }
}

export async function authInit(
  options: Omit<CliRunOptions, "args" | "json"> & { remoteBotId: string; secret: string; run?: Runner },
): Promise<void> {
  const result = await runnerOf(options)({
    ...cliFields(options),
    args: ["auth", "init", "--bot-id", options.remoteBotId, "--secret", options.secret],
  });
  if (result.exitCode !== 0) {
    formatCliOutput(result);
  }
  const status = await authStatus(options);
  if (status !== "authorized") {
    throw new OfficeError("unauthorized", "开通未完成，企业微信没有返回已授权状态。");
  }
}

export async function clearCliCredentials(configDir: string): Promise<void> {
  await rm(join(configDir, "credentials.enc"), { force: true });
  await rm(join(configDir, "cache"), { recursive: true, force: true });
}
