// @ts-nocheck
import { onTestFinished, test } from 'vitest';
import assert from 'node:assert/strict';
import * as React from 'react';
import TestRenderer from 'react-test-renderer';

import {
  WorkspaceBindPromptProvider,
  WorkspaceEditor,
  WorkspaceProjectsContext,
  useWorkspaceBindPrompt,
} from '../src/client/workspace-editor.ts';
import { DiscordSettingsTab } from '../src/client/channels/discord/index.ts';

const { act, create } = TestRenderer;

const PROJECTS = [
  { workspaceId: 'p-a', title: '办公助手', path: '/work/a', sessionIds: [] },
  { workspaceId: 'p-b', title: '研发助手', path: '/work/b', sessionIds: [] },
];

function snapshot(overrides = {}) {
  return {
    items: PROJECTS,
    archivedSessionIds: [],
    state: 'idle',
    phase: 'ready',
    error: null,
    baselinesReady: true,
    recentWorkspaceId: 'p-a',
    ...overrides,
  };
}

function projectSource(initial = snapshot()) {
  let current = initial;
  const listeners = new Set();
  return {
    list: {
      getSnapshot: () => current,
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    publish(next) {
      current = next;
      for (const listener of listeners) listener();
    },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((onResolve) => { resolve = onResolve; });
  return { promise, resolve };
}

function discordSnapshot(workspaceId = 'p-a') {
  const project = PROJECTS.find((item) => item.workspaceId === workspaceId);
  return {
    revision: 1,
    bots: [{
      botId: 'discord_test', connected: true, state: 'connected',
      workspaceId, workspaceTitle: project?.title ?? '旧项目',
      workspace: project?.path ?? '/work/old', workspacePending: false,
      bot: { name: 'Harness Bot', username: 'HarnessBot', idMasked: '123•••' },
      health: { summary: 'Discord Gateway 长连接运行正常', lastCheckedAt: Date.now() },
      error: null,
    }],
  };
}

function twoBotDiscordSnapshot(firstWorkspaceId = 'p-a') {
  const first = discordSnapshot(firstWorkspaceId).bots[0];
  return {
    revision: 1,
    bots: [
      { ...first, botId: 'discord_first', bot: { ...first.bot, name: 'First Bot' } },
      {
        ...first, botId: 'discord_second', workspaceId: 'p-b',
        workspaceTitle: '研发助手', workspace: '/work/b',
        bot: { ...first.bot, name: 'Second Bot' },
      },
    ],
  };
}

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

function withProjects(element, projects = projectSource()) {
  return React.createElement(
    WorkspaceProjectsContext.Provider,
    { value: projects },
    element,
  );
}

function PromptHarness({ bots, projects = projectSource(), onSave = async () => {} }) {
  const { workspacePromptBotId, consumeWorkspacePrompt } = useWorkspaceBindPrompt(bots);
  return withProjects(React.createElement(
    WorkspaceBindPromptProvider,
    { promptBotId: workspacePromptBotId, consume: consumeWorkspacePrompt },
    React.createElement(React.Fragment, null, ...bots.map((bot) => React.createElement(
      WorkspaceEditor,
      {
        key: bot.botId,
        botId: bot.botId,
        workspaceId: bot.workspaceId,
        workspaceTitle: bot.workspaceTitle,
        workspacePending: bot.workspacePending,
        onSave,
      },
    ))),
  ), projects);
}

async function openEditor(props = {}, projects = projectSource(), options = {}) {
  let renderer;
  await act(async () => {
    renderer = create(withProjects(React.createElement(WorkspaceEditor, {
      botId: 'bot-1',
      workspaceId: 'p-a',
      workspaceTitle: '办公助手',
      workspacePending: false,
      async onSave() {},
      ...props,
    }), projects), options);
    await flushMicrotasks();
  });
  await act(async () => {
    buttonNamed(renderer.root, '选择项目').props.onClick();
    await flushMicrotasks();
  });
  return renderer;
}

test('picker renders only live Host project rows and saves workspaceId after resolution', async () => {
  const save = deferred();
  const saved = [];
  const renderer = await openEditor({
    workspaceId: null,
    workspaceTitle: null,
    onSave(value) { saved.push(value); return save.promise; },
  });

  assert.deepEqual(
    renderer.root.findAll((node) => typeof node.props?.['data-workspace-id'] === 'string')
      .map((row) => row.props['data-workspace-id']),
    ['p-a', 'p-b'],
  );
  assert.match(textOf(renderer.root.findByProps({ 'data-workspace-id': 'p-a' })), /办公助手/);
  assert.doesNotMatch(textOf(renderer.root.findByProps({ 'data-workspace-id': 'p-a' })), /\/work\/a/);

  await act(async () => {
    renderer.root.findByProps({ 'data-workspace-id': 'p-b' }).props.onClick();
    await flushMicrotasks();
  });
  assert.deepEqual(saved, ['p-b']);
  assert.equal(renderer.root.findAllByProps({ role: 'dialog' }).length, 1);
  assert.match(textOf(renderer.root), /切换中/);

  save.resolve();
  await act(async () => { await flushMicrotasks(); });
  assert.equal(renderer.root.findAllByProps({ role: 'dialog' }).length, 0);
});

test('duplicate project titles use stable list numbers and parent hints only for duplicates', async () => {
  const projects = projectSource(snapshot({ items: [
    { workspaceId: 'same-a', title: '同名项目', path: '/teams/a/project', sessionIds: [] },
    { workspaceId: 'unique', title: '唯一项目', path: '/teams/unique', sessionIds: [] },
    { workspaceId: 'same-b', title: '同名项目', path: '/teams/b/project', sessionIds: [] },
  ] }));
  const renderer = await openEditor({}, projects);

  assert.match(textOf(renderer.root.findByProps({ 'data-workspace-id': 'same-a' })), /^1同名项目\/teams\/a$/);
  assert.match(textOf(renderer.root.findByProps({ 'data-workspace-id': 'unique' })), /^2唯一项目$/);
  assert.match(textOf(renderer.root.findByProps({ 'data-workspace-id': 'same-b' })), /^3同名项目\/teams\/b$/);
});

test('only a ready empty baseline renders the create-in-Web empty state', async () => {
  for (const incomplete of [
    snapshot({ items: [], state: 'loading' }),
    snapshot({ items: [], phase: 'pending' }),
    snapshot({ items: [], baselinesReady: false }),
  ]) {
    const renderer = await openEditor({}, projectSource(incomplete));
    assert.match(textOf(renderer.root), /正在加载项目/);
    assert.doesNotMatch(textOf(renderer.root), /还没有项目/);
    await act(async () => { renderer.unmount(); });
  }

  const renderer = await openEditor({}, projectSource(snapshot({ items: [] })));
  assert.match(textOf(renderer.root), /还没有项目/);
  assert.match(textOf(renderer.root), /请先在左侧项目区创建项目，然后返回这里选择。/);
  assert.equal(
    renderer.root.findAll((node) => typeof node.props?.['data-workspace-id'] === 'string').length,
    0,
  );
});

test('project source errors and save failures stay visible', async () => {
  const projects = projectSource(snapshot({ error: new Error('项目列表失败') }));
  const renderer = await openEditor({}, projects);
  assert.match(textOf(renderer.root.findByProps({ role: 'alert' })), /项目列表失败/);

  await act(async () => {
    projects.publish(snapshot());
    await flushMicrotasks();
  });
  await act(async () => {
    renderer.root.findByProps({ 'data-workspace-id': 'p-b' }).props.onClick();
    await flushMicrotasks();
  });
});

test('rejected project save keeps the picker open with project copy', async () => {
  const renderer = await openEditor({
    async onSave() { throw new Error('这个项目已不存在，请刷新后重新选择。'); },
  });
  await act(async () => {
    renderer.root.findByProps({ 'data-workspace-id': 'p-b' }).props.onClick();
    await flushMicrotasks();
  });
  assert.equal(renderer.root.findAllByProps({ role: 'dialog' }).length, 1);
  assert.equal(textOf(renderer.root.findByProps({ role: 'alert' })), '这个项目已不存在，请刷新后重新选择。');
});

test('stale current project IDs render as pending and no row is selected', async () => {
  const renderer = await openEditor({
    workspaceId: 'deleted-project',
    workspaceTitle: '已删除项目',
    workspacePending: true,
  });
  assert.match(textOf(renderer.root), /未选择项目/);
  assert.equal(renderer.root.findAll((node) => node.props?.['aria-current'] === 'true').length, 0);
});

test('cancelling a pending bind never saves and authoritative pending reopens after remount', async () => {
  let saves = 0;
  const bot = {
    botId: 'bot-1', workspaceId: null, workspaceTitle: null, workspacePending: true,
  };
  const projects = projectSource();
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(PromptHarness, {
      bots: [bot], projects, async onSave() { saves += 1; },
    }));
    await flushMicrotasks();
  });
  assert.equal(renderer.root.findAllByProps({ role: 'dialog' }).length, 1);
  await act(async () => {
    buttonNamed(renderer.root, '取消').props.onClick();
    await flushMicrotasks();
  });
  assert.equal(saves, 0);
  assert.equal(renderer.root.findAllByProps({ role: 'dialog' }).length, 0);

  await act(async () => { renderer.unmount(); });
  await act(async () => {
    renderer = create(React.createElement(PromptHarness, { bots: [bot], projects }));
    await flushMicrotasks();
  });
  assert.equal(renderer.root.findAllByProps({ role: 'dialog' }).length, 1);
});

