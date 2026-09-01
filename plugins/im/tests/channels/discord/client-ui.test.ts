// @ts-nocheck
import { onTestFinished, test } from 'vitest';
import assert from 'node:assert/strict';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TestRenderer from 'react-test-renderer';

import {
  DiscordAccountCard,
  DiscordSettingsTab,
} from '../../../src/client/channels/discord/index.ts';

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

test('Discord settings exposes a Bot Token action without a fake QR action', () => {
  const markup = renderToStaticMarkup(React.createElement(DiscordSettingsTab, {
    rpcCall: async () => ({ ok: true, value: { bots: [] } }),
  }));
  assert.match(markup, /aria-label="使用 Bot Token 接入 Discord 机器人"/);
  assert.match(markup, />手动接入</);
  assert.doesNotMatch(markup, /扫码接入机器人|dim-scanButton/);
});

test('Discord account card matches the unified compact card layout', () => {
  const markup = renderToStaticMarkup(React.createElement(DiscordAccountCard, {
    account: {
      botId: 'discord_test',
      connected: true,
      state: 'connected',
      bot: { name: 'Harness Bot', username: 'HarnessBot', idMasked: '123•••' },
      health: { summary: 'Discord Gateway 长连接运行正常', lastCheckedAt: Date.now() },
      error: null,
    },
    onReconnect() {},
    onRequestRemove() {},
    onConfirmRemove() {},
    onCancelRemove() {},
  }));
  assert.match(markup, /data-im-channel-logo="discord"/);
  assert.match(markup, /@HarnessBot/);
  assert.match(markup, /class="dim-botHealthGroup"[^]*class="dim-lastChecked"><span>最近检查<\/span>/);
  assert.doesNotMatch(markup, /Gateway 长连接|消息通道|dim-botMetric/);
  assert.match(markup, />检查连接</);
  assert.match(markup, />移除接入</);
  assert.doesNotMatch(markup, /dim-cardSummary/);
});

test('Discord card leads with identity and health, then workspace and disclosures', () => {
  const markup = renderToStaticMarkup(React.createElement(DiscordAccountCard, {
    account: {
      botId: 'discord_compose',
      connected: true,
      state: 'connected',
      workspace: '/workspace/discord',
      bot: { name: 'Harness Bot', username: 'HarnessBot', idMasked: '123•••' },
      health: { summary: 'Discord Gateway 长连接运行正常', lastCheckedAt: Date.now() },
      error: null,
    },
    onReconnect() {},
    onRequestRemove() {},
    onConfirmRemove() {},
    onCancelRemove() {},
  }));
  const markers = [
    'dim-botIdentity',
    'dim-botHealth',
    'dim-workspace',
    'dim-preset',
    'dim-instruction',
    'dim-cardFooter',
  ];
  let cursor = -1;
  for (const marker of markers) {
    const index = markup.indexOf(marker);
    assert.ok(index > cursor, `discord places ${marker} in reading order`);
    cursor = index;
  }
  assert.match(markup, /<details class="dim-preset">/);
  assert.match(markup, /<code class="dim-workspacePath" title="\/workspace\/discord">\/workspace\/discord<\/code>/);
});

