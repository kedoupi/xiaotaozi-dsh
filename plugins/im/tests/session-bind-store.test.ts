// @ts-nocheck
import { onTestFinished, test, vi } from 'vitest';
import assert from 'node:assert/strict';
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  BotWorkspaceStore,
  createBotWorkspaceScope,
} from '../src/channels/shared/bot-workspace-store.ts';
import { ConversationStateStore } from '../src/channels/shared/conversation-state-store.ts';
import { runModelCommand } from '../src/channels/shared/model-command.ts';
import { askInWorkspaceSession } from '../src/channels/shared/workspace-session.ts';

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-im-session-bind-')));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  const defaultWorkspace = join(root, 'default');
  const alternateWorkspace = join(root, 'alternate');
  const thirdWorkspace = join(root, 'third');
  await Promise.all([
    mkdir(defaultWorkspace),
    mkdir(alternateWorkspace),
    mkdir(thirdWorkspace),
  ]);
  return {
    root,
    defaultWorkspace,
    alternateWorkspace,
    thirdWorkspace,
    path: join(root, 'workspaces.json'),
  };
}

// Schema v2: the store catalog maps stable Host project ids to paths; the
// scoped proxy passes the bound id straight to session.create.
function projectRows({ defaultWorkspace, alternateWorkspace, thirdWorkspace }) {
  return [
    defaultWorkspace && { workspaceId: 'project-default', title: 'Default', path: defaultWorkspace },
    alternateWorkspace && { workspaceId: 'project-alternate', title: 'Alternate', path: alternateWorkspace },
    thirdWorkspace && { workspaceId: 'project-third', title: 'Third', path: thirdWorkspace },
  ].filter(Boolean);
}

function attachProjects(workspaces, paths) {
  workspaces.setProjectCatalog(async () => projectRows(paths));
}

async function bindProject(workspaces, botId, paths, workspaceId = 'project-default') {
  attachProjects(workspaces, paths);
  await workspaces.setProject(botId, workspaceId);
}

function deferred() {
  let resolve;
  const promise = new Promise((settle) => { resolve = settle; });
  return { promise, resolve };
}

async function within(promise, timeoutMs, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function memoryState(initial = {}) {
  let sessions = { ...initial };
  let clears = 0;
  let sets = 0;
  return {
    sessionFor(key) { return sessions[key] ?? null; },
    async setSession(key, sessionId) {
      sets += 1;
      sessions[key] = sessionId;
    },
    async clearSessions() {
      clears += 1;
      sessions = {};
    },
    snapshot() { return { ...sessions }; },
    get clears() { return clears; },
    get sets() { return sets; },
  };
}

test('binding a session from another workspace is rejected and does not move the bot', async (t) => {
  const { path, defaultWorkspace, alternateWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, { defaultWorkspace }).load();
  await workspaces.ensure('bot_bind');
  await bindProject(workspaces, 'bot_bind', { defaultWorkspace, alternateWorkspace });
  const previousGeneration = workspaces.generationFor('bot_bind');
  const state = memoryState({ 'direct:one': 'old-one', 'group:two': 'old-two' });
  const calls = [];
  const harness = {
    async adoptWorkspaceSession(sessionId) {
      calls.push(sessionId);
      return {
        sessionId,
        workspace: alternateWorkspace,
        title: 'Existing conversation',
        archived: true,
      };
    },
  };
  const scope = createBotWorkspaceScope(harness, { botId: 'bot_bind', workspaces, state });

  await assert.rejects(
    scope.harness.bindWorkspaceSession('direct:one', 'session-target'),
    { code: 'session-workspace-mismatch' },
  );

  assert.deepEqual(calls, ['session-target']);
  assert.equal(workspaces.workspaceFor('bot_bind'), defaultWorkspace);
  assert.equal(workspaces.generationFor('bot_bind'), previousGeneration);
  assert.deepEqual(state.snapshot(), { 'direct:one': 'old-one', 'group:two': 'old-two' });
  assert.equal(state.clears, 0);
  assert.equal(state.sets, 0);
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), {
    version: 2,
    projects: {
      bot_bind: { workspaceId: 'project-default', title: 'Default', path: defaultWorkspace },
    },
  });
});

