// @ts-nocheck
import { onTestFinished, test } from 'vitest';
import assert from 'node:assert/strict';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TestRenderer from 'react-test-renderer';

import {
  SlackAccountCard,
  SlackCredentialPanel,
  SlackSettingsTab,
} from '../../../src/client/channels/slack/index.ts';
import { SLACK_APP_MANIFEST_YAML } from '../../../src/channels/slack/manifest.ts';

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

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test('Slack settings exposes Manifest-assisted dual-token access without QR', () => {
  const markup = renderToStaticMarkup(React.createElement(SlackSettingsTab, {
    rpcCall: async () => ({ ok: true, value: { bots: [] } }),
  }));
  assert.match(markup, /aria-label="使用 Manifest 和双 Token 接入 Slack 机器人"/);
  assert.match(markup, />接入机器人</);
  assert.doesNotMatch(markup, /扫码接入机器人|dim-scanButton/);

  const panel = renderToStaticMarkup(React.createElement(SlackCredentialPanel, {
    onSubmit() {},
    onCancel() {},
  }));
  assert.match(panel, />复制 Manifest</);
  assert.match(panel, />打开 Slack 创建页</);
  assert.match(panel, />Bot Token</);
  assert.match(panel, />App Token</);
  assert.match(panel, /placeholder="xoxb-…"/);
  assert.match(panel, /placeholder="xapp-…"/);
  assert.equal((panel.match(/type="password"/g) ?? []).length, 2);
  assert.match(SLACK_APP_MANIFEST_YAML, /socket_mode_enabled: true/);
  assert.match(SLACK_APP_MANIFEST_YAML, /- app_mention/);
  assert.match(SLACK_APP_MANIFEST_YAML, /- message\.im/);
});

test('Slack credential failure keeps both tokens, announces the error, and exposes busy state', async () => {
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

  const bind = deferred();
  const calls = [];
  const rpcCall = async (endpoint, payload) => {
    if (endpoint === 'connection.status') return { ok: true, value: { bots: [] } };
    if (endpoint === 'bot.bind-credentials') {
      calls.push(payload);
      return bind.promise;
    }
    throw new Error(`Unexpected endpoint: ${endpoint}`);
  };

  let renderer;
  await act(async () => {
    renderer = create(React.createElement(SlackSettingsTab, { rpcCall }));
    await flushMicrotasks();
  });
  await act(async () => {
    buttonNamed(renderer.root, '接入机器人').props.onClick();
    await flushMicrotasks();
  });

  await act(async () => {
    const [botToken, appToken] = renderer.root.findAllByType('input');
    botToken.props.onChange({ target: { value: 'xoxb-secret-value' } });
    appToken.props.onChange({ target: { value: 'xapp-secret-value' } });
  });
  await act(async () => {
    renderer.root.findByType('form').props.onSubmit({ preventDefault() {} });
  });

  // Busy: the form announces progress and every conflicting control is disabled.
  assert.equal(renderer.root.findByType('form').props['aria-busy'], 'true');
  assert.ok(renderer.root.findAllByType('input').every((input) => input.props.disabled === true));
  assert.equal(buttonNamed(renderer.root, '正在验证并连接…').props.disabled, true);
  assert.equal(buttonNamed(renderer.root, '取消').props.disabled, true);

  await act(async () => {
    bind.resolve({ ok: false, error: { code: 'SLACK_AUTH_FAILED', message: 'Slack 拒绝了这组凭据' } });
    await flushMicrotasks();
  });

  // The unchanged RPC payload carries exactly the submitted tokens.
  assert.deepEqual(calls, [{ botToken: 'xoxb-secret-value', appToken: 'xapp-secret-value' }]);

  // Failure keeps the channel context and announces the sanitized error.
  assert.match(textOf(renderer.root), /接入 Slack 机器人/);
  const alerts = renderer.root.findAllByProps({ role: 'alert' });
  assert.ok(alerts.some((node) => textOf(node).includes('Slack 拒绝了这组凭据')));

  // Inputs stay filled and masked so the user can correct a typo instead of retyping.
  const retained = renderer.root.findAllByType('input');
  assert.deepEqual(retained.map((input) => input.props.value), ['xoxb-secret-value', 'xapp-secret-value']);
  assert.ok(retained.every((input) => input.props.type === 'password'));

  // Retry and cancel are distinct, enabled actions after the failure.
  const retry = buttonNamed(renderer.root, '验证并连接');
  assert.ok(retry);
  assert.notEqual(retry.props.disabled, true);
  assert.notEqual(buttonNamed(renderer.root, '取消').props.disabled, true);
  await act(async () => { renderer.unmount(); });
});

test('Slack account card matches the unified compact layout', () => {
  const markup = renderToStaticMarkup(React.createElement(SlackAccountCard, {
    account: {
      botId: 'slack_test',
      connected: true,
      state: 'connected',
      bot: { name: 'DeepSeek Harness', username: 'deepseek-harness', idMasked: 'T123•••' },
      health: { summary: 'Slack Socket Mode 长连接运行正常', lastCheckedAt: Date.now() },
      error: null,
    },
    onReconnect() {},
    onRequestRemove() {},
    onConfirmRemove() {},
    onCancelRemove() {},
  }));
  assert.match(markup, /data-im-channel-logo="slack"/);
  assert.match(markup, /@deepseek-harness/);
  assert.match(markup, /class="dim-botHealthGroup"[^]*class="dim-lastChecked"><span>最近检查<\/span>/);
  assert.doesNotMatch(markup, /Socket Mode 长连接|消息通道|dim-botMetric/);
  assert.match(markup, />检查连接</);
  assert.match(markup, />移除接入</);
});
