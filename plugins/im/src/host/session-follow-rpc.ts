import { resolveRpcAuthority } from '../rpc-authority.ts';
import {
  bindSessionFollowByBot,
  clearSessionFollow,
  followBindingsGeneration,
  followSources,
  followProjectOf,
  listFollowBots,
  listFollowedSessions,
  locateFollowSessionProject,
  waitForFollowBindingsChange,
} from '../channels/shared/session-follow.ts';

export const IM_FOLLOW_RPC_CHANNEL = '/im';
export const IM_FOLLOW_ENDPOINTS = Object.freeze({
  list: 'session.follow.list',
  index: 'session.follow.index',
  watch: 'session.follow.watch',
  set: 'session.follow.set',
  clear: 'session.follow.clear',
});

const ENDPOINTS = Object.freeze(Object.values(IM_FOLLOW_ENDPOINTS));
const MAX_ID = 256;

type CodedError = { code?: unknown; message?: unknown };
type FollowItem = {
  sessionId?: unknown;
  channel?: unknown;
  botId?: unknown;
  name?: unknown;
  detail?: unknown;
  label?: unknown;
  selected?: unknown;
  ready?: unknown;
  reason?: unknown;
};
type HostCtx = {
  connection?: {
    rpc?: {
      handle?: (channel: string, handler: unknown, options?: unknown) => unknown;
    };
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: unknown, allowed: readonly string[]) {
  return isRecord(value) && Object.keys(value).every((key) => allowed.includes(key));
}

function validSessionId(value: unknown) {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID
    && !/[\s\u0000-\u001f]/.test(value);
}

function validChannel(value: unknown) {
  return typeof value === 'string' && value.length > 0 && value.length <= 32 && !/\s/.test(value);
}

function validBotId(value: unknown) {
  return typeof value === 'string' && value.length > 0 && value.length <= 128
    && !/[\s\u0000-\u001f]/.test(value);
}

export function followPayloadFailure(endpoint: unknown, payload: unknown) {
  if (!isRecord(payload)) return 'Payload must be an object.';
  if (endpoint === IM_FOLLOW_ENDPOINTS.list) {
    return exactKeys(payload, ['sessionId']) && validSessionId(payload.sessionId)
      ? null : 'session.follow.list requires a sessionId.';
  }
  if (endpoint === IM_FOLLOW_ENDPOINTS.index) {
    return exactKeys(payload, []) ? null : 'session.follow.index does not accept fields.';
  }
  if (endpoint === IM_FOLLOW_ENDPOINTS.watch) {
    return exactKeys(payload, ['generation']) && Number.isInteger(payload.generation)
      && (payload.generation as number) >= 0
      ? null
      : 'session.follow.watch requires a generation.';
  }
  if (endpoint === IM_FOLLOW_ENDPOINTS.set) {
    return exactKeys(payload, ['sessionId', 'channel', 'botId'])
      && validSessionId(payload.sessionId)
      && validChannel(payload.channel)
      && validBotId(payload.botId)
      ? null : 'session.follow.set requires sessionId, channel, and botId.';
  }
  if (endpoint === IM_FOLLOW_ENDPOINTS.clear) {
    return exactKeys(payload, ['sessionId']) && validSessionId(payload.sessionId)
      ? null : 'session.follow.clear requires a sessionId.';
  }
  return 'Unknown session-follow endpoint.';
}

function publicBot(item: FollowItem) {
  return {
    channel: item.channel,
    botId: item.botId,
    name: typeof item.name === 'string' && item.name ? item.name : item.label,
    detail: typeof item.detail === 'string' ? item.detail : '',
    label: item.label,
    selected: item.selected === true,
    ready: item.ready !== false,
    reason: typeof item.reason === 'string' ? item.reason : '',
  };
}

function constrainFollowProject(sources: any[]) {
  return sources.some((source) => followProjectOf(source) || typeof source.locateSession === 'function');
}

function listedIndex(sources: any[]) {
  return {
    generation: followBindingsGeneration(),
    items: listFollowedSessions(sources).map((item: FollowItem) => ({
      sessionId: item.sessionId,
      ...publicBot(item),
    })),
  };
}

async function listedBots(sources: any[], sessionId: unknown) {
  const constrain = constrainFollowProject(sources);
  const sessionProject = constrain ? await locateFollowSessionProject(sources, sessionId) : undefined;
  const listed = listFollowBots(sources, sessionId as string, sessionProject) as FollowItem[];
  const currentItem = listed.find((item) => item.selected) ?? null;
  const channels = listed.filter((item) => item.ready !== false).map(publicBot);
  const current = currentItem ? publicBot(currentItem) : null;
  const boundSession = listFollowedSessions(sources).find((item) => item.sessionId === sessionId);
  const bound = boundSession ? publicBot(boundSession) : null;
  return {
    channels,
    current,
    bound,
    sessionWorkspaceId: sessionProject?.workspaceId ?? null,
  };
}

export function createSessionFollowRpcHandler() {
  return async (endpoint: unknown, payload: unknown, signal?: { aborted?: unknown }) => {
    if (!(ENDPOINTS as readonly string[]).includes(endpoint as string)) {
      return { ok: false, error: { code: 'unknown-endpoint', message: 'Unknown session-follow endpoint.' } };
    }
    const failure = followPayloadFailure(endpoint, payload);
    if (failure) {
      return { ok: false, error: { code: 'invalid-payload', message: failure } };
    }
    const body = payload as Record<string, unknown>;
    try {
      const sources = followSources();
      if (endpoint === IM_FOLLOW_ENDPOINTS.list) {
        return { ok: true, value: await listedBots(sources, body.sessionId) };
      }
      if (endpoint === IM_FOLLOW_ENDPOINTS.index) {
        return { ok: true, value: listedIndex(sources) };
      }
      if (endpoint === IM_FOLLOW_ENDPOINTS.watch) {
        await waitForFollowBindingsChange(body.generation, signal);
        if (signal?.aborted) {
          return { ok: false, error: { code: 'cancelled', message: 'The request was cancelled.' } };
        }
        return { ok: true, value: listedIndex(followSources()) };
      }
      if (endpoint === IM_FOLLOW_ENDPOINTS.set) {
        const constrain = constrainFollowProject(sources);
        const sessionProject = constrain
          ? await locateFollowSessionProject(sources, body.sessionId)
          : undefined;
        await bindSessionFollowByBot(sources, {
          ...body,
          sessionProject,
        } as { sessionId: unknown; channel: unknown; botId: unknown; sessionProject: unknown });
      } else {
        await clearSessionFollow(sources, payload as { sessionId: unknown });
      }
      if (signal?.aborted) {
        return { ok: false, error: { code: 'cancelled', message: 'The request was cancelled.' } };
      }
      return { ok: true, value: await listedBots(followSources(), body.sessionId) };
    } catch (error) {
      const coded = error as CodedError | undefined;
      const code = coded?.code === 'follow-target-missing' || coded?.code === 'follow-workspace-mismatch'
        ? coded.code
        : 'follow-failed';
      const message = coded?.code === 'follow-workspace-mismatch'
        ? coded.message
        : '无法更新 IM 会话连接，请稍后重试。';
      return signal?.aborted
        ? { ok: false, error: { code: 'cancelled', message: 'The request was cancelled.' } }
        : { ok: false, error: { code, message } };
    }
  };
}

export function installSessionFollowRpc(ctx: unknown, authority: unknown) {
  const host = ctx as HostCtx | null | undefined;
  if (!host?.connection?.rpc || typeof host.connection.rpc.handle !== 'function') {
    throw new TypeError('DSH Host Connection RPC is required');
  }
  return host.connection.rpc.handle(
    IM_FOLLOW_RPC_CHANNEL,
    createSessionFollowRpcHandler(),
    { authority: resolveRpcAuthority(authority) },
  );
}
