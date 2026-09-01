// @ts-nocheck
import { afterEach, onTestFinished, test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  BOT_FOLLOW_KEY,
  bindSessionFollow,
  bindSessionFollowByBot,
  clearSessionFollow,
  describeFollowKey,
  followTargetLabel,
  followersForSession,
  followSources,
  listFollowBots,
  listFollowTargets,
  followBindingsGeneration,
  followSourceName,
  registerFollowSource,
  resetFollowSources,
} from '../src/channels/shared/session-follow.ts';
import * as workspaceSession from '../src/channels/shared/workspace-session.ts';
import { askInWorkspaceSession } from '../src/channels/shared/workspace-session.ts';
import {
  createSessionFollowRpcHandler,
  followPayloadFailure,
  IM_FOLLOW_ENDPOINTS,
} from '../src/host/session-follow-rpc.ts';
import {
  isSessionActionsMenuLabels,
  sessionIdFromActionButton,
  sessionIdFromFiberNode,
} from '../src/client/session-follow-menu.ts';
import {
  followBadgeCaption,
  followBadgeLabel,
  followBadgePlacement,
  followHoverBotLine,
  followHoverHintText,
  statusSlotNode,
  sessionRowFromActionButton,
  titleNodeFromRow,
} from '../src/client/session-follow-badges.ts';
import { groupFollowBots, SESSION_FOLLOW_CSS } from '../src/client/session-follow.ts';
import { installSessionFollowBadges } from '../src/client/session-follow-badges.ts';
import { listFollowedSessions } from '../src/channels/shared/session-follow.ts';
import { ConversationStateStore } from '../src/channels/shared/conversation-state-store.ts';
import { BotWorkspaceStore } from '../src/channels/shared/bot-workspace-store.ts';
import { locateRegisteredWorkspaceSession } from '../src/channels/shared/harness-session-binding.ts';
import { createProductionController } from '../src/host/channels/dingtalk/production.ts';

afterEach(() => {
  resetFollowSources();
});

function memoryStore(sessions = {}) {
  const state = { sessions: { ...sessions } };
  return {
    snapshot() {
      return { sessions: { ...state.sessions } };
    },
    sessionFor(key) {
      return state.sessions[key] ?? null;
    },
    async setSession(key, sessionId) {
      state.sessions[key] = sessionId;
    },
    async clearSession(key) {
      delete state.sessions[key];
    },
  };
}

test('follow labels distinguish group and direct chats', () => {
  assert.equal(describeFollowKey('group:chat-abcdef'), '群 …abcdef');
  assert.equal(describeFollowKey('direct:user-1'), '私聊 user-1');
  assert.match(followTargetLabel('wecom', 'group:xyz'), /^企业微信 · 群 /);
});

test('bindSessionFollow is exclusive to one IM chat per session', async () => {
  const wecom = memoryStore({ 'group:a': 'session-old', 'direct:b': 'session-keep' });
  const feishu = memoryStore({ 'p2p:u': 'session-new' });
  const sources = [
    { channel: 'wecom', botId: 'bot-1', state: wecom },
    { channel: 'feishu', botId: 'bot-2', state: feishu },
  ];

  await bindSessionFollow(sources, {
    sessionId: 'session-new',
    channel: 'wecom',
    botId: 'bot-1',
    key: 'group:a',
  });

  assert.deepEqual(wecom.snapshot().sessions, {
    'group:a': 'session-new',
    'direct:b': 'session-keep',
  });
  assert.deepEqual(feishu.snapshot().sessions, {});
  assert.deepEqual(
    followersForSession('session-new', sources).map((item) => item.key),
    ['group:a'],
  );
});

test('clearSessionFollow unbinds every chat pointing at the session', async () => {
  const wecom = memoryStore({ 'group:a': 'session-1', 'direct:b': 'session-2' });
  await clearSessionFollow([{ channel: 'wecom', botId: 'bot-1', state: wecom }], {
    sessionId: 'session-1',
  });
  assert.deepEqual(wecom.snapshot().sessions, { 'direct:b': 'session-2' });
});

test('followed-session index lists BOT_FOLLOW_KEY bindings', async () => {
  const wecom = memoryStore({ [BOT_FOLLOW_KEY]: 'session-follow', 'group:ops': 'session-inbound' });
  const feishu = memoryStore();
  const sources = [
    { channel: 'wecom', botId: 'bot-1', name: '企微客服', detail: 'id••••9', state: wecom },
    { channel: 'feishu', botId: 'bot-2', state: feishu },
  ];
  assert.deepEqual(
    listFollowedSessions(sources).map((item) => item.sessionId),
    ['session-follow'],
  );
  assert.equal(listFollowedSessions(sources)[0]?.label.includes('企微客服'), true);

  const handler = createSessionFollowRpcHandler();
  registerFollowSource(sources[0]);
  registerFollowSource(sources[1]);
  const indexed = await handler('session.follow.index', {});
  assert.equal(indexed.ok, true);
  assert.deepEqual(indexed.value.items.map((item) => item.sessionId), ['session-follow']);
  assert.equal(indexed.value.items[0].channel, 'wecom');
  assert.match(followPayloadFailure(IM_FOLLOW_ENDPOINTS.index, { sessionId: 'x' }), /does not accept/);
  assert.match(followPayloadFailure(IM_FOLLOW_ENDPOINTS.watch, {}), /generation/);
});

