import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { ensurePluginDir, migrateLegacyPluginData, pluginData } from "../paths.ts";
import type { ProviderId } from "./store.ts";

export type SelectionMap = Partial<Record<ProviderId, string[]>>;

export function selectionFilePath(): string {
  return pluginData("selection.json");
}

const writes = new Map<string, Promise<void>>();

function serialize(path: string, job: () => Promise<void>): Promise<void> {
  const previous = writes.get(path) ?? Promise.resolve();
  const next = previous.then(job, job);
  writes.set(path, next.catch(() => undefined));
  return next;
}

async function loadMap(path = selectionFilePath()): Promise<SelectionMap> {
  path = resolve(path);
  if (path === resolve(selectionFilePath())) await migrateLegacyPluginData();
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return parsed as SelectionMap;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    return {};
  }
}

async function writeMap(store: SelectionMap, path = selectionFilePath()): Promise<void> {
  if (path === resolve(selectionFilePath())) await ensurePluginDir();
  else await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`;
  try {
    await writeFile(tmp, JSON.stringify(store, null, 2), { mode: 0o600 });
    await rename(tmp, path);
  } catch (error) {
    await rm(tmp, { force: true });
    throw error;
  }
}

/** `undefined` means every advertised model is on. */
export async function getPicked(provider: ProviderId, path = selectionFilePath()): Promise<string[] | undefined> {
  const value = (await loadMap(path))[provider];
  return Array.isArray(value) ? value.filter((id) => typeof id === "string" && id.length > 0) : undefined;
}

export async function setPicked(provider: ProviderId, ids: string[], path = selectionFilePath()): Promise<void> {
  path = resolve(path);
  await serialize(path, async () => {
    const store = await loadMap(path);
    store[provider] = [...new Set(ids.filter((id) => id.length > 0))];
    await writeMap(store, path);
  });
}

export async function clearPicked(provider: ProviderId, path = selectionFilePath()): Promise<void> {
  path = resolve(path);
  await serialize(path, async () => {
    const store = await loadMap(path);
    if (store[provider] === undefined) return;
    delete store[provider];
    await writeMap(store, path);
  });
}

export async function advertisedModels<T extends { id: string }>(
  provider: ProviderId,
  models: readonly T[],
  path = selectionFilePath(),
): Promise<T[]> {
  const picked = await getPicked(provider, path);
  if (picked === undefined) return [...models];
  const allow = new Set(picked);
  return models.filter((model) => allow.has(model.id));
}
