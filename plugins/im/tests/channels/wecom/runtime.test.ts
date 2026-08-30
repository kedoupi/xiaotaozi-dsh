// @ts-nocheck
import { onTestFinished, test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import { WSReconnectExhaustedError } from '@wecom/aibot-node-sdk';

import { containWecomMessage, WecomRuntime } from '../../../src/channels/wecom/wecom-runtime.ts';
import { rememberConnectionTestTarget } from '../../../src/channels/shared/connection-test.ts';
import { wecomJourney } from '../../../src/journey-trace.ts';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

class FakeClient extends EventEmitter {
  disconnected = false;
  sent = [];
  connect() { queueMicrotask(() => this.emit('authenticated')); }
  disconnect() { this.disconnected = true; }
  async replyStream() {}
  async replyStreamNonBlocking() {}
  async sendMessage(chatId, body) { this.sent.push({ chatId, body }); }
}

test('Enterprise WeChat runtime sends a connection test only to the remembered private target', async () => {
  const client = new FakeClient();
  const state = {};
  const runtime = new WecomRuntime({
    config: { botId: 'wecom_bot', remoteBotId: 'remote-bot' },
    secret: 'private-secret',
    harness: { ensureRunning: async () => true },
    state,
    createClient: () => client,
    connectTimeoutMs: 100,
  });
  await runtime.start();
  await assert.rejects(() => runtime.sendConnectionTest('测试'), {
    code: 'test-target-unavailable',
  });
  rememberConnectionTestTarget(state, { chatId: 'member-private' });
  assert.deepEqual(await runtime.sendConnectionTest('测试'), { sent: true });
  assert.deepEqual(client.sent, [{
    chatId: 'member-private',
    body: { msgtype: 'markdown', markdown: { content: '测试' } },
  }]);
  await runtime.stop();
});

test('Enterprise WeChat runtime waits for authentication, suppresses SDK payload logs, and reconnects', async () => {
  const previousTrace = process.env.DSH_PLUGIN_TRACE;
  process.env.DSH_PLUGIN_TRACE = '0';
  try {
    const client = new FakeClient();
    let options;
    const logs = [];
    const runtime = new WecomRuntime({
      config: { botId: 'wecom_bot', remoteBotId: 'remote-bot' },
      secret: 'private-secret',
      harness: { ensureRunning: async () => true },
      state: {},
      createClient: (value) => { options = value; return client; },
      logger: { debug: (...args) => logs.push(args), warn() {} },
      connectTimeoutMs: 100,
    });
    const status = await runtime.start();
    assert.equal(status.ready, true);
    assert.equal(status.wecomConnectionState, 'connected');
    assert.equal(options.botId, 'remote-bot');
    assert.equal(options.secret, 'private-secret');
    options.logger.debug('raw message payload');
    options.logger.warn('raw unknown frame');
    assert.deepEqual(logs, []);
    const kick = vi.spyOn(wecomJourney, 'wsKick').mockImplementation(() => {});
    onTestFinished(() => kick.mockRestore());
    client.emit('disconnected', 'network');
    assert.equal(runtime.status.ready, false);
    assert.equal(runtime.status.wecomConnectionState, 'connecting');
    assert.equal(kick.mock.calls.length, 0);
    client.emit('authenticated');
    assert.equal(runtime.status.ready, true);
    client.emit('error', new WSReconnectExhaustedError('gave up'));
    assert.equal(kick.mock.calls.length, 1);
    assert.equal(kick.mock.calls[0][0].reason, 'disconnected');
    await runtime.stop();
    assert.equal(client.disconnected, true);
    assert.equal(runtime.status.ready, false);
  } finally {
    if (previousTrace === undefined) delete process.env.DSH_PLUGIN_TRACE;
    else process.env.DSH_PLUGIN_TRACE = previousTrace;
  }
});

test('Enterprise WeChat runtime never reports ready without SDK authentication', async () => {
  const client = new FakeClient();
  client.connect = () => {};
  const runtime = new WecomRuntime({
    config: { botId: 'wecom_bot', remoteBotId: 'remote-bot' },
    secret: 'private-secret',
    harness: { ensureRunning: async () => true },
    state: {},
    createClient: () => client,
    connectTimeoutMs: 5,
  });
  await assert.rejects(() => runtime.start(), /authentication timed out/);
  assert.equal(runtime.status.ready, false);
  assert.equal(client.disconnected, true);
});

test('Enterprise WeChat runtime stop cancels an in-flight authentication wait', async () => {
  const client = new FakeClient();
  client.connect = () => {};
  const runtime = new WecomRuntime({
    config: { botId: 'wecom_bot', remoteBotId: 'remote-bot' },
    secret: 'private-secret',
    harness: { ensureRunning: async () => true },
    state: {},
    createClient: () => client,
    connectTimeoutMs: 60_000,
  });
  const starting = runtime.start();
  await new Promise((resolve) => setImmediate(resolve));
  await runtime.stop();
  await assert.rejects(starting, { name: 'AbortError' });
  assert.equal(client.disconnected, true);
  assert.equal(runtime.status.wecomConnectionState, 'idle');
});

test('Enterprise WeChat runtime strips a spaced bot name from group prompts', async () => {
  const client = new FakeClient();
  const asked = deferred();
  let prompt;
  const runtime = new WecomRuntime({
    config: { botId: 'wecom_bot', remoteBotId: 'remote-bot', name: '小桃子 DSH 工具' },
    secret: 'private-secret',
    harness: {
      ensureRunning: async () => true,
      sessionExists: async () => true,
      ask: async (_sessionId, text) => {
        prompt = text;
        asked.resolve();
        return 'ok';
      },
    },
    state: {
      hasSeen: () => false,
      markSeen: async () => {},
      sessionFor: () => 'session-existing',
      setSession: async () => {},
      clearSession: async () => {},
    },
    createClient: () => client,
    connectTimeoutMs: 100,
    logger: { error() {}, warn() {} },
  });
  await runtime.start();
  client.emit('message', {
    headers: { req_id: 'req-mention' },
    body: {
      msgid: 'msg-mention',
      chattype: 'group',
      chatid: 'group-1',
      from: { userid: 'member-1' },
      msgtype: 'text',
      text: { content: '@小桃子DSH 工具 我们开始' },
    },
  });
  await asked.promise;
  assert.equal(prompt, '我们开始');
  await runtime.stop();
});

test('Enterprise WeChat runtime aborts an in-flight Harness interaction when stopped', async () => {
  const client = new FakeClient();
  const askStarted = deferred();
  let askSignal;
  const runtime = new WecomRuntime({
    config: { botId: 'wecom_bot', remoteBotId: 'remote-bot' },
    secret: 'private-secret',
    harness: {
      ensureRunning: async () => true,
      sessionExists: async () => true,
      ask: async (_sessionId, _text, options) => {
        askSignal = options.signal;
        askStarted.resolve();
        await new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => {
          reject(options.signal.reason);
        }, { once: true }));
      },
    },
    state: {
      hasSeen: () => false,
      markSeen: async () => {},
      sessionFor: () => 'session-existing',
      setSession: async () => {},
      clearSession: async () => {},
    },
    createClient: () => client,
    connectTimeoutMs: 100,
    logger: { error() {}, warn() {} },
  });

  await runtime.start();
  client.emit('message', {
    headers: { req_id: 'req-interaction' },
    body: {
      msgid: 'msg-interaction',
      chattype: 'single',
      from: { userid: 'member-1' },
      msgtype: 'text',
      text: { content: '需要交互' },
    },
  });
  await askStarted.promise;
  assert.equal(askSignal.aborted, false);
  await runtime.stop();
  assert.equal(askSignal.aborted, true);
});

test('Enterprise WeChat runtime contains rejected message handlers', async () => {
  const warnings = [];
  containWecomMessage(Promise.reject(new Error('private failure')), (message) => warnings.push(message));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(warnings, ['[dsh-im:wecom] message handling failed']);
});