test('session.follow.watch returns as soon as an inbound bind is stored', async () => {
  const wecom = memoryStore();
  registerFollowSource({
    channel: 'wecom',
    botId: 'bot-live',
    name: '企微客服',
    state: wecom,
  });
  const handler = createSessionFollowRpcHandler();
  const seen = followBindingsGeneration();
  const pending = handler('session.follow.watch', { generation: seen });
  await wecom.setSession(BOT_FOLLOW_KEY, 'session-live');
  const watched = await pending;
  assert.equal(watched.ok, true);
  assert.equal(watched.value.items[0].sessionId, 'session-live');
  assert.equal(watched.value.items[0].channel, 'wecom');
  assert.equal(watched.value.generation > seen, true);
});

test('follow source names refresh from live config getters', () => {
  const config = { botName: '旧名字' };
  registerFollowSource({
    channel: 'wecom',
    botId: 'bot-live-name',
    state: memoryStore({ [BOT_FOLLOW_KEY]: 'session-named' }),
    name: () => followSourceName(config),
  });
  assert.equal(listFollowedSessions()[0].name, '旧名字');
  config.botName = '企微客服';
  assert.equal(listFollowedSessions()[0].name, '企微客服');
});

test('follow names prefer a local alias over the platform config name', () => {
  const aliases = { bot_one: '客服甲' };
  const config = { name: '微信机器人' };
  registerFollowSource({
    channel: 'weixin',
    botId: 'bot_one',
    state: memoryStore({ [BOT_FOLLOW_KEY]: 'session-alias' }),
    name: () => aliases.bot_one || followSourceName(config) || '微信机器人',
  });
  assert.equal(listFollowedSessions()[0].name, '客服甲');
  aliases.bot_one = '';
  assert.equal(listFollowedSessions()[0].name, '微信机器人');
});

test('follow index lists a bound session for every IM channel', () => {
  const channels = [
    'weixin', 'feishu', 'wecom', 'dingtalk', 'qq', 'slack', 'telegram', 'discord', 'whatsapp',
  ];
  const sources = channels.map((channel) => ({
    channel,
    botId: `${channel}-bot`,
    name: `${channel}-bot`,
    state: memoryStore({ [BOT_FOLLOW_KEY]: `session-${channel}` }),
  }));
  assert.deepEqual(
    listFollowedSessions(sources).map((item) => item.channel).sort(),
    [...channels].sort(),
  );
});

test('follow index reads WeCom bindings even when the store has no snapshot helper', () => {
  const wecom = {
    sessions: { [BOT_FOLLOW_KEY]: 'session-wecom' },
  };
  const items = listFollowedSessions([
    { channel: 'wecom', botId: 'wecom-1', name: '企微客服', detail: 'aibV_v••••con9', state: wecom },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].channel, 'wecom');
  assert.equal(items[0].sessionId, 'session-wecom');
  assert.equal(items[0].name, '企微客服');
});

test('two Feishu bots bound to different sessions stay distinct in the follow index', () => {
  const office = memoryStore({ [BOT_FOLLOW_KEY]: 'session-office' });
  const support = memoryStore({ [BOT_FOLLOW_KEY]: 'session-support' });
  const items = listFollowedSessions([
    { channel: 'feishu', botId: 'bot-office', name: '办公助手', detail: 'cli_aaa••••1111', state: office },
    { channel: 'feishu', botId: 'bot-support', name: '客服助手', detail: 'cli_bbb••••2222', state: support },
  ]);
  assert.equal(items.length, 2);
  assert.equal(items.find((item) => item.sessionId === 'session-office')?.name, '办公助手');
  assert.equal(items.find((item) => item.sessionId === 'session-support')?.name, '客服助手');
  assert.equal(items.find((item) => item.sessionId === 'session-office')?.label, '飞书 · 办公助手');
  assert.equal(followBadgeCaption(items.find((item) => item.sessionId === 'session-support')), '客服助手');
});

test('followed-session index prefers explicit follow over inbound chat on the same session', () => {
  const weixin = memoryStore({ [BOT_FOLLOW_KEY]: 'session-shared', 'direct:wx': 'session-shared' });
  const feishu = memoryStore({ 'p2p:u': 'session-other' });
  const items = listFollowedSessions([
    { channel: 'weixin', botId: 'wx-1', name: '微信客服', state: weixin },
    { channel: 'feishu', botId: 'fs-1', name: '办公助手', state: feishu },
  ]);
  assert.deepEqual(items.map((item) => `${item.channel}:${item.sessionId}`).sort(), [
    'feishu:session-other',
    'weixin:session-shared',
  ]);
  assert.equal(items.find((item) => item.sessionId === 'session-shared')?.name, '微信客服');
});

test('session row badges sit on the list item that owns the overflow button', () => {
  const row = {
    closest(selector) {
      if (selector.includes('[data-dsh-sidebar-tools]')) return null;
      return selector.includes('li') || selector.includes('treeitem') ? this : null;
    },
    children: [],
  };
  const slot = { className: 'YDXeBa_slot', parentElement: row };
  const title = { className: 'YDXeBa_title', parentElement: row, textContent: '获取最新远程分支代码' };
  const time = { className: 'YDXeBa_time', parentElement: row };
  const actions = { id: 'actions', className: 'YDXeBa_rowActions', parentElement: row };
  row.children = [slot, title, time, actions];
  const button = {
    closest(selector) {
      if (selector.includes('[data-dsh-sidebar-tools]')) return null;
      return selector.includes('li') || selector.includes('treeitem') ? row : null;
    },
    parentElement: actions,
    getAttribute() {
      return '会话「检查远程仓库更新」的操作';
    },
  };
  assert.equal(sessionRowFromActionButton(button), row);
  assert.equal(titleNodeFromRow(row), title);
  assert.equal(followBadgeCaption({ channel: 'feishu', name: '办公助手' }), '办公助手');
  assert.equal(followBadgeCaption({
    channel: 'feishu',
    name: '飞书机器人',
    detail: 'cli_aaa••••1111',
  }), 'cli_aaa••••1111');
  assert.equal(followHoverBotLine({
    channel: 'weixin',
    name: '客服助手',
    detail: 'id••••9',
  }), '客服助手 · id••••9');
  assert.equal(followHoverBotLine({
    channel: 'weixin',
    name: '9c941f••••.bot',
    detail: '9c941f••••.bot',
  }), '9c941f••••.bot');
  assert.equal(
    followHoverHintText({ channel: 'weixin', name: '客服助手', detail: 'id••••9' }),
    '微信 · 客服助手 · id••••9',
  );
  assert.equal(followBadgeLabel({ channel: 'feishu', name: '办公助手' }), '飞书 · 办公助手');
  assert.equal(statusSlotNode(row), slot);
  assert.deepEqual(followBadgePlacement(button), {
    parent: slot,
    before: null,
    className: 'dim-followBadge dim-followBadgeSlot',
  });
});

