import { spawn } from "node:child_process";
import type { CatalogEntry } from "./catalog.ts";
import { dshHome } from "./dsh-home.ts";

export type PluginMutateResult = { ok: true } | { ok: false; error: string };

export type PluginMutator = (
  action: "install" | "remove",
  entry: CatalogEntry,
  env?: NodeJS.ProcessEnv,
) => Promise<PluginMutateResult>;

const MUTATE_TIMEOUT_MS = 180_000;

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
  return new Promise((resolve) => {
    const child = spawn("dsh", args, {
      env: { ...env, DSH_HOME: dshHome(env) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
    });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ ok: false, error: `${action} timed out` });
    }, MUTATE_TIMEOUT_MS);
    child.on("error", (error: Error) => {
      clearTimeout(timer);
      resolve({ ok: false, error: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ ok: true });
        return;
      }
      resolve({ ok: false, error: (stderr || stdout || `dsh plugin ${action} failed`).trim() });
    });
  });
}