test('binding inside the current workspace only replaces the selected conversation', async (t) => {
  const { path, defaultWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, { defaultWorkspace }).load();
  await workspaces.ensure('bot_same');
  await bindProject(workspaces, 'bot_same', { defaultWorkspace });
  const generation = workspaces.generationFor('bot_same');
  const state = memoryState({ 'direct:one': 'old-one', 'group:two': 'kept-two' });
  const scope = createBotWorkspaceScope({
    async adoptWorkspaceSession(sessionId) {
      return { sessionId, workspace: defaultWorkspace };
    },
  }, { botId: 'bot_same', workspaces, state });

  await scope.harness.bindWorkspaceSession('direct:one', 'session-current-workspace');

  assert.equal(workspaces.workspaceFor('bot_same'), defaultWorkspace);
  assert.equal(workspaces.generationFor('bot_same'), generation);
  assert.equal(state.clears, 0);
  assert.deepEqual(state.snapshot(), {
    'direct:one': 'session-current-workspace',
    'group:two': 'kept-two',
  });
});

test('binding through an equivalent real path does not clear a symlink workspace', async (t) => {
  const { root, path, defaultWorkspace } = await fixture(t);
  const linkedWorkspace = join(root, 'default-link');
  await symlink(defaultWorkspace, linkedWorkspace);
  const workspaces = await new BotWorkspaceStore(path, { defaultWorkspace: linkedWorkspace }).load();
  await workspaces.ensure('bot_symlink');
  workspaces.setProjectCatalog(async () => [
    { workspaceId: 'project-link', title: 'Link', path: linkedWorkspace },
  ]);
  await workspaces.setProject('bot_symlink', 'project-link');
  const generation = workspaces.generationFor('bot_symlink');
  const state = memoryState({ selected: 'session-old', other: 'session-kept' });
  const scope = createBotWorkspaceScope({
    async adoptWorkspaceSession(sessionId) {
      return { sessionId, workspace: defaultWorkspace };
    },
  }, { botId: 'bot_symlink', workspaces, state });

  await scope.harness.bindWorkspaceSession('selected', 'session-target');

  assert.equal(workspaces.workspaceFor('bot_symlink'), linkedWorkspace);
  assert.equal(workspaces.generationFor('bot_symlink'), generation);
  assert.equal(state.clears, 0);
  assert.deepEqual(state.snapshot(), {
    selected: 'session-target',
    other: 'session-kept',
  });
});

test('the next message continues the bound Session without creating a new one', async (t) => {
  const { path, defaultWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, { defaultWorkspace }).load();
  await workspaces.ensure('bot_continue');
  await bindProject(workspaces, 'bot_continue', { defaultWorkspace });
  const state = memoryState({ conversation: 'session-old' });
  const asked = [];
  let createCalls = 0;
  const scope = createBotWorkspaceScope({
    async adoptWorkspaceSession(sessionId) {
      return { sessionId, workspace: defaultWorkspace };
    },
    async sessionExists(sessionId) { return sessionId === 'session-target'; },
    async createSession() {
      createCalls += 1;
      return 'session-created-unexpectedly';
    },
    async ask(sessionId, text) {
      asked.push({ sessionId, text });
      return 'continued answer';
    },
  }, { botId: 'bot_continue', workspaces, state });

  await scope.harness.bindWorkspaceSession('conversation', 'session-target');
  const reply = await askInWorkspaceSession({
    harness: scope.harness,
    state: scope.state,
    key: 'conversation',
    text: 'continue here',
  });

  assert.deepEqual(reply, { sessionId: 'session-target', answer: 'continued answer' });
  assert.deepEqual(asked, [{ sessionId: 'session-target', text: 'continue here' }]);
  assert.equal(createCalls, 0);
});

