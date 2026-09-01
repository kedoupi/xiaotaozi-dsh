// @ts-nocheck
import { onTestFinished, test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TestRenderer from 'react-test-renderer';

import {
  TelegramAccessSettings,
  TelegramAccountCard,
  TelegramSettingsTab,
} from '../../../src/client/channels/telegram/index.ts';

const { act } = TestRenderer;

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

test('Telegram settings exposes a Bot Token action without a fake QR action', () => {
  const markup = renderToStaticMarkup(React.createElement(TelegramSettingsTab, {
    rpcCall: async () => ({ ok: true, value: { bots: [] } }),
  }));
  assert.match(markup, /aria-label="使用 Bot Token 接入 Telegram 机器人"/);
  assert.match(markup, />手动接入</);
  assert.doesNotMatch(markup, /扫码接入机器人|dim-scanButton/);
});

test('Telegram account card matches the unified compact card layout', () => {
  const markup = renderToStaticMarkup(React.createElement(TelegramAccountCard, {
    account: {
      botId: 'telegram_test',
      connected: true,
      state: 'connected',
      bot: { name: 'Harness Bot', username: 'harness_bot', idMasked: '123•••' },
      health: { summary: 'Telegram Bot API 长轮询运行正常', lastCheckedAt: Date.now() },
      error: null,
    },
    onReconnect() {},
    onRequestRemove() {},
    onConfirmRemove() {},
    onCancelRemove() {},
  }));
  assert.match(markup, /data-im-channel-logo="telegram"/);
  assert.match(markup, /@harness_bot/);
  assert.match(markup, /class="dim-botHealthGroup"[^]*class="dim-lastChecked"><span>最近检查<\/span>/);
  assert.doesNotMatch(markup, /Bot API 长轮询|消息通道|dim-botMetric/);
  assert.match(markup, />检查连接</);
  assert.match(markup, />移除接入</);
  assert.match(markup, />访问设置</);
  assert.match(markup, /aria-label="Telegram 访问模式"/);
  assert.match(markup, />兼容模式（开放私聊和被提及的群聊）</);
  assert.match(markup, />安全模式（默认，私聊白名单）</);
  assert.match(markup, /data-mode="private-allowlist">已生效：安全模式</);
  assert.match(markup, /白名单为空；保存后该机器人会拒绝所有入站消息。/);
  assert.doesNotMatch(markup, /dim-cardSummary/);
});

test('Telegram card orders access settings after the capability disclosures and before the footer', () => {
  const markup = renderToStaticMarkup(React.createElement(TelegramAccountCard, {
    account: {
      botId: 'telegram_compose',
      connected: true,
      state: 'connected',
      workspace: '/workspace/telegram',
      bot: { name: 'Harness Bot', username: 'harness_bot', idMasked: '123•••' },
      health: { summary: 'Telegram Bot API 长轮询运行正常', lastCheckedAt: Date.now() },
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
    'dtg-access',
    'dim-cardFooter',
  ];
  let cursor = -1;
  for (const marker of markers) {
    const index = markup.indexOf(marker);
    assert.ok(index > cursor, `telegram places ${marker} in reading order`);
    cursor = index;
  }
  assert.match(markup, /<details class="dim-preset">/);
  assert.match(markup, /<code class="dim-workspacePath" title="\/workspace\/telegram">\/workspace\/telegram<\/code>/);
});

test('Telegram credential failure keeps the token, announces the error, and exposes busy state', async () => {
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
    renderer = TestRenderer.create(React.createElement(TelegramSettingsTab, { rpcCall }));
    await flushMicrotasks();
  });
  await act(async () => {
    buttonNamed(renderer.root, '手动接入').props.onClick();
    await flushMicrotasks();
  });

  await act(async () => {
    renderer.root.findByType('input').props.onChange({ target: { value: '123456:telegram-secret' } });
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
    pending.shift()({ ok: false, error: { code: 'TELEGRAM_AUTH_FAILED', message: 'Telegram 拒绝了这个 Bot Token' } });
    await flushMicrotasks();
  });

  // The unchanged RPC payload carries exactly the submitted token.
  assert.deepEqual(calls, [{ token: '123456:telegram-secret' }]);

  // Failure keeps the channel context and announces the sanitized error.
  assert.match(textOf(renderer.root), /手动接入Telegram机器人/);
  const alerts = renderer.root.findAllByProps({ role: 'alert' });
  assert.ok(alerts.some((node) => textOf(node).includes('Telegram 拒绝了这个 Bot Token')));

  // The token input stays filled and masked for a direct retry.
  const retained = renderer.root.findByType('input');
  assert.equal(retained.props.value, '123456:telegram-secret');
  assert.equal(retained.props.type, 'password');

  // Retry and cancel are distinct, enabled actions after the failure.
  const retry = buttonNamed(renderer.root, '绑定并连接');
  assert.ok(retry);
  assert.notEqual(retry.props.disabled, true);
  assert.notEqual(buttonNamed(renderer.root, '取消').props.disabled, true);
  await act(async () => { renderer.unmount(); });
});

test('Telegram access settings edits and saves one bot policy', async () => {
  const saved = [];
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(TelegramAccessSettings, {
      account: {
        botId: 'telegram_test',
        accessPolicy: { accessMode: 'compatible', allowedUsers: ['111111111'] },
      },
      onSave: async (policy) => saved.push(policy),
    }));
  });

  const select = renderer.root.findByProps({ 'aria-label': 'Telegram 访问模式' });
  let textarea = renderer.root.findByProps({
    'aria-label': '允许私聊的 Telegram User ID',
  });
  assert.equal(textarea.props.disabled, true);
  await act(async () => {
    select.props.onChange({ target: { value: 'private-allowlist' } });
  });
  textarea = renderer.root.findByProps({
    'aria-label': '允许私聊的 Telegram User ID',
  });
  assert.equal(textarea.props.disabled, false);
  await act(async () => {
    textarea.props.onChange({ target: { value: '6087707998\n1202499116\n6087707998' } });
  });
  await act(async () => {
    select.props.onChange({ target: { value: 'compatible' } });
  });
  textarea = renderer.root.findByProps({
    'aria-label': '允许私聊的 Telegram User ID',
  });
  assert.equal(textarea.props.disabled, true);
  assert.equal(textarea.props.value, '6087707998\n1202499116\n6087707998');
  await act(async () => {
    select.props.onChange({ target: { value: 'private-allowlist' } });
  });
  textarea = renderer.root.findByProps({
    'aria-label': '允许私聊的 Telegram User ID',
  });
  assert.equal(textarea.props.disabled, false);
  assert.equal(textarea.props.value, '6087707998\n1202499116\n6087707998');
  assert.deepEqual(
    renderer.root.findByProps({ className: 'dtg-accessBadge' }).children,
    ['已生效：兼容模式'],
  );
  await act(async () => {
    await renderer.root.findByType('form').props.onSubmit({ preventDefault() {} });
  });
  assert.deepEqual(saved, [{
    accessMode: 'private-allowlist',
    allowedUsers: ['6087707998', '1202499116'],
  }]);
  await act(async () => renderer.unmount());
});

