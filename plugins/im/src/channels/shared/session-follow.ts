// @ts-nocheck
import { resolve } from 'node:path';

import { t } from './i18n.ts';

const sources = new Map();
const tappedFollowStates = new WeakSet();
const followWaiters = new Set();
let followGeneration = 0;

export function followBindingsGeneration() {
  return followGeneration;
}

export function notifyFollowBindingsChanged() {
  followGeneration += 1;
  const pending = [...followWaiters];
  followWaiters.clear();
  for (const resolve of pending) resolve();
}

export function waitForFollowBindingsChange(seen, signal, timeoutMs = 8_000) {
  if (followGeneration !== seen) return Promise.resolve(followGeneration);
  return new Promise((resolve) => {
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

function tapFollowState(state) {
  if (!state || typeof state !== 'object' || tappedFollowStates.has(state)) return;
  tappedFollowStates.add(state);
  for (const method of ['setSession', 'clearSession', 'clearSessions']) {
    const original = state[method];
    if (typeof original !== 'function') continue;
    state[method] = async function imFollowTap(...args) {
      const result = await original.apply(this, args);
      notifyFollowBindingsChanged();
      return result;
    };
  }
}

export const FOLLOW_CHANNEL_LABELS = Object.freeze({
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

function sourceId(channel, botId) {
  return `${channel}\0${String(botId)}`;
}

function resolvedFollowField(value) {
  const raw = typeof value === 'function' ? value() : value;
  return typeof raw === 'string' ? raw.trim() : '';
}

export function registerFollowSource({ channel, botId, state, name, detail, workspace, locateSession }) {
  if (typeof channel !== 'string' || !channel || !state) return () => {};
  tapFollowState(state);
  const id = sourceId(channel, botId ?? 'default');
  const record = {
    channel,
    botId: botId ?? 'default',
    name,
    detail,
    state,
    workspace,
    locateSession: typeof locateSession === 'function' ? locateSession : undefined,
  };
  sources.set(id, record);
  return () => {
    if (sources.get(id) === record) sources.delete(id);
  };
}

export function followLocateSession(harness) {
  return async (sessionId) => {
    if (typeof sessionId !== 'string' || !sessionId || !harness) return '';
    if (typeof harness.locateWorkspaceSession === 'function') {
      const path = await harness.locateWorkspaceSession(sessionId);
      return typeof path === 'string' ? path.trim() : '';
    }
    if (typeof harness.adoptWorkspaceSession === 'function') {
      const adopted = await harness.adoptWorkspaceSession(sessionId);
      return typeof adopted?.workspace === 'string' ? adopted.workspace.trim() : '';
    }
    return '';
  };
}

export function followWorkspaceOf(source) {
  const value = typeof source?.workspace === 'function' ? source.workspace() : source?.workspace;
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function sameFollowWorkspace(left, right) {
  if (!left || !right) return false;
  if (left === right) return true;
  try {
    return resolve(left) === resolve(right);
  } catch {
    return false;
  }
}

export async function locateFollowSessionWorkspace(sourceList, sessionId) {
  if (typeof sessionId !== 'string' || !sessionId) return '';
  for (const source of sourceList ?? []) {
    if (typeof source.locateSession !== 'function') continue;
    try {
      const path = await source.locateSession(sessionId);
      if (typeof path === 'string' && path.trim()) return path.trim();
    } catch {
      // Try the next bot; one missing lookup must not hide the others.
    }
  }
  return '';
}

function followReady(source, sessionWorkspace) {
  if (sessionWorkspace === undefined) {
    return { ready: true, reason: '' };
  }
  if (typeof sessionWorkspace !== 'string' || !sessionWorkspace) {
    return { ready: false, reason: t('找不到这个会话的工作区') };
  }
  const botWorkspace = followWorkspaceOf(source);
  if (sameFollowWorkspace(botWorkspace, sessionWorkspace)) {
    return { ready: true, reason: '' };
  }
  return {
    ready: false,
    reason: botWorkspace
      ? t('工作区是 {workspace}', { workspace: botWorkspace })
      : t('未设置工作区'),
  };
}

export function followSourceName(bot) {
  if (typeof bot === 'function') return followSourceName(bot());
  if (!bot || typeof bot !== 'object') return '';
  for (const key of ['botName', 'name', 'nickname', 'displayName']) {
    const value = bot[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export async function preloadFollowSources(items, load) {
  await Promise.all((Array.isArray(items) ? items : []).map(async (item) => {
    try {
      await load(item);
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

export function describeFollowKey(key) {
  if (typeof key !== 'string' || !key) return '';
  const [kind, ...rest] = key.split(':');
  const raw = rest.join(':') || key;
  const short = raw.length > 10 ? `…${raw.slice(-6)}` : raw;
  if (kind === 'group') return `群 ${short}`;
  if (kind === 'direct' || kind === 'p2p') return `私聊 ${short}`;
  return short || key;
}

export function followTargetLabel(channel, key) {
  const channelLabel = FOLLOW_CHANNEL_LABELS[channel] ?? channel;
  const keyLabel = describeFollowKey(key);
  return keyLabel ? `${channelLabel} · ${keyLabel}` : channelLabel;
}

function sessionsOf(state) {
  if (!state || typeof state !== 'object') return {};
  const snapshot = typeof state.snapshot === 'function' ? state.snapshot() : state;
  const sessions = snapshot?.sessions ?? state.sessions;
  return sessions && typeof sessions === 'object' && !Array.isArray(sessions)
    ? { ...sessions }
    : {};
}

export function listFollowTargets(sourceList = followSources()) {
  const botCounts = {};
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

export function followersForSession(sessionId, sourceList = followSources()) {
  if (typeof sessionId !== 'string' || !sessionId) return [];
  return listFollowTargets(sourceList).filter((item) => item.sessionId === sessionId);
}

export function listFollowedSessions(sourceList = followSources()) {
  const channelCounts = {};
  for (const source of sourceList) {
    channelCounts[source.channel] = (channelCounts[source.channel] ?? 0) + 1;
  }
  const bySession = new Map();
  for (const source of sourceList) {
    const sessionId = sessionsOf(source.state)[BOT_FOLLOW_KEY];
    if (typeof sessionId !== 'string' || !sessionId || bySession.has(sessionId)) continue;
    bySession.set(sessionId, {
      sessionId,
      channel: source.channel,
      botId: source.botId,
      name: botName(source, channelCounts),
      detail: resolvedFollowField(source.detail),
      label: botLabel(source, channelCounts),
    });
  }
  return [...bySession.values()];
}

function shortBotId(botId) {
  const raw = String(botId ?? '');
  return raw.length > 12 ? `${raw.slice(0, 8)}…` : raw;
}

export function defaultFollowBotName(channel) {
  const names = {
    weixin: '微信机器人',
    feishu: '飞书机器人',
    wecom: '企业微信机器人',
    dingtalk: '钉钉机器人',
    qq: 'QQ机器人',
  };
  return names[channel] ?? '';
}

function botName(source, channelCounts) {
  const name = resolvedFollowField(source?.name) || followSourceName(source);
  if (name) return name;
  if ((channelCounts[source.channel] ?? 0) > 1) return shortBotId(source.botId);
  return defaultFollowBotName(source.channel)
    || (FOLLOW_CHANNEL_LABELS[source.channel] ?? source.channel);
}

function botLabel(source, channelCounts) {
  const channelLabel = FOLLOW_CHANNEL_LABELS[source.channel] ?? source.channel;
  const name = botName(source, channelCounts);
  return name && name !== channelLabel ? `${channelLabel} · ${name}` : channelLabel;
}

export function listFollowBots(sourceList = followSources(), sessionId = '', sessionWorkspace = undefined) {
  const channelCounts = {};
  for (const source of sourceList) {
    channelCounts[source.channel] = (channelCounts[source.channel] ?? 0) + 1;
  }
  return [...sourceList]
    .map((source) => {
      const sessions = sessionsOf(source.state);
      const selected = sessions[BOT_FOLLOW_KEY] === sessionId;
      const { ready, reason } = followReady(source, sessionWorkspace);
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

export function listFollowChannels(sourceList = followSources(), sessionId = '', sessionWorkspace = undefined) {
  return listFollowBots(sourceList, sessionId, sessionWorkspace);
}

export async function bindSessionFollowByBot(sourceList, { sessionId, channel, botId, sessionWorkspace }) {
  const source = matchingSource(sourceList, channel, botId);
  if (!source) {
    const error = new Error('IM conversation is not available');
    error.code = 'follow-target-missing';
    throw error;
  }
  let resolved = sessionWorkspace;
  if (resolved === undefined) {
    const constrain = sourceList.some((item) => followWorkspaceOf(item) || typeof item.locateSession === 'function');
    resolved = constrain ? (await locateFollowSessionWorkspace(sourceList, sessionId) || null) : undefined;
  }
  const { ready } = followReady(source, resolved);
  if (!ready) {
    const error = new Error(t('这个机器人只能在 IM 中继续自己工作区里的会话。'));
    error.code = 'follow-workspace-mismatch';
    throw error;
  }
  await bindSessionFollow(sourceList, {
    sessionId,
    channel,
    botId,
    key: BOT_FOLLOW_KEY,
  });
}

function matchingSource(sourceList, channel, botId) {
  return sourceList.find((source) => source.channel === channel && source.botId === botId) ?? null;
}

// Serialize Follow clear-then-set so concurrent binds cannot interleave and
// leave two bots following the same session.
let followMutationQueue = Promise.resolve();

export async function bindSessionFollow(sourceList, { sessionId, channel, botId, key }) {
  const operation = followMutationQueue.then(async () => {
    const source = matchingSource(sourceList, channel, botId);
    if (!source || typeof source.state?.setSession !== 'function') {
      const error = new Error('IM conversation is not available');
      error.code = 'follow-target-missing';
      throw error;
    }
    await clearSessionFollow(sourceList, { sessionId });
    await source.state.setSession(key, sessionId);
  });
  followMutationQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

export async function clearSessionFollow(sourceList, { sessionId }) {
  if (typeof sessionId !== 'string' || !sessionId) return;
  for (const source of sourceList) {
    if (typeof source.state?.clearSession !== 'function') continue;
    for (const [key, bound] of Object.entries(sessionsOf(source.state))) {
      if (bound === sessionId) await source.state.clearSession(key);
    }
  }
}