test('a later authoritative snapshot reopens a cancelled pending prompt in the same mount', async () => {
  let saves = 0;
  const bot = { botId: 'bot-1', workspaceId: null, workspaceTitle: null, workspacePending: true };
  const projects = projectSource();
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(PromptHarness, {
      bots: [bot], projects, async onSave() { saves += 1; },
    }));
    await flushMicrotasks();
  });
  await act(async () => {
    buttonNamed(renderer.root, '取消').props.onClick();
    await flushMicrotasks();
  });
  assert.equal(renderer.root.findAllByProps({ role: 'dialog' }).length, 0);

  await act(async () => {
    renderer.update(React.createElement(PromptHarness, {
      bots: [{ ...bot }], projects, async onSave() { saves += 1; },
    }));
    await flushMicrotasks();
  });
  assert.equal(saves, 0);
  assert.equal(renderer.root.findAllByProps({ role: 'dialog' }).length, 1);
});

test('only the first pending bot on the selected page opens', async () => {
  const projects = projectSource();
  const first = { botId: 'bot-1', workspaceId: null, workspacePending: true };
  const second = { botId: 'bot-2', workspaceId: null, workspacePending: true };
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(PromptHarness, { bots: [first, second], projects }));
    await flushMicrotasks();
  });
  assert.equal(renderer.root.findAllByProps({ role: 'dialog' }).length, 1);
  assert.equal(renderer.root.findAllByProps({ 'data-workspace-editor-bot-id': 'bot-1' })[0]
    .findAllByProps({ role: 'dialog' }).length, 1);
  assert.equal(renderer.root.findAllByProps({ 'data-workspace-editor-bot-id': 'bot-2' })[0]
    .findAllByProps({ role: 'dialog' }).length, 0);
});

