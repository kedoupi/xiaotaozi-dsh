import { withSessionBindingLock } from './session-binding-lock.ts';
import { BOT_FOLLOW_KEY } from './session-follow.ts';
import { t } from './i18n.ts';
import { pluginTrace, shortId, shortKey } from '../../trace.ts';

export const WORKSPACE_SESSION_STALE = 'workspace-session-stale';

const STALE_FOLLOW_TEXT = '网页会话已不存在，已断开 IM 会话。请重新选择要在 IM 中继续的会话，或发送 /new 开始新会话。';

type CodedError = { code?: unknown };

type SessionState = {
  sessionFor?: (key: unknown) => unknown;
  setSession?: (key: unknown, sessionId: unknown) => unknown;
  clearSession?: (key: unknown) => unknown;
};

type WorkspaceSessionHandle = {
  sessionId: string;
  sessionExists: (...args: unknown[]) => unknown;
  models: (...args: unknown[]) => unknown;
  selectModel: (...args: unknown[]) => unknown;
  isRunning: (...args: unknown[]) => unknown;
  hasActiveTurn: (...args: unknown[]) => unknown;
  stopActiveTurn: (...args: unknown[]) => unknown;
  steerActiveTurn: (...args: unknown[]) => unknown;
  ask: (...args: unknown[]) => unknown;
};

type WorkspaceHarness = {
  workspaceSession?: (sessionId: string) => WorkspaceSessionHandle;
  sessionExists?: (sessionId: string, ...args: unknown[]) => unknown;
  getSessionModels?: (sessionId: string, ...args: unknown[]) => unknown;
  selectSessionModel?: (sessionId: string, ...args: unknown[]) => unknown;
  isSessionRunning?: (sessionId: string, ...args: unknown[]) => unknown;
  hasActiveTurn?: (sessionId: string, ...args: unknown[]) => unknown;
  stopActiveTurn?: (sessionId: string, ...args: unknown[]) => unknown;
  steerActiveTurn?: (sessionId: string, ...args: unknown[]) => unknown;
  ask?: (sessionId: string, ...args: unknown[]) => unknown;
  createSession?: (options?: unknown) => unknown;
  whenWorkspaceReady?: (options?: { signal?: unknown }) => unknown;
};

type BoundSession = {
  sessionId: string;
  session: WorkspaceSessionHandle;
  stale?: false;
};

type StaleSession = {
  sessionId: string;
  stale: true;
};

type AskOptions = {
  timeoutMs?: unknown;
  onArtifact?: (artifact: unknown) => unknown;
} & Record<string, unknown>;

type AskInWorkspaceSessionInput = {
  harness?: unknown;
  state?: unknown;
  key?: unknown;
  text?: unknown;
  content?: unknown;
  createOptions?: { signal?: unknown } & Record<string, unknown>;
  existsOptions?: { signal?: unknown };
  askOptions?: AskOptions | number;
};

function workspaceSession(harness: WorkspaceHarness, sessionId: string): WorkspaceSessionHandle {
  if (typeof harness.workspaceSession === 'function') {
    return harness.workspaceSession(sessionId);
  }
  const client = harness as Required<Pick<
    WorkspaceHarness,
    | 'sessionExists'
    | 'getSessionModels'
    | 'selectSessionModel'
    | 'isSessionRunning'
    | 'hasActiveTurn'
    | 'stopActiveTurn'
    | 'steerActiveTurn'
    | 'ask'
  >>;
  return Object.freeze({
    sessionId,
    sessionExists: (...args: unknown[]) => client.sessionExists(sessionId, ...args),
    models: (...args: unknown[]) => client.getSessionModels(sessionId, ...args),
    selectModel: (...args: unknown[]) => client.selectSessionModel(sessionId, ...args),
    isRunning: (...args: unknown[]) => client.isSessionRunning(sessionId, ...args),
    hasActiveTurn: (...args: unknown[]) => client.hasActiveTurn(sessionId, ...args),
    stopActiveTurn: (...args: unknown[]) => client.stopActiveTurn(sessionId, ...args),
    steerActiveTurn: (...args: unknown[]) => client.steerActiveTurn(sessionId, ...args),
    ask: (...args: unknown[]) => client.ask(sessionId, ...args),
  });
}

