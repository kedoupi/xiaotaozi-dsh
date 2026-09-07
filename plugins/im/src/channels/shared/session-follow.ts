import { t } from './i18n.ts';

type CodedError = Error & { code?: string };

type FollowProject = {
  workspaceId?: unknown;
  title?: unknown;
};

type FollowState = {
  snapshot?: () => unknown;
  sessions?: unknown;
  setSession?: (...args: unknown[]) => unknown;
  clearSession?: (...args: unknown[]) => unknown;
  clearSessions?: (...args: unknown[]) => unknown;
};

type FollowSource = {
  channel: string;
  botId?: unknown;
  state?: FollowState | null;
  name?: unknown;
  detail?: unknown;
  project?: unknown;
  generation?: unknown;
  locateSession?: (sessionId: string) => unknown;
};

type FollowSourceInput = {
  channel?: unknown;
  botId?: unknown;
  state?: unknown;
  name?: unknown;
  detail?: unknown;
  project?: unknown;
  generation?: unknown;
  locateSession?: unknown;
};

type FollowReady = {
  ready: boolean;
  reason: string;
};

type FollowWaiter = () => void;

type AbortableSignal = {
  aborted?: unknown;
  addEventListener?: (type: string, listener: () => void, options?: { once?: boolean }) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
};

type FollowFence = {
  project: FollowProject | null;
  workspaceId: unknown;
  generation: unknown;
};

type FollowBindInput = {
  sessionId?: unknown;
  channel?: unknown;
  botId?: unknown;
  key?: unknown;
  fence?: FollowFence;
};

type FollowBindByBotInput = {
  sessionId?: unknown;
  channel?: unknown;
  botId?: unknown;
  sessionProject?: unknown;
};

type ChannelCountMap = Record<string, number>;

const sources = new Map<string, FollowSource>();
const tappedFollowStates = new WeakSet<object>();
const followWaiters = new Set<FollowWaiter>();
let followGeneration = 0;

function translatedText(text: string, params?: Record<string, unknown> | null) {
  return t(text, params) as string;
}

function asFollowState(state: unknown): FollowState | null {
  return state && typeof state === 'object' ? state as FollowState : null;
}

function asFollowProject(value: unknown): FollowProject | null {
  if (!value || typeof value !== 'object') return null;
  const project = value as FollowProject;
  return typeof project.workspaceId === 'string' && project.workspaceId ? project : null;
}

export function followBindingsGeneration() {
  return followGeneration;
}

export function notifyFollowBindingsChanged() {
  followGeneration += 1;
  const pending = [...followWaiters];
  followWaiters.clear();
  for (const resolve of pending) resolve();
}

export function waitForFollowBindingsChange(seen: unknown, signal?: AbortableSignal | null, timeoutMs = 8_000) {
  if (followGeneration !== seen) return Promise.resolve(followGeneration);
  return new Promise<number>((resolve) => {
    const finish = () => {
      followWaiters.delete(finish);
      signal?.removeEventListener?.('abort', finish);
      if (timer) clearTimeout(timer);
      resolve(followGeneration);
    };
    followWaiters.add(finish);
    const timer = Number.isFinite(timeoutMs) && timeoutMs > 0
      ? setTimeout(finish, timeoutMs)
      : null;
    signal?.addEventListener?.('abort', finish, { once: true });
  });
}

function tapFollowState(state: unknown) {
  if (!state || typeof state !== 'object' || tappedFollowStates.has(state)) return;
  tappedFollowStates.add(state);
  const record = state as FollowState & Record<string, unknown>;
  for (const method of ['setSession', 'clearSession', 'clearSessions'] as const) {
    const original = record[method];
    if (typeof original !== 'function') continue;
    record[method] = async function imFollowTap(...args: unknown[]) {
      const result = await original.apply(this, args);
      notifyFollowBindingsChanged();
      return result;
    };
  }
}

export const FOLLOW_CHANNEL_LABELS: Readonly<Record<string, string>> = Object.freeze({
  weixin: '微信',
  feishu: '飞书',
  dingtalk: '钉钉',
  wecom: '企业微信',
  qq: 'QQ',
  slack: 'Slack',
  telegram: 'Telegram',
  discord: 'Discord',
  whatsapp: 'WhatsApp',
});

export const FOLLOW_CHANNEL_ORDER = Object.freeze(Object.keys(FOLLOW_CHANNEL_LABELS));
export const BOT_FOLLOW_KEY = '__follow__';