test('a status response started before saving cannot restore the old project', async () => {
  const previousWindow = globalThis.window;
  let intervalCallback;
  globalThis.window = {
    setInterval(callback) { intervalCallback = callback; return 1; }, clearInterval() {},
  };
  onTestFinished(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });
  const staleStatus = deferred();
  const calls = [];
  let statusCalls = 0;
  const rpcCall = async (endpoint, payload) => {
    calls.push({ endpoint, payload });
    if (endpoint === 'connection.status') {
      statusCalls += 1;
      if (statusCalls === 1) return { ok: true, value: discordSnapshot('p-a') };
      if (statusCalls === 2) return staleStatus.promise;
      return { ok: true, value: discordSnapshot('p-b') };
    }
    if (endpoint === 'bot.workspace.set') return { ok: true, value: discordSnapshot('p-b') };
    throw new Error(`Unexpected endpoint: ${endpoint}`);
  };

  let renderer;
  await act(async () => {
    renderer = create(withProjects(React.createElement(DiscordSettingsTab, { rpcCall }), projectSource()));
    await flushMicrotasks();
  });
  await act(async () => { intervalCallback(); await flushMicrotasks(); });
  await act(async () => {
    buttonNamed(renderer.root, '选择项目').props.onClick();
    await flushMicrotasks();
  });
  await act(async () => {
    renderer.root.findByProps({ 'data-workspace-id': 'p-b' }).props.onClick();
    await flushMicrotasks();
  });
  assert.deepEqual(calls.find((call) => call.endpoint === 'bot.workspace.set')?.payload, {
    botId: 'discord_test', workspaceId: 'p-b',
  });
  assert.equal(textOf(renderer.root.findByProps({ className: 'dim-workspacePath' })), '研发助手');

  await act(async () => {
    staleStatus.resolve({ ok: true, value: discordSnapshot('p-a') });
    await flushMicrotasks();
  });
  assert.equal(textOf(renderer.root.findByProps({ className: 'dim-workspacePath' })), '研发助手');
  await act(async () => { renderer.unmount(); });
});

