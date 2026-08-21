import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { ensurePluginDir, migrateLegacyPluginData, pluginData } from "../paths.ts";
import type { ProviderId } from "./store.ts";

export type SelectionMap = Partial<Record<ProviderId, string[]>>;

export function selectionFilePath(): string {
  return pluginData("selection.json");
}

async function loadMap(path = selectionFilePath()): Promise<SelectionMap> {
  if (path === selectionFilePath()) await migrateLegacyPluginData();
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
  await ensurePluginDir();
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
  const store = await loadMap(path);
  store[provider] = [...new Set(ids.filter((id) => id.length > 0))];
  await writeMap(store, path);
}

export async function clearPicked(provider: ProviderId, path = selectionFilePath()): Promise<void> {
  const store = await loadMap(path);
  if (store[provider] === undefined) return;
  delete store[provider];
  await writeMap(store, path);
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