test('a first prompt and model switch share one binding without holding the lock during ask', async () => {
  const state = memoryState();
  const askStarted = deferred();
  const releaseAsk = deferred();
  const calls = [];
  let creations = 0;
  const catalog = {
    groups: [{
      id: 'provider',
      name: 'Provider',
      models: [{ id: 'model', name: 'Model' }],
    }],
    failures: [],
  };
  const harness = {
    async createSession() {
      creations += 1;
      calls.push(['createSession']);
      return `session-${creations}`;
    },
    workspaceSession(sessionId) {
      return {
        async sessionExists() { return true; },
        async ask(text) {
          calls.push(['ask', sessionId, text]);
          askStarted.resolve();
          await releaseAsk.promise;
          return 'answer';
        },
        async isRunning() { return false; },
        async hasActiveTurn() { return false; },
        async models() {
          return {
            ...catalog,
            current: { provider: 'provider', model: 'model' },
            routable: true,
          };
        },
        async selectModel(selection) {
          calls.push(['selectModel', sessionId, selection]);
          return { selected: selection };
        },
      };
    },
    async listModels() { return catalog; },
  };

  const prompting = askInWorkspaceSession({
    harness,
    state,
    key: 'conversation',
    text: 'first prompt',
  });
  const switching = runModelCommand(
    '/model provider/model',
    harness,
    state,
    'conversation',
  );
  await askStarted.promise;

  let switchResult;
  try {
    switchResult = await within(
      switching,
      500,
      'model switching waited for the running ask instead of only the binding transaction',
    );
  } finally {
    releaseAsk.resolve();
  }
  const promptResult = await prompting;

  assert.match(switchResult.message, /模型已切换为/);
  assert.deepEqual(promptResult, { sessionId: 'session-1', answer: 'answer' });
  assert.equal(creations, 1);
  assert.deepEqual(state.snapshot(), { conversation: 'session-1' });
  assert.deepEqual(calls, [
    ['createSession'],
    ['ask', 'session-1', 'first prompt'],
    ['selectModel', 'session-1', { provider: 'provider', model: 'model' }],
  ]);
});

test('workspace sessions forward structured multimodal prompt content unchanged', async (t) => {
  const { path, defaultWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, { defaultWorkspace }).load();
  await workspaces.ensure('bot_multimodal');
  await bindProject(workspaces, 'bot_multimodal', { defaultWorkspace });
  const state = memoryState({ conversation: 'session-image' });
  const prompts = [];
  const content = [
    { type: 'text', text: '这是什么？' },
    { type: 'image', mediaType: 'image/png', data: 'AAAA' },
  ];
  const scope = createBotWorkspaceScope({
    async sessionExists() { return true; },
    async ask(sessionId, prompt) {
      prompts.push({ sessionId, prompt });
      return 'image answer';
    },
  }, { botId: 'bot_multimodal', workspaces, state });

  assert.deepEqual(await askInWorkspaceSession({
    harness: scope.harness,
    state: scope.state,
    key: 'conversation',
    content,
  }), { sessionId: 'session-image', answer: 'image answer' });
  assert.deepEqual(prompts, [{ sessionId: 'session-image', prompt: content }]);
});

test('adoption errors and invalid adoption responses leave local state unchanged', async (t) => {
  const { path, defaultWorkspace, alternateWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, { defaultWorkspace }).load();
  await workspaces.ensure('bot_reject');
  await bindProject(workspaces, 'bot_reject', { defaultWorkspace, alternateWorkspace });
  const state = memoryState({ conversation: 'session-old' });
  const rejection = Object.assign(new Error('subagent sessions cannot be adopted'), {
    code: 'agent-busy',
  });
  const rejectedScope = createBotWorkspaceScope({
    async adoptWorkspaceSession() { throw rejection; },
  }, { botId: 'bot_reject', workspaces, state });

  await assert.rejects(
    rejectedScope.harness.bindWorkspaceSession('conversation', 'session-child'),
    { code: 'agent-busy' },
  );
  assert.equal(workspaces.workspaceFor('bot_reject'), defaultWorkspace);
  assert.deepEqual(state.snapshot(), { conversation: 'session-old' });

  const invalidScope = createBotWorkspaceScope({
    async adoptWorkspaceSession() {
      return { sessionId: 'different-session', workspace: alternateWorkspace };
    },
  }, { botId: 'bot_reject', workspaces, state });
  await assert.rejects(
    invalidScope.harness.bindWorkspaceSession('conversation', 'session-requested'),
    /invalid adopted workspace session/,
  );
  assert.equal(workspaces.workspaceFor('bot_reject'), defaultWorkspace);
  assert.deepEqual(state.snapshot(), { conversation: 'session-old' });
});

