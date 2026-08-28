import { randomUUID } from "node:crypto";
import type { BoardWorkspace } from "./types.ts";

export type { BoardWorkspace };

export type InspectOutcome =
  | { outcome: "pending" }
  | { outcome: "succeeded" }
  | { outcome: "failed"; error: string }
  | { outcome: "cancelled"; error: string };

type RpcResult<T> = { ok: true; value: T } | { ok: false; error: { message?: string } };

type ApiProxyLike = {
  sessions: {
    create(req: { rpcId: string; payload: Record<string, unknown> }): Promise<{ result: RpcResult<{ sessionId: string }> }>;
    rename(req: { rpcId: string; payload: { sessionId: string; title: string } }): Promise<{ result: RpcResult<unknown> }>;
    prompt(req: { rpcId: string; payload: Record<string, unknown> }): Promise<{ result: RpcResult<unknown> }>;
    list(req: { rpcId: string; payload: Record<string, unknown> }): Promise<{ result: RpcResult<{ items: Array<{ sessionId?: string; id?: string; running?: boolean }> }> }>;
    cancel?(req: { rpcId: string; payload: { sessionId: string } }): Promise<{ result: RpcResult<{ accepted: true }> }>;
  };
};

function rpcId(): string {
  return `xtz-ui-board-${randomUUID()}`;
}

function asApi(value: unknown): ApiProxyLike | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const sessions = (value as { sessions?: { create?: unknown; prompt?: unknown; list?: unknown } }).sessions;
  if (typeof sessions?.create !== "function" || typeof sessions.prompt !== "function" || typeof sessions.list !== "function") {
    return undefined;
  }
  return value as ApiProxyLike;
}

function fail(result: RpcResult<unknown>): never {
  throw new Error(result.ok ? "rpc failed" : (result.error.message ?? "rpc failed"));
}

export async function launchTask(
  apiRaw: unknown,
  input: { title: string; prompt: string; workspaceId?: string },
): Promise<string> {
  const api = asApi(apiRaw);
  if (api === undefined) throw new Error("session runner unavailable");
  const created = await api.sessions.create({
    rpcId: rpcId(),
    payload: input.workspaceId === undefined ? {} : { workspaceId: input.workspaceId },
  });
  if (!created.result.ok) fail(created.result);
  const sessionId = created.result.value.sessionId;
  try {
    if (typeof api.sessions.rename === "function") {
      await api.sessions.rename({ rpcId: rpcId(), payload: { sessionId, title: input.title } });
    }
    const prompt = await api.sessions.prompt({
      rpcId: rpcId(),
      payload: {
        sessionId,
        mode: "queue",
        content: [{ type: "text", text: input.prompt }],
      },
    });
    if (!prompt.result.ok) fail(prompt.result);
  } catch (error) {
    const wrapped = new Error(error instanceof Error ? error.message : String(error));
    (wrapped as Error & { sessionId: string }).sessionId = sessionId;
    throw wrapped;
  }
  return sessionId;
}

export async function cancelSession(apiRaw: unknown, sessionId: string): Promise<void> {
  const sessions = typeof apiRaw === "object" && apiRaw !== null ? (apiRaw as { sessions?: { cancel?: unknown } }).sessions : undefined;
  if (typeof sessions?.cancel !== "function") throw new Error("session cancellation unavailable");
  const cancelled = await sessions.cancel({ rpcId: rpcId(), payload: { sessionId } }) as { result: RpcResult<unknown> };
  if (!cancelled.result.ok) fail(cancelled.result);
}

export async function inspectSession(apiRaw: unknown, sessionId: string): Promise<InspectOutcome> {
  const api = asApi(apiRaw);
  if (api === undefined) return { outcome: "pending" };
  try {
    const listed = await api.sessions.list({ rpcId: rpcId(), payload: {} });
    if (!listed.result.ok) return { outcome: "pending" };
    const item = listed.result.value.items.find((row) => row.sessionId === sessionId || row.id === sessionId);
    if (item === undefined) return { outcome: "cancelled", error: "execution session no longer exists" };
    if (item.running === true) return { outcome: "pending" };
    return { outcome: "succeeded" };
  } catch {
    return { outcome: "pending" };
  }
}

export function listWorkspaces(registry: unknown): BoardWorkspace[] {
  if (typeof registry !== "object" || registry === null) return [];
  const list = (registry as { list?: () => unknown }).list;
  if (typeof list !== "function") return [];
  try {
    const rows = list.call(registry);
    if (!Array.isArray(rows)) return [];
    return rows.flatMap((row) => {
      if (typeof row !== "object" || row === null) return [];
      const rec = row as { id?: unknown; title?: unknown; path?: unknown };
      if (typeof rec.id !== "string" || rec.id === "") return [];
      return [{
        id: rec.id,
        title: typeof rec.title === "string" ? rec.title : rec.id,
        path: typeof rec.path === "string" ? rec.path : "",
      }];
    });
  } catch {
    return [];
  }
}
