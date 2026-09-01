// @ts-nocheck
import { onTestFinished, test } from 'vitest';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TestRenderer from 'react-test-renderer';

import { QQ_ENDPOINTS } from '../../../src/client/channels/qq/api.ts';
import { AccountCard, QqSettingsTab } from '../../../src/client/channels/qq/index.ts';
import { en, setImTranslator } from '../../../src/client/i18n.ts';

const { act, create } = TestRenderer;

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

const CLIENT_URL = new URL('../../../src/client/channels/qq/index.ts', import.meta.url);

test('QQ settings uses the shared compact channel toolbar', () => {
  const markup = renderToStaticMarkup(React.createElement(QqSettingsTab, {
    rpcCall: async () => ({ ok: true, value: {} }),
  }));
  assert.match(markup, /class="ddt-page dqq-page dim-channelPage"/);
  assert.match(markup, /class="ddt-button dim-scanButton"/);
  assert.match(markup, /aria-label="扫码接入 QQ 机器人"/);
  assert.match(markup, /class="dim-actionIcon"[^]*扫码接入机器人/);
  assert.doesNotMatch(markup, /凭据仅保存在本机|role="switch"|type="checkbox"/);
});

test('QQ bot cards match the shared two-metric card treatment', () => {
  const markup = renderToStaticMarkup(React.createElement(AccountCard, {
    account: {
      botId: 'qq_bot',
      connected: true,
      state: 'connected',
      bot: { name: 'QQ机器人', appIdMasked: '123••••456' },
      health: { summary: 'QQ WebSocket 长连接运行正常', lastCheckedAt: Date.now() },
      error: null,
    },
    onReconnect() {},
    onRequestRemove() {},
    onConfirmRemove() {},
    onCancelRemove() {},
  }));
  assert.match(markup, /class="ddt-card dim-botCard"/);
  assert.match(markup, /data-im-channel-logo="qq"/);
  assert.match(markup, /class="dim-botHealthGroup"[^]*class="dim-lastChecked"><span>最近检查<\/span>/);
  assert.doesNotMatch(markup, /消息通道|dim-botMetric/);
  assert.match(markup, />检查连接<[^]*>移除接入</);
  assert.match(markup, /class="dim-cardFooterLayout"/);
  assert.doesNotMatch(markup, /收到\s*\/\s*回复|dim-cardSummary|QQ WebSocket 长连接运行正常/);

  const offlineMarkup = renderToStaticMarkup(React.createElement(AccountCard, {
    account: {
      botId: 'qq_bot', connected: false, state: 'error',
      bot: { name: 'QQ机器人', appIdMasked: '123••••456' },
      health: { summary: '连接失败，请检查凭据', lastCheckedAt: Date.now() },
      error: null,
    },
    onReconnect() {}, onRequestRemove() {}, onConfirmRemove() {}, onCancelRemove() {},
  }));
  assert.match(offlineMarkup, /class="ddt-summary dim-cardSummary">连接失败，请检查凭据</);
});

test('QQ connection checks request a test message and show concise card feedback', async () => {
  const source = await readFile(CLIENT_URL, 'utf8');
  assert.match(source, /\{ botId: account\.botId, sendTest: true \}/);
  assert.match(source, /'连接检查失败，请稍后重试。'/);
  assert.doesNotMatch(source, /连接检查失败：\$\{presentError\(error\)\.message\}/);

  const markup = renderToStaticMarkup(React.createElement(AccountCard, {
    account: {
      botId: 'qq_bot', connected: true, state: 'connected',
      bot: { name: 'QQ机器人', appIdMasked: '123••••456' },
      health: { summary: 'QQ WebSocket 长连接运行正常', lastCheckedAt: Date.now() },
      error: null,
    },
    feedback: '测试消息已发送，请到对应机器人会话中确认。',
    onReconnect() {}, onRequestRemove() {}, onConfirmRemove() {}, onCancelRemove() {},
  }));
  assert.match(markup, /role="status"/);
  assert.match(markup, /测试消息已发送/);

  const offlineMarkup = renderToStaticMarkup(React.createElement(AccountCard, {
    account: {
      botId: 'qq_bot', connected: false, state: 'error',
      bot: { name: 'QQ机器人', appIdMasked: '123••••456' },
      health: { summary: 'QQ 连接尚未就绪', lastCheckedAt: Date.now() },
      error: { code: 'offline', message: '连接凭据已失效' },
    },
    feedback: '测试消息已发送，请到对应机器人会话中确认。',
    onReconnect() {}, onRequestRemove() {}, onConfirmRemove() {}, onCancelRemove() {},
  }));
  assert.match(offlineMarkup, />连接凭据已失效</);
  assert.match(offlineMarkup, /role="status"[^>]*>测试消息已发送/);
});

test('fixed reconnect failure copy renders fully in English', () => {
  setImTranslator((key) => en[key] ?? key);
  try {
    const markup = renderToStaticMarkup(React.createElement(AccountCard, {
      account: {
        botId: 'qq_bot', connected: true, state: 'connected',
        bot: { name: 'QQ Bot', appIdMasked: '123••••456' },
        health: { summary: 'healthy', lastCheckedAt: Date.now() },
        error: null,
      },
      feedback: '连接检查失败，请稍后重试。',
      onReconnect() {}, onRequestRemove() {}, onConfirmRemove() {}, onCancelRemove() {},
    }));
    assert.match(markup, /Connection check failed\. Try again later\./);
    assert.doesNotMatch(markup, /[\p{Script=Han}]/u);
  } finally {
    setImTranslator(null);
  }
});

