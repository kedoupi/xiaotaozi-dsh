import type { RoutingMode } from "./preferences.ts";

export interface ModelInfoLike {
  inputModalities?: readonly string[];
}

export type ResolveModelInfo<T extends ModelInfoLike = ModelInfoLike> = (
  provider: string,
  model: string,
  signal?: AbortSignal,
) => Promise<T>;

export interface HostAdmissionLlm<T extends ModelInfoLike = ModelInfoLike> {
  resolveModelInfo: ResolveModelInfo<T>;
}

/**
 * Host `prompt` admission calls `resolveModelInfo` on the current picker model
 * and rejects when `inputModalities` is defined without `"image"`.
 * Smart UX hides that picker; the stale Host current may still be text-only.
 * Advertise image only for Host. Inventory / tools must keep the original.
 */
export function advertiseImageForSmartAdmission<T extends ModelInfoLike>(
  info: T,
  mode: RoutingMode,
): T {
  if (mode !== "smart") return info;
  const current = info.inputModalities;
  if (current === undefined || current.includes("image")) return info;
  return { ...info, inputModalities: [...current, "image"] };
}

export function installSmartHostAdmission<T extends ModelInfoLike>(
  llm: HostAdmissionLlm<T>,
  getMode: () => RoutingMode | Promise<RoutingMode>,
): { dispose: () => void; resolveTruthful: ResolveModelInfo<T> } {
  const original = llm.resolveModelInfo.bind(llm) as ResolveModelInfo<T>;
  llm.resolveModelInfo = async (provider, model, signal) => {
    const info = await original(provider, model, signal);
    let mode: RoutingMode = "manual";
    try {
      mode = await getMode();
    } catch {
      return info;
    }
    return advertiseImageForSmartAdmission(info, mode);
  };
  return {
    dispose: () => {
      llm.resolveModelInfo = original;
    },
    resolveTruthful: original,
  };
}
