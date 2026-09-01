// @ts-nocheck
import { onTestFinished, test } from 'vitest';
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

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
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

test('Enterprise WeChat card orders capability disclosures before the office row and footer', () => {
  const markup = renderToStaticMarkup(cardWithOffice(officeSnapshot()));
  const markers = [
    'dim-botIdentity',
    'dim-botHealth',
    'dim-workspace',
    'dim-preset',
    'dim-instruction',
    'dwecom-officeRow',
    'dim-cardFooter',
  ];
  let cursor = -1;
  for (const marker of markers) {
    const index = markup.indexOf(marker);
    assert.ok(index > cursor, `wecom places ${marker} in reading order`);
    cursor = index;
  }
  assert.match(markup, /<details class="dim-preset">/);
  assert.match(markup, /<summary class="dim-presetSummary">/);
  assert.match(markup, /<details class="dwecom-officeDetails">/);
  assert.match(markup, /<code class="dim-workspacePath" title="\/workspace\/current">\/workspace\/current<\/code>/);
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

test('Enterprise WeChat connection feedback is scoped to the checked bot', async () => {
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

const OFFICE_CARD_HANDLERS = {
  onOfficeActivate() {}, onOfficeConfigure() {}, onOfficeRefresh() {},
};

function officeSnapshot(overrides = {}) {
  return {
    ok: true,
    cliInstalled: true,
    mainStatus: 'active',
    activeBotId: 'wecom_card',
    authorized: true,
    allowWrite: true,
    cliPath: 'wecom-cli',
    configDir: '/safe/path',
    ...overrides,
  };
}

function cardWithOffice(office, extra = {}) {
  return React.createElement(AccountCard, {
    account: account('wecom_card', '企业微信机器人'),
    office,
    ...OFFICE_CARD_HANDLERS,
    onReconnect() {}, onRequestRemove() {}, onConfirmRemove() {}, onCancelRemove() {},
    ...extra,
  });
}

test('Enterprise WeChat card shows the CLI install state when wecom-cli is missing', () => {
  const markup = renderToStaticMarkup(cardWithOffice(officeSnapshot({
    cliInstalled: false, mainStatus: 'cli-missing', activeBotId: null, authorized: false, allowWrite: false,
  })));
  assert.match(markup, /未安装 wecom-cli/);
  assert.match(markup, /npm install -g @wecom\/cli/);
  assert.match(markup, />重新检查</);
  assert.doesNotMatch(markup, /开通办公能力|设为办公机器人|办公能力暂不可用/);
});

test('Enterprise WeChat card keeps CLI metadata behind disclosure and exposes the permission toggle', () => {
  const markup = renderToStaticMarkup(cardWithOffice(officeSnapshot()));
  assert.match(markup, /办公能力已开通/);
  assert.match(markup, /<summary>CLI 与配置详情<\/summary>/);
  assert.match(markup, /允许修改企业微信数据/);
  assert.match(markup, /type="checkbox"/);
  assert.match(markup, />重新检查</);
  const details = markup.slice(markup.indexOf('dwecom-officeDetails'));
  assert.match(details, /CLI 路径/);
  assert.match(details, /配置目录/);
  assert.doesNotMatch(details, /wecom_card|secretRef|remoteBotId|type="checkbox"|允许修改企业微信数据/);
  const beforeDetails = markup.slice(0, markup.indexOf('dwecom-officeDetails'));
  assert.match(beforeDetails, /允许修改企业微信数据/);
});

test('Enterprise WeChat card does not claim a retained active bot is healthy after rollback failure', () => {
  const markup = renderToStaticMarkup(cardWithOffice(officeSnapshot({
    activeBotId: 'wecom_card', authorized: false, mainStatus: 'activate-failed',
  })));
  assert.match(markup, /办公鉴权不可用/);
  assert.doesNotMatch(markup, /办公能力已开通/);
  assert.match(markup, /type="checkbox"[^>]*disabled/);
  assert.match(markup, /恢复授权后才能调整写权限/);
  assert.match(markup, />重新检查</);
});

test('Enterprise WeChat card announces office loading as a polite busy status', () => {
  const markup = renderToStaticMarkup(cardWithOffice('loading'));
  assert.match(markup, /role="status"/);
  assert.match(markup, /aria-busy="true"/);
  assert.match(markup, /正在读取办公状态…/);
  assert.doesNotMatch(markup, /开通办公能力|设为办公机器人|重新检查/);
});

test('Enterprise WeChat card offers to become the office bot when another bot is active', () => {
  const markup = renderToStaticMarkup(cardWithOffice(officeSnapshot({ activeBotId: 'wecom_other' })));
  assert.match(markup, /不是当前办公机器人/);
  assert.match(markup, />设为办公机器人</);
  assert.doesNotMatch(markup, /办公设置|CLI 与配置详情|办公能力已开通/);
});

test('Enterprise WeChat card offers activation when no office bot is active', () => {
  const markup = renderToStaticMarkup(cardWithOffice(officeSnapshot({ mainStatus: 'unbound', activeBotId: null })));
  assert.match(markup, /办公能力未开通/);
  assert.match(markup, />开通办公能力</);
});

test('Enterprise WeChat card degrades to a recheck action when the office route fails', () => {
  const markup = renderToStaticMarkup(cardWithOffice(null));
  assert.match(markup, /办公服务连接失败，办公能力暂不可用/);
  assert.match(markup, />重新检查</);
  assert.doesNotMatch(markup, /开通办公能力|设为办公机器人/);
});

function stubWindow() {
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
}

function twoBotRpc(bots) {
  return async (endpoint) => {
    if (endpoint === 'connection.status') return { ok: true, value: { bots } };
    throw new Error(`Unexpected endpoint: ${endpoint}`);
  };
}

test('Enterprise WeChat office actions run per card and commit the returned status', async () => {
  stubWindow();
  const bots = [account('wecom_first', 'First Bot'), account('wecom_second', 'Second Bot')];
  const calls = [];
  let snapshot = officeSnapshot({ activeBotId: 'wecom_first' });
  const officeCall = async (action, payload = {}) => {
    calls.push([action, payload]);
    if (action === 'activate') snapshot = { ...snapshot, activeBotId: payload.botId };
    if (action === 'configure') snapshot = { ...snapshot, allowWrite: payload.value };
    return snapshot;
  };

  let renderer;
  await act(async () => {
    renderer = create(React.createElement(WecomSettingsTab, { rpcCall: twoBotRpc(bots), officeCall }));
    await flushMicrotasks();
  });
  assert.deepEqual(calls, [['status', {}]]);
  assert.match(textOf(renderer.root.findByProps({ 'data-bot-id': 'wecom_first' })), /办公能力已开通/);

  const second = renderer.root.findByProps({ 'data-bot-id': 'wecom_second' });
  await act(async () => {
    buttonNamed(second, '设为办公机器人').props.onClick();
    await flushMicrotasks();
  });
  assert.deepEqual(calls[1], ['activate', { botId: 'wecom_second' }]);
  const secondAfter = renderer.root.findByProps({ 'data-bot-id': 'wecom_second' });
  assert.match(textOf(secondAfter), /办公能力已开通/);
  assert.match(textOf(renderer.root.findByProps({ 'data-bot-id': 'wecom_first' })), /设为办公机器人/);

  const toggle = secondAfter.findAllByType('input').find((input) => input.props.type === 'checkbox');
  await act(async () => {
    toggle.props.onChange({ target: { checked: false } });
    await flushMicrotasks();
  });
  assert.deepEqual(calls[2], ['configure', { field: 'allowWrite', value: false }]);
  await act(async () => { renderer.unmount(); });
});

test('Enterprise WeChat office mutation disables office controls on every card', async () => {
  stubWindow();
  const bots = [account('wecom_first', 'First Bot'), account('wecom_second', 'Second Bot')];
  const pending = deferred();
  const snapshot = officeSnapshot({ activeBotId: 'wecom_first' });
  const officeCall = async (action) => action === 'activate' ? pending.promise : snapshot;

  let renderer;
  await act(async () => {
    renderer = create(React.createElement(WecomSettingsTab, { rpcCall: twoBotRpc(bots), officeCall }));
    await flushMicrotasks();
  });
  const second = renderer.root.findByProps({ 'data-bot-id': 'wecom_second' });
  await act(async () => {
    buttonNamed(second, '设为办公机器人').props.onClick();
    await flushMicrotasks();
  });

  const firstBusy = renderer.root.findByProps({ 'data-bot-id': 'wecom_first' });
  const secondBusy = renderer.root.findByProps({ 'data-bot-id': 'wecom_second' });
  assert.equal(buttonNamed(firstBusy, '重新检查').props.disabled, true);
  assert.equal(firstBusy.findAllByType('input').find((input) => input.props.type === 'checkbox').props.disabled, true);
  assert.equal(buttonNamed(secondBusy, '正在开通…').props.disabled, true);

  await act(async () => {
    pending.resolve({ ...snapshot, activeBotId: 'wecom_second' });
    await flushMicrotasks();
  });
  await act(async () => { renderer.unmount(); });
});

test('Enterprise WeChat stale office refresh cannot overwrite a newer activation result', async () => {
  stubWindow();
  const bots = [account('wecom_first', 'First Bot'), account('wecom_second', 'Second Bot')];
  const staleStatus = deferred();
  const oldSnapshot = officeSnapshot({ activeBotId: 'wecom_first' });
  let statusCalls = 0;
  const officeCall = async (action, payload) => {
    if (action === 'status') {
      statusCalls += 1;
      return statusCalls === 1 ? oldSnapshot : staleStatus.promise;
    }
    if (action === 'activate') return { ...oldSnapshot, activeBotId: payload.botId };
    throw new Error(`Unexpected office action: ${action}`);
  };

  let renderer;
  await act(async () => {
    renderer = create(React.createElement(WecomSettingsTab, { rpcCall: twoBotRpc(bots), officeCall }));
    await flushMicrotasks();
  });
  await act(async () => {
    buttonNamed(renderer.root.findByProps({ 'data-bot-id': 'wecom_first' }), '重新检查').props.onClick();
    await flushMicrotasks();
  });
  await act(async () => {
    buttonNamed(renderer.root.findByProps({ 'data-bot-id': 'wecom_second' }), '设为办公机器人').props.onClick();
    await flushMicrotasks();
  });
  assert.match(textOf(renderer.root.findByProps({ 'data-bot-id': 'wecom_second' })), /办公能力已开通/);

  await act(async () => {
    staleStatus.resolve(oldSnapshot);
    await flushMicrotasks();
  });
  assert.match(textOf(renderer.root.findByProps({ 'data-bot-id': 'wecom_second' })), /办公能力已开通/);
  assert.doesNotMatch(textOf(renderer.root.findByProps({ 'data-bot-id': 'wecom_first' })), /办公能力已开通/);
  await act(async () => { renderer.unmount(); });
});

test('Enterprise WeChat office activate rejection stays on the target card', async () => {
  stubWindow();
  const bots = [account('wecom_first', 'First Bot'), account('wecom_second', 'Second Bot')];
  const snapshot = officeSnapshot({ activeBotId: 'wecom_first' });
  const officeCall = async (action) => {
    if (action === 'activate') throw new Error('目标机器人授权失败');
    return snapshot;
  };

  let renderer;
  await act(async () => {
    renderer = create(React.createElement(WecomSettingsTab, { rpcCall: twoBotRpc(bots), officeCall }));
    await flushMicrotasks();
  });
  const second = renderer.root.findByProps({ 'data-bot-id': 'wecom_second' });
  await act(async () => {
    buttonNamed(second, '设为办公机器人').props.onClick();
    await flushMicrotasks();
  });

  const secondAfter = renderer.root.findByProps({ 'data-bot-id': 'wecom_second' });
  const firstAfter = renderer.root.findByProps({ 'data-bot-id': 'wecom_first' });
  assert.match(textOf(secondAfter), /目标机器人授权失败/);
  assert.doesNotMatch(textOf(firstAfter), /目标机器人授权失败/);
  assert.match(textOf(firstAfter), /办公能力已开通/);
  assert.match(textOf(firstAfter), /运行正常/);
  await act(async () => { renderer.unmount(); });
});

test('Enterprise WeChat office rollback status keeps the old active bot and flags the target card', async () => {
  stubWindow();
  const bots = [account('wecom_first', 'First Bot'), account('wecom_second', 'Second Bot')];
  const snapshot = officeSnapshot({ activeBotId: 'wecom_first' });
  let activateCalls = 0;
  const officeCall = async (action) => {
    if (action === 'activate') {
      activateCalls += 1;
      if (activateCalls === 1) {
        return {
          ...snapshot,
          ok: false,
          lastError: { code: 'auth-failed', message: '目标机器人授权失败，已恢复原办公机器人。' },
        };
      }
      return { ...snapshot, activeBotId: 'wecom_second' };
    }
    return snapshot;
  };

  let renderer;
  await act(async () => {
    renderer = create(React.createElement(WecomSettingsTab, { rpcCall: twoBotRpc(bots), officeCall }));
    await flushMicrotasks();
  });
  const second = renderer.root.findByProps({ 'data-bot-id': 'wecom_second' });
  await act(async () => {
    buttonNamed(second, '设为办公机器人').props.onClick();
    await flushMicrotasks();
  });

  const secondAfter = renderer.root.findByProps({ 'data-bot-id': 'wecom_second' });
  const firstAfter = renderer.root.findByProps({ 'data-bot-id': 'wecom_first' });
  assert.match(textOf(secondAfter), /目标机器人授权失败，已恢复原办公机器人。/);
  assert.match(textOf(secondAfter), /设为办公机器人/);
  assert.doesNotMatch(textOf(firstAfter), /授权失败/);
  assert.match(textOf(firstAfter), /办公能力已开通/);
  assert.match(textOf(firstAfter), /运行正常/);
  assert.equal(renderer.root.findAllByProps({ role: 'alert' }).filter(
    (node) => /无法读取企业微信机器人状态/.test(textOf(node)),
  ).length, 0);

  const retry = buttonNamed(secondAfter, '重试');
  assert.ok(retry, 'rollback failure offers a retry on the target card');
  await act(async () => {
    retry.props.onClick();
    await flushMicrotasks();
  });
  assert.equal(activateCalls, 2, 'retry re-runs the activation');
  const secondRetried = renderer.root.findByProps({ 'data-bot-id': 'wecom_second' });
  assert.match(textOf(secondRetried), /办公能力已开通/);
  assert.doesNotMatch(textOf(secondRetried), /授权失败/);
  await act(async () => { renderer.unmount(); });
});

test('Enterprise WeChat office configure marks the card busy with visible progress copy', async () => {
  stubWindow();
  const bots = [account('wecom_first', 'First Bot')];
  const pending = deferred();
  const snapshot = officeSnapshot({ activeBotId: 'wecom_first' });
  const officeCall = async (action) => action === 'configure' ? pending.promise : snapshot;

  let renderer;
  await act(async () => {
    renderer = create(React.createElement(WecomSettingsTab, { rpcCall: twoBotRpc(bots), officeCall }));
    await flushMicrotasks();
  });
  const card = () => renderer.root.findByProps({ 'data-bot-id': 'wecom_first' });
  assert.equal(card().findByProps({ className: 'dwecom-officeRow' }).props['aria-busy'], undefined);

  const toggle = card().findAllByType('input').find((input) => input.props.type === 'checkbox');
  await act(async () => {
    toggle.props.onChange({ target: { checked: false } });
    await flushMicrotasks();
  });

  const busyRow = card().findByProps({ className: 'dwecom-officeRow' });
  assert.equal(busyRow.props['aria-busy'], 'true', 'busy mutation sets aria-busy on the office row');
  assert.match(textOf(card()), /正在更新办公设置…/);
  const busyToggle = card().findAllByType('input').find((input) => input.props.type === 'checkbox');
  assert.equal(busyToggle.props.disabled, true);
  assert.match(textOf(card()), /运行正常/);

  await act(async () => {
    pending.resolve({ ...snapshot, allowWrite: false });
    await flushMicrotasks();
  });
  assert.equal(card().findByProps({ className: 'dwecom-officeRow' }).props['aria-busy'], undefined);
  await act(async () => { renderer.unmount(); });
});

test('Enterprise WeChat office activate rejection offers a retry that re-runs the activation', async () => {
  stubWindow();
  const bots = [account('wecom_first', 'First Bot'), account('wecom_second', 'Second Bot')];
  const snapshot = officeSnapshot({ activeBotId: 'wecom_first' });
  const calls = [];
  let failures = 1;
  const officeCall = async (action, payload = {}) => {
    if (action === 'activate') {
      calls.push(payload);
      if (failures > 0) {
        failures -= 1;
        throw new Error('目标机器人授权失败');
      }
      return { ...snapshot, activeBotId: payload.botId };
    }
    return snapshot;
  };

  let renderer;
  await act(async () => {
    renderer = create(React.createElement(WecomSettingsTab, { rpcCall: twoBotRpc(bots), officeCall }));
    await flushMicrotasks();
  });
  const second = renderer.root.findByProps({ 'data-bot-id': 'wecom_second' });
  await act(async () => {
    buttonNamed(second, '设为办公机器人').props.onClick();
    await flushMicrotasks();
  });

  const secondAfter = renderer.root.findByProps({ 'data-bot-id': 'wecom_second' });
  assert.match(textOf(secondAfter), /目标机器人授权失败/);
  const retry = buttonNamed(secondAfter, '重试');
  assert.ok(retry, 'activate rejection offers a retry on the target card');
  await act(async () => {
    retry.props.onClick();
    await flushMicrotasks();
  });
  assert.deepEqual(calls, [{ botId: 'wecom_second' }, { botId: 'wecom_second' }]);
  const secondRetried = renderer.root.findByProps({ 'data-bot-id': 'wecom_second' });
  assert.match(textOf(secondRetried), /办公能力已开通/);
  assert.doesNotMatch(textOf(secondRetried), /授权失败/);
  assert.match(textOf(renderer.root.findByProps({ 'data-bot-id': 'wecom_first' })), /运行正常/);
  assert.equal(renderer.root.findAllByProps({ role: 'alert' }).filter(
    (node) => /无法读取企业微信机器人状态/.test(textOf(node)),
  ).length, 0);
  await act(async () => { renderer.unmount(); });
});

test('Enterprise WeChat office configure rejection retries with the original change', async () => {
  stubWindow();
  const bots = [account('wecom_first', 'First Bot')];
  const snapshot = officeSnapshot({ activeBotId: 'wecom_first' });
  const calls = [];
  let failures = 1;
  const officeCall = async (action, payload = {}) => {
    if (action === 'configure') {
      calls.push(payload);
      if (failures > 0) {
        failures -= 1;
        throw new Error('办公设置保存失败');
      }
      return { ...snapshot, allowWrite: payload.value };
    }
    return snapshot;
  };

  let renderer;
  await act(async () => {
    renderer = create(React.createElement(WecomSettingsTab, { rpcCall: twoBotRpc(bots), officeCall }));
    await flushMicrotasks();
  });
  const card = () => renderer.root.findByProps({ 'data-bot-id': 'wecom_first' });
  const toggle = card().findAllByType('input').find((input) => input.props.type === 'checkbox');
  await act(async () => {
    toggle.props.onChange({ target: { checked: false } });
    await flushMicrotasks();
  });

  assert.match(textOf(card()), /办公设置保存失败/);
  const retry = buttonNamed(card(), '重试');
  assert.ok(retry, 'configure rejection offers a retry on the target card');
  await act(async () => {
    retry.props.onClick();
    await flushMicrotasks();
  });
  assert.deepEqual(calls, [
    { field: 'allowWrite', value: false },
    { field: 'allowWrite', value: false },
  ], 'retry replays the original configure change');
  assert.doesNotMatch(textOf(card()), /办公设置保存失败/);
  const updated = card().findAllByType('input').find((input) => input.props.type === 'checkbox');
  assert.equal(updated.props.checked, false);
  await act(async () => { renderer.unmount(); });
});

test('Enterprise WeChat office outage never breaks the chat cards', async () => {
  stubWindow();
  const bots = [account('wecom_first', 'First Bot')];
  const officeCall = async () => { throw new Error('office host unreachable'); };

  let renderer;
  await act(async () => {
    renderer = create(React.createElement(WecomSettingsTab, { rpcCall: twoBotRpc(bots), officeCall }));
    await flushMicrotasks();
  });

  const first = renderer.root.findByProps({ 'data-bot-id': 'wecom_first' });
  assert.match(textOf(first), /办公能力暂不可用/);
  assert.match(textOf(first), /运行正常/);
  assert.ok(buttonNamed(first, '重新检查'));
  assert.equal(renderer.root.findAllByProps({ role: 'alert' }).filter(
    (node) => /无法读取企业微信机器人状态/.test(textOf(node)),
  ).length, 0);
  await act(async () => { renderer.unmount(); });
});

test('Enterprise WeChat reconnect failure uses fixed translatable copy', async () => {
  const source = await readFile(CLIENT_URL, 'utf8');
  assert.match(source, /'连接检查失败，请稍后重试。'/);
  assert.match(source, /connectionTestFeedback/);
  assert.doesNotMatch(source, /请先私聊机器人发送 \/status/);
  assert.doesNotMatch(source, /连接检查失败：\$\{presentError\(error\)\.message\}/);
});

test('Enterprise WeChat keeps the connecting surface until the status snapshot contains the connected bot', async () => {
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
    if (endpoint === WECOM_ENDPOINTS.status) {
      statusCalls += 1;
      return { ok: true, value: {
        revision: statusCalls,
        bots: statusCalls < 3 ? [] : [{
          botId: 'wecom_new', connected: true, state: 'connected',
          workspace: '/workspace/default',
          bot: { name: '企业微信客服', appIdMasked: 'wecom•••new' },
          health: { summary: '企业微信 WebSocket 长连接运行正常' },
        }],
      } };
    }
    if (endpoint === WECOM_ENDPOINTS.beginProvisioning) return { ok: true, value: {
      attemptId: 'attempt_1', status: 'pending', expiresAt: Date.now() + 60_000,
      pollIntervalMs: 1_000, qrCodeDataUrl: 'data:image/png;base64,AAAA',
    } };
    if (endpoint === WECOM_ENDPOINTS.pollProvisioning) return { ok: true, value: {
      attemptId: 'attempt_1', status: 'connected', botId: 'wecom_new',
      expiresAt: Date.now() + 60_000, pollIntervalMs: 1_000,
    } };
    throw new Error(`Unexpected endpoint: ${endpoint}`);
  };

  let renderer;
  await act(async () => {
    renderer = create(React.createElement(WecomSettingsTab, { rpcCall }));
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

  // The poll reported connected but the authoritative snapshot lacks the bot,
  // so the connecting surface stays and Add must not offer a second bind.
  assert.match(textOf(renderer.root), /企业微信已授权，正在连接机器人/);
  assert.equal(buttonNamed(renderer.root, '正在接入').props.disabled, true);
  assert.equal(timeouts.length, 1);

  const secondPoll = timeouts.shift();
  await act(async () => {
    await secondPoll.callback();
    await flushMicrotasks();
  });

  assert.doesNotMatch(textOf(renderer.root), /正在连接机器人/);
  assert.equal(renderer.root.findAllByProps({ 'data-bot-id': 'wecom_new' }).length, 1);
  await act(async () => { renderer.unmount(); });
});

test('Enterprise WeChat removal opens a modal overlay dialog above the still-visible card', async () => {
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

  const focusLog = [];
  const triggerNode = { focus: () => focusLog.push('trigger') };
  const previousDocument = globalThis.document;
  globalThis.document = {
    activeElement: null,
    contains: () => true,
    querySelector: () => null,
    createElement: () => ({ dataset: {}, remove() {} }),
    head: { appendChild() {} },
    addEventListener() {},
    removeEventListener() {},
  };
  onTestFinished(() => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });

  const bots = [account('wecom_remove', '客服机器人')];
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
    renderer = create(React.createElement(WecomSettingsTab, { rpcCall }));
    await flushMicrotasks();
  });
  const card = () => renderer.root.findByProps({ 'data-bot-id': 'wecom_remove' });
  const dialogs = () => renderer.root.findAllByProps({ role: 'alertdialog' });

  await act(async () => {
    buttonNamed(card(), '移除接入').props.onClick({ currentTarget: triggerNode });
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
  assert.match(textOf(card()), /wecom_remove•••/, 'the card stays visible behind the overlay');

  await act(async () => {
    buttonNamed(renderer.root, '保留机器人').props.onClick();
  });
  assert.equal(dialogs().length, 0, 'cancel closes the dialog');
  assert.match(textOf(card()), /wecom_remove•••/, 'cancel keeps the bot');
  assert.deepEqual(focusLog, ['trigger'], 'cancel restores focus to the clicked remove button');

  await act(async () => {
    buttonNamed(card(), '移除接入').props.onClick({ currentTarget: triggerNode });
  });
  await act(async () => {
    buttonNamed(renderer.root, '确认移除接入').props.onClick();
    await flushMicrotasks();
  });
  assert.deepEqual(deletes, [{ botId: 'wecom_remove', confirm: true }]);
  assert.equal(dialogs().length, 0, 'confirm closes the dialog');
  await act(async () => { renderer.unmount(); });
});