test('session follow CSS keeps a compact badge with expanded touch targets and running state', () => {
  assert.match(SESSION_FOLLOW_CSS, /\[data-im-follow-badge\] \{[^}]*width: 16px;[^}]*height: 16px;/);
  assert.match(SESSION_FOLLOW_CSS, /\[data-im-follow-badge\]::after \{[^}]*inset: -8px;/);
  assert.match(SESSION_FOLLOW_CSS, /\[class\*="slot"\]:has\(> \[data-im-follow-badge\]\)/);
  assert.match(SESSION_FOLLOW_CSS, /\[class\*="slot"\]:has\(\[class\*="matrix"\]\) > \[data-im-follow-badge\] \.dim-logo,\n[^{}]+\{\n  outline:/);
  assert.match(SESSION_FOLLOW_CSS, /:has\(> \[data-im-follow-badge\]\) > :not\(\[data-im-follow-badge\]\) \{[^}]*clip: rect\(0, 0, 0, 0\);[^}]*clip-path: inset\(50%\);/);
  assert.match(SESSION_FOLLOW_CSS, /\[data-im-follow-badge\]::after \{ inset: -14px; \}/);
  assert.doesNotMatch(SESSION_FOLLOW_CSS, /pointer: coarse\) \{[^]*\.dim-followBadge[^]*min-height: 44px/);
});

test('session status-slot discovery has a direct-child query fallback', () => {
  const slot = { className: 'YDXeBa_slot' };
  const row = {
    children: [],
    querySelectorAll() { return [slot]; },
  };
  slot.parentElement = row;
  assert.equal(statusSlotNode(row), slot);
});

test('session row badges stay outside the hover-only overflow cluster', () => {
  const row = {
    closest(selector) {
      if (selector.includes('[data-dsh-sidebar-tools]')) return null;
      return selector.includes('treeitem') ? this : null;
    },
    children: [],
  };
  const title = { className: 'YDXeBa_title', parentElement: row };
  const actions = { parentElement: row, className: 'YDXeBa_rowActions' };
  row.children = [title, actions];
  const menu = { parentElement: actions };
  const overflow = {
    closest(selector) {
      if (selector.includes('[data-dsh-sidebar-tools]')) return null;
      return selector.includes('treeitem') ? row : null;
    },
    parentElement: menu,
  };
  assert.deepEqual(followBadgePlacement(overflow), {
    parent: row,
    before: title,
  });
});

test('session row badges replace occupied status slots and carry the running state', () => {
  const row = {
    closest(selector) {
      if (selector.includes('[data-dsh-sidebar-tools]')) return null;
      return selector.includes('treeitem') ? this : null;
    },
    children: [],
  };
  const dots = { className: 'statusDots matrix' };
  const slot = { className: 'YDXeBa_slot', parentElement: row, children: [dots] };
  const title = { className: 'YDXeBa_title', parentElement: row };
  row.children = [slot, title];
  const button = {
    closest() { return row; },
    parentElement: row,
  };
  assert.deepEqual(followBadgePlacement(button), {
    parent: slot,
    before: null,
    className: 'dim-followBadge dim-followBadgeSlot',
  });
});

test('session overflow menu is detected by official labels', () => {
  assert.equal(isSessionActionsMenuLabels(['重命名', '分叉会话', '归档会话']), true);
  assert.equal(isSessionActionsMenuLabels(['Rename', 'Fork session', 'Archive session']), true);
  assert.equal(isSessionActionsMenuLabels(['删除工作区']), false);
  const fiber = {
    memoizedProps: {},
    return: { memoizedProps: { node: { id: 'session-row-1' } } },
  };
  assert.equal(sessionIdFromFiberNode({ __reactFiber$test: fiber }), 'session-row-1');
  assert.equal(sessionIdFromFiberNode({
    __reactFiber$id: {
      memoizedProps: { id: 'session-prop-id' },
      return: null,
    },
  }), 'session-prop-id');
  assert.equal(sessionIdFromFiberNode({
    __reactFiber$alt: {
      memoizedProps: { className: 'row' },
      pendingProps: { sessionId: 'session-header-2' },
      return: null,
    },
  }), 'session-header-2');
  assert.equal(sessionIdFromFiberNode({
    __reactFiber$folder: {
      memoizedProps: { node: { id: 'folder-1' } },
      return: { memoizedProps: { node: { id: 'session-ancestor' } }, return: null },
    },
  }), 'session-ancestor');
  const row = {
    __reactFiber$row: { memoizedProps: { node: { id: 'session-row' } }, return: null },
  };
  const button = {
    __reactFiber$button: { memoizedProps: { id: 'session-wrong' }, return: null },
    closest: () => row,
  };
  assert.equal(sessionIdFromActionButton(button), 'session-row');
});

