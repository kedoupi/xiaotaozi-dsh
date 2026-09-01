// @ts-nocheck
import { onTestFinished, test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TestRenderer from 'react-test-renderer';

import {
  normalizeSnapshot,
  WEIXIN_ENDPOINTS,
} from '../../../src/client/channels/weixin/api.ts';
import {
  AccountCard,
  WeixinSettingsTab,
} from '../../../src/client/channels/weixin/index.ts';
import { WorkspaceProjectsContext } from '../../../src/client/workspace-editor.ts';

const { act, create } = TestRenderer;
const CLIENT_URL = new URL('../../../src/client/channels/weixin/index.ts', import.meta.url);

async function flushMicrotasks() {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
}

function textOf(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return node?.children?.map(textOf).join('') ?? '';
}

function buttonNamed(root, name) {
  return root.findAllByType('button').find((button) => textOf(button) === name);
}

const projectSnapshot = {
  items: [{ workspaceId: 'project-alpha', title: 'Alpha project', path: '/workspace/alpha', sessionIds: [] }],
  archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
  baselinesReady: true, recentWorkspaceId: 'project-alpha',
};
const projectSource = {
  list: {
    getSnapshot: () => projectSnapshot,
    subscribe: () => () => {},
  },
};

function withProjects(element, projects = projectSource) {
  return React.createElement(
    WorkspaceProjectsContext.Provider,
    { value: projects },
    element,
  );
}

function account(botId, name) {
  return {
    botId,
    connected: true,
    state: 'connected',
    configured: true,
    workspace: '/workspace/current',
    bot: { name, accountIdMasked: `${botId}•••` },
    health: { summary: '微信消息长轮询运行正常', lastCheckedAt: Date.now() },
    error: null,
  };
}

test('Weixin client keeps only the public connection-test result', () => {
  const snapshot = normalizeSnapshot({
    schemaVersion: 1,
    revision: 1,
    state: 'connected',
    testMessage: {
      sent: false,
      code: 'test-target-unavailable',
      providerDetail: 'must-not-cross-client-normalization',
    },
    bots: [{
      botId: 'wx_0123456789abcdef01234567',
      connected: true,
      state: 'connected',
      configured: true,
      bot: { name: '微信机器人', accountIdMasked: 'account••••1234' },
    }],
  });

  assert.deepEqual(snapshot.testMessage, {
    sent: false,
    code: 'test-target-unavailable',
  });
});

test('Weixin card feedback stays visible without hiding connection errors', () => {
  const markup = renderToStaticMarkup(React.createElement(AccountCard, {
    account: {
      ...account('wx_first', '微信机器人'),
      connected: false,
      state: 'error',
      error: { code: 'offline', message: '连接凭据已失效' },
    },
    feedback: '微信连接检查完成，测试消息已发送。',
    onReconnect() {}, onRequestRemove() {}, onConfirmRemove() {}, onCancelRemove() {},
  }));

  assert.match(markup, />连接凭据已失效</);
  assert.match(markup, /role="status"[^>]*>微信连接检查完成，测试消息已发送。</);
});

test('Weixin connection feedback is scoped to the checked bot', async () => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    setInterval() { return 1; }, clearInterval() {},
    setTimeout() { return 1; }, clearTimeout() {},
    requestAnimationFrame(callback) { callback(); return 1; }, cancelAnimationFrame() {},
  };
  onTestFinished(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });

  const bots = [account('wx_first', 'First Bot'), account('wx_second', 'Second Bot')];
  const calls = [];
  const rpcCall = async (endpoint, payload) => {
    if (endpoint === 'connection.status') return { ok: true, value: { revision: 1, bots } };
    if (endpoint === 'bot.reconnect') {
      calls.push(payload);
      return { ok: true, value: { revision: 2, bots, testMessage: { sent: true } } };
    }
    throw new Error(`Unexpected endpoint: ${endpoint}`);
  };

  let renderer;
  await act(async () => {
    renderer = create(React.createElement(WeixinSettingsTab, { rpcCall }));
    await flushMicrotasks();
  });
  const first = renderer.root.findByProps({ 'data-bot-id': 'wx_first' });
  await act(async () => {
    buttonNamed(first, '检查连接').props.onClick();
    await flushMicrotasks();
  });

  const firstAfter = renderer.root.findByProps({ 'data-bot-id': 'wx_first' });
  const secondAfter = renderer.root.findByProps({ 'data-bot-id': 'wx_second' });
  assert.match(textOf(firstAfter), /测试消息已发送/);
  assert.doesNotMatch(textOf(secondAfter), /测试消息已发送/);
  assert.deepEqual(calls, [{ botId: 'wx_first', sendTest: true }]);
  await act(async () => { renderer.unmount(); });
});

