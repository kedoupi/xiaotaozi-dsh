// @ts-nocheck
import { onTestFinished, test } from 'vitest';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TestRenderer from 'react-test-renderer';

import {
  EmptyView,
  ProvisionView,
  QrPanel,
  WhatsappAccountCard,
  WhatsappSettingsTab,
} from '../../../src/client/channels/whatsapp/index.ts';
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

test('WhatsApp onboarding is QR-only with no Cloud API credential form', () => {
  const empty = renderToStaticMarkup(React.createElement(EmptyView, {}));
  const qr = renderToStaticMarkup(React.createElement(QrPanel, {
    provision: {
      qrCodeDataUrl: 'data:image/png;base64,QUJDRA==',
      expiresAt: Date.now() + 60_000,
      durationMs: 60_000,
    },
    now: Date.now(),
  }));
  assert.match(empty, /扫码绑定 WhatsApp 机器人/);
  assert.match(empty, /非官方 WhatsApp Web/);
  assert.match(empty, /专用号码/);
  assert.match(empty, /生成二维码/);
  assert.match(qr, /已关联设备/);
  assert.match(qr, /关联设备/);
  assert.doesNotMatch(`${empty}${qr}`, /Cloud API|Phone Number ID|Access Token|App Secret|Verify Token|Webhook/);
});

test('WhatsApp QR startup renders a neutral loading state instead of an error card', () => {
  const markup = renderToStaticMarkup(React.createElement(ProvisionView, {
    provision: { status: 'starting' },
    busy: true,
  }));
  assert.match(markup, /正在生成 WhatsApp 二维码/);
  assert.match(markup, /aria-busy="true"/);
  assert.doesNotMatch(markup, /WhatsApp 没有接入完成|WHATSAPP_PROVISION_FAILED|ddt-inlineError/);
});

test('WhatsApp account card uses the unified compact channel layout', () => {
  const markup = renderToStaticMarkup(React.createElement(WhatsappAccountCard, {
    account: {
      botId: 'whatsapp-card',
      state: 'connected',
      connected: true,
      bot: { name: 'Harness WhatsApp', idMasked: '1650••••0123' },
      health: { summary: 'WhatsApp Web 关联设备运行正常', lastCheckedAt: Date.now() },
      error: null,
    },
    testNotice: '测试消息已发送，请到 WhatsApp 自聊会话中确认。',
  }));
  assert.match(markup, /data-im-channel-logo="whatsapp"/);
  assert.match(markup, /class="dim-botHealthGroup"[^]*class="dim-lastChecked"><span>最近检查<\/span>/);
  assert.doesNotMatch(markup, /WhatsApp Web|消息通道|dim-botMetric/);
  assert.match(markup, /检查连接/);
  assert.match(markup, /移除接入/);
  assert.match(markup, /class="dim-cardFooterLayout"/);
  assert.match(markup, /role="status"[^>]*>测试消息已发送/);
});

test('WhatsApp connection check requests a test message from the existing reconnect endpoint', async () => {
  const source = await readFile(new URL(
    '../../../src/client/channels/whatsapp/index.ts',
    import.meta.url,
  ), 'utf8');
  assert.match(source, /WHATSAPP_ENDPOINTS\.reconnectBot,[\s\S]*\{ botId: account\.botId, sendTest: true \}/);
  assert.match(source, /\[account\.botId\]: '连接检查失败，请稍后重试。'/);
  assert.doesNotMatch(source, /连接检查失败：\$\{presentError\(error\)\.message\}/);
});

test('WhatsApp reconnect failures render a fixed English-safe notice', async (t) => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    setInterval() { return 1; },
    clearInterval() {},
    setTimeout() { return 1; },
    clearTimeout() {},
  };
  setImTranslator((key) => en[key] ?? key);
  onTestFinished(() => {
    setImTranslator(null);
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });
  const snapshot = {
    schemaVersion: 1,
    bots: [{
      botId: 'whatsapp_test',
      state: 'connected',
      connected: true,
      workspace: '/workspace/current',
      bot: { name: 'Harness WhatsApp', idMasked: '1650••••0123' },
      health: { summary: 'WhatsApp Web is healthy', lastCheckedAt: Date.now() },
      error: null,
    }],
    totals: { configured: 1, connected: 1 },
  };
  const rpcCall = async (endpoint) => {
    if (endpoint === 'connection.status') return { ok: true, value: snapshot };
    if (endpoint === 'bot.reconnect') {
      return {
        ok: false,
        error: { code: 'whatsapp-operation-failed', message: 'WhatsApp 操作失败，请稍后重试。' },
      };
    }
    throw new Error(`Unexpected endpoint: ${endpoint}`);
  };

  let renderer;
  await act(async () => {
    renderer = create(React.createElement(WhatsappSettingsTab, { rpcCall }));
    await flushMicrotasks();
  });
  const card = renderer.root.findByProps({ 'data-bot-id': 'whatsapp_test' });
  await act(async () => {
    card.findAllByType('button')
      .find((button) => textOf(button) === 'Check connection').props.onClick();
    await flushMicrotasks();
  });

  const notice = textOf(renderer.root.findByProps({ role: 'status' }));
  assert.equal(notice, 'Connection check failed. Try again later.');
  assert.doesNotMatch(notice, /[\p{Script=Han}]/u);
  await act(async () => { renderer.unmount(); });
});

