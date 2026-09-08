type Request = { rpcId: string; payload: Record<string, unknown> };
export type SessionEvent = { type: string; data?: { turn?: number; reason?: unknown } };
export interface SessionController {
  create(request: Record<string, unknown>): Promise<unknown>;
  rename(request: Record<string, unknown>): Promise<unknown>;
  prompt(request: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
  list(request: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
  cancel(request: Record<string, unknown>): unknown;
  inspect(sessionId: string): Promise<{ events: readonly SessionEvent[] }>;
}

/** Keep board lifecycle ownership while adapting to RC1's in-process Host service. */
export function boardSessionApi(value: unknown): unknown {
  const host = value as SessionController | undefined;
  if (!host || typeof host.create !== "function" || typeof host.inspect !== "function") return undefined;
  const wrap = (method: "create" | "rename" | "prompt" | "list" | "cancel") => async ({ rpcId, payload }: Request) => ({
    result: { ok: true, value: await host[method](method === "prompt" ? { ...payload, requestId: rpcId } : payload, new AbortController().signal) },
  });
  return { sessions: {
    create: wrap("create"), rename: wrap("rename"), prompt: wrap("prompt"),
    list: wrap("list"), cancel: wrap("cancel"),
    inspect: (sessionId: string) => host.inspect(sessionId),
  } };
}
