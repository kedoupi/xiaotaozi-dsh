import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pluginData } from "../paths.ts";
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

function withLastSelected(
  mode: RoutingMode,
  last: LastRouteRef | undefined,
): RoutingPreference {
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

// Serialize the read/merge/rename transaction, not merely the final write.
const writes = new Map<string, Promise<void>>();

export function updateRoutingPreference(
  patch: Partial<RoutingPreference>,
  path = routingFilePath(),
): Promise<void> {
  const key = resolve(path);
  const incoming = {
    ...(patch.mode === undefined
      ? {}
      : { mode: requireRoutingMode(patch.mode) }),
    ...("lastSelected" in patch
      ? { lastSelected: parseLastRouteRef(patch.lastSelected) }
      : {}),
  };
  const next = (writes.get(key) ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      const body = parseRoutingPreference({
        ...(await loadRoutingPreference(key)),
        ...incoming,
      });
      await mkdir(dirname(key), { recursive: true, mode: 0o700 });
      const tmp = `${key}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`;
      try {
        await writeFile(tmp, `${JSON.stringify(body, null, 2)}\n`, {
          mode: 0o600,
          flag: "wx",
        });
        await rename(tmp, key);
      } catch (error) {
        await rm(tmp, { force: true });
        throw error;
      }
    });
  writes.set(key, next);
  void next
    .finally(() => {
      if (writes.get(key) === next) writes.delete(key);
    })
    .catch(() => {});
  return next;
}

export async function saveRoutingPreference(
  next: RoutingMode | RoutingPreference,
  path = routingFilePath(),
): Promise<void> {
  if (typeof next === "string") {
    await updateRoutingPreference({ mode: requireRoutingMode(next) }, path);
  } else {
    await updateRoutingPreference(
      { mode: requireRoutingMode(next.mode), lastSelected: next.lastSelected },
      path,
    );
  }
}