test('follow bots list each connected bot and mark the current one', async () => {
  const wecom = memoryStore({ [BOT_FOLLOW_KEY]: 'session-9', 'group:ops': 'session-9' });
  const feishu = memoryStore({ 'p2p:u': 'session-other' });
  const sources = [
    { channel: 'wecom', botId: 'bot-1', state: wecom },
    { channel: 'feishu', botId: 'bot-2', name: '办公助手', state: feishu },
  ];
  const bots = listFollowBots(sources, 'session-9');
  assert.deepEqual(bots.map((item) => item.channel), ['feishu', 'wecom']);
  assert.equal(bots.find((item) => item.channel === 'wecom')?.selected, true);
  assert.equal(bots.find((item) => item.channel === 'feishu')?.selected, false);

  await bindSessionFollowByBot(sources, {
    sessionId: 'session-9',
    channel: 'feishu',
    botId: 'bot-2',
  });
  assert.equal(feishu.snapshot().sessions[BOT_FOLLOW_KEY], 'session-9');
  assert.equal(wecom.snapshot().sessions['group:ops'], undefined);
});

test('follow bots keep Feishu robots distinct and selectable before any chat', async () => {
  const alpha = memoryStore();
  const beta = memoryStore();
  const sources = [
    { channel: 'feishu', botId: 'bot_alpha', name: '办公助手', state: alpha },
    { channel: 'feishu', botId: 'bot_beta', name: '客服助手', state: beta },
  ];
  const bots = listFollowBots(sources, 'session-new');
  assert.deepEqual(bots.map((item) => item.label), ['飞书 · 办公助手', '飞书 · 客服助手']);
  assert.equal(bots.every((item) => item.selected === false), true);

  await bindSessionFollowByBot(sources, {
    sessionId: 'session-new',
    channel: 'feishu',
    botId: 'bot_beta',
  });
  assert.equal(alpha.snapshot().sessions[BOT_FOLLOW_KEY], undefined);
  assert.equal(beta.snapshot().sessions[BOT_FOLLOW_KEY], 'session-new');
  assert.equal(
    listFollowBots(sources, 'session-new').find((item) => item.botId === 'bot_beta')?.selected,
    true,
  );
});

test('inbound session bindings still get follow badges', () => {
  const wecom = memoryStore({
    'direct:user-a': 'session-inbound-a',
    'direct:user-b': 'session-inbound-b',
  });
  const items = listFollowedSessions([{ channel: 'wecom', botId: 'bot-1', state: wecom }]);
  assert.deepEqual(
    items.map((item) => item.sessionId).sort(),
    ['session-inbound-a', 'session-inbound-b'],
  );
});

test('switching bot follow drops the previous session badge', async () => {
  const wecom = memoryStore({
    [BOT_FOLLOW_KEY]: 'session-old',
    'direct:user': 'session-old',
  });
  const sources = [{ channel: 'wecom', botId: 'bot-1', state: wecom }];
  assert.deepEqual(listFollowedSessions(sources).map((item) => item.sessionId), ['session-old']);
  await bindSessionFollowByBot(sources, {
    sessionId: 'session-new',
    channel: 'wecom',
    botId: 'bot-1',
  });
  assert.equal(wecom.snapshot().sessions[BOT_FOLLOW_KEY], 'session-new');
  assert.deepEqual(listFollowedSessions(sources).map((item) => item.sessionId), ['session-new']);
});

test('a bot follow badge is exclusive to the followed session', async () => {
  const weixin = memoryStore({
    [BOT_FOLLOW_KEY]: 'session-follow',
    'direct:user': 'session-inbound',
  });
  const sources = [{ channel: 'weixin', botId: 'wx', state: weixin }];
  assert.equal(listFollowBots(sources, 'session-follow').find((item) => item.channel === 'weixin')?.selected, true);
  assert.equal(listFollowBots(sources, 'session-inbound').find((item) => item.channel === 'weixin')?.selected, false);
});

test('registry lists live sources and RPC validates payloads', async () => {
  const wecom = memoryStore({ [BOT_FOLLOW_KEY]: 'session-9', 'group:ops': 'session-9' });
  registerFollowSource({
    channel: 'wecom',
    botId: 'bot-1',
    state: wecom,
    detail: 'aibV_v••••con9',
  });
  const items = listFollowTargets();
  assert.equal(items.length, 1);
  assert.equal(items[0].label.includes('企业微信'), true);

  assert.match(followPayloadFailure(IM_FOLLOW_ENDPOINTS.list, {}), /sessionId/);
  assert.match(followPayloadFailure(IM_FOLLOW_ENDPOINTS.set, {
    sessionId: 'session-10',
    channel: 'wecom',
  }), /botId/);
  const handler = createSessionFollowRpcHandler();
  const listed = await handler('session.follow.list', { sessionId: 'session-9' });
  assert.equal(listed.ok, true);
  assert.equal(listed.value.current.channel, 'wecom');
  assert.equal(listed.value.current.botId, 'bot-1');
  assert.equal(listed.value.current.name, '企业微信机器人');
  assert.equal(listed.value.current.detail, 'aibV_v••••con9');
  assert.equal(listed.value.current.label, '企业微信 · 企业微信机器人');
  assert.equal(listed.value.channels[0].channel, 'wecom');
  assert.equal(listed.value.channels[0].detail, 'aibV_v••••con9');

  const bound = await handler('session.follow.set', {
    sessionId: 'session-10',
    channel: 'wecom',
    botId: 'bot-1',
  });
  assert.equal(bound.ok, true);
  assert.equal(wecom.snapshot().sessions[BOT_FOLLOW_KEY], 'session-10');
  assert.equal(wecom.snapshot().sessions['group:ops'], 'session-9');
});

