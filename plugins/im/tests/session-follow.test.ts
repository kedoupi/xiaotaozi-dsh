// @ts-nocheck
import { afterEach, test } from 'vitest';
import assert from 'node:assert/strict';

import {
  BOT_FOLLOW_KEY,
  bindSessionFollow,
  bindSessionFollowByBot,
  clearSessionFollow,
  describeFollowKey,
  followTargetLabel,
  followersForSession,
  listFollowBots,
  listFollowTargets,
  followBindingsGeneration,
  followSourceName,
  registerFollowSource,
  resetFollowSources,
} from '../src/channels/shared/session-follow.ts';
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
import { listFollowedSessions } from '../src/channels/shared/session-follow.ts';

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

test('session follow CSS keeps slot and occupied-slot fallbacks compact on coarse pointers', () => {
  assert.match(SESSION_FOLLOW_CSS, /\.dim-followBadgeSlot, \.dim-followBadgeCompact/);
  assert.match(SESSION_FOLLOW_CSS, /\.dim-followBadge:not\(\.dim-followBadgeSlot\):not\(\.dim-followBadgeCompact\)/);
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

test('session row badges stay beside the title when the status slot already has dots', () => {
  const row = {
    closest(selector) {
      if (selector.includes('[data-dsh-sidebar-tools]')) return null;
      return selector.includes('treeitem') ? this : null;
    },
    children: [],
  };
  const dots = { className: 'statusDots' };
  const slot = { className: 'YDXeBa_slot', parentElement: row, children: [dots] };
  const title = { className: 'YDXeBa_title', parentElement: row };
  row.children = [slot, title];
  const button = {
    closest() { return row; },
    parentElement: row,
  };
  assert.deepEqual(followBadgePlacement(button), {
    parent: row,
    before: title,
    className: 'dim-followBadge dim-followBadgeCompact',
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

test('inbound-only sessions still get a follow badge', () => {
  const wecom = memoryStore({ 'direct:user': 'session-inbound' });
  const items = listFollowedSessions([{ channel: 'wecom', botId: 'bot-1', state: wecom }]);
  assert.deepEqual(items.map((item) => item.sessionId), ['session-inbound']);
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

test('follow picker groups bots by IM and hides other workspaces', async () => {
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

  registerFollowSource({
    channel: 'weixin',
    botId: 'wx',
    state: weixin,
    workspace: '/workspace/other',
    locateSession: async () => '/workspace/here',
  });
  registerFollowSource({
    channel: 'feishu',
    botId: 'bot_alpha',
    name: '办公助手',
    state: alpha,
    workspace: '/workspace/here',
    locateSession: async () => '/workspace/here',
  });
  registerFollowSource({
    channel: 'feishu',
    botId: 'bot_beta',
    name: '客服助手',
    state: beta,
    workspace: '/workspace/here',
    locateSession: async () => '/workspace/here',
  });
  const listed = await createSessionFollowRpcHandler()('session.follow.list', { sessionId: 'session-here' });
  assert.equal(listed.ok, true);
  assert.deepEqual(listed.value.channels.map((item) => item.botId), ['bot_alpha', 'bot_beta']);
});

test('follow bots outside the session workspace are listed but not selectable', async () => {
  const wecom = memoryStore();
  const feishu = memoryStore();
  const sources = [
    { channel: 'wecom', botId: 'bot-1', state: wecom, workspace: '/workspace/a' },
    { channel: 'feishu', botId: 'bot-2', name: '办公助手', state: feishu, workspace: '/workspace/b' },
  ];
  const bots = listFollowBots(sources, 'session-in-a', '/workspace/a');
  assert.equal(bots.find((item) => item.channel === 'wecom')?.ready, true);
  assert.equal(bots.find((item) => item.channel === 'feishu')?.ready, false);
  assert.match(bots.find((item) => item.channel === 'feishu')?.reason, /工作区是/);
  assert.deepEqual(bots.filter((item) => item.ready).map((item) => item.channel), ['wecom']);

  await assert.rejects(
    bindSessionFollowByBot(sources, {
      sessionId: 'session-in-a',
      channel: 'feishu',
      botId: 'bot-2',
      sessionWorkspace: '/workspace/a',
    }),
    { code: 'follow-workspace-mismatch' },
  );
  assert.equal(feishu.snapshot().sessions[BOT_FOLLOW_KEY], undefined);

  await bindSessionFollowByBot(sources, {
    sessionId: 'session-in-a',
    channel: 'wecom',
    botId: 'bot-1',
    sessionWorkspace: '/workspace/a',
  });
  assert.equal(wecom.snapshot().sessions[BOT_FOLLOW_KEY], 'session-in-a');
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