test('an older reconnect snapshot from another bot cannot restore a saved project', async () => {
  const previousWindow = globalThis.window;
  globalThis.window = { setInterval() { return 1; }, clearInterval() {} };
  onTestFinished(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });
  const staleReconnect = deferred();
  let statusCalls = 0;
  const rpcCall = async (endpoint, payload) => {
    if (endpoint === 'connection.status') {
      statusCalls += 1;
      return { ok: true, value: twoBotDiscordSnapshot(statusCalls === 1 ? 'p-a' : 'p-b') };
    }
    if (endpoint === 'bot.reconnect') return staleReconnect.promise;
    if (endpoint === 'bot.workspace.set') {
      assert.deepEqual(payload, { botId: 'discord_first', workspaceId: 'p-b' });
      return { ok: true, value: twoBotDiscordSnapshot('p-b') };
    }
    throw new Error(`Unexpected endpoint: ${endpoint}`);
  };

  let renderer;
  await act(async () => {
    renderer = create(withProjects(React.createElement(DiscordSettingsTab, { rpcCall }), projectSource()));
    await flushMicrotasks();
  });
  const firstCard = renderer.root.findByProps({ 'data-bot-id': 'discord_first' });
  const secondCard = renderer.root.findByProps({ 'data-bot-id': 'discord_second' });
  await act(async () => { buttonNamed(secondCard, '检查连接').props.onClick(); await flushMicrotasks(); });
  await act(async () => { buttonNamed(firstCard, '选择项目').props.onClick(); await flushMicrotasks(); });
  await act(async () => {
    renderer.root.findByProps({ 'data-workspace-id': 'p-b' }).props.onClick();
    await flushMicrotasks();
  });

  staleReconnect.resolve({ ok: true, value: twoBotDiscordSnapshot('p-a') });
  await act(async () => { await flushMicrotasks(); });
  assert.equal(textOf(renderer.root.findByProps({ 'data-bot-id': 'discord_first' })
    .findByProps({ className: 'dim-workspacePath' })), '研发助手');
  await act(async () => { renderer.unmount(); });
});

test('an older reconnect snapshot cannot resurrect a bot deleted by a newer mutation', async () => {
  const previousWindow = globalThis.window;
  globalThis.window = { setInterval() { return 1; }, clearInterval() {} };
  onTestFinished(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });
  const staleReconnect = deferred();
  const initialSnapshot = twoBotDiscordSnapshot('p-a');
  const deletedSnapshot = { ...initialSnapshot, bots: initialSnapshot.bots.slice(1) };
  let statusCalls = 0;
  const rpcCall = async (endpoint) => {
    if (endpoint === 'connection.status') {
      statusCalls += 1;
      return { ok: true, value: statusCalls === 1 ? initialSnapshot : deletedSnapshot };
    }
    if (endpoint === 'bot.reconnect') return staleReconnect.promise;
    if (endpoint === 'bot.delete') return { ok: true, value: deletedSnapshot };
    throw new Error(`Unexpected endpoint: ${endpoint}`);
  };

  let renderer;
  await act(async () => {
    renderer = create(withProjects(React.createElement(DiscordSettingsTab, { rpcCall }), projectSource()));
    await flushMicrotasks();
  });
  const firstCard = renderer.root.findByProps({ 'data-bot-id': 'discord_first' });
  const secondCard = renderer.root.findByProps({ 'data-bot-id': 'discord_second' });
  await act(async () => { buttonNamed(secondCard, '检查连接').props.onClick(); await flushMicrotasks(); });
  await act(async () => { buttonNamed(firstCard, '移除接入').props.onClick(); });
  await act(async () => {
    await buttonNamed(firstCard, '确认移除接入').props.onClick();
    await flushMicrotasks();
  });
  assert.equal(renderer.root.findAllByProps({ 'data-bot-id': 'discord_first' }).length, 0);

  staleReconnect.resolve({ ok: true, value: initialSnapshot });
  await act(async () => { await flushMicrotasks(); });
  assert.equal(renderer.root.findAllByProps({ 'data-bot-id': 'discord_first' }).length, 0);
  await act(async () => { renderer.unmount(); });
});

test('dialog is labelled, focuses on open, Escape cancels, and rows meet the 44px target contract', async () => {
  let dialogFocus = 0;
  let editFocus = 0;
  const renderer = await openEditor({}, projectSource(), {
    createNodeMock(element) {
      if (element.props?.className === 'dim-directoryPicker') return { focus() { dialogFocus += 1; } };
      if (element.props?.className === 'dim-workspaceEdit') return { focus() { editFocus += 1; } };
      return {};
    },
  });
  const dialog = renderer.root.findByProps({ role: 'dialog' });
  assert.equal(dialog.props['aria-modal'], 'true');
  assert.ok(dialog.props['aria-labelledby']);
  assert.equal(dialogFocus, 1);
  assert.equal(renderer.root.findByProps({ 'data-workspace-id': 'p-a' }).props.style.minHeight, 44);

  await act(async () => {
    dialog.props.onKeyDown({ key: 'Escape', preventDefault() {} });
    await flushMicrotasks();
  });
  assert.equal(renderer.root.findAllByProps({ role: 'dialog' }).length, 0);
  assert.equal(editFocus, 1);
});
