import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { ensurePluginDir, pluginData } from "../paths.ts";

export type RoutingMode = "manual" | "smart";

export interface RoutingPreference {
  mode: RoutingMode;
}

export function routingFilePath(): string {
  return pluginData("routing.json");
}

export function requireRoutingMode(value: unknown): RoutingMode {
  if (value === "manual" || value === "smart") return value;
  throw new Error("routing mode must be manual or smart");
}

export function parseRoutingPreference(raw: unknown): RoutingPreference {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return { mode: "manual" };
  const mode = (raw as { mode?: unknown }).mode;
  return { mode: mode === "smart" ? "smart" : "manual" };
}

export async function loadRoutingPreference(
  path = routingFilePath(),
): Promise<RoutingPreference> {
  try {
    return parseRoutingPreference(
      JSON.parse(await readFile(path, "utf8")) as unknown,
    );
  } catch {
    return { mode: "manual" };
  }
}

export async function saveRoutingPreference(
  mode: RoutingMode,
  path = routingFilePath(),
): Promise<void> {
  requireRoutingMode(mode);
  await ensurePluginDir();
  const tmp = `${path}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`;
  try {
    await writeFile(tmp, `${JSON.stringify({ mode }, null, 2)}\n`, {
      mode: 0o600,
    });
    await rename(tmp, path);
  } catch (error) {
    await rm(tmp, { force: true });
    throw error;
  }
}
