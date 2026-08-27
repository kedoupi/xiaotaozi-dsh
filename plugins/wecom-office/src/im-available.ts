import { IM_PLUGIN_NAMES } from "./names.ts";

export function detectLoadedImPlugin(
  registry: { values(): Iterable<{ name?: string }> } | undefined | null,
): boolean {
  if (registry === undefined || registry === null || typeof registry.values !== "function") return false;
  try {
    for (const runtime of registry.values()) {
      if (typeof runtime?.name === "string" && IM_PLUGIN_NAMES.has(runtime.name)) return true;
    }
  } catch {
    return false;
  }
  return false;
}