async function sessionExists(session: WorkspaceSessionHandle, options: unknown) {
  return options === undefined
    ? session.sessionExists()
    : session.sessionExists(options);
}

async function createSession(harness: WorkspaceHarness, options: unknown) {
  const create = (harness as Required<Pick<WorkspaceHarness, 'createSession'>>).createSession;
  return options === undefined
    ? create()
    : create(options);
}

async function existingSession(
  harness: WorkspaceHarness,
  sessionId: unknown,
  existsOptions: unknown,
): Promise<BoundSession | null> {
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
export async function resolveActiveSession(
  harness: unknown,
  state: unknown,
  key: unknown,
  existsOptions?: unknown,
): Promise<BoundSession | StaleSession | null> {
  const store = state as SessionState | null | undefined;
  if (typeof store?.sessionFor !== 'function') return null;
  const client = harness as WorkspaceHarness;
  if (key !== BOT_FOLLOW_KEY) {
    const followId = store.sessionFor(BOT_FOLLOW_KEY);
    if (typeof followId === 'string' && followId) {
      const follow = await existingSession(client, followId, existsOptions);
      if (follow) return follow;
      await store.clearSession?.(BOT_FOLLOW_KEY);
      return { stale: true, sessionId: followId };
    }
  }
  const bound = store.sessionFor(key);
  if (typeof bound === 'string' && bound) {
    return existingSession(client, bound, existsOptions);
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
export async function startNewConversation(state: unknown, conversationKey: unknown) {
  const store = state as SessionState | null | undefined;
  const followId = typeof store?.sessionFor === 'function'
    ? store.sessionFor(BOT_FOLLOW_KEY)
    : null;
  const clearedFollow = typeof followId === 'string' && followId.length > 0;
  if (clearedFollow) await (store as Required<Pick<SessionState, 'clearSession'>>).clearSession(BOT_FOLLOW_KEY);
  if (typeof conversationKey === 'string' && conversationKey) {
    await store?.clearSession?.(conversationKey);
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
}: AskInWorkspaceSessionInput) {
  const client = harness as WorkspaceHarness;
  const store = state as SessionState;
  while (true) {
    try {
      // Reuse is first work too: never probe or ask a persisted session while
      // the bot workspace is still unconfirmed. The typeof guard keeps the
      // microtask schedule unchanged for harnesses without the fence.
      if (typeof client.whenWorkspaceReady === 'function') {
        await client.whenWorkspaceReady({
          signal: createOptions?.signal ?? existsOptions?.signal,
        });
      }
      const binding = await withSessionBindingLock(store as object, key as string, async () => {
        const resolved = await resolveActiveSession(client, store, key, existsOptions);
        if (resolved?.stale === true) return resolved;
        if (resolved) {
          pluginTrace('dsh-im:session', `reuse key=${shortKey(key)} session=${shortId(resolved.sessionId)}`);
          return resolved;
        }
        const sessionId = await createSession(client, createOptions);
        if (await (store as Required<Pick<SessionState, 'setSession'>>).setSession(key, sessionId) === false) {
          return null;
        }
        pluginTrace('dsh-im:session', `create key=${shortKey(key)} session=${shortId(sessionId)}`);
        return {
          sessionId: sessionId as string,
          session: workspaceSession(client, sessionId as string),
        };
      });
      if (!binding) continue;
      if (binding.stale === true) return staleFollowResult();
      const artifacts: unknown[] = [];
      const originalOnArtifact = typeof askOptions === 'object'
        && typeof askOptions?.onArtifact === 'function'
        ? askOptions.onArtifact
        : null;
      const artifactOptions: AskOptions = typeof askOptions === 'number'
        ? { timeoutMs: askOptions }
        : { ...askOptions };
      artifactOptions.onArtifact = async (artifact: unknown) => {
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
      if ((error as CodedError)?.code !== WORKSPACE_SESSION_STALE) throw error;
    }
  }
}