function sourceId(channel: string, botId: unknown) {
  return `${channel}\0${String(botId)}`;
}

function resolvedFollowField(value: unknown) {
  const raw = typeof value === 'function' ? value() : value;
  return typeof raw === 'string' ? raw.trim() : '';
}

export function registerFollowSource({
  channel,
  botId,
  state,
  name,
  detail,
  project,
  generation,
  locateSession,
}: FollowSourceInput) {
  if (typeof channel !== 'string' || !channel || !state) return () => {};
  tapFollowState(state);
  const id = sourceId(channel, botId ?? 'default');
  const record: FollowSource = {
    channel,
    botId: botId ?? 'default',
    name,
    detail,
    state: asFollowState(state),
    project,
    generation,
    locateSession: typeof locateSession === 'function'
      ? locateSession as FollowSource['locateSession']
      : undefined,
  };
  sources.set(id, record);
  return () => {
    if (sources.get(id) === record) sources.delete(id);
  };
}

export function followProjectOf(source: FollowSourceInput | FollowSource | null | undefined) {
  const value = typeof source?.project === 'function' ? source.project() : source?.project;
  return asFollowProject(value);
}

export async function locateFollowSessionProject(
  sourceList: Iterable<FollowSource> | null | undefined,
  sessionId: unknown,
) {
  if (typeof sessionId !== 'string' || !sessionId) return null;
  for (const source of sourceList ?? []) {
    if (typeof source.locateSession !== 'function') continue;
    try {
      const project = asFollowProject(await source.locateSession(sessionId));
      if (project) return project;
    } catch {
      // Try the next bot; one missing lookup must not hide the others.
    }
  }
  return null;
}

function followReady(
  source: FollowSource,
  sessionProject: unknown,
  sourceProject = followProjectOf(source),
): FollowReady {
  if (sessionProject === undefined) return { ready: true, reason: '' };
  const project = sessionProject as FollowProject | null | undefined;
  if (!project?.workspaceId) {
    return { ready: false, reason: translatedText('找不到这个会话的项目') };
  }
  if (sourceProject?.workspaceId === project.workspaceId) {
    return { ready: true, reason: '' };
  }
  return {
    ready: false,
    reason: sourceProject
      ? translatedText('项目是 {project}', { project: sourceProject.title || translatedText('未命名项目') })
      : translatedText('未选择项目'),
  };
}