test('Discord credential failure keeps the token, announces the error, and exposes busy state', async () => {
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

  const pending = [];
  const calls = [];
  const rpcCall = async (endpoint, payload) => {
    if (endpoint === 'connection.status') return { ok: true, value: { bots: [] } };
    if (endpoint === 'bot.bind-credentials') {
      calls.push(payload);
      return new Promise((resolve) => pending.push(resolve));
    }
    throw new Error(`Unexpected endpoint: ${endpoint}`);
  };

  let renderer;
  await act(async () => {
    renderer = create(React.createElement(DiscordSettingsTab, { rpcCall }));
    await flushMicrotasks();
  });
  await act(async () => {
    buttonNamed(renderer.root, '手动接入').props.onClick();
    await flushMicrotasks();
  });

  await act(async () => {
    renderer.root.findByType('input').props.onChange({ target: { value: 'discord-secret-token' } });
  });
  await act(async () => {
    renderer.root.findByType('form').props.onSubmit({ preventDefault() {} });
  });

  // Busy: the form announces progress and conflicting controls are disabled.
  assert.equal(renderer.root.findByType('form').props['aria-busy'], 'true');
  assert.equal(renderer.root.findByType('input').props.disabled, true);
  assert.equal(buttonNamed(renderer.root, '正在绑定…').props.disabled, true);
  assert.equal(buttonNamed(renderer.root, '取消').props.disabled, true);

  await act(async () => {
    pending.shift()({ ok: false, error: { code: 'DISCORD_AUTH_FAILED', message: 'Discord 拒绝了这个 Bot Token' } });
    await flushMicrotasks();
  });

  // The unchanged RPC payload carries exactly the submitted token.
  assert.deepEqual(calls, [{ token: 'discord-secret-token' }]);

  // Failure keeps the channel context and announces the sanitized error.
  assert.match(textOf(renderer.root), /手动接入Discord机器人/);
  const alerts = renderer.root.findAllByProps({ role: 'alert' });
  assert.ok(alerts.some((node) => textOf(node).includes('Discord 拒绝了这个 Bot Token')));

  // The token input stays filled and masked for a direct retry.
  const retained = renderer.root.findByType('input');
  assert.equal(retained.props.value, 'discord-secret-token');
  assert.equal(retained.props.type, 'password');

  // Retry and cancel are distinct, enabled actions after the failure.
  const retry = buttonNamed(renderer.root, '绑定并连接');
  assert.ok(retry);
  assert.notEqual(retry.props.disabled, true);
  assert.notEqual(buttonNamed(renderer.root, '取消').props.disabled, true);
  await act(async () => { renderer.unmount(); });
});

test('Discord removal opens a modal overlay dialog above the still-visible card', async () => {
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
    botId: 'discord_remove',
    connected: true,
    state: 'connected',
    bot: { name: 'Harness Bot', username: 'HarnessBot', idMasked: '123•••' },
    health: { summary: 'Discord Gateway 长连接运行正常', lastCheckedAt: Date.now() },
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
    renderer = create(React.createElement(DiscordSettingsTab, { rpcCall }));
    await flushMicrotasks();
  });
  const card = () => renderer.root.findByProps({ 'data-bot-id': 'discord_remove' });
  const dialogs = () => renderer.root.findAllByProps({ role: 'alertdialog' });

  await act(async () => {
    buttonNamed(card(), '移除接入').props.onClick();
  });

  assert.equal(dialogs().length, 1, 'removal opens exactly one dialog');
  const dialog = dialogs()[0];
  assert.equal(dialog.props['aria-modal'], 'true');
  assert.ok(dialog.props['aria-labelledby']);
  assert.ok(dialog.props['aria-describedby']);
  let node = dialog;
  let insideCard = false;
  while (node.parent) {
    if (node.parent.type === 'article') insideCard = true;
    node = node.parent;
  }
  assert.equal(insideCard, false, 'the dialog is not inlined into the card');
  assert.match(textOf(card()), /@HarnessBot/, 'the card stays visible behind the overlay');
  assert.equal(card().findAllByProps({ className: 'ddt-cardBody dim-botCardBody' }).length, 1);

  await act(async () => {
    buttonNamed(renderer.root, '保留机器人').props.onClick();
  });
  assert.equal(dialogs().length, 0, 'cancel closes the dialog');
  assert.match(textOf(card()), /@HarnessBot/, 'cancel keeps the bot');

  await act(async () => {
    buttonNamed(card(), '移除接入').props.onClick();
  });
  await act(async () => {
    buttonNamed(renderer.root, '确认移除接入').props.onClick();
    await flushMicrotasks();
  });
  assert.deepEqual(deletes, [{ botId: 'discord_remove', confirm: true }]);
  assert.equal(dialogs().length, 0, 'confirm closes the dialog');
  await act(async () => { renderer.unmount(); });
});