test('Weixin reconnect failure uses fixed translatable copy', async () => {
  const source = await readFile(CLIENT_URL, 'utf8');
  assert.match(source, /'连接检查失败，请稍后重试。'/);
  assert.match(source, /connectionTestFeedback/);
  assert.doesNotMatch(source, /请先私聊机器人发送 \/status/);
  assert.doesNotMatch(source, /连接检查失败：\$\{presentError\(error\)\.message\}/);
});

test('Weixin status-only snapshot reopens the workspace picker without provisioning', async () => {
  const previousWindow = globalThis.window;
  const calls = [];
  globalThis.window = {
    setInterval() { return 1; }, clearInterval() {},
    setTimeout() { return 1; }, clearTimeout() {},
    requestAnimationFrame(callback) { callback(); return 1; }, cancelAnimationFrame() {},
  };
  onTestFinished(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });

  const projects = projectSource;
  const rpcCall = async (endpoint) => {
    calls.push(endpoint);
    if (endpoint === WEIXIN_ENDPOINTS.status) {
      return {
        ok: true,
        value: {
          revision: 1,
          bots: [{
            botId: 'wx_new',
            connected: false,
            state: 'connecting',
            configured: true,
            workspace: '/workspace/default',
            workspacePending: true,
            bot: { name: '微信机器人', accountIdMasked: 'wx•••new' },
            health: { summary: '微信连接当前离线' },
          }],
        },
      };
    }
    throw new Error(`Unexpected endpoint: ${endpoint}`);
  };

  let renderer;
  await act(async () => {
    renderer = create(withProjects(React.createElement(WeixinSettingsTab, { rpcCall }), projects));
    await flushMicrotasks();
  });

  assert.equal(renderer.root.findAllByProps({ role: 'dialog' }).length, 1);
  assert.deepEqual(calls, [WEIXIN_ENDPOINTS.status]);
  await act(async () => { renderer.unmount(); });
});

test('Weixin retries a transient poll error and reconciles pending workspace while connecting', async () => {
  const previousWindow = globalThis.window;
  const timeouts = [];
  let timeoutId = 0;
  globalThis.window = {
    setInterval() { return 1; }, clearInterval() {},
    setTimeout(callback, delay) {
      const handle = ++timeoutId;
      timeouts.push({ handle, callback, delay });
      return handle;
    },
    clearTimeout(handle) {
      const index = timeouts.findIndex((entry) => entry.handle === handle);
      if (index >= 0) timeouts.splice(index, 1);
    },
    requestAnimationFrame(callback) { callback(); return 1; }, cancelAnimationFrame() {},
  };
  onTestFinished(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });

  const projects = projectSource;
  let pollCalls = 0;
  let statusCalls = 0;
  const calls = [];
  const rpcCall = async (endpoint, payload) => {
    calls.push({ endpoint, payload });
    if (endpoint === WEIXIN_ENDPOINTS.status) {
      statusCalls += 1;
      return { ok: true, value: {
        revision: statusCalls,
        bots: statusCalls < 3 ? [] : [{
          botId: 'wx_new', connected: false, state: 'connecting', configured: true,
          workspace: '/workspace/default', workspacePending: true,
          bot: { name: '微信机器人', accountIdMasked: 'wx•••new' },
          health: { summary: '微信连接当前离线' },
        }],
      } };
    }
    if (endpoint === WEIXIN_ENDPOINTS.beginProvisioning) return { ok: true, value: {
      attemptId: 'attempt_1', status: 'pending', expiresAt: Date.now() + 60_000,
      pollIntervalMs: 1_000, qrCodeDataUrl: 'data:image/png;base64,AAAA',
    } };
    if (endpoint === WEIXIN_ENDPOINTS.pollProvisioning) {
      pollCalls += 1;
      if (pollCalls === 1) throw new Error('temporary transport failure');
      return { ok: true, value: {
        attemptId: 'attempt_1', status: 'connecting', expiresAt: Date.now() + 60_000,
        pollIntervalMs: 1_000,
      } };
    }
    throw new Error(`Unexpected endpoint: ${endpoint}`);
  };

  let renderer;
  await act(async () => {
    renderer = create(withProjects(React.createElement(WeixinSettingsTab, { rpcCall }), projects));
    await flushMicrotasks();
  });
  await act(async () => {
    buttonNamed(renderer.root, '生成微信二维码').props.onClick();
    await flushMicrotasks();
  });

  assert.equal(timeouts.length, 1);
  const firstPoll = timeouts.shift();
  await act(async () => {
    await firstPoll.callback();
    await flushMicrotasks();
  });
  assert.doesNotMatch(textOf(renderer.root), /微信没有绑定完成/);
  assert.equal(timeouts.length, 1);

  const secondPoll = timeouts.shift();
  await act(async () => {
    await secondPoll.callback();
    await flushMicrotasks();
  });

  assert.doesNotMatch(textOf(renderer.root), /微信没有绑定完成/);
  assert.ok(calls.filter(({ endpoint }) => endpoint === WEIXIN_ENDPOINTS.status).length >= 3);
  assert.equal(renderer.root.findAllByProps({ role: 'dialog' }).length, 1);
  assert.match(textOf(renderer.root), /正在连接/);
  await act(async () => { renderer.unmount(); });
});

