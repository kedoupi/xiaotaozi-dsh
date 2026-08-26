// @ts-nocheck
import { onTestFinished, test, vi } from 'vitest';
import assert from 'node:assert/strict';

import { rememberConnectionTestTarget } from '../../../src/channels/shared/connection-test.ts';
import { WeixinApiError } from '../../../src/channels/weixin/weixin-api.ts';
import { WeixinRuntime } from '../../../src/channels/weixin/weixin-runtime.ts';

const flush = () => new Promise((resolve) => setImmediate(resolve));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function eventually(predicate, message, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(message);
}

function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    const onAbort = () => {
      cleanup();
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

test('runtime sends a connection test only after a remembered Weixin private chat', async () => {
  const sends = [];
  const state = { getUpdatesBuf: () => '' };
  const runtime = new WeixinRuntime({
    api: {
      notifyStart: async () => {},
      notifyStop: async () => {},
      sendText: async (request) => sends.push(request),
      getUpdates: async ({ signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      }),
    },
    config: {
      botId: 'wx_owner',
      baseUrl: 'https://ilinkai.weixin.qq.com/',
      ownerUserId: 'owner-user',
    },
    token: 'bot-token',
    harness: { ensureRunning: async () => true },
    state,
  });

  await runtime.start();
  await assert.rejects(() => runtime.sendConnectionTest('连接测试'), {
    code: 'test-target-unavailable',
  });
  rememberConnectionTestTarget(state, { toUserId: 'owner-user', contextToken: 'context-1' });
  assert.deepEqual(await runtime.sendConnectionTest('连接测试'), { sent: true });
  assert.equal(sends.length, 1);
  assert.equal(sends[0].toUserId, 'owner-user');
  assert.equal(sends[0].text, '连接测试');
  assert.equal(sends[0].contextToken, 'context-1');
  assert.equal(sends[0].runId, undefined);
  await runtime.stop();
});

test('runtime verifies the token, consumes getUpdates, replies, persists cursor, and aborts on stop', async () => {
  const calls = [];
  let pollCount = 0;
  let askSignal;
  const stateData = { cursor: '', seen: new Set(), session: null };
  const api = {
    notifyStart: async (request) => calls.push(['start', request.token]),
    notifyStop: async (request) => calls.push(['stop', request.token]),
    sendText: async (request) => calls.push(['send', request.text, request.contextToken]),
    getUpdates: async ({ signal }) => {
      pollCount += 1;
      if (pollCount === 1) {
        return {
          ret: 0,
          get_updates_buf: 'cursor-next',
          msgs: [{
            message_id: 7,
            message_type: 1,
            from_user_id: 'owner',
            context_token: 'context-7',
            item_list: [{ type: 1, text_item: { text: '问题' } }],
          }],
        };
      }
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    },
  };
  const state = {
    getUpdatesBuf: () => stateData.cursor,
    setGetUpdatesBuf: async (value) => { stateData.cursor = value; },
    hasSeen: (id) => stateData.seen.has(id),
    markSeen: async (id) => stateData.seen.add(id),
    sessionFor: () => stateData.session,
    setSession: async (_key, value) => { stateData.session = value; },
    clearSession: async () => { stateData.session = null; },
  };
  const runtime = new WeixinRuntime({
    api,
    config: {
      botId: 'wx_bot',
      baseUrl: 'https://ilinkai.weixin.qq.com/',
      ownerUserId: 'owner',
    },
    token: 'bot-token',
    harness: {
      ensureRunning: async () => true,
      sessionExists: async () => true,
      createSession: async () => 'session-1',
      ask: async (_sessionId, _text, options) => {
        askSignal = options.signal;
        return '回答';
      },
    },
    state,
    logger: { warn() {}, error() {} },
  });

  const started = await runtime.start();
  assert.equal(started.ready, true);
  await flush();
  await flush();
  assert.equal(stateData.cursor, 'cursor-next');
  assert.deepEqual(calls.slice(0, 2), [
    ['start', 'bot-token'],
    ['send', '回答', 'context-7'],
  ]);
  assert.equal(askSignal.aborted, false);
  await runtime.stop();
  assert.equal(askSignal.aborted, true);
  assert.deepEqual(calls.at(-1), ['stop', 'bot-token']);
  assert.equal(runtime.status.ready, false);
});

test('runtime keeps polling while a Harness interaction waits and consumes its answer in the open turn', async () => {
  const questionPresented = deferred();
  const answerSubmitted = deferred();
  const sends = [];
  const askTexts = [];
  const interactionResponses = [];
  const polledCursors = [];
  const cursorWrites = [];
  let pollCount = 0;
  let turnFinished = false;
  let secondPollStartedWhileTurnOpen = false;
  let respondedWhileTurnOpen = false;
  const stateData = { cursor: '', seen: new Set(), session: 'session-1' };

  const api = {
    notifyStart: async () => {},
    notifyStop: async () => {},
    sendText: async (request) => sends.push(request),
    getUpdates: async ({ getUpdatesBuf, signal }) => {
      pollCount += 1;
      polledCursors.push(getUpdatesBuf);
      if (pollCount === 1) {
        return {
          ret: 0,
          get_updates_buf: 'cursor-question',
          msgs: [{
            message_id: 101,
            message_type: 1,
            from_user_id: 'owner',
            context_token: 'context-question',
            item_list: [{ type: 1, text_item: { text: '请调用 ask_user_question' } }],
          }],
        };
      }
      if (pollCount === 2) {
        secondPollStartedWhileTurnOpen = !turnFinished;
        await questionPresented.promise;
        return {
          ret: 0,
          get_updates_buf: 'cursor-answer',
          msgs: [{
            message_id: 102,
            message_type: 1,
            from_user_id: 'owner',
            context_token: 'context-answer',
            item_list: [{ type: 1, text_item: { text: '1' } }],
          }],
        };
      }
      return new Promise((_resolve, reject) => {
        const abort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
        if (signal.aborted) abort();
        else signal.addEventListener('abort', abort, { once: true });
      });
    },
  };
  const state = {
    getUpdatesBuf: () => stateData.cursor,
    setGetUpdatesBuf: async (value) => {
      stateData.cursor = value;
      cursorWrites.push(value);
    },
    hasSeen: (id) => stateData.seen.has(id),
    markSeen: async (id) => stateData.seen.add(id),
    sessionFor: () => stateData.session,
    setSession: async (_key, value) => { stateData.session = value; },
    clearSession: async () => { stateData.session = null; },
  };
  const runtime = new WeixinRuntime({
    api,
    config: {
      botId: 'wx_interaction',
      baseUrl: 'https://ilinkai.weixin.qq.com/',
      ownerUserId: 'owner',
    },
    token: 'bot-token',
    harness: {
      ensureRunning: async () => true,
      sessionExists: async () => true,
      createSession: async () => 'session-1',
      ask: async (sessionId, text, options) => {
        askTexts.push(text);
        await options.onInteraction({
          kind: 'question',
          rpcId: 'rpc-runtime-question',
          interactionId: 'interaction-runtime-question',
          sessionId,
          payload: {
            questions: [{
              id: 'environment',
              question: '请选择测试环境',
              options: [{ label: '测试环境' }, { label: '生产环境' }],
            }],
          },
          respond: async (response) => {
            interactionResponses.push(response);
            respondedWhileTurnOpen = !turnFinished;
            answerSubmitted.resolve();
          },
        });
        questionPresented.resolve();
        await abortable(answerSubmitted.promise, options.signal);
        turnFinished = true;
        return '你选择了：测试环境';
      },
    },
    state,
    logger: { warn() {}, error() {} },
  });

  await runtime.start();
  try {
    await eventually(
      () => turnFinished && stateData.seen.size === 2
        && sends.some((request) => request.text === '你选择了：测试环境')
        && stateData.cursor === 'cursor-answer',
      'the answer should resolve the original Harness turn',
    );

    assert.equal(secondPollStartedWhileTurnOpen, true);
    assert.equal(respondedWhileTurnOpen, true);
    assert.deepEqual(askTexts, ['请调用 ask_user_question']);
    assert.deepEqual(interactionResponses, [{
      ok: true,
      value: {
        sessionId: 'session-1',
        answer: { answers: [{ id: 'environment', selected: ['测试环境'] }] },
      },
    }]);
    assert.deepEqual(cursorWrites, ['cursor-question', 'cursor-answer']);
    assert.deepEqual(polledCursors.slice(0, 3), ['', 'cursor-question', 'cursor-answer']);
    assert.equal(stateData.cursor, 'cursor-answer');
  } finally {
    await runtime.stop();
  }
});

test('runtime keeps polling but persists the cursor only after message handling settles', async () => {
  const askStarted = deferred();
  const askGate = deferred();
  const cursorWrites = [];
  const polledCursors = [];
  let pollCount = 0;
  const stateData = { cursor: '', seen: new Set(), session: 'session-1' };
  const api = {
    notifyStart: async () => {},
    notifyStop: async () => {},
    sendText: async () => {},
    getUpdates: async ({ getUpdatesBuf, signal }) => {
      pollCount += 1;
      polledCursors.push(getUpdatesBuf);
      if (pollCount === 1) {
        return {
          ret: 0,
          get_updates_buf: 'cursor-1',
          msgs: [{
            message_id: 11,
            message_type: 1,
            from_user_id: 'owner',
            item_list: [{ type: 1, text_item: { text: '慢问题' } }],
          }],
        };
      }
      if (pollCount === 2) return { ret: 0, get_updates_buf: 'cursor-2', msgs: [] };
      return new Promise((_resolve, reject) => {
        const abort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
        if (signal.aborted) abort();
        else signal.addEventListener('abort', abort, { once: true });
      });
    },
  };
  const state = {
    getUpdatesBuf: () => stateData.cursor,
    setGetUpdatesBuf: async (value) => {
      stateData.cursor = value;
      cursorWrites.push(value);
    },
    hasSeen: (id) => stateData.seen.has(id),
    markSeen: async (id) => stateData.seen.add(id),
    sessionFor: () => stateData.session,
    setSession: async (_key, value) => { stateData.session = value; },
    clearSession: async () => { stateData.session = null; },
  };
  const runtime = new WeixinRuntime({
    api,
    config: {
      botId: 'wx_cursor',
      baseUrl: 'https://ilinkai.weixin.qq.com/',
      ownerUserId: 'owner',
    },
    token: 'bot-token',
    harness: {
      ensureRunning: async () => true,
      sessionExists: async () => true,
      createSession: async () => 'session-1',
      ask: async (_sessionId, _text, options) => {
        askStarted.resolve();
        await abortable(askGate.promise, options.signal);
        return '回答';
      },
    },
    state,
    logger: { warn() {}, error() {} },
  });

  await runtime.start();
  try {
    await askStarted.promise;
    await eventually(
      () => pollCount >= 3,
      'polling should continue while the first message is still being handled',
    );
    assert.deepEqual(cursorWrites, [], 'the cursor must not be persisted before accept settles');
    assert.deepEqual(polledCursors.slice(0, 3), ['', 'cursor-1', 'cursor-2']);
    askGate.resolve();
    await eventually(
      () => stateData.cursor === 'cursor-2',
      'both cursors should be persisted in order once handling settles',
    );
    assert.deepEqual(cursorWrites, ['cursor-1', 'cursor-2']);
  } finally {
    askGate.resolve();
    await runtime.stop();
  }
});

test('stop during a notifyStart retry aborts the pending start without leaving a runtime', async () => {
  let notifyStartCalls = 0;
  let notifyStopCalls = 0;
  let getUpdatesCalls = 0;
  const runtime = new WeixinRuntime({
    api: {
      notifyStart: async () => {
        notifyStartCalls += 1;
        throw new WeixinApiError('network-error', 'temporary DNS failure');
      },
      notifyStop: async () => { notifyStopCalls += 1; },
      sendText: async () => {},
      getUpdates: async () => {
        getUpdatesCalls += 1;
        return { ret: 0, msgs: [] };
      },
    },
    config: { botId: 'wx_race', baseUrl: 'https://ilinkai.weixin.qq.com/', ownerUserId: 'owner' },
    token: 'bot-token',
    harness: { ensureRunning: async () => true },
    state: { getUpdatesBuf: () => '' },
    startRetryDelaysMs: [60_000],
    logger: { warn() {}, error() {} },
  });

  const starting = runtime.start();
  starting.catch(() => undefined);
  await eventually(() => notifyStartCalls === 1, 'notifyStart should have been attempted');
  await runtime.stop();

  await assert.rejects(starting);
  assert.equal(runtime.status.ready, false);
  assert.equal(runtime.status.weixinConnectionState, 'idle');
  assert.equal(notifyStartCalls, 1, 'the aborted retry loop must not call notifyStart again');
  assert.equal(notifyStopCalls, 0, 'an unstarted account must not be notified to stop');
  await flush();
  await flush();
  assert.equal(getUpdatesCalls, 0, 'no monitor may run after stop returned');
  assert.equal(runtime.status.ready, false);
});

test('runtime refuses to report ready when notifyStart rejects the stored token', async () => {
  const runtime = new WeixinRuntime({
    api: {
      notifyStart: async () => { throw new Error('rejected'); },
      notifyStop: async () => {},
    },
    config: { botId: 'wx_bad', baseUrl: 'https://ilinkai.weixin.qq.com/', ownerUserId: 'owner' },
    token: 'bad-token',
    harness: { ensureRunning: async () => true },
    state: {},
  });
  await assert.rejects(runtime.start(), /rejected/);
  assert.equal(runtime.status.ready, false);
  assert.equal(runtime.status.weixinConnectionState, 'failed');
});

test('runtime identifies a local Harness health failure without exposing its detail', async () => {
  const runtime = new WeixinRuntime({
    api: {
      notifyStart: async () => assert.fail('notifyStart must not run while Harness is unavailable'),
      notifyStop: async () => {},
      sendText: async () => {},
      getUpdates: async () => ({ ret: 0, msgs: [] }),
    },
    config: { botId: 'wx_harness', baseUrl: 'https://ilinkai.weixin.qq.com/', ownerUserId: 'owner' },
    token: 'bot-token',
    harness: { ensureRunning: async () => { throw new Error('private loopback transport detail'); } },
    state: {},
  });

  await assert.rejects(runtime.start(), (error) => {
    assert.equal(error.code, 'harness-unreachable');
    assert.doesNotMatch(error.message, /private loopback transport detail/);
    assert.match(error.cause?.message ?? '', /private loopback transport detail/);
    return true;
  });
  assert.equal(runtime.status.ready, false);
  assert.equal(runtime.status.weixinConnectionState, 'failed');
});

test('runtime retries a transient notifyStart failure before reporting the account offline', async () => {
  let startCalls = 0;
  const runtime = new WeixinRuntime({
    api: {
      notifyStart: async () => {
        startCalls += 1;
        if (startCalls === 1) {
          throw new WeixinApiError('network-error', 'temporary DNS failure');
        }
      },
      notifyStop: async () => {},
      sendText: async () => {},
      getUpdates: async ({ signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }),
    },
    config: { botId: 'wx_retry', baseUrl: 'https://ilinkai.weixin.qq.com/', ownerUserId: 'owner' },
    token: 'bot-token',
    harness: { ensureRunning: async () => true },
    state: {},
    startRetryDelaysMs: [0],
    logger: { warn() {}, error() {} },
  });

  const started = await runtime.start();
  assert.equal(started.ready, true);
  assert.equal(startCalls, 2);
  await runtime.stop();
});
