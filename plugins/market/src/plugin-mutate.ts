import { spawn } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join, parse, resolve } from "node:path";
import type { CatalogEntry } from "./catalog.ts";
import { dshHome } from "./dsh-home.ts";

export type PluginMutateResult = { ok: true } | { ok: false; error: string };

export type PluginMutator = (
  action: "install" | "remove",
  entry: CatalogEntry,
  env?: NodeJS.ProcessEnv,
) => Promise<PluginMutateResult>;

const MUTATE_TIMEOUT_MS = 180_000;
export const PINNED_DSH_VERSION = "0.1.1-rc.2";

export interface DshLaunch {
  command: string;
  prefixArgs: string[];
}

export interface PluginMutateRuntime {
  /** Test seam and nonstandard launcher seam; production uses the current Host entry. */
  dshEntry?: string;
  nodePath?: string;
  timeoutMs?: number;
}

interface DshPackageJson {
  name?: unknown;
  version?: unknown;
  bin?: unknown;
}

function dshBin(packageJson: DshPackageJson): string | undefined {
  if (typeof packageJson.bin === "string") return packageJson.bin;
  if (typeof packageJson.bin !== "object" || packageJson.bin === null || Array.isArray(packageJson.bin)) {
    return undefined;
  }
  const entry = (packageJson.bin as Record<string, unknown>).dsh;
  return typeof entry === "string" && entry !== "" ? entry : undefined;
}

/**
 * Resolve the exact DSH package that booted this Host. This avoids PATH and keeps
 * the plugin independent from the separately installed `xtz` package.
 */
export function resolvePinnedDshLaunch(
  entryPath: string | undefined = process.argv[1],
  nodePath: string = process.execPath,
): DshLaunch {
  if (typeof entryPath !== "string" || entryPath.trim() === "") {
    throw new Error("current DSH Host entry is unavailable");
  }

  let realEntry: string;
  try {
    realEntry = realpathSync(resolve(entryPath));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`current DSH Host entry cannot be resolved: ${detail}`);
  }

  let directory = dirname(realEntry);
  const root = parse(directory).root;
  while (true) {
    const packagePath = join(directory, "package.json");
    let packageJson: DshPackageJson | undefined;
    try {
      packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as DshPackageJson;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        // An unrelated ancestor package may be malformed; only a valid DSH
        // package can authorize a mutation runtime.
      }
    }
    if (packageJson?.name === "@deepseek-ai/dsh") {
      if (packageJson.version !== PINNED_DSH_VERSION) {
        throw new Error(`current DSH Host is ${String(packageJson.version)}, expected ${PINNED_DSH_VERSION}`);
      }
      const relativeBin = dshBin(packageJson);
      if (relativeBin === undefined) throw new Error("current DSH Host package has no dsh bin entry");
      let packageBin: string;
      try {
        packageBin = realpathSync(resolve(directory, relativeBin));
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`current DSH Host bin cannot be resolved: ${detail}`);
      }
      if (packageBin !== realEntry) throw new Error("current DSH Host entry does not match its package dsh bin");
      return { command: nodePath, prefixArgs: [packageBin] };
    }
    if (directory === root) break;
    directory = dirname(directory);
  }
  throw new Error("current Host was not launched by @deepseek-ai/dsh");
}

function refusedSpec(spec: string): string | undefined {
  if (spec.startsWith("link:") || spec.startsWith("file:") || spec.startsWith(".") || spec.startsWith("/")) {
    return "refused local spec";
  }
  if (spec.includes("#path:externals/") || spec.includes("/externals/")) {
    return "refused externals path";
  }
  return undefined;
}

/** Install or remove via `dsh plugin --profile web` into the current DSH_HOME. */
export function spawnDshPluginMutate(
  action: "install" | "remove",
  entry: CatalogEntry,
  env: NodeJS.ProcessEnv = process.env,
  runtime: PluginMutateRuntime = {},
): Promise<PluginMutateResult> {
  const spec = action === "install" ? entry.installSpec : entry.packageName;
  if (typeof spec !== "string" || spec === "") {
    return Promise.resolve({ ok: false, error: action === "install" ? "missing install spec" : "missing package name" });
  }
  const refused = refusedSpec(spec);
  if (refused !== undefined) return Promise.resolve({ ok: false, error: refused });
  const args = action === "install"
    ? ["plugin", "--profile", "web", "add", spec]
    : ["plugin", "--profile", "web", "remove", spec];
  let launch: DshLaunch;
  try {
    launch = resolvePinnedDshLaunch(runtime.dshEntry, runtime.nodePath);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return Promise.resolve({ ok: false, error: `pinned DSH runtime unavailable: ${detail}` });
  }
  return new Promise((resolve) => {
    const child = spawn(launch.command, [...launch.prefixArgs, ...args], {
      env: { ...env, DSH_HOME: dshHome(env) },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    const finish = (result: PluginMutateResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
    });
    timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish({ ok: false, error: `${action} timed out` });
    }, runtime.timeoutMs ?? MUTATE_TIMEOUT_MS);
    child.on("error", (error: Error) => {
      finish({ ok: false, error: error.message });
    });
    child.on("close", (code) => {
      if (code === 0) {
        finish({ ok: true });
        return;
      }
      finish({ ok: false, error: (stderr || stdout || `dsh plugin ${action} failed`).trim() });
    });
  });
}