export function followSourceName(bot: unknown): string {
  if (typeof bot === 'function') return followSourceName(bot());
  if (!bot || typeof bot !== 'object') return '';
  const record = bot as Record<string, unknown>;
  for (const key of ['botName', 'name', 'nickname', 'displayName'] as const) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export async function preloadFollowSources<T>(items: unknown, load: (item: T) => unknown) {
  await Promise.all((Array.isArray(items) ? items : []).map(async (item) => {
    try {
      await load(item as T);
    } catch {
      // A corrupt bot state must not hide the other follow sources.
    }
  }));
}

export function followSources() {
  return [...sources.values()];
}

export function resetFollowSources() {
  sources.clear();
}

export function describeFollowKey(key: unknown) {
  if (typeof key !== 'string' || !key) return '';
  const [kind, ...rest] = key.split(':');
  const raw = rest.join(':') || key;
  const short = raw.length > 10 ? `…${raw.slice(-6)}` : raw;
  if (kind === 'group') return `群 ${short}`;
  if (kind === 'direct' || kind === 'p2p') return `私聊 ${short}`;
  return short || key;
}

export function followTargetLabel(channel: unknown, key: unknown) {
  const channelLabel = FOLLOW_CHANNEL_LABELS[channel as string] ?? channel;
  const keyLabel = describeFollowKey(key);
  return keyLabel ? `${channelLabel} · ${keyLabel}` : channelLabel;
}

function sessionsOf(state: unknown): Record<string, unknown> {
  const record = asFollowState(state);
  if (!record) return {};
  const snapshot = typeof record.snapshot === 'function' ? record.snapshot() : state;
  const sessions = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
    ? (snapshot as { sessions?: unknown }).sessions ?? record.sessions
    : record.sessions;
  return sessions && typeof sessions === 'object' && !Array.isArray(sessions)
    ? { ...sessions as Record<string, unknown> }
    : {};
}

export function listFollowTargets(sourceList: Iterable<FollowSource> = followSources()) {
  const botCounts: ChannelCountMap = {};
  for (const source of sourceList) {
    botCounts[source.channel] = (botCounts[source.channel] ?? 0) + 1;
  }
  const items = [];
  for (const source of sourceList) {
    for (const [key, sessionId] of Object.entries(sessionsOf(source.state))) {
      if (key === BOT_FOLLOW_KEY) continue;
      if (typeof key !== 'string' || !key || typeof sessionId !== 'string' || !sessionId) continue;
      const label = followTargetLabel(source.channel, key);
      items.push({
        channel: source.channel,
        botId: source.botId,
        key,
        sessionId,
        label: botCounts[source.channel] > 1 ? `${label} (${source.botId})` : label,
      });
    }
  }
  return items;
}

export function followersForSession(sessionId: unknown, sourceList: Iterable<FollowSource> = followSources()) {
  if (typeof sessionId !== 'string' || !sessionId) return [];
  return listFollowTargets(sourceList).filter((item) => item.sessionId === sessionId);
}

export function listFollowedSessions(sourceList: Iterable<FollowSource> = followSources()) {
  const channelCounts: ChannelCountMap = {};
  for (const source of sourceList) {
    channelCounts[source.channel] = (channelCounts[source.channel] ?? 0) + 1;
  }
  const bySession = new Map<string, {
    sessionId: string;
    channel: string;
    botId: unknown;
    name: string;
    detail: string;
    label: string;
    preferred: boolean;
  }>();
  const remember = (sessionId: unknown, source: FollowSource, preferred: unknown) => {
    if (typeof sessionId !== 'string' || !sessionId) return;
    const existing = bySession.get(sessionId);
    if (existing?.preferred && !preferred) return;
    bySession.set(sessionId, {
      sessionId,
      channel: source.channel,
      botId: source.botId,
      name: botName(source, channelCounts),
      detail: resolvedFollowField(source.detail),
      label: botLabel(source, channelCounts),
      preferred: preferred === true,
    });
  };
  for (const source of sourceList) {
    const sessions = sessionsOf(source.state);
    const followed = sessions[BOT_FOLLOW_KEY];
    remember(followed, source, true);
    // A bot follow is exclusive. Inbound chat maps for other sessions must
    // not keep the previous row's channel logo after the user switches.
    for (const [key, sessionId] of Object.entries(sessions)) {
      if (key === BOT_FOLLOW_KEY) continue;
      if (typeof followed === 'string' && followed && sessionId !== followed) continue;
      remember(sessionId, source, false);
    }
  }
  return [...bySession.values()].map(({ preferred: _preferred, ...item }) => item);
}

function shortBotId(botId: unknown) {
  const raw = String(botId ?? '');
  return raw.length > 12 ? `${raw.slice(0, 8)}…` : raw;
}

export function defaultFollowBotName(channel: unknown) {
  const names: Record<string, string> = {
    weixin: '微信机器人',
    feishu: '飞书机器人',
    wecom: '企业微信机器人',
    dingtalk: '钉钉机器人',
    qq: 'QQ机器人',
  };
  return names[channel as string] ?? '';
}

function botName(source: FollowSource, channelCounts: ChannelCountMap) {
  const name = resolvedFollowField(source?.name) || followSourceName(source);
  if (name) return name;
  if ((channelCounts[source.channel] ?? 0) > 1) return shortBotId(source.botId);
  return defaultFollowBotName(source.channel)
    || (FOLLOW_CHANNEL_LABELS[source.channel] ?? source.channel);
}

function botLabel(source: FollowSource, channelCounts: ChannelCountMap) {
  const channelLabel = FOLLOW_CHANNEL_LABELS[source.channel] ?? source.channel;
  const name = botName(source, channelCounts);
  return name && name !== channelLabel ? `${channelLabel} · ${name}` : channelLabel;
}

export function listFollowBots(
  sourceList: Iterable<FollowSource> = followSources(),
  sessionId = '',
  sessionProject: unknown = undefined,
) {
  const channelCounts: ChannelCountMap = {};
  for (const source of sourceList) {
    channelCounts[source.channel] = (channelCounts[source.channel] ?? 0) + 1;
  }
  return [...sourceList]
    .map((source) => {
      const sessions = sessionsOf(source.state);
      const selected = sessions[BOT_FOLLOW_KEY] === sessionId;
      const { ready, reason } = followReady(source, sessionProject);
      return {
        channel: source.channel,
        botId: source.botId,
        name: botName(source, channelCounts),
        detail: resolvedFollowField(source.detail),
        label: botLabel(source, channelCounts),
        selected,
        ready,
        reason,
      };
    })
    .sort((left, right) => {
      const leftOrder = FOLLOW_CHANNEL_ORDER.indexOf(left.channel);
      const rightOrder = FOLLOW_CHANNEL_ORDER.indexOf(right.channel);
      const byChannel = (leftOrder === -1 ? 99 : leftOrder) - (rightOrder === -1 ? 99 : rightOrder);
      if (byChannel !== 0) return byChannel;
      return String(left.botId).localeCompare(String(right.botId));
    });
}

export function listFollowChannels(
  sourceList: Iterable<FollowSource> = followSources(),
  sessionId = '',
  sessionProject: unknown = undefined,
) {
  return listFollowBots(sourceList, sessionId, sessionProject);
}

function followWorkspaceMismatch() {
  const error = new Error(translatedText('这个机器人只能在 IM 中继续自己项目里的会话。')) as CodedError;
  error.code = 'follow-workspace-mismatch';
  return error;
}

function followFence(source: FollowSource): FollowFence {
  const project = followProjectOf(source);
  const generation = typeof source?.generation === 'function'
    ? source.generation()
    : source?.generation;
  return { project, workspaceId: project?.workspaceId ?? null, generation };
}

function followFenceMatches(source: FollowSource, fence: FollowFence) {
  const current = followFence(source);
  return current.workspaceId === fence.workspaceId
    && Object.is(current.generation, fence.generation);
}

export async function bindSessionFollowByBot(
  sourceList: readonly FollowSource[],
  { sessionId, channel, botId, sessionProject }: FollowBindByBotInput,
) {
  const source = matchingSource(sourceList, channel, botId);
  if (!source) {
    const error = new Error('IM conversation is not available') as CodedError;
    error.code = 'follow-target-missing';
    throw error;
  }
  let resolved = sessionProject;
  if (resolved === undefined) {
    const constrain = sourceList.some((item) => followProjectOf(item) || typeof item.locateSession === 'function');
    resolved = constrain ? await locateFollowSessionProject(sourceList, sessionId) : undefined;
  }
  const fence = followFence(source);
  const { ready } = followReady(source, resolved, fence.project);
  if (!ready) throw followWorkspaceMismatch();
  await bindSessionFollow(sourceList, {
    sessionId,
    channel,
    botId,
    key: BOT_FOLLOW_KEY,
    fence,
  });
}

function matchingSource(sourceList: readonly FollowSource[], channel: unknown, botId: unknown) {
  return sourceList.find((source) => source.channel === channel && source.botId === botId) ?? null;
}

// Serialize Follow clear-then-set so concurrent binds cannot interleave and
// leave two bots following the same session.
let followMutationQueue = Promise.resolve();

export async function bindSessionFollow(
  sourceList: readonly FollowSource[],
  { sessionId, channel, botId, key, fence }: FollowBindInput,
) {
  const operation = followMutationQueue.then(async () => {
    const source = matchingSource(sourceList, channel, botId);
    if (!source || typeof source.state?.setSession !== 'function'
      || (fence && typeof source.state?.clearSession !== 'function')) {
      const error = new Error('IM conversation is not available') as CodedError;
      error.code = 'follow-target-missing';
      throw error;
    }
    if (fence && !followFenceMatches(source, fence)) throw followWorkspaceMismatch();
    await clearSessionFollow(sourceList, { sessionId });
    if (fence && !followFenceMatches(source, fence)) throw followWorkspaceMismatch();
    await source.state.setSession!(key, sessionId);
    if (fence && !followFenceMatches(source, fence)) {
      try {
        await source.state.clearSession!(key);
      } finally {
        throw followWorkspaceMismatch();
      }
    }
  });
  followMutationQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

export async function clearSessionFollow(
  sourceList: Iterable<FollowSource>,
  { sessionId }: { sessionId?: unknown },
) {
  if (typeof sessionId !== 'string' || !sessionId) return;
  for (const source of sourceList) {
    if (typeof source.state?.clearSession !== 'function') continue;
    for (const [key, bound] of Object.entries(sessionsOf(source.state))) {
      if (bound === sessionId) await source.state.clearSession(key);
    }
  }
}