test('a workspace switch during adoption wins instead of being overwritten by the stale bind', async (t) => {
  const { path, defaultWorkspace, alternateWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, { defaultWorkspace }).load();
  await workspaces.ensure('bot_adoption_race');
  await bindProject(workspaces, 'bot_adoption_race', { defaultWorkspace, alternateWorkspace });
  const state = memoryState({ conversation: 'session-old', other: 'session-other' });
  const adoptionStarted = deferred();
  const releaseAdoption = deferred();
  const scope = createBotWorkspaceScope({
    async adoptWorkspaceSession(sessionId) {
      adoptionStarted.resolve();
      await releaseAdoption.promise;
      return { sessionId, workspace: defaultWorkspace };
    },
  }, { botId: 'bot_adoption_race', workspaces, state });

  const binding = scope.harness.bindWorkspaceSession('conversation', 'session-target');
  await adoptionStarted.promise;
  await scope.harness.switchWorkspace(alternateWorkspace);
  releaseAdoption.resolve();

  await assert.rejects(binding, { code: 'workspace-session-stale' });
  assert.equal(workspaces.workspaceFor('bot_adoption_race'), alternateWorkspace);
  assert.deepEqual(state.snapshot(), {});
  assert.equal(state.sets, 0);
});

test('the store queue rejects a generation change after adoption validation', async (t) => {
  const { path, defaultWorkspace, alternateWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, { defaultWorkspace }).load();
  await workspaces.ensure('bot_queue_fence');
  await bindProject(workspaces, 'bot_queue_fence', { defaultWorkspace, alternateWorkspace });
  const state = memoryState({ conversation: 'session-old', other: 'session-other' });
  const bindInQueue = workspaces.bindWorkspaceSession.bind(workspaces);
  workspaces.bindWorkspaceSession = async (...args) => {
    await workspaces.setWorkspace('bot_queue_fence', alternateWorkspace, {
      clearSessions: () => state.clearSessions(),
    });
    return bindInQueue(...args);
  };
  const scope = createBotWorkspaceScope({
    async adoptWorkspaceSession(sessionId) {
      return { sessionId, workspace: defaultWorkspace };
    },
  }, { botId: 'bot_queue_fence', workspaces, state });

  await assert.rejects(
    scope.harness.bindWorkspaceSession('conversation', 'session-target'),
    { code: 'workspace-session-stale' },
  );

  assert.equal(workspaces.workspaceFor('bot_queue_fence'), alternateWorkspace);
  assert.deepEqual(state.snapshot(), {});
  assert.equal(state.sets, 0);
});

test('a workspace switch cannot interleave between bind persistence and its session write', async (t) => {
  const {
    path, defaultWorkspace, thirdWorkspace,
  } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, { defaultWorkspace }).load();
  await workspaces.ensure('bot_serial');
  await bindProject(workspaces, 'bot_serial', { defaultWorkspace, thirdWorkspace });
  let sessions = { first: 'session-old', second: 'session-other' };
  const setStarted = deferred();
  const releaseSet = deferred();
  const state = {
    sessionFor(key) { return sessions[key] ?? null; },
    async clearSessions() { sessions = {}; },
    async setSession(key, sessionId) {
      setStarted.resolve();
      await releaseSet.promise;
      sessions[key] = sessionId;
    },
    snapshot() { return { ...sessions }; },
  };
  const scope = createBotWorkspaceScope({
    async adoptWorkspaceSession(sessionId) {
      return { sessionId, workspace: defaultWorkspace };
    },
  }, { botId: 'bot_serial', workspaces, state });

  const binding = scope.harness.bindWorkspaceSession('first', 'session-target');
  await setStarted.promise;
  const switching = scope.harness.switchWorkspace(thirdWorkspace);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(workspaces.workspaceFor('bot_serial'), defaultWorkspace);
  assert.deepEqual(state.snapshot(), { first: 'session-old', second: 'session-other' });

  releaseSet.resolve();
  await binding;
  await switching;

  assert.equal(workspaces.workspaceFor('bot_serial'), thirdWorkspace);
  assert.deepEqual(state.snapshot(), {});
});

