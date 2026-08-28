import type { Context } from "@deepseek-ai/cordis";
import type { ArchiveLiveHost } from "./ledger.ts";

type Registry = {
  archivedSessionIds?: string[];
  requireState?: () => { archivedSessionIds?: string[] } & Record<string, unknown>;
  setState?: (state: Record<string, unknown>) => Promise<void>;
};

type Sessions = {
  get(id: string): { detach?: () => void } | undefined;
  liveEntryFor?(session: unknown): { detach?: () => void } | undefined;
};

function asRegistry(value: unknown): Registry | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  return value as Registry;
}

function asSessions(value: unknown): Sessions | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const rec = value as { get?: unknown };
  if (typeof rec.get !== "function") return undefined;
  return value as Sessions;
}

function readService(ctx: Context, name: string): unknown {
  try {
    return ctx.get(name);
  } catch {
    return undefined;
  }
}

export function archiveHostFromContext(ctx: Context): ArchiveLiveHost {
  const registry = asRegistry(readService(ctx, "workspaceRegistry"));
  return {
    archivedIds: () => {
      try {
        if (Array.isArray(registry?.archivedSessionIds)) return registry.archivedSessionIds;
        const state = registry?.requireState?.();
        if (Array.isArray(state?.archivedSessionIds)) return state.archivedSessionIds;
      } catch {
        return undefined;
      }
      return undefined;
    },
    setArchivedIds: async (ids) => {
      if (registry?.requireState === undefined || registry.setState === undefined) {
        throw new Error("workspaceRegistry.setState unavailable");
      }
      const state = registry.requireState();
      await registry.setState({ ...state, archivedSessionIds: ids });
    },
    detachLive: (sessionId) => {
      try {
        const sessions = asSessions(readService(ctx, "sessions"));
        if (sessions === undefined) return;
        const live = sessions.get(sessionId);
        if (live === undefined) return;
        const entry = sessions.liveEntryFor?.(live) ?? live;
        entry.detach?.();
      } catch {
        // best effort
      }
    },
    emitDisposed: (sessionId) => {
      try {
        (ctx as Context & { emit(event: string, payload: unknown): void }).emit(
          "session/disposed",
          { id: sessionId, session: { id: sessionId } },
        );
      } catch {
        // best effort
      }
    },
  };
}
