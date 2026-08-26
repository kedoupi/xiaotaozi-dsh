import type { Context } from "@deepseek-ai/cordis";
import type { CwdHost } from "./cwd.ts";

type Sessions = {
  get(id: string): unknown;
};

type Workspace = {
  path?: string;
  sessionIds?: readonly string[];
};

type Registry = {
  list?: () => Workspace[];
};

function asSessions(value: unknown): Sessions | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const rec = value as { get?: unknown };
  if (typeof rec.get !== "function") return undefined;
  return value as Sessions;
}

function asRegistry(value: unknown): Registry | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  return value as Registry;
}

function cwdFromSession(session: unknown): string | undefined {
  if (typeof session !== "object" || session === null) return undefined;
  const rec = session as { header?: { cwd?: unknown }; session?: { header?: { cwd?: unknown } } };
  const cwd = rec.header?.cwd ?? rec.session?.header?.cwd;
  return typeof cwd === "string" && cwd !== "" ? cwd : undefined;
}

function readService(ctx: Context, name: string): unknown {
  try {
    return ctx.get(name);
  } catch {
    return undefined;
  }
}

/** Resolve a session workspace from live host services, never `process.cwd()`. */
export function workbenchHostFromContext(ctx: Context): CwdHost {
  return {
    cwdFor(sessionId) {
      try {
        const sessions = asSessions(readService(ctx, "sessions"));
        const fromSession = cwdFromSession(sessions?.get(sessionId));
        if (fromSession !== undefined) return fromSession;
      } catch {
        // fall through
      }
      try {
        const registry = asRegistry(readService(ctx, "workspaceRegistry") ?? readService(ctx, "workspace"));
        const list = registry?.list?.();
        if (!Array.isArray(list)) return undefined;
        for (const workspace of list) {
          if (!Array.isArray(workspace.sessionIds) || !workspace.sessionIds.includes(sessionId)) continue;
          if (typeof workspace.path === "string" && workspace.path !== "") return workspace.path;
        }
      } catch {
        return undefined;
      }
      return undefined;
    },
  };
}