test('a later workspace generation cannot be reported as the completed binding', async (t) => {
  const {
    path, defaultWorkspace, thirdWorkspace,
  } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, { defaultWorkspace }).load();
  await workspaces.ensure('bot_late_switch');
  await bindProject(workspaces, 'bot_late_switch', { defaultWorkspace, thirdWorkspace });
  const state = memoryState({ conversation: 'session-old' });
  const bindInQueue = workspaces.bindWorkspaceSession.bind(workspaces);
  workspaces.bindWorkspaceSession = async (...args) => {
    const bound = await bindInQueue(...args);
    await workspaces.setWorkspace('bot_late_switch', thirdWorkspace, {
      clearSessions: () => state.clearSessions(),
    });
    return bound;
  };
  const scope = createBotWorkspaceScope({
    async adoptWorkspaceSession(sessionId) {
      return { sessionId, workspace: defaultWorkspace };
    },
  }, { botId: 'bot_late_switch', workspaces, state });

  await assert.rejects(
    scope.harness.bindWorkspaceSession('conversation', 'session-target'),
    { code: 'workspace-session-stale' },
  );

  assert.equal(workspaces.workspaceFor('bot_late_switch'), thirdWorkspace);
  assert.deepEqual(state.snapshot(), {});
});

test('a bind started by an old bot incarnation cannot mutate a same-id replacement', async (t) => {
  const { path, defaultWorkspace, alternateWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, { defaultWorkspace }).load();
  await workspaces.ensure('bot_rebound');
  await bindProject(workspaces, 'bot_rebound', { defaultWorkspace, alternateWorkspace });
  const oldState = memoryState({ conversation: 'session-old' });
  const adoptionStarted = deferred();
  const releaseAdoption = deferred();
  const oldScope = createBotWorkspaceScope({
    async adoptWorkspaceSession(sessionId) {
      adoptionStarted.resolve();
      await releaseAdoption.promise;
      return { sessionId, workspace: alternateWorkspace };
    },
  }, { botId: 'bot_rebound', workspaces, state: oldState });

  const staleBinding = oldScope.harness.bindWorkspaceSession('conversation', 'session-target');
  await adoptionStarted.promise;
  const removal = await workspaces.beginRemoval('bot_rebound', {
    clearSessions: () => oldState.clearSessions(),
  });
  await workspaces.finishRemoval(removal);
  await workspaces.ensure('bot_rebound');
  await workspaces.setProject('bot_rebound', 'project-default');
  const replacementIncarnation = workspaces.incarnationFor('bot_rebound');

  releaseAdoption.resolve();
  await assert.rejects(staleBinding, { code: 'workspace-bot-not-found' });

  assert.equal(workspaces.incarnationFor('bot_rebound'), replacementIncarnation);
  assert.equal(workspaces.workspaceFor('bot_rebound'), defaultWorkspace);
  assert.deepEqual(oldState.snapshot(), {});
  assert.equal(oldState.sets, 0);
});

test('binding fences a session creation that started in the previous workspace generation', async (t) => {
  const { path, defaultWorkspace, alternateWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, { defaultWorkspace }).load();
  await workspaces.ensure('bot_creation');
  await bindProject(workspaces, 'bot_creation', { defaultWorkspace, alternateWorkspace });
  const creationStarted = deferred();
  const releaseCreation = deferred();
  const state = memoryState();
  const scope = createBotWorkspaceScope({
    async createSession() {
      creationStarted.resolve();
      await releaseCreation.promise;
      return 'session-from-old-workspace';
    },
    async adoptWorkspaceSession(sessionId) {
      return { sessionId, workspace: workspaces.workspaceFor('bot_creation') };
    },
  }, { botId: 'bot_creation', workspaces, state });

  const oldCreation = scope.harness.createSession();
  await creationStarted.promise;
  await scope.harness.switchWorkspace(alternateWorkspace);
  await scope.harness.bindWorkspaceSession('bound', 'session-target');
  releaseCreation.resolve();
  const staleSessionId = await oldCreation;

  assert.equal(await scope.state.setSession('other', staleSessionId), false);
  assert.deepEqual(state.snapshot(), { bound: 'session-target' });
});