test('follow picker matches project identity and exposes no project path', async () => {
  const weixin = memoryStore();
  const alpha = memoryStore();
  const beta = memoryStore();
  const grouped = groupFollowBots([
    { channel: 'weixin', botId: 'wx', name: '微信', ready: false },
    { channel: 'feishu', botId: 'bot_alpha', name: '办公助手', ready: true },
    { channel: 'feishu', botId: 'bot_beta', name: '客服助手', ready: true },
  ]);
  assert.deepEqual(grouped.map((group) => group.channel), ['feishu']);
  assert.deepEqual(grouped[0].bots.map((item) => item.name), ['办公助手', '客服助手']);

  const sessionProject = { workspaceId: 'project-a', title: 'Current A', path: '/current/a' };
  registerFollowSource({
    channel: 'weixin',
    botId: 'wx',
    state: weixin,
    project: { workspaceId: 'project-other', title: 'Other', path: '/current/a' },
    locateSession: async () => sessionProject,
  });
  registerFollowSource({
    channel: 'feishu',
    botId: 'bot_alpha',
    name: '办公助手',
    state: alpha,
    project: { workspaceId: 'project-a', title: 'Cached A', path: '/old/a' },
    locateSession: async () => sessionProject,
  });
  registerFollowSource({
    channel: 'feishu',
    botId: 'bot_beta',
    name: '客服助手',
    state: beta,
    project: { workspaceId: 'project-a', title: 'Cached A', path: '/old/a' },
    locateSession: async () => sessionProject,
  });
  const listed = await createSessionFollowRpcHandler()('session.follow.list', { sessionId: 'session-here' });
  assert.equal(listed.ok, true);
  assert.deepEqual(listed.value.channels.map((item) => item.botId), ['bot_alpha', 'bot_beta']);
  assert.equal(listed.value.sessionWorkspaceId, 'project-a');
  assert.doesNotMatch(JSON.stringify(listed.value), /\/current\/a|\/old\/a/);
});

test('follow readiness rejects equal paths with different ids and deleted projects', async () => {
  const wecom = memoryStore();
  const feishu = memoryStore();
  const sources = [
    {
      channel: 'wecom', botId: 'bot-1', state: wecom,
      project: { workspaceId: 'project-a', title: 'A', path: '/workspace/changed' },
    },
    {
      channel: 'feishu', botId: 'bot-2', name: '办公助手', state: feishu,
      project: { workspaceId: 'project-b', title: 'B', path: '/workspace/a' },
    },
    { channel: 'qq', botId: 'bot-deleted', state: memoryStore(), project: null },
  ];
  const sessionProject = { workspaceId: 'project-a', title: 'Current A', path: '/workspace/a' };
  const bots = listFollowBots(sources, 'session-in-a', sessionProject);
  assert.equal(bots.find((item) => item.channel === 'wecom')?.ready, true);
  assert.equal(bots.find((item) => item.channel === 'feishu')?.ready, false);
  assert.equal(bots.find((item) => item.channel === 'qq')?.ready, false);
  assert.match(bots.find((item) => item.channel === 'feishu')?.reason, /项目是/);
  assert.deepEqual(bots.filter((item) => item.ready).map((item) => item.channel), ['wecom']);

  await assert.rejects(
    bindSessionFollowByBot(sources, {
      sessionId: 'session-in-a',
      channel: 'feishu',
      botId: 'bot-2',
      sessionProject,
    }),
    { code: 'follow-workspace-mismatch' },
  );
  assert.equal(feishu.snapshot().sessions[BOT_FOLLOW_KEY], undefined);

  await bindSessionFollowByBot(sources, {
    sessionId: 'session-in-a',
    channel: 'wecom',
    botId: 'bot-1',
    sessionProject,
  });
  assert.equal(wecom.snapshot().sessions[BOT_FOLLOW_KEY], 'session-in-a');
});

test('the Harness follow locator returns the owning project object', async () => {
  const client = {
    ensureRunning: async () => true,
    rpc: async () => ({
      items: [{
        workspaceId: 'project-a', title: 'Office', path: '/work/a', sessionIds: ['session-a'],
      }],
      archivedSessionIds: [],
    }),
  };
  assert.deepEqual(await locateRegisteredWorkspaceSession(client, 'session-a'), {
    workspaceId: 'project-a', title: 'Office', path: '/work/a',
  });
});

test('askInWorkspaceSession clears and reports a stale follow instead of asking the old chat session', async () => {
  const asked = [];
  const state = memoryStore({
    [BOT_FOLLOW_KEY]: 'session-gone',
    'p2p:u': 'session-chat',
  });
  const harness = {
    async createSession() {
      return 'session-created-unexpectedly';
    },
    workspaceSession(sessionId) {
      return {
        sessionId,
        async sessionExists() {
          return sessionId === 'session-chat';
        },
        async ask(text) {
          asked.push({ sessionId, text });
          return 'ok';
        },
      };
    },
  };
  const reply = await askInWorkspaceSession({
    harness,
    state,
    key: 'p2p:u',
    text: 'hello',
  });
  assert.deepEqual(asked, [], 'no silent ask in the old conversation session');
  assert.notEqual(reply.sessionId, 'session-chat');
  assert.equal(state.sessionFor(BOT_FOLLOW_KEY), null, 'stale follow is cleared');
  assert.equal(
    reply.answer,
    '网页会话已不存在，已断开 IM 会话。请重新选择要在 IM 中继续的会话，或发送 /new 开始新会话。',
  );
});

