// @ts-nocheck
import { resolveRpcAuthority } from '../rpc-authority.ts';
import {
  bindSessionFollowByBot,
  clearSessionFollow,
  followBindingsGeneration,
  followSources,
  followWorkspaceOf,
  listFollowBots,
  listFollowedSessions,
  locateFollowSessionWorkspace,
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

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, allowed) {
  return isRecord(value) && Object.keys(value).every((key) => allowed.includes(key));
}

function validSessionId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID
    && !/[\s\u0000-\u001f]/.test(value);
}

function validChannel(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 32 && !/\s/.test(value);
}

function validBotId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 128
    && !/[\s\u0000-\u001f]/.test(value);
}

export function followPayloadFailure(endpoint, payload) {
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
      && payload.generation >= 0
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

function publicBot(item) {
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

function constrainFollowWorkspace(sources) {
  return sources.some((source) => followWorkspaceOf(source) || typeof source.locateSession === 'function');
}

function listedIndex(sources) {
  return {
    generation: followBindingsGeneration(),
    items: listFollowedSessions(sources).map((item) => ({
      sessionId: item.sessionId,
      ...publicBot(item),
    })),
  };
}

async function listedBots(sources, sessionId) {
  const constrain = constrainFollowWorkspace(sources);
  const located = constrain ? await locateFollowSessionWorkspace(sources, sessionId) : undefined;
  const sessionWorkspace = constrain ? (located || null) : undefined;
  const listed = listFollowBots(sources, sessionId, sessionWorkspace);
  const currentItem = listed.find((item) => item.selected) ?? null;
  const channels = listed.filter((item) => item.ready !== false).map(publicBot);
  const current = currentItem ? publicBot(currentItem) : null;
  return { channels, current, sessionWorkspace };
}

export function createSessionFollowRpcHandler() {
  return async (endpoint, payload, signal) => {
    if (!ENDPOINTS.includes(endpoint)) {
      return { ok: false, error: { code: 'unknown-endpoint', message: 'Unknown session-follow endpoint.' } };
    }
    const failure = followPayloadFailure(endpoint, payload);
    if (failure) {
      return { ok: false, error: { code: 'invalid-payload', message: failure } };
    }
    try {
      const sources = followSources();
      if (endpoint === IM_FOLLOW_ENDPOINTS.list) {
        return { ok: true, value: await listedBots(sources, payload.sessionId) };
      }
      if (endpoint === IM_FOLLOW_ENDPOINTS.index) {
        return { ok: true, value: listedIndex(sources) };
      }
      if (endpoint === IM_FOLLOW_ENDPOINTS.watch) {
        await waitForFollowBindingsChange(payload.generation, signal);
        if (signal?.aborted) {
          return { ok: false, error: { code: 'cancelled', message: 'The request was cancelled.' } };
        }
        return { ok: true, value: listedIndex(followSources()) };
      }
      if (endpoint === IM_FOLLOW_ENDPOINTS.set) {
        const constrain = constrainFollowWorkspace(sources);
        const located = constrain ? await locateFollowSessionWorkspace(sources, payload.sessionId) : undefined;
        await bindSessionFollowByBot(sources, {
          ...payload,
          sessionWorkspace: constrain ? (located || null) : undefined,
        });
      } else {
        await clearSessionFollow(sources, payload);
      }
      if (signal?.aborted) {
        return { ok: false, error: { code: 'cancelled', message: 'The request was cancelled.' } };
      }
      return { ok: true, value: await listedBots(followSources(), payload.sessionId) };
    } catch (error) {
      const code = error?.code === 'follow-target-missing' || error?.code === 'follow-workspace-mismatch'
        ? error.code
        : 'follow-failed';
      const message = error?.code === 'follow-workspace-mismatch'
        ? error.message
        : '无法更新 IM 会话连接，请稍后重试。';
      return signal?.aborted
        ? { ok: false, error: { code: 'cancelled', message: 'The request was cancelled.' } }
        : { ok: false, error: { code, message } };
    }
  };
}

export function installSessionFollowRpc(ctx, authority) {
  if (!ctx?.connection?.rpc || typeof ctx.connection.rpc.handle !== 'function') {
    throw new TypeError('DSH Host Connection RPC is required');
  }
  return ctx.connection.rpc.handle(
    IM_FOLLOW_RPC_CHANNEL,
    createSessionFollowRpcHandler(),
    { authority: resolveRpcAuthority(authority) },
  );
}
