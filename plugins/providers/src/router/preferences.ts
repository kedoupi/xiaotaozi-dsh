import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { ensurePluginDir, pluginData } from "../paths.ts";
import { parseLastRouteRef, type LastRouteRef } from "./last-selected.ts";

export type RoutingMode = "manual" | "smart";

export interface RoutingPreference {
  mode: RoutingMode;
  lastSelected?: LastRouteRef;
}

export function routingFilePath(): string {
  return pluginData("routing.json");
}

export function requireRoutingMode(value: unknown): RoutingMode {
  if (value === "manual" || value === "smart") return value;
  throw new Error("routing mode must be manual or smart");
}

function withLastSelected(mode: RoutingMode, last: LastRouteRef | undefined): RoutingPreference {
  return last === undefined ? { mode } : { mode, lastSelected: last };
}

export function parseRoutingPreference(raw: unknown): RoutingPreference {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return { mode: "manual" };
  const record = raw as { mode?: unknown; lastSelected?: unknown };
  const mode: RoutingMode = record.mode === "smart" ? "smart" : "manual";
  return withLastSelected(mode, parseLastRouteRef(record.lastSelected));
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
  next: RoutingMode | RoutingPreference,
  path = routingFilePath(),
): Promise<void> {
  const incoming = typeof next === "string" ? { mode: next } : next;
  requireRoutingMode(incoming.mode);
  const last = typeof next === "string"
    ? (await loadRoutingPreference(path)).lastSelected
    : parseLastRouteRef(incoming.lastSelected);
  const body = withLastSelected(incoming.mode, last);
  await ensurePluginDir();
  const tmp = `${path}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`;
  try {
    await writeFile(tmp, `${JSON.stringify(body, null, 2)}\n`, {
      mode: 0o600,
    });
    await rename(tmp, path);
  } catch (error) {
    await rm(tmp, { force: true });
    throw error;
  }
}
