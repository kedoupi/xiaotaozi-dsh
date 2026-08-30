// @ts-nocheck
import { onTestFinished, test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TestRenderer from 'react-test-renderer';

import { WECOM_ENDPOINTS } from '../../../src/client/channels/wecom/api.ts';
import {
  AccountCard,
  WecomSettingsTab,
} from '../../../src/client/channels/wecom/index.ts';
import { WorkspaceDirectoryPickerContext } from '../../../src/client/workspace-editor.ts';

const { act, create } = TestRenderer;
const CLIENT_URL = new URL('../../../src/client/channels/wecom/index.ts', import.meta.url);

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

function directoryListing(path, childNames = [], { home = '/workspace', truncated = false } = {}) {
  let cursor = '';
  const crumbs = [{ name: '/', path: '/', hidden: false }];
  for (const name of path.split('/').filter(Boolean)) {
    cursor += `/${name}`;
    crumbs.push({ name, path: cursor, hidden: false });
  }
  return {
    path,
    home,
    crumbs,
    entries: childNames.map((name) => ({
      name,
      path: `${path === '/' ? '' : path}/${name}`,
      hidden: name.startsWith('.'),
    })),
    truncated,
  };
}

function withDirectoryPicker(element, picker) {
  return React.createElement(
    WorkspaceDirectoryPickerContext.Provider,
    { value: picker },
    element,
  );
}

function account(botId, name) {
  return {
    botId,
    connected: true,
    state: 'connected',
    workspace: '/workspace/current',
    bot: { name, appIdMasked: `${botId}•••` },
    health: { summary: '企业微信 WebSocket 长连接运行正常', lastCheckedAt: Date.now() },
    error: null,
  };
}

test('Enterprise WeChat settings uses the shared compact channel toolbar', () => {
  const markup = renderToStaticMarkup(React.createElement(WecomSettingsTab, {
    rpcCall: async () => ({ ok: true, value: {} }),
  }));
  assert.match(markup, /class="ddt-page dwecom-page dim-channelPage"/);
  assert.match(markup, /class="ddt-button dim-scanButton"/);
  assert.match(markup, /aria-label="扫码接入企业微信机器人"/);
  assert.match(markup, /class="dim-actionIcon"[^]*扫码接入机器人/);
  assert.doesNotMatch(markup, /凭据仅保存在本机|role="switch"|type="checkbox"/);
});

test('Enterprise WeChat cards keep check time with status and omit repeated channel details', () => {
  const markup = renderToStaticMarkup(React.createElement(AccountCard, {
    account: {
      botId: 'wecom_bot',
      connected: true,
      state: 'connected',
      bot: { name: '企业微信机器人', appIdMasked: 'bot••••001' },
      health: { summary: '企业微信 WebSocket 长连接运行正常', lastCheckedAt: Date.now() },
      error: null,
    },
    onReconnect() {},
    onRequestRemove() {},
    onConfirmRemove() {},
    onCancelRemove() {},
  }));
  assert.match(markup, /class="ddt-card dim-botCard"/);
  assert.match(markup, /data-im-channel-logo="wecom"/);
  assert.match(markup, /class="dim-botHealthGroup"[^]*class="dim-lastChecked"><span>最近检查<\/span>/);
  assert.doesNotMatch(markup, /消息通道|dim-botMetric/);
  assert.match(markup, />检查连接<[^]*>移除接入</);
  assert.match(markup, /class="dim-cardFooterLayout"/);
  assert.match(markup, /class="dim-presetSelect"/);
  assert.doesNotMatch(markup, /收到\s*\/\s*回复|dim-cardSummary|企业微信 WebSocket 长连接运行正常/);
});

test('Enterprise WeChat card feedback stays visible without hiding connection errors', () => {
  const markup = renderToStaticMarkup(React.createElement(AccountCard, {
    account: {
      ...account('wecom_bot', '企业微信机器人'),
      connected: false,
      state: 'error',
      error: { code: 'offline', message: '连接凭据已失效' },
    },
    feedback: '企业微信连接检查完成，测试消息已发送。',
    onReconnect() {}, onRequestRemove() {}, onConfirmRemove() {}, onCancelRemove() {},
  }));

  assert.match(markup, />连接凭据已失效</);
  assert.match(markup, /role="status"[^>]*>企业微信连接检查完成，测试消息已发送。</);
});

test('Enterprise WeChat connection feedback is scoped to the checked bot', async (t) => {
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

  const bots = [account('wecom_first', 'First Bot'), account('wecom_second', 'Second Bot')];
  const calls = [];
  const rpcCall = async (endpoint, payload) => {
    if (endpoint === 'connection.status') return { ok: true, value: { bots } };
    if (endpoint === 'bot.reconnect') {
      calls.push(payload);
      return { ok: true, value: { bots, testMessage: { sent: true } } };
    }
    throw new Error(`Unexpected endpoint: ${endpoint}`);
  };

  let renderer;
  await act(async () => {
    renderer = create(React.createElement(WecomSettingsTab, { rpcCall }));
    await flushMicrotasks();
  });
  const first = renderer.root.findByProps({ 'data-bot-id': 'wecom_first' });
  await act(async () => {
    buttonNamed(first, '检查连接').props.onClick();
    await flushMicrotasks();
  });

  const firstAfter = renderer.root.findByProps({ 'data-bot-id': 'wecom_first' });
  const secondAfter = renderer.root.findByProps({ 'data-bot-id': 'wecom_second' });
  assert.match(textOf(firstAfter), /测试消息已发送/);
  assert.doesNotMatch(textOf(secondAfter), /测试消息已发送/);
  assert.deepEqual(calls, [{ botId: 'wecom_first', sendTest: true }]);
  await act(async () => { renderer.unmount(); });
});

test('Enterprise WeChat status-only snapshot reopens the workspace picker without provisioning', async () => {
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

  const picker = {
    async listDirectory(path) {
      return directoryListing(path ?? '/workspace');
    },
  };
  const rpcCall = async (endpoint) => {
    calls.push(endpoint);
    if (endpoint === WECOM_ENDPOINTS.status) {
      return {
        ok: true,
        value: {
          revision: 1,
          bots: [{
            botId: 'wecom_new',
            connected: false,
            state: 'connecting',
            workspace: '/workspace/default',
            workspacePending: true,
            bot: { name: '企业微信客服', appIdMasked: 'wecom•••new' },
            health: { summary: '企业微信客服当前离线' },
          }],
        },
      };
    }
    throw new Error(`Unexpected endpoint: ${endpoint}`);
  };

  let renderer;
  await act(async () => {
    renderer = create(withDirectoryPicker(React.createElement(WecomSettingsTab, { rpcCall }), picker));
    await flushMicrotasks();
  });

  assert.equal(renderer.root.findAllByProps({ role: 'dialog' }).length, 1);
  assert.deepEqual(calls, [WECOM_ENDPOINTS.status]);
  await act(async () => { renderer.unmount(); });
});

test('Enterprise WeChat retries a transient poll error and reconciles pending workspace while connecting', async () => {
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

  const picker = {
    async listDirectory(path) {
      return directoryListing(path ?? '/workspace');
    },
  };
  let pollCalls = 0;
  let statusCalls = 0;
  const rpcCall = async (endpoint) => {
    if (endpoint === WECOM_ENDPOINTS.status) {
      statusCalls += 1;
      return { ok: true, value: {
        revision: statusCalls,
        bots: statusCalls < 3 ? [] : [{
          botId: 'wecom_new', connected: false, state: 'connecting',
          workspace: '/workspace/default', workspacePending: true,
          bot: { name: '企业微信客服', appIdMasked: 'wecom•••new' },
          health: { summary: '企业微信客服当前离线' },
        }],
      } };
    }
    if (endpoint === WECOM_ENDPOINTS.beginProvisioning) return { ok: true, value: {
      attemptId: 'attempt_1', status: 'pending', expiresAt: Date.now() + 60_000,
      pollIntervalMs: 1_000, qrCodeDataUrl: 'data:image/png;base64,AAAA',
    } };
    if (endpoint === WECOM_ENDPOINTS.pollProvisioning) {
      pollCalls += 1;
      if (pollCalls === 1) throw new Error('temporary transport failure');
      return { ok: true, value: {
        attemptId: 'attempt_1', status: 'connecting', botId: 'wecom_new',
        expiresAt: Date.now() + 60_000, pollIntervalMs: 1_000,
      } };
    }
    throw new Error(`Unexpected endpoint: ${endpoint}`);
  };

  let renderer;
  await act(async () => {
    renderer = create(withDirectoryPicker(React.createElement(WecomSettingsTab, { rpcCall }), picker));
    await flushMicrotasks();
  });
  await act(async () => {
    buttonNamed(renderer.root, '生成企业微信二维码').props.onClick();
    await flushMicrotasks();
  });

  assert.equal(timeouts.length, 1);
  const firstPoll = timeouts.shift();
  await act(async () => {
    await firstPoll.callback();
    await flushMicrotasks();
  });
  assert.doesNotMatch(textOf(renderer.root), /机器人没有绑定完成/);
  assert.equal(timeouts.length, 1);

  const secondPoll = timeouts.shift();
  await act(async () => {
    await secondPoll.callback();
    await flushMicrotasks();
  });

  assert.ok(statusCalls >= 3);
  assert.equal(renderer.root.findAllByProps({ role: 'dialog' }).length, 1);
  assert.match(textOf(renderer.root), /正在连接/);
  await act(async () => { renderer.unmount(); });
});

test('Enterprise WeChat reconnect failure uses fixed translatable copy', async () => {
  const source = await readFile(CLIENT_URL, 'utf8');
  assert.match(source, /'连接检查失败，请稍后重试。'/);
  assert.match(source, /connectionTestFeedback/);
  assert.doesNotMatch(source, /请先私聊机器人发送 \/status/);
  assert.doesNotMatch(source, /连接检查失败：\$\{presentError\(error\)\.message\}/);
});
