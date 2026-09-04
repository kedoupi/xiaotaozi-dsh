import type { AuthorizedModelInventory } from "./inventory.ts";
import type { RoutingMode } from "./preferences.ts";

export interface RouteLastSelected {
  provider: string;
  model: string;
  displayName: string;
}

/** Read-only UX snapshot. Does not change routing weights or selection. */
export interface RoutingContract {
  mode: RoutingMode;
  candidateCount: number;
  lastSelected?: RouteLastSelected;
}

export function buildRoutingContract(
  mode: RoutingMode,
  inventory: AuthorizedModelInventory,
  last?: { provider: string; model: string; displayName?: string },
): RoutingContract {
  const named = last === undefined
    ? undefined
    : inventory.candidates.find(
      (candidate) => candidate.provider === last.provider && candidate.model === last.model,
    );
  return {
    mode,
    candidateCount: inventory.candidates.length,
    ...last === undefined
      ? {}
      : {
        lastSelected: {
          provider: last.provider,
          model: last.model,
          displayName: named?.displayName ?? last.displayName ?? last.model,
        },
      },
  };
}

export function parseRoutingContract(value: unknown): RoutingContract {
  const record = typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : {};
  const mode: RoutingMode = record.mode === "smart" ? "smart" : "manual";
  const rawCount = record.candidateCount;
  const candidateCount = typeof rawCount === "number" && Number.isFinite(rawCount)
    ? Math.max(0, Math.floor(rawCount))
    : 0;
  const raw = record.lastSelected;
  if (typeof raw !== "object" || raw === null) return { mode, candidateCount };
  const item = raw as Record<string, unknown>;
  if (typeof item.provider !== "string" || item.provider.length === 0) return { mode, candidateCount };
  if (typeof item.model !== "string" || item.model.length === 0) return { mode, candidateCount };
  return {
    mode,
    candidateCount,
    lastSelected: {
      provider: item.provider,
      model: item.model,
      displayName: typeof item.displayName === "string" && item.displayName.length > 0
        ? item.displayName
        : item.model,
    },
  };
}
