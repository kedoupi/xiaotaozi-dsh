// @ts-nocheck
const targets = new WeakMap();

export const CONNECTION_TEST_STATE_IDENTITY = Symbol('dsh-im.connection-test-state-identity');

function stateIdentity(state) {
  return state?.[CONNECTION_TEST_STATE_IDENTITY] ?? state;
}

function cleanText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

const pendingGuides = new WeakMap();

export function rememberConnectionTestTarget(state, target) {
  if (!state || !target || typeof target !== 'object') return false;
  try {
    const stored = structuredClone(target);
    targets.set(stateIdentity(state), stored);
    if (typeof state.setConnectionTestTarget === 'function') {
      void Promise.resolve(state.setConnectionTestTarget(stored)).catch(() => undefined);
    }
    return true;
  } catch {
    return false;
  }
}

export function queuePendingGuide(state, text) {
  const body = cleanText(text);
  if (!state || !body) return false;
  pendingGuides.set(stateIdentity(state), body);
  return true;
}

export function takePendingGuide(state) {
  if (!state) return null;
  const key = stateIdentity(state);
  const text = pendingGuides.get(key) ?? null;
  if (text) pendingGuides.delete(key);
  return text;
}

export async function flushPendingGuide(state, send) {
  const text = takePendingGuide(state);
  if (!text) return false;
  const target = connectionTestTarget(state);
  if (!target || typeof send !== 'function') {
    queuePendingGuide(state, text);
    return false;
  }
  try {
    await send(target, text);
    return true;
  } catch {
    queuePendingGuide(state, text);
    return false;
  }
}

export function rememberDirectTargetAndFlush(state, target, send) {
  rememberConnectionTestTarget(state, target);
  return flushPendingGuide(state, send);
}

export function connectionTestTarget(state) {
  if (!state) return null;
  const live = targets.get(stateIdentity(state));
  if (live) return structuredClone(live);
  const stored = typeof state.getConnectionTestTarget === 'function'
    ? state.getConnectionTestTarget()
    : null;
  if (!stored || typeof stored !== 'object') return null;
  try {
    const cloned = structuredClone(stored);
    targets.set(stateIdentity(state), cloned);
    return structuredClone(cloned);
  } catch {
    return null;
  }
}

export function connectionTestMessage(botName, channelLabel = '机器人') {
  const name = cleanText(botName) ?? channelLabel;
  return `✅ 小桃子连接测试成功\n这条消息由插件页面中的“${name}”机器人卡片发出。`;
}

export function connectionTestTargetUnavailable(channelLabel = '机器人') {
  const error = new Error(`${channelLabel}尚未收到可用于测试的私聊消息。`);
  error.code = 'test-target-unavailable';
  return error;
}

export async function sendRememberedConnectionTest({ state, send, text, channelLabel }) {
  const target = connectionTestTarget(state);
  if (!target) throw connectionTestTargetUnavailable(channelLabel);
  await send(target, text);
  return { sent: true };
}

export function publicConnectionTestResult(error) {
  if (!error) return Object.freeze({ sent: true });
  return Object.freeze({
    sent: false,
    code: error?.code === 'test-target-unavailable'
      ? 'test-target-unavailable'
      : 'test-message-failed',
  });
}