test('two conversations sharing one Session keep independent generation handles', async (t) => {
  const { path, defaultWorkspace, alternateWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, { defaultWorkspace }).load();
  await workspaces.ensure('bot_shared_session');
  await bindProject(workspaces, 'bot_shared_session', { defaultWorkspace, alternateWorkspace });
  const state = memoryState({ first: 'session-shared', second: 'session-shared' });
  const bothExistenceChecksStarted = deferred();
  const releaseExistenceChecks = deferred();
  let existenceChecks = 0;
  let creations = 0;
  const asked = [];
  const scope = createBotWorkspaceScope({
    async sessionExists(sessionId) {
      assert.equal(sessionId, 'session-shared');
      existenceChecks += 1;
      if (existenceChecks === 2) bothExistenceChecksStarted.resolve();
      await releaseExistenceChecks.promise;
      return true;
    },
    async createSession({ workspaceId }) {
      assert.equal(workspaceId, 'project-alternate');
      creations += 1;
      return `session-current-${creations}`;
    },
    async ask(sessionId, text) {
      asked.push({ sessionId, text });
      return `answer:${text}`;
    },
  }, { botId: 'bot_shared_session', workspaces, state });

  const first = askInWorkspaceSession({
    harness: scope.harness,
    state: scope.state,
    key: 'first',
    text: 'first prompt',
  });
  const second = askInWorkspaceSession({
    harness: scope.harness,
    state: scope.state,
    key: 'second',
    text: 'second prompt',
  });
  await bothExistenceChecksStarted.promise;
  await scope.harness.switchWorkspace(alternateWorkspace);
  releaseExistenceChecks.resolve();

  const replies = await Promise.all([first, second]);
  assert.equal(replies.length, 2);
  assert.equal(asked.some(({ sessionId }) => sessionId === 'session-shared'), false);
  assert.deepEqual(new Set(asked.map(({ sessionId }) => sessionId)), new Set([
    'session-current-1',
    'session-current-2',
  ]));
  assert.equal(workspaces.workspaceFor('bot_shared_session'), alternateWorkspace);
});

test('an old handle stays stale after switching away and rebinding the same Session id', async (t) => {
  const { path, defaultWorkspace, alternateWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, { defaultWorkspace }).load();
  await workspaces.ensure('bot_rebind_same_id');
  await bindProject(workspaces, 'bot_rebind_same_id', { defaultWorkspace, alternateWorkspace });
  const state = memoryState({ first: 'session-shared' });
  const existenceStarted = deferred();
  const releaseExistence = deferred();
  const asked = [];
  const scope = createBotWorkspaceScope({
    async adoptWorkspaceSession(sessionId) {
      return { sessionId, workspace: workspaces.workspaceFor('bot_rebind_same_id') };
    },
    async sessionExists(sessionId) {
      assert.equal(sessionId, 'session-shared');
      existenceStarted.resolve();
      await releaseExistence.promise;
      return true;
    },
    async createSession({ workspaceId }) {
      assert.equal(workspaceId, 'project-alternate');
      return 'session-after-rebind';
    },
    async ask(sessionId, text) {
      asked.push({ sessionId, text });
      return 'answer';
    },
  }, { botId: 'bot_rebind_same_id', workspaces, state });

  const oldPrompt = askInWorkspaceSession({
    harness: scope.harness,
    state: scope.state,
    key: 'first',
    text: 'old prompt',
  });
  await existenceStarted.promise;
  await scope.harness.switchWorkspace(alternateWorkspace);
  await scope.harness.bindWorkspaceSession('second', 'session-shared');
  releaseExistence.resolve();

  assert.deepEqual(await oldPrompt, { sessionId: 'session-after-rebind', answer: 'answer' });
  assert.deepEqual(asked, [{ sessionId: 'session-after-rebind', text: 'old prompt' }]);
  assert.equal(workspaces.workspaceFor('bot_rebind_same_id'), alternateWorkspace);
  assert.deepEqual(state.snapshot(), {
    second: 'session-shared',
    first: 'session-after-rebind',
  });
});

