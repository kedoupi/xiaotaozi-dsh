// @ts-nocheck
import { withSessionBindingLock } from './session-binding-lock.ts';
import { BOT_FOLLOW_KEY } from './session-follow.ts';
import { t } from './i18n.ts';
import { pluginTrace, shortId, shortKey } from '../../trace.ts';

export const WORKSPACE_SESSION_STALE = 'workspace-session-stale';

const STALE_FOLLOW_TEXT = '跟进的会话已不存在，已解除跟进。请重新选择要跟进的会话，或发送 /new 开始新会话。';

function workspaceSession(harness, sessionId) {
  if (typeof harness.workspaceSession === 'function') {
    return harness.workspaceSession(sessionId);
  }
  return Object.freeze({
    sessionId,
    sessionExists: (...args) => harness.sessionExists(sessionId, ...args),
    models: (...args) => harness.getSessionModels(sessionId, ...args),
    selectModel: (...args) => harness.selectSessionModel(sessionId, ...args),
    isRunning: (...args) => harness.isSessionRunning(sessionId, ...args),
    hasActiveTurn: (...args) => harness.hasActiveTurn(sessionId, ...args),
    stopActiveTurn: (...args) => harness.stopActiveTurn(sessionId, ...args),
    steerActiveTurn: (...args) => harness.steerActiveTurn(sessionId, ...args),
    ask: (...args) => harness.ask(sessionId, ...args),
  });
}

async function sessionExists(session, options) {
  return options === undefined
    ? session.sessionExists()
    : session.sessionExists(options);
}

async function createSession(harness, options) {
  return options === undefined
    ? harness.createSession()
    : harness.createSession(options);
}

async function existingSession(harness, sessionId, existsOptions) {
  if (typeof sessionId !== 'string' || !sessionId) return null;
  if (typeof harness.workspaceSession !== 'function'
    && typeof harness.sessionExists !== 'function') {
    // Without an existence probe the binding can only be trusted.
    return { sessionId, session: workspaceSession(harness, sessionId) };
  }
  const session = workspaceSession(harness, sessionId);
  return await sessionExists(session, existsOptions) ? { sessionId, session } : null;
}

/**
 * Resolve the Session the next prompt or Session command must use: Follow
 * first, then the conversation binding. A followed Session that no longer
 * exists is stale: clear it and report instead of silently falling back to an
 * older conversation Session.
 */
export async function resolveActiveSession(harness, state, key, existsOptions) {
  if (typeof state?.sessionFor !== 'function') return null;
  if (key !== BOT_FOLLOW_KEY) {
    const followId = state.sessionFor(BOT_FOLLOW_KEY);
    if (typeof followId === 'string' && followId) {
      const follow = await existingSession(harness, followId, existsOptions);
      if (follow) return follow;
      await state.clearSession?.(BOT_FOLLOW_KEY);
      return { stale: true, sessionId: followId };
    }
  }
  const bound = state.sessionFor(key);
  if (typeof bound === 'string' && bound) {
    return existingSession(harness, bound, existsOptions);
  }
  return null;
}

export function staleFollowResult() {
  return { sessionId: null, staleFollow: true, answer: t(STALE_FOLLOW_TEXT) };
}

const NEW_SESSION_FOLLOW_CLEARED = '已断开网页会话。请发送问题开始新会话。';
const NEW_SESSION_UNBOUND = '下一条消息将开启新会话。';

/**
 * /new unbinds the current chat. An active Follow is cleared first so the
 * next prompt cannot keep routing into the web Session. The Session itself
 * is left in place.
 */
export async function startNewConversation(state, conversationKey) {
  const followId = typeof state?.sessionFor === 'function'
    ? state.sessionFor(BOT_FOLLOW_KEY)
    : null;
  const clearedFollow = typeof followId === 'string' && followId.length > 0;
  if (clearedFollow) await state.clearSession(BOT_FOLLOW_KEY);
  if (typeof conversationKey === 'string' && conversationKey) {
    await state?.clearSession?.(conversationKey);
  }
  return {
    clearedFollow,
    message: t(clearedFollow ? NEW_SESSION_FOLLOW_CLEARED : NEW_SESSION_UNBOUND),
  };
}

/**
 * Resolve, persist, and ask through a session that belongs to the bot's
 * current workspace. A concurrent workspace switch invalidates the scoped
 * session and retries before any prompt is sent to the stale session.
 */
export async function askInWorkspaceSession({
  harness,
  state,
  key,
  text,
  content,
  createOptions,
  existsOptions,
  askOptions,
}) {
  while (true) {
    try {
      // Reuse is first work too: never probe or ask a persisted session while
      // the bot workspace is still unconfirmed. The typeof guard keeps the
      // microtask schedule unchanged for harnesses without the fence.
      if (typeof harness.whenWorkspaceReady === 'function') {
        await harness.whenWorkspaceReady({
          signal: createOptions?.signal ?? existsOptions?.signal,
        });
      }
      const binding = await withSessionBindingLock(state, key, async () => {
        const resolved = await resolveActiveSession(harness, state, key, existsOptions);
        if (resolved?.stale === true) return resolved;
        if (resolved) {
          pluginTrace('dsh-im:session', `reuse key=${shortKey(key)} session=${shortId(resolved.sessionId)}`);
          return resolved;
        }
        const sessionId = await createSession(harness, createOptions);
        if (await state.setSession(key, sessionId) === false) return null;
        pluginTrace('dsh-im:session', `create key=${shortKey(key)} session=${shortId(sessionId)}`);
        return { sessionId, session: workspaceSession(harness, sessionId) };
      });
      if (!binding) continue;
      if (binding.stale === true) return staleFollowResult();
      const artifacts = [];
      const originalOnArtifact = typeof askOptions === 'object'
        && typeof askOptions?.onArtifact === 'function'
        ? askOptions.onArtifact
        : null;
      const artifactOptions = typeof askOptions === 'number'
        ? { timeoutMs: askOptions }
        : { ...askOptions };
      artifactOptions.onArtifact = async (artifact) => {
        artifacts.push(artifact);
        await originalOnArtifact?.(artifact);
      };
      const answer = await binding.session.ask(content ?? text, artifactOptions);
      return {
        sessionId: binding.sessionId,
        answer,
        ...(artifacts.length > 0 ? { artifacts } : {}),
      };
    } catch (error) {
      if (error?.code !== WORKSPACE_SESSION_STALE) throw error;
    }
  }
}