test('WhatsApp keeps the connecting surface until the status snapshot contains the connected bot', async () => {
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
    if (endpoint === 'connection.status') {
      statusCalls += 1;
      return { ok: true, value: {
        revision: statusCalls,
        bots: statusCalls < 3 ? [] : [{
          botId: 'whatsapp_new', connected: true, state: 'connected',
          workspace: '/workspace/default',
          bot: { name: 'Harness WhatsApp', idMasked: '1650••••0123' },
          health: { summary: 'WhatsApp Web 关联设备运行正常' },
        }],
        totals: { configured: statusCalls < 3 ? 0 : 1, connected: statusCalls < 3 ? 0 : 1 },
      } };
    }
    if (endpoint === 'provision.begin') return { ok: true, value: {
      attemptId: 'attempt_1', status: 'pending', expiresAt: Date.now() + 60_000,
      pollIntervalMs: 1_000, qrCodeDataUrl: 'data:image/png;base64,AAAA',
    } };
    if (endpoint === 'provision.poll') return { ok: true, value: {
      attemptId: 'attempt_1', status: 'connected', botId: 'whatsapp_new',
      expiresAt: Date.now() + 60_000, pollIntervalMs: 1_000,
    } };
    throw new Error(`Unexpected endpoint: ${endpoint}`);
  };

  let renderer;
  await act(async () => {
    renderer = create(React.createElement(WhatsappSettingsTab, { rpcCall }));
    await flushMicrotasks();
  });
  await act(async () => {
    renderer.root.findAllByType('button')
      .find((button) => textOf(button) === '生成二维码').props.onClick();
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
  assert.match(textOf(renderer.root), /已扫码，正在连接 WhatsApp/);
  const addButton = renderer.root.findAllByType('button')
    .find((button) => textOf(button) === '正在接入');
  assert.equal(addButton.props.disabled, true);
  assert.equal(timeouts.length, 1);

  const secondPoll = timeouts.shift();
  await act(async () => {
    await secondPoll.callback();
    await flushMicrotasks();
  });

  assert.doesNotMatch(textOf(renderer.root), /正在连接 WhatsApp/);
  assert.equal(renderer.root.findAllByProps({ 'data-bot-id': 'whatsapp_new' }).length, 1);
  await act(async () => { renderer.unmount(); });
});

test('WhatsApp removal opens a modal overlay dialog above the still-visible card', async () => {
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
    botId: 'whatsapp_remove',
    connected: true,
    state: 'connected',
    bot: { name: 'WhatsApp 机器人', accountIdMasked: '8613••••789' },
    health: { summary: 'WhatsApp Web 连接运行正常', lastCheckedAt: Date.now() },
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
    renderer = create(React.createElement(WhatsappSettingsTab, { rpcCall }));
    await flushMicrotasks();
  });
  const card = () => renderer.root.findByProps({ 'data-bot-id': 'whatsapp_remove' });
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
  assert.equal(card().findAllByProps({ className: 'ddt-cardBody dim-botCardBody' }).length, 1, 'the card stays visible behind the overlay');

  await act(async () => {
    buttonNamed(renderer.root, '保留机器人').props.onClick();
  });
  assert.equal(dialogs().length, 0, 'cancel closes the dialog');
  assert.equal(card().findAllByProps({ className: 'ddt-cardBody dim-botCardBody' }).length, 1, 'cancel keeps the bot');

  await act(async () => {
    buttonNamed(card(), '移除接入').props.onClick();
  });
  await act(async () => {
    buttonNamed(renderer.root, '确认移除接入').props.onClick();
    await flushMicrotasks();
  });
  assert.deepEqual(deletes, [{ botId: 'whatsapp_remove', confirm: true }]);
  assert.equal(dialogs().length, 0, 'confirm closes the dialog');
  await act(async () => { renderer.unmount(); });
});