test('QQ keeps the connecting surface until the status snapshot contains the connected bot', async () => {
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
    if (endpoint === QQ_ENDPOINTS.status) {
      statusCalls += 1;
      return { ok: true, value: {
        revision: statusCalls,
        bots: statusCalls < 3 ? [] : [{
          botId: 'qq_new', connected: true, state: 'connected',
          workspace: '/workspace/default',
          bot: { name: 'QQ机器人', appIdMasked: '123••••456' },
          health: { summary: 'QQ WebSocket 长连接运行正常' },
        }],
      } };
    }
    if (endpoint === QQ_ENDPOINTS.beginProvisioning) return { ok: true, value: {
      attemptId: 'attempt_1', status: 'pending', expiresAt: Date.now() + 60_000,
      pollIntervalMs: 1_000, qrCodeDataUrl: 'data:image/png;base64,AAAA',
    } };
    if (endpoint === QQ_ENDPOINTS.pollProvisioning) return { ok: true, value: {
      attemptId: 'attempt_1', status: 'connected', botId: 'qq_new',
      expiresAt: Date.now() + 60_000, pollIntervalMs: 1_000,
    } };
    throw new Error(`Unexpected endpoint: ${endpoint}`);
  };

  let renderer;
  await act(async () => {
    renderer = create(React.createElement(QqSettingsTab, { rpcCall }));
    await flushMicrotasks();
  });
  await act(async () => {
    buttonNamed(renderer.root, '生成 QQ 二维码').props.onClick();
    await flushMicrotasks();
  });

  assert.equal(timeouts.length, 1);
  const firstPoll = timeouts.shift();
  await act(async () => {
    await firstPoll.callback();
    await flushMicrotasks();
  });

  // The poll reported connected but the authoritative snapshot lacks the bot,
  // so the connecting surface stays and Add must not offer a second bind.
  assert.match(textOf(renderer.root), /QQ 已授权，正在连接机器人/);
  assert.equal(buttonNamed(renderer.root, '正在接入').props.disabled, true);
  assert.equal(timeouts.length, 1);

  const secondPoll = timeouts.shift();
  await act(async () => {
    await secondPoll.callback();
    await flushMicrotasks();
  });

  assert.doesNotMatch(textOf(renderer.root), /正在连接机器人/);
  assert.equal(renderer.root.findAllByProps({ 'data-bot-id': 'qq_new' }).length, 1);
  await act(async () => { renderer.unmount(); });
});

test('QQ removal opens a modal overlay dialog above the still-visible card', async () => {
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

  const bots = [{
    botId: 'qq_remove',
    connected: true,
    state: 'connected',
    bot: { name: 'QQ机器人', appIdMasked: '123••••456' },
    health: { summary: 'QQ WebSocket 长连接运行正常', lastCheckedAt: Date.now() },
  }];
  const deletes = [];
  const rpcCall = async (endpoint, payload) => {
    if (endpoint === 'connection.status') return { ok: true, value: { bots } };
    if (endpoint === 'bot.delete') {
      deletes.push(payload);
      return { ok: true, value: { bots: [] } };
    }
    throw new Error(`Unexpected endpoint: ${endpoint}`);
  };

  let renderer;
  await act(async () => {
    renderer = create(React.createElement(QqSettingsTab, { rpcCall }));
    await flushMicrotasks();
  });
  const card = () => renderer.root.findByProps({ 'data-bot-id': 'qq_remove' });
  const dialogs = () => renderer.root.findAllByProps({ role: 'alertdialog' });

  await act(async () => {
    buttonNamed(card(), '移除接入').props.onClick();
  });

  assert.equal(dialogs().length, 1, 'removal opens exactly one dialog');
  assert.equal(dialogs()[0].props['aria-modal'], 'true');
  let node = dialogs()[0];
  let insideCard = false;
  while (node.parent) {
    if (node.parent.type === 'article') insideCard = true;
    node = node.parent;
  }
  assert.equal(insideCard, false, 'the dialog is not inlined into the card');
  assert.match(textOf(card()), /123••••456/, 'the card stays visible behind the overlay');

  await act(async () => {
    buttonNamed(renderer.root, '保留机器人').props.onClick();
  });
  assert.equal(dialogs().length, 0, 'cancel closes the dialog');
  assert.match(textOf(card()), /123••••456/, 'cancel keeps the bot');

  await act(async () => {
    buttonNamed(card(), '移除接入').props.onClick();
  });
  await act(async () => {
    buttonNamed(renderer.root, '确认移除接入').props.onClick();
    await flushMicrotasks();
  });
  assert.deepEqual(deletes, [{ botId: 'qq_remove', confirm: true }]);
  assert.equal(dialogs().length, 0, 'confirm closes the dialog');
  await act(async () => { renderer.unmount(); });
});
