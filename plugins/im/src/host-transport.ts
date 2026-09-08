import { randomUUID } from 'node:crypto';
import type { HarnessClientInit } from './channels/shared/harness-client.ts';

type Row = Record<string, unknown>;
type Gateway = {
  invoke(request: { namespace: string; method: string; args: Row; signal?: AbortSignal }): Promise<unknown>;
  stream(request: { namespace: string; method: string; args: Row; signal?: AbortSignal }): Promise<AsyncIterable<Row>>;
  openWireStream(endpoint: string, payload: Row, signal: AbortSignal): Promise<AsyncIterable<Row>>;
  dispatchRpc(endpoint: string, payload: Row, signal: AbortSignal): Promise<{ ok: boolean; error?: unknown }>;
};
type Host = {
  get(name: string): unknown;
  typertGateway: Gateway;
  on(name: string, listener: (session: { id: string }, event: Row) => void): () => void;
};
type SessionController = { inspect(id: string, signal?: AbortSignal): Promise<{ events: Row[]; meta: Row }> };
function row(value: unknown): Row { return typeof value === 'object' && value !== null ? value as Row : {}; }

/** RC1 Host transport for IM's existing ownership/reply protocol. No browser token or HTTP hop. */
export function createHarnessHostTransport(context: unknown): Pick<HarnessClientInit, 'fetchImpl' | 'createWebSocket'> {
  const ctx = context as Host;
  // Lightweight production-assembly fixtures deliberately supply their own Harness class.
  if (typeof ctx?.get !== 'function' || typeof ctx.typertGateway?.stream !== 'function') return {};
  const gateway = ctx.typertGateway;
  type Claim = { clients: Set<string>; kind: string; sessionId: string; approvalId?: unknown };
  const pending = new Map<string, Claim>();
  const invoke = (namespace: string, method: string, args: Row, signal?: AbortSignal) => gateway.invoke({ namespace, method, args, signal });
  const inspect = (id: string, signal?: AbortSignal) => {
    const controller = ctx.get('sessionController') as SessionController | undefined;
    if (!controller) throw new Error('Host sessionController unavailable');
    return controller.inspect(id, signal);
  };
  async function rpc(method: string, payload: Row, requestId: string, signal?: AbortSignal): Promise<unknown> {
    signal?.throwIfAborted();
    if (method === 'host.describe' || method === 'session.list') return invoke('session', 'list', { _request: {} }, signal);
    if (method === 'workspace.list') {
      const stream = await gateway.stream({ namespace: 'workspace', method: 'follow', args: {}, signal });
      for await (const frame of stream) {
        if (frame.type !== 'baseline') throw new Error('Host workspace baseline unavailable');
        return frame.value;
      }
      throw new Error('Host workspace stream ended before baseline');
    }
    if (method === 'session.history') {
      const state = await inspect(String(payload.sessionId), signal);
      return { events: state.events.map(event => ({ event })), meta: state.meta };
    }
    if (method === 'llm.models' || method === 'session.models') {
      const catalog = row(await invoke('session', 'modelCatalog', {}, signal));
      if (method === 'llm.models') return catalog;
      const state = await inspect(String(payload.sessionId), signal);
      const latest = [...state.events].reverse().find(event => event.type === 'model/selection' || event.type === 'request/header');
      const current = latest?.type === 'model/selection' ? row(latest.data)
        : latest ? row(row(row(latest.data).header).config) : row(catalog.default);
      return { ...catalog, current, routable: Array.isArray(catalog.routableProviders) && catalog.routableProviders.includes(current.provider) };
    }
    if (['session.create', 'session.rename', 'session.prompt', 'session.cancel', 'session.selectModel'].includes(method)) {
      return invoke('session', method.slice(8), { request: method === 'session.prompt' ? { ...payload, requestId } : payload }, signal);
    }
    throw new Error(`Unsupported Host operation: ${method}`);
  }
  const fetchImpl: typeof fetch = async (_url, init) => {
    const message = JSON.parse(String(init?.body)) as { type: string; method: string; rpcId: string; payload: Row; result?: { ok: boolean; value?: Row; error?: unknown } };
    const signal = init?.signal ?? undefined;
    if (message.type === 'client-response') {
      const claim = pending.get(message.rpcId);
      if (!claim) return Response.json({ accepted: false, reason: 'not-pending' });
      const result = message.result;
      if (result?.ok && (result.value?.sessionId !== claim.sessionId
        || (claim.kind === 'approval' && result.value?.approvalId !== claim.approvalId))) {
        return Response.json({ accepted: false, reason: 'bad-response' });
      }
      const error = row(result?.error);
      const outcome = result?.ok ? { kind: 'result', value: claim.kind === 'approval' ? result.value?.outcome : result.value?.answer }
        : { kind: 'rejected', error: { name: typeof error.name === 'string' ? error.name : 'Error', message: typeof error.message === 'string' ? error.message : 'Interaction rejected', ...(typeof error.code === 'string' ? { code: error.code } : {}) } };
      const receipt = await gateway.dispatchRpc('$events/result', { args: { clientId: [...claim.clients][0], eventId: message.rpcId, outcome } }, signal ?? new AbortController().signal);
      if (!receipt.ok) throw new Error('Host interaction response rejected');
      pending.delete(message.rpcId);
      return Response.json({ accepted: true });
    }
    try {
      const value = await rpc(message.method, message.payload, message.rpcId, signal);
      return Response.json({ type: 'server-response', rpcId: message.rpcId, result: { ok: true, value } });
    } catch (error) {
      if (signal?.aborted) throw error;
      const failure = row(error);
      return Response.json({ type: 'server-response', rpcId: message.rpcId, result: { ok: false, error: {
        message: error instanceof Error ? error.message : String(error), code: failure.code, details: failure.details,
      } } });
    }
  };
  const createWebSocket = (): WebSocket => {
    const socket = new EventTarget() as EventTarget & { readyState: number; close(): void };
    const lifetime = new AbortController();
    let clientId = '';
    const deliveries = new Map<string, Claim>();
    socket.readyState = 0;
    const emit = (payload: Row, rpcId: string = randomUUID()) => socket.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'server-request', rpcId, method: payload.type, payload }) }));
    const off = ctx.on('session/event', (session, event) => {
      if (socket.readyState === 1) emit({ type: 'session/event', sessionId: session.id, event });
    });
    socket.close = () => {
      if (socket.readyState === 3) return;
      socket.readyState = 3;
      lifetime.abort(); off();
      for (const [id, claim] of pending) {
        claim.clients.delete(clientId);
        if (claim.clients.size === 0) pending.delete(id);
      }
      deliveries.clear();
      socket.dispatchEvent(new Event('close'));
    };
    void (async () => {
      const stream = await gateway.openWireStream('$events', { args: {} }, lifetime.signal);
      for await (const frame of stream) {
        if (lifetime.signal.aborted) break;
        if (typeof frame.clientId === 'string') {
          clientId = frame.clientId; socket.readyState = 1; socket.dispatchEvent(new Event('open'));
        } else if (frame.type === 'waterfall' && (frame.event === 'approval/request' || frame.event === 'user-questions/request')) {
          const id = String(frame.eventId);
          const request = row(frame.request);
          const kind = frame.event === 'approval/request' ? 'approval' : 'question';
          const sessionId = String(frame.agentId);
          const claim = pending.get(id) ?? { clients: new Set<string>(), kind, sessionId, approvalId: kind === 'approval' ? id : undefined };
          claim.clients.add(clientId); pending.set(id, claim); deliveries.set(id, claim);
          emit({ ...request, type: `${kind}/requested`, sessionId, ...(kind === 'approval' ? { approvalId: id } : {}) }, id);
        } else if (frame.type === 'cancel') {
          const id = String(frame.eventId); const claim = deliveries.get(id);
          if (claim) {
            pending.delete(id); deliveries.delete(id);
            emit({ type: `${claim.kind}/resolved`, sessionId: claim.sessionId, questionRpcId: id, approvalId: claim.approvalId, outcome: 'cancelled' }, id);
          }
        }
      }
      socket.close();
    })().catch(() => {
      if (!lifetime.signal.aborted) socket.dispatchEvent(new Event('error'));
      socket.close();
    });
    return socket as unknown as WebSocket;
  };
  return { fetchImpl, createWebSocket };
}