test('Weixin cancel reconciles when the Host reports the attempt connected', async () => {
  const previousWindow = globalThis.window;
  const timeouts = [];
  let timeoutId = 0;
  globalThis.window = {
    setInterval() { return 1; }, clearInterval() {},
    setTimeout(callback, delay) {
      const handle = ++timeoutId;
      timeouts.push({ handle, callback, delay });
      return handle;
    },
    clearTimeout(handle) {
      const index = timeouts.findIndex((entry) => entry.handle === handle);
      if (index >= 0) timeouts.splice(index, 1);
    },
    requestAnimationFrame(callback) { callback(); return 1; }, cancelAnimationFrame() {},
  };
  onTestFinished(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });

  let statusCalls = 0;
  const rpcCall = async (endpoint) => {
    if (endpoint === WEIXIN_ENDPOINTS.status) {
      statusCalls += 1;
      return { ok: true, value: {
        revision: statusCalls,
        bots: statusCalls < 2 ? [] : [{
          botId: 'wx_new', connected: true, state: 'connected', configured: true,
          workspace: '/workspace/default',
          bot: { name: '微信机器人', accountIdMasked: 'wx•••new' },
          health: { summary: '微信连接运行正常' },
        }],
      } };
    }
    if (endpoint === WEIXIN_ENDPOINTS.beginProvisioning) return { ok: true, value: {
      attemptId: 'attempt_1', status: 'pending', expiresAt: Date.now() + 60_000,
      pollIntervalMs: 1_000, qrCodeDataUrl: 'data:image/png;base64,AAAA',
    } };
    if (endpoint === WEIXIN_ENDPOINTS.cancelProvisioning) return { ok: true, value: {
      attemptId: 'attempt_1', status: 'connected', botId: 'wx_new',
    } };
    throw new Error(`Unexpected endpoint: ${endpoint}`);
  };

  let renderer;
  await act(async () => {
    renderer = create(React.createElement(WeixinSettingsTab, { rpcCall }));
    await flushMicrotasks();
  });
  await act(async () => {
    buttonNamed(renderer.root, '生成微信二维码').props.onClick();
    await flushMicrotasks();
  });

  const statusCallsBeforeCancel = statusCalls;
  await act(async () => {
    buttonNamed(renderer.root, '取消').props.onClick();
    await flushMicrotasks();
  });

  const notice = textOf(renderer.root.findByProps({ className: 'dxw-visuallyHidden' }));
  assert.doesNotMatch(notice, /已取消/);
  assert.ok(statusCalls > statusCallsBeforeCancel);
  assert.equal(renderer.root.findAllByProps({ 'data-bot-id': 'wx_new' }).length, 1);
  await act(async () => { renderer.unmount(); });
});