test('askInWorkspaceSession uses the bot follow session for inbound chats', async () => {
  const asked = [];
  const state = memoryStore({
    [BOT_FOLLOW_KEY]: 'session-follow',
    'p2p:u': 'session-old',
  });
  const harness = {
    async createSession() {
      return 'session-created-unexpectedly';
    },
    workspaceSession(sessionId) {
      return {
        sessionId,
        async sessionExists() {
          return sessionId === 'session-follow' || sessionId === 'session-old';
        },
        async ask(text) {
          asked.push({ sessionId, text });
          return 'ok';
        },
      };
    },
  };
  const reply = await askInWorkspaceSession({
    harness,
    state,
    key: 'p2p:u',
    text: 'hello',
  });
  assert.equal(reply.sessionId, 'session-follow');
  assert.deepEqual(asked, [{ sessionId: 'session-follow', text: 'hello' }]);
  assert.equal(state.snapshot().sessions['p2p:u'], 'session-old');
});

function deferred() {
  let resolve;
  const promise = new Promise((settle) => { resolve = settle; });
  return { promise, resolve };
}

test('Follow cannot write a project-B session after project-A session clearing', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-im-follow-project-race-'));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  const workspaces = await new BotWorkspaceStore(join(directory, 'workspaces.json')).load();
  const projects = [
    { workspaceId: 'project-a', title: 'Alpha', path: join(directory, 'alpha') },
    { workspaceId: 'project-b', title: 'Beta', path: join(directory, 'beta') },
  ];
  workspaces.setProjectCatalog(async () => projects);
  await workspaces.ensure('bot-a');
  await workspaces.setProject('bot-a', 'project-b');

  const writeEntered = deferred();
  const allowWrite = deferred();
  const sessionsCleared = deferred();
  const finishClear = deferred();
  const sessions = {};
  const state = {
    snapshot: () => ({ sessions: { ...sessions } }),
    async setSession(key, sessionId) {
      writeEntered.resolve();
      await allowWrite.promise;
      sessions[key] = sessionId;
    },
    async clearSession(key) {
      delete sessions[key];
    },
    async clearSessions() {
      for (const key of Object.keys(sessions)) delete sessions[key];
      sessionsCleared.resolve();
      await finishClear.promise;
    },
  };
  const source = {
    channel: 'wecom',
    botId: 'bot-a',
    state,
    project: () => workspaces.projectFor('bot-a'),
    generation: () => workspaces.generationFor('bot-a'),
  };
  const rejectedFollow = assert.rejects(bindSessionFollowByBot([source], {
    sessionId: 'session-b',
    channel: 'wecom',
    botId: 'bot-a',
    sessionProject: projects[1],
  }), { code: 'follow-workspace-mismatch' });
  await writeEntered.promise;

  const switching = workspaces.setProject('bot-a', 'project-a', {
    clearSessions: () => state.clearSessions(),
  });
  await sessionsCleared.promise;
  assert.equal(workspaces.projectFor('bot-a').workspaceId, 'project-b');
  allowWrite.resolve();
  await rejectedFollow;
  assert.deepEqual(sessions, {});

  finishClear.resolve();
  await switching;
  assert.equal(workspaces.projectFor('bot-a').workspaceId, 'project-a');
  assert.deepEqual(sessions, {});
});

test('Follow clears its write when project identity changes without a generation signal', async () => {
  const writeEntered = deferred();
  const allowWrite = deferred();
  const sessions = {};
  let project = { workspaceId: 'project-b', title: 'Beta', path: '/project/b' };
  const state = {
    snapshot: () => ({ sessions: { ...sessions } }),
    async setSession(key, sessionId) {
      writeEntered.resolve();
      await allowWrite.promise;
      sessions[key] = sessionId;
    },
    async clearSession(key) {
      delete sessions[key];
    },
  };
  const source = {
    channel: 'wecom',
    botId: 'bot-a',
    state,
    project: () => project,
    generation: () => 1,
  };
  const rejectedFollow = assert.rejects(bindSessionFollowByBot([source], {
    sessionId: 'session-b',
    channel: 'wecom',
    botId: 'bot-a',
    sessionProject: project,
  }), { code: 'follow-workspace-mismatch' });
  await writeEntered.promise;
  project = { workspaceId: 'project-a', title: 'Alpha', path: '/project/a' };
  allowWrite.resolve();

  await rejectedFollow;
  assert.deepEqual(sessions, {});
});

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function createTestProduction(directory, seen) {
  const stateStores = [];
  class ConfigStore {
    async load() { return this; }
    list() { return []; }
    get() { return null; }
  }
  class DeviceAuth {}
  class StateStore extends ConversationStateStore {
    constructor(path) {
      super(path);
      stateStores.push(this);
    }
  }
  class Harness {
    stopManagedProcess() {}
  }
  class Runtime {}
  class Controller {
    constructor(options) { seen.controllerOptions = options; }
    async close() {}
  }
  const supervisor = {
    ready: Promise.resolve(null),
    start() { return this; },
    async close() {},
  };
  const production = await createProductionController({
    credentials: {},
    webServer: { port: 3080 },
    logger: () => console,
  }, { dataDir: directory }, {
    ConfigStore,
    DeviceAuth,
    StateStore,
    HarnessClient: Harness,
    Controller,
    Runtime,
    createConnectionSupervisor: () => supervisor,
  });
  return { production, stateStores };
}

test('deleting a bot unregisters its follow source and the state file stays deleted', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-im-follow-lifecycle-'));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  const seen = {};
  const { production, stateStores } = await createTestProduction(directory, seen);

  await seen.controllerOptions.createRuntime({
    botId: 'bot_del',
    config: { botId: 'bot_del', clientId: 'dingabc' },
  });
  assert.equal(followSources().some((source) => source.botId === 'bot_del'), true);

  const state = stateStores[0];
  assert.ok(state);
  const writing = state.setSession('direct:a', 'session-1');
  await seen.controllerOptions.deleteState({ botId: 'bot_del' });
  await writing;

  assert.equal(
    followSources().some((source) => source.botId === 'bot_del'),
    false,
    'deleted bot must not stay registered as a follow source',
  );
  assert.equal(await pathExists(state.path ?? join(directory, 'bots', 'bot_del', 'state.json')), false);

  await production.close();
});

