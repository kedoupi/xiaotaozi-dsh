import type { Context } from "@deepseek-ai/cordis";
import type { ArchiveLiveHost } from "./ledger.ts";

type Registry = {
  archivedSessionIds?: readonly string[];
  requireState?: () => { archivedSessionIds?: readonly string[] } & Record<string, unknown>;
  setState?: (state: Record<string, unknown>) => Promise<void>;
  enqueueOperation?<T>(operation: () => Promise<T>): Promise<T>;
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
  const registry = (): Registry | undefined => asRegistry(readService(ctx, "workspaceRegistry"));
  const mutateArchivedIds: NonNullable<ArchiveLiveHost["mutateArchivedIds"]> = async (mutation) => {
    const current = registry();
    if (current?.requireState === undefined || current.setState === undefined) {
      throw new Error("workspaceRegistry.setState unavailable");
    }
    const commit = async () => {
      const state = current.requireState!();
      const outcome = await mutation(Array.isArray(state.archivedSessionIds) ? [...state.archivedSessionIds] : []);
      await current.setState!({ ...state, archivedSessionIds: outcome.ids });
      return outcome.result;
    };
    return current.enqueueOperation === undefined ? await commit() : await current.enqueueOperation(commit);
  };
  return {
    archivedIds: () => {
      try {
        const current = registry();
        if (Array.isArray(current?.archivedSessionIds)) return [...current.archivedSessionIds];
        const state = current?.requireState?.();
        if (Array.isArray(state?.archivedSessionIds)) return [...state.archivedSessionIds];
      } catch {
        return undefined;
      }
      return undefined;
    },
    setArchivedIds: async (ids) => await mutateArchivedIds(async () => ({ ids, result: undefined })),
    mutateArchivedIds,
    isLive: (sessionId) => asSessions(readService(ctx, "sessions"))?.get(sessionId) !== undefined,
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