test('Telegram access settings keeps both mode descriptions in an accessible help tooltip', async () => {
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(TelegramAccessSettings, {
      account: {
        botId: 'telegram_test',
        accessPolicy: { accessMode: 'compatible', allowedUsers: ['111111111'] },
      },
      onSave() {},
    }));
  });
  const helpButton = renderer.root.findByProps({
    'aria-label': '查看 Telegram 访问模式说明',
  });
  const tooltip = renderer.root.findByProps({ role: 'tooltip' });
  const heading = renderer.root.findByProps({ className: 'dtg-accessHeading' });
  assert.equal(helpButton.props.type, 'button');
  assert.ok(tooltip.props.id);
  assert.equal(helpButton.props['aria-describedby'], tooltip.props.id);
  assert.equal(heading.findAllByType('p').length, 0);

  const markup = renderToStaticMarkup(React.createElement(TelegramAccessSettings, {
    account: {
      botId: 'telegram_test',
      accessPolicy: { accessMode: 'compatible', allowedUsers: ['111111111'] },
    },
    onSave() {},
  }));
  assert.match(markup, />兼容模式<\/strong>/);
  assert.match(markup, /<strong>安全模式<\/strong>/);
  assert.match(markup, /保持原有行为：私聊直接响应，群聊在被提及或回复时响应。/);
  assert.match(markup, /群聊全部忽略，私聊仅允许白名单用户。/);
  await act(async () => renderer.unmount());
});

test('Telegram access mode help opens for pointer hover and keyboard focus', async () => {
  const styles = await readFile(
    new URL('../../../src/client/channels/telegram/styles.ts', import.meta.url),
    'utf8',
  );
  assert.match(styles, /\.dtg-accessHelpButton:focus-visible \{/);
  assert.match(styles, /\.dtg-accessHelp:hover \.dtg-accessTooltip, \.dtg-accessHelp:focus-within \.dtg-accessTooltip \{[^}]*opacity: 1;[^}]*visibility: visible;/);
});

test('Telegram access settings warns when safe mode has an empty allowlist', () => {
  const markup = renderToStaticMarkup(React.createElement(TelegramAccessSettings, {
    account: {
      botId: 'telegram_test',
      accessPolicy: { accessMode: 'private-allowlist', allowedUsers: [] },
    },
    onSave() {},
  }));
  assert.match(markup, /白名单为空；保存后该机器人会拒绝所有入站消息。/);
});