test('a Session created before a switch keeps its original generation provenance', async (t) => {
  const { path, defaultWorkspace, alternateWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, { defaultWorkspace }).load();
  await workspaces.ensure('bot_create_provenance');
  await bindProject(workspaces, 'bot_create_provenance', { defaultWorkspace, alternateWorkspace });
  const state = memoryState();
  const creationStarted = deferred();
  const releaseCreation = deferred();
  const createdIn = [];
  const asked = [];
  const scope = createBotWorkspaceScope({
    async createSession({ workspaceId }) {
      createdIn.push(workspaceId);
      if (createdIn.length === 1) {
        creationStarted.resolve();
        await releaseCreation.promise;
        return 'session-created-before-switch';
      }
      return 'session-created-after-switch';
    },
    async ask(sessionId, text) {
      asked.push({ sessionId, text });
      return 'answer';
    },
  }, { botId: 'bot_create_provenance', workspaces, state });

  const prompting = askInWorkspaceSession({
    harness: scope.harness,
    state: scope.state,
    key: 'conversation',
    text: 'prompt',
  });
  await creationStarted.promise;
  await scope.harness.switchWorkspace(alternateWorkspace);
  releaseCreation.resolve();

  assert.deepEqual(await prompting, {
    sessionId: 'session-created-after-switch',
    answer: 'answer',
  });
  assert.deepEqual(createdIn, ['project-default', 'project-alternate']);
  assert.deepEqual(asked, [{ sessionId: 'session-created-after-switch', text: 'prompt' }]);
  assert.deepEqual(state.snapshot(), { conversation: 'session-created-after-switch' });
});

test('workspace persistence failure is not reached when the session is outside the bot workspace', async (t) => {
  const { root, defaultWorkspace, alternateWorkspace } = await fixture(t);
  const storeDirectory = join(root, 'store');
  const storePath = join(storeDirectory, 'workspaces.json');
  await mkdir(storeDirectory);
  const workspaces = await new BotWorkspaceStore(storePath, { defaultWorkspace }).load();
  await workspaces.ensure('bot_persist');
  await bindProject(workspaces, 'bot_persist', { defaultWorkspace, alternateWorkspace });
  const generation = workspaces.generationFor('bot_persist');
  const state = memoryState({ first: 'session-old', second: 'session-other' });
  const scope = createBotWorkspaceScope({
    async adoptWorkspaceSession(sessionId) {
      return { sessionId, workspace: alternateWorkspace };
    },
  }, { botId: 'bot_persist', workspaces, state });

  const savedDirectory = `${storeDirectory}-saved`;
  await rename(storeDirectory, savedDirectory);
  await writeFile(storeDirectory, 'blocks persistence');
  await assert.rejects(
    scope.harness.bindWorkspaceSession('first', 'session-target'),
    { code: 'session-workspace-mismatch' },
  );

  assert.equal(workspaces.workspaceFor('bot_persist'), defaultWorkspace);
  assert.equal(workspaces.generationFor('bot_persist'), generation);
  assert.deepEqual(state.snapshot(), { first: 'session-old', second: 'session-other' });
  assert.equal(state.sets, 0);

  await rm(storeDirectory, { force: true });
  await rename(savedDirectory, storeDirectory);
});

test('session persistence failure leaves the bot workspace unchanged', async (t) => {
  const { path, defaultWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, { defaultWorkspace }).load();
  await workspaces.ensure('bot_state_failure');
  await bindProject(workspaces, 'bot_state_failure', { defaultWorkspace });
  let sessions = { first: 'session-old', second: 'session-other' };
  const state = {
    sessionFor(key) { return sessions[key] ?? null; },
    async clearSessions() { sessions = {}; },
    async setSession() { throw new Error('state persistence failed'); },
    snapshot() { return { ...sessions }; },
  };
  const scope = createBotWorkspaceScope({
    async adoptWorkspaceSession(sessionId) {
      return { sessionId, workspace: defaultWorkspace };
    },
  }, { botId: 'bot_state_failure', workspaces, state });

  await assert.rejects(
    scope.harness.bindWorkspaceSession('first', 'session-target'),
    /state persistence failed/,
  );

  assert.equal(workspaces.workspaceFor('bot_state_failure'), defaultWorkspace);
  assert.deepEqual(state.snapshot(), { first: 'session-old', second: 'session-other' });
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), {
    version: 2,
    projects: {
      bot_state_failure: {
        workspaceId: 'project-default',
        title: 'Default',
        path: defaultWorkspace,
      },
    },
  });
});

test('remove waits for queued persists so a delayed write cannot recreate the state file', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-im-state-remove-')));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'state.json');
  const store = await new ConversationStateStore(path).load();

  const writing = store.setSession('direct:a', 'session-1');
  await store.remove();
  await writing;

  let exists = true;
  try {
    await access(path);
  } catch {
    exists = false;
  }
  assert.equal(exists, false, 'a persist queued before remove must not recreate the state file');
});
