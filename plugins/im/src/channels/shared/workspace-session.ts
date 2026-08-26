// @ts-nocheck
import { withSessionBindingLock } from './session-binding-lock.ts';
import { BOT_FOLLOW_KEY } from './session-follow.ts';

export const WORKSPACE_SESSION_STALE = 'workspace-session-stale';

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
  const session = workspaceSession(harness, sessionId);
  return await sessionExists(session, existsOptions) ? { sessionId, session } : null;
}

async function resolveBoundSession(harness, state, key, existsOptions) {
  if (typeof state?.sessionFor !== 'function') return null;
  const ids = [];
  if (key !== BOT_FOLLOW_KEY) {
    const followId = state.sessionFor(BOT_FOLLOW_KEY);
    if (typeof followId === 'string' && followId) ids.push(followId);
  }
  const bound = state.sessionFor(key);
  if (typeof bound === 'string' && bound && !ids.includes(bound)) ids.push(bound);
  for (const sessionId of ids) {
    const matched = await existingSession(harness, sessionId, existsOptions);
    if (matched) return matched;
  }
  return null;
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
      const binding = await withSessionBindingLock(state, key, async () => {
        const existing = await resolveBoundSession(harness, state, key, existsOptions);
        if (existing) return existing;
        const sessionId = await createSession(harness, createOptions);
        if (await state.setSession(key, sessionId) === false) return null;
        return { sessionId, session: workspaceSession(harness, sessionId) };
      });
      if (!binding) continue;
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
