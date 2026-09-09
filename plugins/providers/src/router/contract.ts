import type { AuthorizedModelInventory } from "./inventory.ts";
import { parseLastRouteRef, type LastRouteRef } from "./last-selected.ts";
import type { RoutingMode } from "./preferences.ts";

export interface RouteLastSelected {
  provider: string;
  model: string;
  displayName: string;
}

/** Read-only UX snapshot. Observation limits do not implement stalled-model recovery. */
export interface RoutingContract {
  mode: RoutingMode;
  candidateCount: number;
  lastSelected?: RouteLastSelected;
  /** Ephemeral and scoped to the last live decision; never persisted. */
  switchNotice?: string;
  attribution?: "session" | "historical";
  sessionId?: string;
  refreshTiming?: { pollIntervalMs: number; totalTimeoutMs: number };
}

/** Timer-safe positive integers; legacy Hosts retain the bounded 500/90000 fallback. */
export function routingRefreshTiming(
  raw?: unknown,
): NonNullable<RoutingContract["refreshTiming"]> {
  const value =
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  const bounded = (n: unknown, fallback: number): number =>
    typeof n === "number" && Number.isInteger(n) && n > 0 && n <= 2_147_483_647
      ? n
      : fallback;
  return {
    pollIntervalMs: bounded(value.pollIntervalMs, 500),
    totalTimeoutMs: bounded(value.totalTimeoutMs, 90_000),
  };
}

export function buildRoutingContract(
  mode: RoutingMode,
  inventory: AuthorizedModelInventory,
  last?: LastRouteRef,
  context?: {
    sessionId?: string;
    lastUsed?: LastRouteRef;
    switchNotice?: string;
    refreshTiming?: RoutingContract["refreshTiming"];
  },
): RoutingContract {
  const sessionId = context?.sessionId;
  const selected =
    sessionId === undefined
      ? last
      : last?.sessionId === sessionId
        ? last
        : context?.lastUsed;
  const notice = selected === last ? context?.switchNotice?.trim() : undefined;
  const named =
    selected === undefined
      ? undefined
      : inventory.candidates.find(
          (candidate) =>
            candidate.provider === selected.provider &&
            candidate.model === selected.model,
        );
  return {
    mode,
    candidateCount: inventory.candidates.length,
    ...(selected === undefined || !notice ? {} : { switchNotice: notice }),
    ...(context === undefined
      ? {}
      : sessionId === undefined
        ? { attribution: "historical" as const }
        : { attribution: "session" as const, sessionId }),
    ...(context?.refreshTiming === undefined
      ? {}
      : { refreshTiming: routingRefreshTiming(context.refreshTiming) }),
    ...(selected === undefined
      ? {}
      : {
          lastSelected: {
            provider: selected.provider,
            model: selected.model,
            displayName:
              named?.displayName ?? selected.displayName ?? selected.model,
          },
        }),
  };
}

export function parseRoutingContract(value: unknown): RoutingContract {
  const record =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const mode: RoutingMode = record.mode === "smart" ? "smart" : "manual";
  const rawCount = record.candidateCount;
  const candidateCount =
    typeof rawCount === "number" && Number.isFinite(rawCount)
      ? Math.max(0, Math.floor(rawCount))
      : 0;
  const last = parseLastRouteRef(record.lastSelected);
  const notice = typeof record.switchNotice === "string" ? record.switchNotice.trim() : "";
  const sessionId =
    typeof record.sessionId === "string" && record.sessionId.length > 0
      ? record.sessionId
      : undefined;
  return {
    mode,
    candidateCount,
    ...(last === undefined || !notice ? {} : { switchNotice: notice }),
    ...(record.attribution === "session" && sessionId !== undefined
      ? { attribution: "session", sessionId }
      : record.attribution === "historical"
        ? { attribution: "historical" }
        : {}),
    ...(record.refreshTiming === undefined
      ? {}
      : { refreshTiming: routingRefreshTiming(record.refreshTiming) }),
    ...(last === undefined
      ? {}
      : {
          lastSelected: {
            provider: last.provider,
            model: last.model,
            displayName: last.displayName ?? last.model,
          },
        }),
  };
}