test('closing production unregisters every bot follow source', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-im-follow-close-'));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  const seen = {};
  const { production } = await createTestProduction(directory, seen);

  await seen.controllerOptions.createRuntime({
    botId: 'bot_a',
    config: { botId: 'bot_a', clientId: 'dingaaa' },
  });
  await seen.controllerOptions.createRuntime({
    botId: 'bot_b',
    config: { botId: 'bot_b', clientId: 'dingbbb' },
  });
  assert.equal(followSources().length, 2);

  await production.close();

  assert.deepEqual(followSources(), []);
});

test('every production controller disposes its follow source on delete and close', async () => {
  for (const name of ['shared', 'dingtalk', 'feishu', 'qq', 'slack', 'wecom', 'weixin', 'whatsapp']) {
    const source = await readFile(
      new URL(`../src/host/channels/${name}/production.ts`, import.meta.url),
      'utf8',
    );
    assert.match(source, /followUnregisters\.set\(/, `${name} must store the unregister callback`);
    assert.match(source, /followUnregisters\.get\(/, `${name} must unregister on deleteState`);
    assert.match(
      source,
      /for \(const unregister of followUnregisters\.values\(\)\) unregister\(\)/,
      `${name} must unregister all follow sources on close`,
    );
  }
});

test('concurrent follow binds leave exactly one active target in completion order', async () => {
  const entered = deferred();
  const gate = deferred();
  const alpha = memoryStore();
  const beta = memoryStore();
  const setAlpha = alpha.setSession;
  alpha.setSession = async (key, sessionId) => {
    entered.resolve();
    await gate.promise;
    return setAlpha(key, sessionId);
  };
  const sources = [
    { channel: 'wecom', botId: 'bot-a', state: alpha },
    { channel: 'wecom', botId: 'bot-b', state: beta },
  ];

  const bindA = bindSessionFollow(sources, {
    sessionId: 'session-x',
    channel: 'wecom',
    botId: 'bot-a',
    key: BOT_FOLLOW_KEY,
  });
  await entered.promise;
  const bindB = bindSessionFollow(sources, {
    sessionId: 'session-x',
    channel: 'wecom',
    botId: 'bot-b',
    key: BOT_FOLLOW_KEY,
  });
  await new Promise((resolve) => setImmediate(resolve));
  gate.resolve();
  await Promise.all([bindA, bindB]);

  assert.deepEqual(
    listFollowedSessions(sources)
      .filter((item) => item.sessionId === 'session-x')
      .map((item) => item.botId),
    ['bot-b'],
    'the later completed bind is the only active follow target',
  );
});

test('client follow badges ignore a stale index generation after a newer watch', async () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const previousMutationObserver = globalThis.MutationObserver;
  globalThis.document = {
    body: {},
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  globalThis.window = { setTimeout, clearTimeout };
  globalThis.MutationObserver = class {
    observe() {}
    disconnect() {}
  };
  const indexGate = deferred();
  const secondWatchGate = deferred();
  const watchCalls = [];
  let indexReturned = false;
  const rpcCall = async (endpoint, payload, signal) => {
    if (endpoint === 'session.follow.index') {
      await indexGate.promise;
      indexReturned = true;
      return { ok: true, value: { items: [], generation: 5 } };
    }
    if (endpoint === 'session.follow.watch') {
      watchCalls.push(payload.generation);
      if (watchCalls.length === 1) {
        return {
          ok: true,
          value: {
            items: [{ sessionId: 's-new', channel: 'wecom', botId: 'bot-1' }],
            generation: 6,
          },
        };
      }
      if (watchCalls.length === 2) {
        await secondWatchGate.promise;
        return { ok: true, value: { items: [], generation: 5 } };
      }
      return new Promise((_, reject) => {
        signal?.addEventListener?.('abort', () => reject(new Error('aborted')), { once: true });
      });
    }
    throw new Error(`unexpected rpc ${endpoint}`);
  };
  const uninstall = installSessionFollowBadges({ rpcCall, onOpen: () => {} });
  try {
    await vi.waitFor(() => assert.deepEqual(watchCalls, [0, 6]));
    indexGate.resolve();
    await vi.waitFor(() => assert.equal(indexReturned, true));
    await new Promise((resolve) => setTimeout(resolve, 0));
    secondWatchGate.resolve();
    await vi.waitFor(() => assert.equal(watchCalls.length, 3));
    assert.equal(
      watchCalls[2],
      6,
      'the stale index snapshot must not rewind the client follow generation',
    );
  } finally {
    uninstall();
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
    globalThis.MutationObserver = previousMutationObserver;
  }
});

function newCommandSnippet(source, marker) {
  const index = source.indexOf(marker);
  assert.notEqual(index, -1, `missing ${marker}`);
  return source.slice(index, index + 700);
}

test('startNewConversation clears Follow and conversation without deleting the Session', async () => {
  assert.equal(typeof workspaceSession.startNewConversation, 'function');
  const liveSessions = new Map([
    ['session-web', { id: 'session-web' }],
    ['session-chat', { id: 'session-chat' }],
  ]);
  const deleted = [];
  const stopped = [];
  const state = memoryStore({
    [BOT_FOLLOW_KEY]: 'session-web',
    'direct:user': 'session-chat',
  });
  state.deleteSession = async (id) => deleted.push(id);
  state.stopSession = async (id) => stopped.push(id);

  const result = await workspaceSession.startNewConversation(state, 'direct:user');

  assert.equal(result.clearedFollow, true);
  assert.equal(result.message, '已断开网页会话。请发送问题开始新会话。');
  assert.equal(state.sessionFor(BOT_FOLLOW_KEY), null);
  assert.equal(state.sessionFor('direct:user'), null);
  assert.equal(liveSessions.has('session-web'), true, 'followed Session must still exist');
  assert.equal(liveSessions.has('session-chat'), true);
  assert.deepEqual(deleted, []);
  assert.deepEqual(stopped, []);
});

test('startNewConversation without Follow only unbinds the conversation', async () => {
  const state = memoryStore({ 'direct:user': 'session-chat' });
  const result = await workspaceSession.startNewConversation(state, 'direct:user');
  assert.equal(result.clearedFollow, false);
  assert.equal(result.message, '下一条消息将开启新会话。');
  assert.equal(state.sessionFor('direct:user'), null);
});

test('every /new path routes through startNewConversation', async () => {
  const paths = [
    ['../src/channels/shared/text-harness-bridge.ts', "if (!hasImages && !hasFiles && command === '/new')"],
    ['../src/channels/wecom/wecom-bridge.ts', "if (!hasImages && !hasFiles && command === '/new')"],
    ['../src/channels/weixin/weixin-bridge.ts', "if (!hasImages && !hasFiles && command === '/new')"],
    ['../src/channels/qq/qq-bridge.ts', "if (!hasImages && !hasFiles && command === '/new')"],
    ['../src/channels/dingtalk/dingtalk-bridge.ts', "if (isPlainText && !hasImages && !hasFiles && command === '/new')"],
    ['../src/channels/feishu/bridge.ts', "if (commandText === '/new')"],
    ['../src/channels/feishu/bridge.ts', "if (action === 'new')"],
  ];
  for (const [file, marker] of paths) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.match(
      newCommandSnippet(source, marker),
      /startNewConversation\(/,
      `${file} ${marker} must call startNewConversation`,
    );
  }
});

test('session hover hint is text-only and readable on the host dark surface', async () => {
  const dialog = await readFile(new URL('../src/client/session-follow.ts', import.meta.url), 'utf8');
  const badges = await readFile(new URL('../src/client/session-follow-badges.ts', import.meta.url), 'utf8');
  const hover = badges.slice(
    badges.indexOf('function paintHoverHint'),
    badges.indexOf('function ensureHoverHint'),
  );

  assert.doesNotMatch(hover, /FollowChannelLogo/);
  assert.match(hover, /dim-followHoverChannel/);
  assert.match(hover, /dim-followHoverBot/);
  assert.match(dialog, /\.dim-followHoverChannel \{[^}]*color: rgb\(255 255 255 \/ 90%\);/);
  assert.match(dialog, /\.dim-followHoverBot \{[^}]*color: rgb\(255 255 255 \/ 65%\);/);
});

test('visible Follow copy has no Chinese 跟进 literals', async () => {
  const files = [
    '../src/client/session-follow.ts',
    '../src/client/session-follow-menu.ts',
    '../src/client/session-follow-badges.ts',
    '../src/client/i18n.ts',
    '../src/client/usage-guide-card.ts',
    '../src/channels/shared/workspace-session.ts',
    '../src/channels/shared/session-follow.ts',
    '../src/channels/shared/i18n-en/shared-a.ts',
    '../src/channels/shared/i18n-en/shared-b.ts',
    '../src/host/session-follow-rpc.ts',
  ];
  for (const file of files) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /跟进/, `${file} must not teach 跟进`);
  }
  const dialog = await readFile(new URL('../src/client/session-follow.ts', import.meta.url), 'utf8');
  const badges = await readFile(new URL('../src/client/session-follow-badges.ts', import.meta.url), 'utf8');
  const usage = await readFile(new URL('../src/client/usage-guide-card.ts', import.meta.url), 'utf8');
  const hostFollow = await readFile(new URL('../src/channels/shared/session-follow.ts', import.meta.url), 'utf8');
  const i18n = await readFile(new URL('../src/client/i18n.ts', import.meta.url), 'utf8');
  const hostEn = await readFile(new URL('../src/channels/shared/i18n-en/shared-b.ts', import.meta.url), 'utf8');
  const sharedEn = await readFile(new URL('../src/channels/shared/i18n-en/shared-a.ts', import.meta.url), 'utf8');
  assert.match(dialog, /当前项目没有可以继续此会话的 IM 机器人。先打开侧栏的 IM 机器人，把机器人切换到这个项目。/);
  assert.doesNotMatch(dialog, /当前工作区|切到这个目录/);
  assert.match(badges, /localizeText\('IM 会话'\)/);
  assert.match(usage, /机器人只能在 IM 中继续所选项目里的会话。/);
  assert.match(hostFollow, /这个机器人只能在 IM 中继续自己项目里的会话。/);
  assert.match(i18n, /'在 IM 中继续此会话': 'Continue this session in IM'/);
  assert.match(i18n, /'断开 IM 会话': 'Disconnect IM session'/);
  assert.match(i18n, /'IM 会话': 'IM session'/);
  assert.match(
    i18n,
    /'只显示当前项目里的机器人，勾选一个即可。': 'Only bots in this project are shown. Choose one to continue this session in IM.'/,
  );
  assert.match(i18n, /'切换到这个项目': 'switch to this project'/);
  assert.doesNotMatch(hostEn, /自己工作区里的会话/);
  assert.match(
    sharedEn,
    /'网页会话已不存在，已断开 IM 会话。请重新选择要在 IM 中继续的会话，或发送 \/new 开始新会话。'/,
  );
});
