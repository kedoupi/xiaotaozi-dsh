// @ts-nocheck
import { expect, onTestFinished, test, vi } from "vitest";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  BotWorkspaceStore,
  createBotScopedHarness,
  createBotWorkspaceScope,
  createWorkspaceAwareController,
  observeBotWorkspaceRemovals,
  validateWorkspacePath,
} from "../src/channels/shared/bot-workspace-store.ts";
import {
  connectionTestTarget,
  rememberConnectionTestTarget,
} from "../src/channels/shared/connection-test.ts";
import {
  runWorkspaceCommand,
  splitWorkspaceCommandMessage,
} from "../src/channels/shared/workspace-command.ts";
import { TextHarnessBridge } from "../src/channels/shared/text-harness-bridge.ts";
import {
  askInWorkspaceSession,
  WORKSPACE_SESSION_STALE,
} from "../src/channels/shared/workspace-session.ts";
import { HarnessClient as WeixinHarnessClient } from "../src/channels/weixin/harness-client.ts";
import { HarnessClient as FeishuHarnessClient } from "../src/channels/feishu/harness-client.ts";
import { HarnessClient as DingtalkHarnessClient } from "../src/channels/dingtalk/harness-client.ts";
import { ConversationStateStore } from "../src/channels/shared/conversation-state-store.ts";
import { WeixinStateStore } from "../src/channels/weixin/state-store.ts";
import { StateStore as FeishuStateStore } from "../src/channels/feishu/state-store.ts";
import { DingtalkStateStore } from "../src/channels/dingtalk/state-store.ts";
import { WecomStateStore } from "../src/channels/wecom/state-store.ts";
import { QqStateStore } from "../src/channels/qq/state-store.ts";
import {
  TOKEN_BOT_ENDPOINTS,
  createTokenBotRpcHandler,
} from "../src/host/channels/shared/rpc.ts";
import { publicWorkspaceError } from "../src/host/channels/shared/workspace-rpc.ts";

async function fixture(t) {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "dsh-im-workspace-")),
  );
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  const defaultWorkspace = join(root, "default");
  const alternateWorkspace = join(root, "alternate workspace");
  await Promise.all([mkdir(defaultWorkspace), mkdir(alternateWorkspace)]);
  return {
    root,
    defaultWorkspace,
    alternateWorkspace,
    path: join(root, "workspaces.json"),
  };
}

// Schema v2: project identity is the Host workspaceId; path is cached metadata.
function projectRow(workspaceId, path, title = workspaceId) {
  return { workspaceId, title, path };
}

function defaultProjects(defaultWorkspace, alternateWorkspace, thirdWorkspace) {
  return [
    ["project-default", defaultWorkspace, "Default"],
    ["project-alternate", alternateWorkspace, "Alternate"],
    ["project-third", thirdWorkspace, "Third"],
  ]
    .filter(([, path]) => path)
    .map(([id, path, title]) => projectRow(id, path, title));
}

test("BotWorkspaceStore persists per-bot project bindings and keeps bots isolated", async (t) => {
  const { path, defaultWorkspace, alternateWorkspace } = await fixture(t);
  const store = await new BotWorkspaceStore(path, { defaultWorkspace }).load();
  store.setProjectCatalog(async () => [
    projectRow("project-default", defaultWorkspace, "Default"),
    projectRow("project-alternate", alternateWorkspace, "Alternate"),
  ]);

  assert.equal(await store.ensure("bot_one"), null);
  assert.equal(await store.ensure("bot_two"), null);
  await store.setProject("bot_one", "project-default");
  await store.setProject("bot_two", "project-default");
  await store.setProject("bot_one", "project-alternate");

  assert.equal(store.projectFor("bot_one").workspaceId, "project-alternate");
  assert.equal(store.projectFor("bot_two").workspaceId, "project-default");
  assert.equal(store.workspaceFor("bot_one"), alternateWorkspace);
  assert.equal(store.workspaceFor("bot_two"), defaultWorkspace);
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), {
    version: 2,
    projects: {
      bot_one: {
        workspaceId: "project-alternate",
        title: "Alternate",
        path: alternateWorkspace,
      },
      bot_two: {
        workspaceId: "project-default",
        title: "Default",
        path: defaultWorkspace,
      },
    },
  });

  const reloaded = await new BotWorkspaceStore(path, {
    defaultWorkspace: tmpdir(),
  }).load();
  assert.equal(reloaded.workspaceFor("bot_one"), alternateWorkspace);
  assert.equal(reloaded.workspaceFor("bot_two"), defaultWorkspace);
});

test("BotWorkspaceStore persists per-bot instructions independently of workspace", async (t) => {
  const { path, defaultWorkspace } = await fixture(t);
  const store = await new BotWorkspaceStore(path, { defaultWorkspace }).load();
  await store.ensure("bot_one");
  await store.ensure("bot_two");
  assert.equal(
    await store.setInstruction("bot_one", "  只做客服  "),
    "只做客服",
  );
  assert.equal(store.instructionFor("bot_one"), "只做客服");
  assert.equal(store.instructionFor("bot_two"), null);

  const saved = JSON.parse(await readFile(path, "utf8"));
  assert.deepEqual(saved.instructions, { bot_one: "只做客服" });

  const reloaded = await new BotWorkspaceStore(path, {
    defaultWorkspace,
  }).load();
  assert.equal(reloaded.instructionFor("bot_one"), "只做客服");
  await reloaded.setInstruction("bot_one", "   ");
  assert.equal(reloaded.instructionFor("bot_one"), null);
  assert.equal(
    "instructions" in JSON.parse(await readFile(path, "utf8")),
    false,
  );
});

test("BotWorkspaceStore persists per-bot display names independently of workspace", async (t) => {
  const { path, defaultWorkspace } = await fixture(t);
  const store = await new BotWorkspaceStore(path, { defaultWorkspace }).load();
  await store.ensure("bot_one");
  await store.ensure("bot_two");
  assert.equal(await store.setDisplayName("bot_one", "  客服甲  "), "客服甲");
  assert.equal(store.displayNameFor("bot_one"), "客服甲");
  assert.equal(store.displayNameFor("bot_two"), null);

  const saved = JSON.parse(await readFile(path, "utf8"));
  assert.deepEqual(saved.displayNames, { bot_one: "客服甲" });
  assert.equal(
    store.decorateStatus({
      bots: [
        {
          botId: "bot_one",
          bot: { name: "微信机器人", accountIdMasked: "acc••1" },
        },
      ],
    }).bots[0].bot.name,
    "客服甲",
  );

  const reloaded = await new BotWorkspaceStore(path, {
    defaultWorkspace,
  }).load();
  assert.equal(reloaded.displayNameFor("bot_one"), "客服甲");
  await reloaded.setDisplayName("bot_one", "   ");
  assert.equal(reloaded.displayNameFor("bot_one"), null);
  assert.equal(
    "displayNames" in JSON.parse(await readFile(path, "utf8")),
    false,
  );
});

test("a pending bot waits for the first project pick before creating a session", async (t) => {
  const { path, defaultWorkspace, alternateWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, {
    defaultWorkspace,
  }).load();
  await workspaces.ensure("bot_bind_pick");
  assert.equal(workspaces.workspacePendingFor("bot_bind_pick"), true);
  assert.equal(
    workspaces.decorateStatus({
      bots: [{ botId: "bot_bind_pick" }],
    }).bots[0].workspacePending,
    true,
  );

  const createdIn = [];
  const harness = {
    async createSession({ workspaceId }) {
      createdIn.push(workspaceId);
      return "session-1";
    },
    async sessionExists() {
      return true;
    },
    async ask() {
      return "answer";
    },
  };
  let persistedSession = null;
  const state = {
    sessionFor() {
      return persistedSession;
    },
    async setSession(_key, sessionId) {
      persistedSession = sessionId;
    },
    async clearSessions() {
      persistedSession = null;
    },
  };
  const scope = createBotWorkspaceScope(harness, {
    botId: "bot_bind_pick",
    workspaces,
    state,
  });

  let created = false;
  const prompting = askInWorkspaceSession({
    harness: scope.harness,
    state: scope.state,
    key: "conversation",
    text: "hello",
  }).then((result) => {
    created = true;
    return result;
  });

  await Promise.resolve();
  await Promise.resolve();
  assert.equal(created, false);
  assert.deepEqual(createdIn, []);

  workspaces.setProjectCatalog(async () => [
    projectRow("project-default", defaultWorkspace, "Default"),
    projectRow("project-alternate", alternateWorkspace, "Alternate"),
  ]);
  await workspaces.setProject("bot_bind_pick", "project-alternate", {
    clearSessions: () => state.clearSessions(),
  });
  const result = await prompting;
  assert.equal(result.sessionId, "session-1");
  assert.deepEqual(createdIn, ["project-alternate"]);
  assert.equal(workspaces.workspacePendingFor("bot_bind_pick"), false);
  assert.equal(workspaces.workspaceFor("bot_bind_pick"), alternateWorkspace);
});

test("a pending workspace wait aborts with its session request", async (t) => {
  const { path, defaultWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, {
    defaultWorkspace,
  }).load();
  await workspaces.ensure("bot_abort_wait");
  const scope = createBotWorkspaceScope(
    {
      async createSession() {
        throw new Error("must not run");
      },
    },
    {
      botId: "bot_abort_wait",
      workspaces,
      state: { async clearSessions() {} },
    },
  );
  const controller = new AbortController();
  const creating = scope.harness.createSession({ signal: controller.signal });
  controller.abort(new Error("runtime stopped"));
  await assert.rejects(creating, /runtime stopped/);
});

test("beginning removal rejects a pending workspace wait", async (t) => {
  const { path, defaultWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, {
    defaultWorkspace,
  }).load();
  await workspaces.ensure("bot_remove_wait");
  const waiting = workspaces.whenWorkspaceReady("bot_remove_wait");
  const rejection = assert.rejects(waiting, { code: WORKSPACE_SESSION_STALE });
  const removal = await workspaces.beginRemoval("bot_remove_wait");
  await rejection;
  await workspaces.finishRemoval(removal);
});

test("a pending bot fences session listing, binding, and reuse until the project pick", async (t) => {
  const { path, defaultWorkspace, alternateWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, {
    defaultWorkspace,
  }).load();
  await workspaces.ensure("bot_fence");
  const events = [];
  const harness = {
    async listWorkspaceSessions(workspace) {
      events.push(`list:${workspace}`);
      return {
        workspace,
        sessions: [
          { sessionId: "session-id", title: "Picked", summaryAvailable: true },
        ],
      };
    },
    async adoptWorkspaceSession(sessionId) {
      events.push(`bind:${sessionId}`);
      return { sessionId, workspace: alternateWorkspace, title: "Picked" };
    },
    async createSession() {
      events.push("create");
      return "session-unexpected";
    },
    async sessionExists(sessionId) {
      events.push(`exists:${sessionId}`);
      return true;
    },
    async ask(sessionId) {
      events.push(`ask:${sessionId}`);
      return "answer";
    },
  };
  const sessions = { "direct:reuse": "session-old" };
  const state = {
    sessionFor(key) {
      return sessions[key] ?? null;
    },
    async setSession(key, sessionId) {
      sessions[key] = sessionId;
    },
    async clearSession(key) {
      delete sessions[key];
    },
    async clearSessions() {
      for (const key of Object.keys(sessions)) delete sessions[key];
    },
  };
  const scope = createBotWorkspaceScope(harness, {
    botId: "bot_fence",
    workspaces,
    state,
  });

  const listing = runWorkspaceCommand(
    "/sessionlist",
    scope.harness,
    "direct:chat",
  );
  const binding = runWorkspaceCommand(
    "/session session-id",
    scope.harness,
    "direct:chat",
  );
  const prompting = askInWorkspaceSession({
    harness: scope.harness,
    state: scope.state,
    key: "direct:reuse",
    text: "hello",
  });
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.deepEqual(events, []);

  workspaces.setProjectCatalog(async () => [
    projectRow("project-default", defaultWorkspace, "Default"),
    projectRow("project-alternate", alternateWorkspace, "Alternate"),
  ]);
  await workspaces.setProject("bot_fence", "project-alternate", {
    // The pre-bound session already belongs to the picked project here, so
    // this fixture's clear keeps it; the fence, not session clearing, is
    // under test.
    clearSessions: () => state.clearSession("direct:chat"),
  });
  const [, bound, reply] = await Promise.all([listing, binding, prompting]);
  assert.deepEqual(
    events.filter((event) => event.startsWith("list:")),
    [`list:${alternateWorkspace}`],
    "listing reads the workspace chosen after the wait resolved",
  );
  assert.ok(events.includes("bind:session-id"));
  assert.ok(events.includes("exists:session-old"));
  assert.ok(events.includes("ask:session-old"));
  assert.equal(events.includes("create"), false);
  assert.match(bound.message, /当前聊天已绑定会话/);
  assert.equal(reply.sessionId, "session-old");
  assert.equal(reply.answer, "answer");
});

test("selecting the default project unblocks the first inbound session", async (t) => {
  const { path, defaultWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, {
    defaultWorkspace,
  }).load();
  await workspaces.ensure("bot_bind_keep");
  const createdIn = [];
  const harness = {
    async createSession({ workspaceId }) {
      createdIn.push(workspaceId);
      return "session-keep";
    },
    async sessionExists() {
      return true;
    },
    async ask() {
      return "answer";
    },
  };
  let persistedSession = null;
  const state = {
    sessionFor() {
      return persistedSession;
    },
    async setSession(_key, sessionId) {
      persistedSession = sessionId;
    },
    async clearSessions() {
      persistedSession = null;
    },
  };
  const scope = createBotWorkspaceScope(harness, {
    botId: "bot_bind_keep",
    workspaces,
    state,
  });
  const prompting = askInWorkspaceSession({
    harness: scope.harness,
    state: scope.state,
    key: "conversation",
    text: "hello",
  });
  workspaces.setProjectCatalog(async () => [
    projectRow("project-default", defaultWorkspace, "Default"),
  ]);
  await workspaces.setProject("bot_bind_keep", "project-default");
  assert.equal((await prompting).sessionId, "session-keep");
  assert.deepEqual(createdIn, ["project-default"]);
  assert.equal(workspaces.workspacePendingFor("bot_bind_keep"), false);
});

test("connection test targets survive a new workspace scope for the same bot", async (t) => {
  const { path, defaultWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, {
    defaultWorkspace,
  }).load();
  await workspaces.ensure("bot_reconnect");
  const state = {};
  const harness = {};
  const beforeReconnect = createBotWorkspaceScope(harness, {
    botId: "bot_reconnect",
    workspaces,
    state,
  });
  const afterReconnect = createBotWorkspaceScope(harness, {
    botId: "bot_reconnect",
    workspaces,
    state,
  });

  assert.equal(
    rememberConnectionTestTarget(beforeReconnect.state, { channelId: "D123" }),
    true,
  );
  assert.deepEqual(connectionTestTarget(afterReconnect.state), {
    channelId: "D123",
  });
});

test("project writes roll back updates while committed removals stay retired in memory", async (t) => {
  const { root, defaultWorkspace, alternateWorkspace } = await fixture(t);
  const storeDirectory = join(root, "workspace-store");
  const storePath = join(storeDirectory, "workspaces.json");
  await mkdir(storeDirectory);
  const store = await new BotWorkspaceStore(storePath, {
    defaultWorkspace,
  }).load();
  store.setProjectCatalog(async () =>
    defaultProjects(defaultWorkspace, alternateWorkspace),
  );
  await store.ensure("bot_io");
  await store.setProject("bot_io", "project-alternate");

  await rename(storeDirectory, `${storeDirectory}-saved`);
  await writeFile(storeDirectory, "blocks workspace persistence");
  let clears = 0;
  await assert.rejects(
    store.setProject("bot_io", "project-default", {
      clearSessions: async () => {
        clears += 1;
      },
    }),
  );
  assert.equal(clears, 1);
  assert.equal(store.workspaceFor("bot_io"), alternateWorkspace);
  await assert.rejects(store.remove("bot_io"));
  assert.equal(store.has("bot_io"), false);
  assert.equal(store.workspaceFor("bot_io"), null);

  await rm(storeDirectory, { force: true });
  await rename(`${storeDirectory}-saved`, storeDirectory);
  const staleDisk = await new BotWorkspaceStore(storePath, {
    defaultWorkspace,
  }).load();
  assert.equal(staleDisk.workspaceFor("bot_io"), alternateWorkspace);
  await staleDisk.reconcile([]);
  assert.equal(staleDisk.has("bot_io"), false);

  const blockedParent = join(root, "blocked-parent");
  await writeFile(blockedParent, "not a directory");
  const broken = new BotWorkspaceStore(join(blockedParent, "workspaces.json"), {
    defaultWorkspace,
  });
  await assert.rejects(broken.ensure("bot_new"));
  assert.equal(broken.workspaceFor("bot_new"), null);
});

test("workspace validation rejects relative, missing, and file paths", async (t) => {
  const { root } = await fixture(t);
  const file = join(root, "file.txt");
  await writeFile(file, "not a directory");

  await assert.rejects(validateWorkspacePath("relative/path"), {
    code: "workspace-not-absolute",
  });
  await assert.rejects(validateWorkspacePath(join(root, "missing")), {
    code: "workspace-not-found",
  });
  await assert.rejects(validateWorkspacePath(file), {
    code: "workspace-not-directory",
  });
});

test("bot-scoped Harness creates sessions in each bot project and switching clears sessions", async (t) => {
  const { path, defaultWorkspace, alternateWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, {
    defaultWorkspace,
  }).load();
  workspaces.setProjectCatalog(async () =>
    defaultProjects(defaultWorkspace, alternateWorkspace),
  );
  await Promise.all([
    workspaces.ensure("bot_one"),
    workspaces.ensure("bot_two"),
  ]);
  await Promise.all([
    workspaces.setProject("bot_one", "project-default"),
    workspaces.setProject("bot_two", "project-default"),
  ]);
  const calls = [];
  const harness = {
    async createSession(options) {
      calls.push(options);
      return `session-${calls.length}`;
    },
    async ensureRunning() {
      return true;
    },
  };
  let cleared = 0;
  const state = {
    async clearSessions() {
      cleared += 1;
    },
  };
  const one = createBotScopedHarness(harness, {
    botId: "bot_one",
    workspaces,
    state,
  });
  const two = createBotScopedHarness(harness, {
    botId: "bot_two",
    workspaces,
    state,
  });

  await one.createSession();
  await one.switchWorkspace(alternateWorkspace);
  await Promise.all([one.createSession(), two.createSession()]);

  assert.equal(cleared, 1);
  assert.equal(calls[0].workspaceId, "project-default");
  assert.deepEqual(
    calls
      .slice(1)
      .map((call) => call.workspaceId)
      .sort(),
    ["project-alternate", "project-default"],
  );
  assert.ok(calls.every((call) => !("workspace" in call) && !("cwd" in call)));
});

test("an old session cannot be written back while RPC switches the bot workspace", async (t) => {
  const { path, defaultWorkspace, alternateWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, {
    defaultWorkspace,
  }).load();
  workspaces.setProjectCatalog(async () =>
    defaultProjects(defaultWorkspace, alternateWorkspace),
  );
  await workspaces.ensure("bot_race");
  await workspaces.setProject("bot_race", "project-default");
  let finishCreation;
  let existenceChecks = 0;
  const harness = {
    createSession() {
      return new Promise((resolveCreation) => {
        finishCreation = resolveCreation;
      });
    },
    async sessionExists() {
      existenceChecks += 1;
      return true;
    },
  };
  let persistedSession = null;
  const state = {
    async clearSessions() {
      persistedSession = null;
    },
    async setSession(_key, sessionId) {
      persistedSession = sessionId;
    },
  };
  const scope = createBotWorkspaceScope(harness, {
    botId: "bot_race",
    workspaces,
    state,
  });
  const controller = createWorkspaceAwareController(
    {
      status() {
        return { bots: [{ botId: "bot_race" }] };
      },
    },
    {
      workspaces,
      stateFor: async () => state,
    },
  );

  const oldSession = scope.harness.createSession();
  await controller.updateWorkspace("bot_race", "project-alternate");
  finishCreation("session-from-old-workspace");
  const sessionId = await oldSession;

  assert.equal(await scope.state.setSession("conversation", sessionId), false);
  assert.equal(persistedSession, null);

  const oldSessionForLookup = scope.harness.createSession();
  await controller.updateWorkspace("bot_race", "project-default");
  finishCreation("second-session-from-old-workspace");
  assert.equal(
    await scope.harness.sessionExists(await oldSessionForLookup),
    false,
  );
  assert.equal(
    existenceChecks,
    0,
    "stale sessions are rejected before asking Harness",
  );
});

test("an old workspace session handle cannot list, select, stop, or steer after a switch", async (t) => {
  const { path, defaultWorkspace, alternateWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, {
    defaultWorkspace,
  }).load();
  workspaces.setProjectCatalog(async () =>
    defaultProjects(defaultWorkspace, alternateWorkspace),
  );
  await workspaces.ensure("bot_session_controls");
  await workspaces.setProject("bot_session_controls", "project-default");
  const targetCalls = [];
  const harness = {
    async getSessionModels(...args) {
      targetCalls.push(["models", ...args]);
    },
    async selectSessionModel(...args) {
      targetCalls.push(["select", ...args]);
    },
    async stopActiveTurn(...args) {
      targetCalls.push(["stop", ...args]);
    },
    async steerActiveTurn(...args) {
      targetCalls.push(["steer", ...args]);
    },
  };
  const state = { async clearSessions() {} };
  const scope = createBotWorkspaceScope(harness, {
    botId: "bot_session_controls",
    workspaces,
    state,
  });
  const oldSession = scope.harness.workspaceSession("session-old");
  const controller = createWorkspaceAwareController(
    {
      status() {
        return { bots: [{ botId: "bot_session_controls" }] };
      },
    },
    { workspaces, stateFor: async () => state },
  );

  await controller.updateWorkspace("bot_session_controls", "project-alternate");
  const control = { owner: {}, key: "direct:one" };
  for (const operation of [
    () => oldSession.models(),
    () => oldSession.selectModel({ provider: "provider", model: "model" }),
    () => oldSession.stopActiveTurn(control),
    () => oldSession.steerActiveTurn("continue", control),
  ]) {
    await assert.rejects(
      operation(),
      (error) => error?.code === WORKSPACE_SESSION_STALE,
    );
  }
  assert.deepEqual(targetCalls, []);
});

test("a control mutation that already started keeps its result across a workspace switch", async (t) => {
  const { path, defaultWorkspace, alternateWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, {
    defaultWorkspace,
  }).load();
  workspaces.setProjectCatalog(async () =>
    defaultProjects(defaultWorkspace, alternateWorkspace),
  );
  await workspaces.ensure("bot_started_controls");
  await workspaces.setProject("bot_started_controls", "project-default");
  const started = [];
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const harness = {
    async stopActiveTurn() {
      started.push("stop");
      await gate;
      return true;
    },
    async steerActiveTurn() {
      started.push("steer");
      await gate;
      return true;
    },
  };
  const state = { async clearSessions() {} };
  const scope = createBotWorkspaceScope(harness, {
    botId: "bot_started_controls",
    workspaces,
    state,
  });
  const session = scope.harness.workspaceSession("session-old");
  const control = { owner: {}, key: "direct:one" };
  const stop = session.stopActiveTurn(control);
  const steer = session.steerActiveTurn("continue", control);
  assert.deepEqual(started, ["stop", "steer"]);

  const controller = createWorkspaceAwareController(
    {
      status() {
        return { bots: [{ botId: "bot_started_controls" }] };
      },
    },
    { workspaces, stateFor: async () => state },
  );
  await controller.updateWorkspace("bot_started_controls", "project-alternate");
  release();

  assert.deepEqual(await Promise.all([stop, steer]), [true, true]);
});

test("a prompt retries in the new workspace when switching after session creation", async (t) => {
  const { path, defaultWorkspace, alternateWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, {
    defaultWorkspace,
  }).load();
  workspaces.setProjectCatalog(async () =>
    defaultProjects(defaultWorkspace, alternateWorkspace),
  );
  await workspaces.ensure("bot_prompt");
  await workspaces.setProject("bot_prompt", "project-default");
  const createdIn = [];
  const asks = [];
  let sessionNumber = 0;
  let markFirstSet;
  let releaseFirstSet;
  const firstSet = new Promise((resolveSet) => {
    markFirstSet = resolveSet;
  });
  const firstSetGate = new Promise((resolveSet) => {
    releaseFirstSet = resolveSet;
  });
  const harness = {
    async createSession({ workspaceId }) {
      createdIn.push(workspaceId);
      sessionNumber += 1;
      return `session-${sessionNumber}`;
    },
    async sessionExists() {
      return true;
    },
    async ask(sessionId) {
      asks.push(sessionId);
      return `answer-${sessionId}`;
    },
  };
  let persistedSession = null;
  const state = {
    sessionFor() {
      return persistedSession;
    },
    async setSession(_key, sessionId) {
      persistedSession = sessionId;
      if (sessionId === "session-1") {
        markFirstSet();
        await firstSetGate;
      }
    },
    async clearSessions() {
      persistedSession = null;
    },
  };
  const scope = createBotWorkspaceScope(harness, {
    botId: "bot_prompt",
    workspaces,
    state,
  });
  const controller = createWorkspaceAwareController(
    {
      status() {
        return { bots: [{ botId: "bot_prompt" }] };
      },
    },
    { workspaces, stateFor: async () => state },
  );

  const prompting = askInWorkspaceSession({
    harness: scope.harness,
    state: scope.state,
    key: "conversation",
    text: "hello",
  });
  await firstSet;
  await controller.updateWorkspace("bot_prompt", "project-alternate");
  releaseFirstSet();

  const result = await prompting;
  assert.equal(result.answer, "answer-session-2");
  assert.deepEqual(createdIn, ["project-default", "project-alternate"]);
  assert.deepEqual(asks, ["session-2"]);
  assert.equal(persistedSession, "session-2");
});

test("a workspace switch lets an already-started reply finish and moves the next message", async (t) => {
  const { path, defaultWorkspace, alternateWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, {
    defaultWorkspace,
  }).load();
  workspaces.setProjectCatalog(async () =>
    defaultProjects(defaultWorkspace, alternateWorkspace),
  );
  await workspaces.ensure("bot_started_prompt");
  await workspaces.setProject("bot_started_prompt", "project-default");
  const createdIn = [];
  const asks = [];
  let sessionNumber = 0;
  let markFirstAskStarted;
  let releaseFirstAsk;
  const firstAskStarted = new Promise((resolveStarted) => {
    markFirstAskStarted = resolveStarted;
  });
  const firstAskGate = new Promise((resolveAsk) => {
    releaseFirstAsk = resolveAsk;
  });
  const harness = {
    async createSession({ workspaceId }) {
      createdIn.push(workspaceId);
      sessionNumber += 1;
      return `session-${sessionNumber}`;
    },
    async sessionExists() {
      return true;
    },
    async ask(sessionId, text) {
      asks.push({ sessionId, text });
      if (asks.length === 1) {
        markFirstAskStarted();
        await firstAskGate;
      }
      return `answer-${sessionId}`;
    },
  };
  let persistedSession = null;
  const state = {
    sessionFor() {
      return persistedSession;
    },
    async setSession(_key, sessionId) {
      persistedSession = sessionId;
    },
    async clearSessions() {
      persistedSession = null;
    },
  };
  const scope = createBotWorkspaceScope(harness, {
    botId: "bot_started_prompt",
    workspaces,
    state,
  });
  const controller = createWorkspaceAwareController(
    {
      status() {
        return { bots: [{ botId: "bot_started_prompt" }] };
      },
    },
    { workspaces, stateFor: async () => state },
  );

  const first = askInWorkspaceSession({
    harness: scope.harness,
    state: scope.state,
    key: "conversation",
    text: "first",
  });
  await firstAskStarted;
  await controller.updateWorkspace("bot_started_prompt", "project-alternate");
  assert.equal(
    workspaces.workspaceFor("bot_started_prompt"),
    alternateWorkspace,
  );
  releaseFirstAsk();

  assert.deepEqual(await first, {
    sessionId: "session-1",
    answer: "answer-session-1",
  });
  assert.deepEqual(
    await askInWorkspaceSession({
      harness: scope.harness,
      state: scope.state,
      key: "conversation",
      text: "second",
    }),
    {
      sessionId: "session-2",
      answer: "answer-session-2",
    },
  );
  assert.deepEqual(createdIn, ["project-default", "project-alternate"]);
  assert.deepEqual(asks, [
    { sessionId: "session-1", text: "first" },
    { sessionId: "session-2", text: "second" },
  ]);
});

test("deleting and rebinding a bot cannot accept an old in-flight session", async (t) => {
  const { path, defaultWorkspace, alternateWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, {
    defaultWorkspace,
  }).load();
  workspaces.setProjectCatalog(async () =>
    defaultProjects(defaultWorkspace, alternateWorkspace),
  );
  await workspaces.ensure("bot_rebind");
  await workspaces.setProject("bot_rebind", "project-default");
  let finishCreation;
  let creationStarted;
  const creationReachedHarness = new Promise((resolveStarted) => {
    creationStarted = resolveStarted;
  });
  const harness = {
    createSession() {
      creationStarted();
      return new Promise((resolveCreation) => {
        finishCreation = resolveCreation;
      });
    },
  };
  let persistedSession = null;
  const state = {
    async clearSessions() {
      persistedSession = null;
    },
    async setSession(_key, sessionId) {
      persistedSession = sessionId;
    },
  };
  const oldScope = createBotWorkspaceScope(harness, {
    botId: "bot_rebind",
    workspaces,
    state,
  });
  let bots = [{ botId: "bot_rebind" }];
  const controller = createWorkspaceAwareController(
    {
      status() {
        return { bots };
      },
      async deleteBot() {
        bots = [];
        return { bots };
      },
    },
    { workspaces, stateFor: async () => state },
  );

  const oldSession = oldScope.harness.createSession();
  // The scope now reconciles the catalog before creating; wait until the
  // old-generation creation has genuinely reached Harness before deleting.
  await creationReachedHarness;
  await controller.deleteBot("bot_rebind");
  await workspaces.ensure("bot_rebind");
  finishCreation("session-before-delete");

  assert.equal(
    await oldScope.state.setSession("conversation", await oldSession),
    false,
  );
  assert.equal(persistedSession, null);
  await assert.rejects(oldScope.harness.switchWorkspace(alternateWorkspace), {
    code: "workspace-bot-not-found",
  });
  const reboundScope = createBotWorkspaceScope(harness, {
    botId: "bot_rebind",
    workspaces,
    state,
  });
  assert.equal(
    await reboundScope.harness.switchWorkspace(alternateWorkspace),
    alternateWorkspace,
  );
});

test("a successful public delete clears sessions before a same-id rebind", async (t) => {
  const { path, defaultWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, {
    defaultWorkspace,
  }).load();
  workspaces.setProjectCatalog(async () => defaultProjects(defaultWorkspace));
  await workspaces.ensure("bot_reused_id");
  await workspaces.setProject("bot_reused_id", "project-default");
  let persistedSession = "old-session";
  const state = {
    sessionFor() {
      return persistedSession;
    },
    async setSession(_key, sessionId) {
      persistedSession = sessionId;
    },
    async clearSessions() {
      persistedSession = null;
    },
  };
  let bots = [{ botId: "bot_reused_id" }];
  const controller = createWorkspaceAwareController(
    {
      status() {
        return { bots };
      },
      async deleteBot() {
        assert.equal(
          persistedSession,
          null,
          "session cleanup precedes the config deletion",
        );
        bots = [];
        return { bots };
      },
    },
    { workspaces, stateFor: async () => state },
  );

  await controller.deleteBot("bot_reused_id");
  await workspaces.ensure("bot_reused_id");
  await workspaces.setProject("bot_reused_id", "project-default");
  const asks = [];
  const scope = createBotWorkspaceScope(
    {
      async createSession() {
        return "new-session";
      },
      async sessionExists() {
        return true;
      },
      async ask(sessionId) {
        asks.push(sessionId);
        return "new-answer";
      },
    },
    { botId: "bot_reused_id", workspaces, state },
  );

  assert.deepEqual(
    await askInWorkspaceSession({
      harness: scope.harness,
      state: scope.state,
      key: "conversation",
      text: "after rebind",
    }),
    { sessionId: "new-session", answer: "new-answer" },
  );
  assert.deepEqual(asks, ["new-session"]);
  assert.equal(persistedSession, "new-session");
});

test("session cleanup load or clear failures do not block public deletion", async (t) => {
  const { path, defaultWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, {
    defaultWorkspace,
  }).load();
  const warnings = [];
  vi.spyOn(console, "warn").mockImplementation((...args) => {
    warnings.push(args);
  });

  for (const failure of ["load", "clear"]) {
    const botId = `bot_cleanup_${failure}`;
    await workspaces.ensure(botId);
    let bots = [{ botId }];
    let deletions = 0;
    const controller = createWorkspaceAwareController(
      {
        status() {
          return { bots };
        },
        async deleteBot() {
          deletions += 1;
          bots = [];
          return { bots };
        },
      },
      {
        workspaces,
        stateFor: async () => {
          if (failure === "load") throw new Error("state load failed");
          return {
            async clearSessions() {
              throw new Error("session clear failed");
            },
          };
        },
      },
    );

    await controller.deleteBot(botId);
    assert.equal(deletions, 1);
    assert.equal(workspaces.has(botId), false);
  }
  assert.equal(warnings.length, 2);
  assert.ok(
    warnings.every(([message]) =>
      message.includes("ignored session cleanup failure"),
    ),
  );
});

test("an old deletion transaction cannot retire a same-id rebound bot", async (t) => {
  const { path, defaultWorkspace, alternateWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, {
    defaultWorkspace,
  }).load();
  workspaces.setProjectCatalog(async () =>
    defaultProjects(defaultWorkspace, alternateWorkspace),
  );
  await workspaces.ensure("bot_lifecycle");
  await workspaces.setProject("bot_lifecycle", "project-alternate");
  const firstIncarnation = workspaces.incarnationFor("bot_lifecycle");
  let bots = [{ botId: "bot_lifecycle", lifecycle: "old" }];
  const observedStore = observeBotWorkspaceRemovals(
    {
      async remove(botId) {
        return { botId };
      },
    },
    { workspaces },
  );
  const controller = createWorkspaceAwareController(
    {
      status() {
        return { bots };
      },
      async deleteBot(botId) {
        // The config commit retires the old lifecycle before the outer adapter
        // resumes. Simulate a queued same-account provisioning completing in
        // that gap and creating a new incarnation with the deterministic id.
        await observedStore.remove(botId);
        await workspaces.ensure(botId);
        await workspaces.setProject(botId, "project-default");
        bots = [{ botId, lifecycle: "rebound" }];
        return { bots };
      },
    },
    { workspaces, stateFor: async () => ({ async clearSessions() {} }) },
  );

  const result = await controller.deleteBot("bot_lifecycle");
  assert.equal(workspaces.has("bot_lifecycle"), true);
  assert.equal(workspaces.workspaceFor("bot_lifecycle"), defaultWorkspace);
  assert.notEqual(workspaces.incarnationFor("bot_lifecycle"), firstIncarnation);
  assert.equal(result.bots[0].workspace, defaultWorkspace);

  const staleRemoval = await workspaces.beginRemoval("bot_lifecycle");
  await workspaces.retireAfterConfigCommit("bot_lifecycle");
  await workspaces.ensure("bot_lifecycle");
  await workspaces.setProject("bot_lifecycle", "project-alternate");
  const latestIncarnation = workspaces.incarnationFor("bot_lifecycle");
  assert.equal(await workspaces.abortRemoval(staleRemoval), false);
  assert.equal((await workspaces.finishRemoval(staleRemoval)).stale, true);
  assert.equal(workspaces.has("bot_lifecycle"), true);
  assert.equal(workspaces.workspaceFor("bot_lifecycle"), alternateWorkspace);
  assert.equal(workspaces.incarnationFor("bot_lifecycle"), latestIncarnation);
});

test("a workspace update for an old incarnation cannot mutate a same-id rebound bot", async (t) => {
  const { path, defaultWorkspace, alternateWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, {
    defaultWorkspace,
  }).load();
  workspaces.setProjectCatalog(async () =>
    defaultProjects(defaultWorkspace, alternateWorkspace),
  );
  await workspaces.ensure("bot_update_aba");
  await workspaces.setProject("bot_update_aba", "project-default");
  let markStateRequested;
  let releaseState;
  const stateRequested = new Promise((resolveRequested) => {
    markStateRequested = resolveRequested;
  });
  const stateGate = new Promise((resolveState) => {
    releaseState = resolveState;
  });
  let clears = 0;
  const controller = createWorkspaceAwareController(
    {
      status() {
        return { bots: [{ botId: "bot_update_aba" }] };
      },
    },
    {
      workspaces,
      stateFor: async () => {
        markStateRequested();
        await stateGate;
        return {
          async clearSessions() {
            clears += 1;
          },
        };
      },
    },
  );

  const updating = controller.updateWorkspace(
    "bot_update_aba",
    "project-alternate",
  );
  await stateRequested;
  await workspaces.retireAfterConfigCommit("bot_update_aba");
  await workspaces.ensure("bot_update_aba");
  await workspaces.setProject("bot_update_aba", "project-default");
  releaseState();

  await assert.rejects(updating, { code: "workspace-bot-not-found" });
  assert.equal(clears, 0);
  assert.equal(workspaces.has("bot_update_aba"), true);
  assert.equal(workspaces.workspaceFor("bot_update_aba"), defaultWorkspace);
});

test("a blocked workspace switch for one bot does not block another bot session", async (t) => {
  const { path, defaultWorkspace, alternateWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, {
    defaultWorkspace,
  }).load();
  workspaces.setProjectCatalog(async () =>
    defaultProjects(defaultWorkspace, alternateWorkspace),
  );
  await Promise.all([
    workspaces.ensure("bot_slow"),
    workspaces.ensure("bot_ready"),
  ]);
  await Promise.all([
    workspaces.setProject("bot_slow", "project-default"),
    workspaces.setProject("bot_ready", "project-default"),
  ]);
  let markClearStarted;
  let releaseClear;
  const clearStarted = new Promise((resolveClear) => {
    markClearStarted = resolveClear;
  });
  const clearGate = new Promise((resolveClear) => {
    releaseClear = resolveClear;
  });
  const stateSlow = {
    async clearSessions() {
      markClearStarted();
      await clearGate;
    },
  };
  const stateReady = { async clearSessions() {} };
  const created = [];
  const harness = {
    async createSession({ workspaceId }) {
      created.push(workspaceId);
      return "ready-session";
    },
  };
  const slow = createBotScopedHarness(harness, {
    botId: "bot_slow",
    workspaces,
    state: stateSlow,
  });
  const ready = createBotScopedHarness(harness, {
    botId: "bot_ready",
    workspaces,
    state: stateReady,
  });

  const switching = slow.switchWorkspace(alternateWorkspace);
  await clearStarted;
  assert.equal(await ready.createSession(), "ready-session");
  assert.deepEqual(created, ["project-default"]);
  releaseClear();
  await switching;
});

test("clearing workspace sessions preserves message deduplication and channel cursors", async (t) => {
  const { root } = await fixture(t);
  const stores = [
    [
      "shared",
      await new ConversationStateStore(join(root, "shared-state.json")).load(),
    ],
    [
      "weixin",
      await new WeixinStateStore(join(root, "weixin-state.json")).load(),
    ],
    [
      "feishu",
      await new FeishuStateStore(join(root, "feishu-state.json")).load(),
    ],
    [
      "dingtalk",
      await new DingtalkStateStore(join(root, "dingtalk-state.json"), {
        idFactory: () => "request",
        now: () => "2026-08-17T00:00:00.000Z",
      }).load(),
    ],
    ["wecom", await new WecomStateStore(join(root, "wecom-state.json")).load()],
    ["qq", await new QqStateStore(join(root, "qq-state.json")).load()],
  ];

  for (const [name, store] of stores) {
    await store.setSession("conversation", `session-${name}`);
    await store.markSeen(`message-${name}`);
  }
  await stores[0][1].setCursor(42);
  await stores[1][1].setGetUpdatesBuf("next-weixin-cursor");
  await stores[3][1].recordPendingSender("staff-one", "User One");

  for (const [name, store] of stores) {
    await store.clearSessions();
    assert.equal(
      store.sessionFor("conversation"),
      null,
      `${name} clears its Harness session`,
    );
    assert.equal(
      store.hasSeen(`message-${name}`),
      true,
      `${name} keeps message deduplication`,
    );
  }
  assert.equal(stores[0][1].cursor(), 42);
  assert.equal(stores[1][1].getUpdatesBuf(), "next-weixin-cursor");
  assert.equal(stores[3][1].pendingSenders().length, 1);
});

test("workspace-aware controller decorates status and updates one bot", async (t) => {
  const { path, defaultWorkspace, alternateWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, {
    defaultWorkspace,
  }).load();
  workspaces.setProjectCatalog(async () =>
    defaultProjects(defaultWorkspace, alternateWorkspace),
  );
  await Promise.all([
    workspaces.ensure("bot_one"),
    workspaces.ensure("bot_two"),
  ]);
  await workspaces.setProject("bot_one", "project-default");
  const cleared = [];
  const controller = createWorkspaceAwareController(
    {
      status() {
        return { bots: [{ botId: "bot_one" }, { botId: "bot_two" }] };
      },
      async deleteBot(botId) {
        return {
          bots: [{ botId: botId === "bot_one" ? "bot_two" : "bot_one" }],
        };
      },
    },
    {
      workspaces,
      stateFor: async (botId) => ({
        async clearSessions() {
          cleared.push(botId);
        },
      }),
    },
  );

  const updated = await controller.updateWorkspace(
    "bot_one",
    "project-alternate",
  );
  assert.equal(updated.bots[0].workspace, alternateWorkspace);
  assert.equal(updated.bots[0].workspaceId, "project-alternate");
  assert.equal(updated.bots[1].workspace, null);
  assert.equal(updated.bots[1].workspacePending, true);
  assert.deepEqual(cleared, ["bot_one"]);

  await assert.rejects(
    controller.updateWorkspace("missing_bot", "project-alternate"),
    {
      code: "workspace-bot-not-found",
    },
  );
});

test("workspace updates serialize with deletion and cannot recreate a removed bot mapping", async (t) => {
  const { path, defaultWorkspace, alternateWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, {
    defaultWorkspace,
  }).load();
  workspaces.setProjectCatalog(async () =>
    defaultProjects(defaultWorkspace, alternateWorkspace),
  );
  await workspaces.ensure("bot_delete");
  await workspaces.setProject("bot_delete", "project-alternate");
  let bots = [{ botId: "bot_delete" }];
  let releaseDelete;
  let markDeleteStarted;
  const deleteStarted = new Promise((resolveStarted) => {
    markDeleteStarted = resolveStarted;
  });
  const deleteGate = new Promise((resolveDelete) => {
    releaseDelete = resolveDelete;
  });
  let clears = 0;
  const controller = createWorkspaceAwareController(
    {
      status() {
        return { bots };
      },
      async deleteBot() {
        markDeleteStarted();
        await deleteGate;
        bots = [];
        return { bots };
      },
    },
    {
      workspaces,
      stateFor: async () => ({
        async clearSessions() {
          clears += 1;
        },
      }),
    },
  );

  const deleting = controller.deleteBot("bot_delete");
  await deleteStarted;
  const lateUpdate = controller.updateWorkspace(
    "bot_delete",
    "project-default",
  );
  releaseDelete();
  await deleting;
  await assert.rejects(lateUpdate, { code: "workspace-bot-not-found" });
  assert.equal(workspaces.workspaceFor("bot_delete"), null);
  assert.equal(clears, 1);
});

test("workspace deletion keeps the durable path until the bot config commits", async (t) => {
  const { path, defaultWorkspace, alternateWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, {
    defaultWorkspace,
  }).load();
  workspaces.setProjectCatalog(async () =>
    defaultProjects(defaultWorkspace, alternateWorkspace),
  );
  await workspaces.ensure("bot_durable");
  await workspaces.setProject("bot_durable", "project-alternate");
  let bots = [{ botId: "bot_durable" }];
  let markDeleteStarted;
  let releaseDelete;
  const deleteStarted = new Promise((resolveDelete) => {
    markDeleteStarted = resolveDelete;
  });
  const deleteGate = new Promise((resolveDelete) => {
    releaseDelete = resolveDelete;
  });
  const controller = createWorkspaceAwareController(
    {
      status() {
        return { bots };
      },
      async deleteBot() {
        markDeleteStarted();
        await deleteGate;
        bots = [];
        return { bots };
      },
    },
    { workspaces, stateFor: async () => ({ async clearSessions() {} }) },
  );

  const deleting = controller.deleteBot("bot_durable");
  await deleteStarted;
  assert.equal(
    JSON.parse(await readFile(path, "utf8")).projects.bot_durable.path,
    alternateWorkspace,
  );
  releaseDelete();
  await deleting;
  assert.equal(workspaces.has("bot_durable"), false);
});

test("a failed bot deletion aborts the fence without rewriting its workspace", async (t) => {
  const { path, defaultWorkspace, alternateWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, {
    defaultWorkspace,
  }).load();
  workspaces.setProjectCatalog(async () =>
    defaultProjects(defaultWorkspace, alternateWorkspace),
  );
  await workspaces.ensure("bot_abort");
  await workspaces.setProject("bot_abort", "project-alternate");
  const state = { async clearSessions() {} };
  const scope = createBotWorkspaceScope(
    { async createSession() {} },
    {
      botId: "bot_abort",
      workspaces,
      state,
    },
  );
  const controller = createWorkspaceAwareController(
    {
      status() {
        return { bots: [{ botId: "bot_abort" }] };
      },
      async deleteBot() {
        throw new Error("config removal failed");
      },
    },
    { workspaces, stateFor: async () => state },
  );

  await assert.rejects(
    controller.deleteBot("bot_abort"),
    /config removal failed/,
  );
  assert.equal(workspaces.has("bot_abort"), true);
  assert.equal(workspaces.workspaceFor("bot_abort"), alternateWorkspace);
  assert.equal(
    await scope.harness.switchWorkspace(defaultWorkspace),
    defaultWorkspace,
  );
});

test("a committed bot deletion stays retired when workspace cleanup persistence fails", async (t) => {
  const { root, defaultWorkspace, alternateWorkspace } = await fixture(t);
  const storeDirectory = join(root, "delete-store");
  const storePath = join(storeDirectory, "workspaces.json");
  await mkdir(storeDirectory);
  const workspaces = await new BotWorkspaceStore(storePath, {
    defaultWorkspace,
  }).load();
  workspaces.setProjectCatalog(async () =>
    defaultProjects(defaultWorkspace, alternateWorkspace),
  );
  await workspaces.ensure("bot_commit");
  await workspaces.setProject("bot_commit", "project-alternate");
  let bots = [{ botId: "bot_commit" }];
  let markDeleteStarted;
  let releaseDelete;
  const deleteStarted = new Promise((resolveDelete) => {
    markDeleteStarted = resolveDelete;
  });
  const deleteGate = new Promise((resolveDelete) => {
    releaseDelete = resolveDelete;
  });
  const controller = createWorkspaceAwareController(
    {
      status() {
        return { bots };
      },
      async deleteBot() {
        markDeleteStarted();
        await deleteGate;
        bots = [];
        return { bots };
      },
    },
    { workspaces, stateFor: async () => ({ async clearSessions() {} }) },
  );

  const deleting = controller.deleteBot("bot_commit");
  await deleteStarted;
  await rename(storeDirectory, `${storeDirectory}-saved`);
  await writeFile(storeDirectory, "block cleanup persistence");
  releaseDelete();
  await deleting;
  assert.equal(workspaces.has("bot_commit"), false);
  await assert.rejects(
    workspaces.setWorkspace("bot_commit", defaultWorkspace),
    {
      code: "workspace-bot-not-found",
    },
  );

  await rm(storeDirectory, { force: true });
  await rename(`${storeDirectory}-saved`, storeDirectory);
  assert.equal(
    JSON.parse(await readFile(storePath, "utf8")).projects.bot_commit.path,
    alternateWorkspace,
  );
  await workspaces.reconcile([]);
  await assert.rejects(readFile(storePath, "utf8"), { code: "ENOENT" });
});

test("config-store removal observation retires workspaces after the config commit", async (t) => {
  const { path, defaultWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, {
    defaultWorkspace,
  }).load();
  await Promise.all([
    workspaces.ensure("bot_remove"),
    workspaces.ensure("bot_feishu"),
  ]);
  const tokenStore = observeBotWorkspaceRemovals(
    {
      async remove(botId) {
        return { botId };
      },
    },
    { workspaces },
  );
  const feishuStore = observeBotWorkspaceRemovals(
    {
      async removeBot(id) {
        return { id };
      },
    },
    {
      workspaces,
      method: "removeBot",
      botIdFromRemoved: (removed) => removed.id,
    },
  );

  await tokenStore.remove("bot_remove");
  await feishuStore.removeBot("bot_feishu");
  assert.equal(workspaces.has("bot_remove"), false);
  assert.equal(workspaces.has("bot_feishu"), false);
});

test("/workspace command preserves spaces and returns actionable validation messages", async (t) => {
  const { alternateWorkspace } = await fixture(t);
  const switched = [];
  const harness = {
    async switchWorkspace(path) {
      switched.push(path);
      return path;
    },
  };

  assert.equal(await runWorkspaceCommand("hello", harness), null);
  assert.match(
    (await runWorkspaceCommand("/workspace", harness)).message,
    /用法/,
  );
  assert.match(
    (await runWorkspaceCommand(`/workspace ${alternateWorkspace}`, harness))
      .message,
    new RegExp(alternateWorkspace.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
  assert.deepEqual(switched, [alternateWorkspace]);

  const invalidHarness = {
    async switchWorkspace() {
      const error = new Error("工作区路径不存在。");
      error.code = "workspace-not-found";
      throw error;
    },
  };
  const invalid = await runWorkspaceCommand(
    "/workspace /missing/workspace",
    invalidHarness,
  );
  assert.match(invalid.message, /路径不存在/);
  assert.match(invalid.message, /用法：\/workspace 工作区绝对路径/);

  const removedHarness = {
    async switchWorkspace() {
      const error = new Error("bot removed");
      error.code = "workspace-bot-not-found";
      throw error;
    },
  };
  assert.match(
    (
      await runWorkspaceCommand(
        `/workspace ${alternateWorkspace}`,
        removedHarness,
      )
    ).message,
    /正在移除或已重新接入/,
  );
});

test("/workspacelist returns existing absolute paths with the current workspace first", async (t) => {
  const { root, defaultWorkspace, alternateWorkspace } = await fixture(t);
  const thirdWorkspace = join(root, "third");
  await mkdir(thirdWorkspace);
  let listCalls = 0;
  const harness = {
    currentWorkspace() {
      return defaultWorkspace;
    },
    async listWorkspaces() {
      listCalls += 1;
      return [
        alternateWorkspace,
        defaultWorkspace,
        alternateWorkspace,
        thirdWorkspace,
        join(root, "missing"),
        "relative/path",
      ];
    },
  };

  const result = await runWorkspaceCommand("/WORKSPACELIST", harness);
  assert.equal(result.handled, true);
  assert.match(result.message, /工作区（3）/);
  assert.match(
    result.message,
    new RegExp(
      `1\\. ${defaultWorkspace.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}（当前）`,
    ),
  );
  assert.ok(
    result.message.indexOf(defaultWorkspace) <
      result.message.indexOf(alternateWorkspace),
  );
  assert.ok(
    result.message.indexOf(alternateWorkspace) <
      result.message.indexOf(thirdWorkspace),
  );
  assert.doesNotMatch(result.message, /missing|relative\/path/);
  assert.match(result.message, /切换用法：\/workspace 工作区绝对路径/);
  assert.match(result.message, /查看会话：\/sessionlist 工作区序号或绝对路径/);
  assert.equal(result.messages.join(""), result.message);
  assert.equal(listCalls, 1);

  assert.match(
    (await runWorkspaceCommand("/workspacelist extra", harness)).message,
    /用法/,
  );
  assert.equal(listCalls, 1);
  assert.match(
    (await runWorkspaceCommand("/workspacelist", {})).message,
    /暂不支持/,
  );
  assert.match(
    (
      await runWorkspaceCommand("/workspacelist", {
        async listWorkspaces() {
          throw new Error("private host detail");
        },
      })
    ).message,
    /暂时无法获取/,
  );
  assert.match(
    (
      await runWorkspaceCommand("/workspacelist", {
        async listWorkspaces() {
          return [];
        },
      })
    ).message,
    /没有仍然存在/,
  );
});

test("/workspacelist splits a long registry without dropping paths", async (t) => {
  const { root, defaultWorkspace } = await fixture(t);
  const paths = Array.from({ length: 48 }, (_, index) =>
    join(root, `workspace-${String(index).padStart(2, "0")}`),
  );
  await Promise.all(paths.map((workspace) => mkdir(workspace)));
  const result = await runWorkspaceCommand("/workspacelist", {
    currentWorkspace() {
      return defaultWorkspace;
    },
    async listWorkspaces() {
      return paths;
    },
  });

  assert.ok(result.messages.length > 1);
  assert.equal(result.messages.join(""), result.message);
  assert.ok(result.messages.every((message) => message.length <= 1_800));
  for (const workspace of paths) assert.ok(result.message.includes(workspace));
});

test("/workspacelist hides unsafe Unicode paths and rechecks the bot scope", async (t) => {
  const { root, defaultWorkspace } = await fixture(t);
  const unsafePaths = [
    join(root, "line\u2028separator"),
    join(root, "bidi\u202ereversal"),
    join(root, "control\u0085next-line"),
  ];
  await Promise.all(unsafePaths.map((workspace) => mkdir(workspace)));

  const filtered = await runWorkspaceCommand("/workspacelist", {
    currentWorkspace() {
      return defaultWorkspace;
    },
    async listWorkspaces() {
      return unsafePaths;
    },
  });
  assert.match(filtered.message, /工作区（1）/);
  for (const workspace of unsafePaths)
    assert.ok(!filtered.message.includes(workspace));

  const stale = await runWorkspaceCommand("/workspacelist", {
    currentWorkspace() {
      return defaultWorkspace;
    },
    async listWorkspaces() {
      return [defaultWorkspace];
    },
    assertWorkspaceScope() {
      const error = new Error("old bot lifecycle");
      error.code = "workspace-bot-not-found";
      throw error;
    },
  });
  assert.match(stale.message, /正在移除或已重新接入/);
});

test("/sessionlist supports the current workspace, list numbers, and absolute paths", async (t) => {
  const { root, defaultWorkspace, alternateWorkspace } = await fixture(t);
  const thirdWorkspace = join(root, "third workspace");
  await mkdir(thirdWorkspace);
  const listedWorkspaces = [];
  let workspaceListCalls = 0;
  const sessionsByWorkspace = new Map([
    [
      defaultWorkspace,
      [
        {
          sessionId: "session-current",
          title: "安全标题\u202e伪造\n4. injected",
          archived: false,
          blank: true,
          origin: "subagent",
          summaryAvailable: true,
        },
        {
          sessionId: "session-archived",
          title: null,
          archived: true,
          blank: false,
          origin: null,
          summaryAvailable: true,
        },
        {
          sessionId: "session-missing-summary",
          title: null,
          archived: false,
          blank: false,
          origin: null,
          summaryAvailable: false,
        },
      ],
    ],
    [
      alternateWorkspace,
      [
        {
          sessionId: "session-alternate",
          title: "Alternate session",
          archived: false,
          summaryAvailable: true,
        },
      ],
    ],
    [thirdWorkspace, []],
  ]);
  const harness = {
    currentWorkspace() {
      return defaultWorkspace;
    },
    async listWorkspaces() {
      workspaceListCalls += 1;
      return [alternateWorkspace, defaultWorkspace, thirdWorkspace];
    },
    async listWorkspaceSessions(workspace) {
      listedWorkspaces.push(workspace);
      return { workspace, sessions: sessionsByWorkspace.get(workspace) ?? [] };
    },
  };

  const current = await runWorkspaceCommand("/SESSIONLIST", harness);
  assert.match(
    current.message,
    new RegExp(
      `工作区：${defaultWorkspace.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    ),
  );
  assert.match(current.message, /会话（3）/);
  assert.match(
    current.message,
    /1\. 安全标题 伪造 4\. injected\n {3}ID: session-current/,
  );
  assert.doesNotMatch(current.message, /\u202e|\n4\. injected/);
  assert.match(
    current.message,
    /2\. 暂无标题（已归档）\n {3}ID: session-archived/,
  );
  assert.match(
    current.message,
    /3\. 标题暂不可用\n {3}ID: session-missing-summary/,
  );
  assert.match(
    current.message,
    /绑定用法：\/session Session ID 或当前工作区序号（\/session N）/,
  );
  assert.equal(current.messages.join(""), current.message);

  const numbered = await runWorkspaceCommand("/sessionlist 2", harness);
  assert.match(
    numbered.message,
    new RegExp(
      `工作区：${alternateWorkspace.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    ),
  );
  assert.match(numbered.message, /Alternate session/);
  assert.match(
    numbered.message,
    /绑定用法：\/session Session ID\n提示：\/session N 只按机器人当前工作区的序号绑定/,
  );
  assert.doesNotMatch(numbered.message, /Session ID 或当前工作区序号/);

  const absolute = await runWorkspaceCommand(
    `/sessionlist ${thirdWorkspace}`,
    harness,
  );
  assert.match(absolute.message, /该工作区暂无会话/);
  assert.deepEqual(listedWorkspaces, [
    defaultWorkspace,
    alternateWorkspace,
    thirdWorkspace,
  ]);
  assert.equal(
    workspaceListCalls,
    1,
    "only numeric selection needs the workspace registry order",
  );
});

test("/sessionlist returns actionable and safe errors", async (t) => {
  const { root, defaultWorkspace } = await fixture(t);
  const file = join(root, "not-a-workspace.txt");
  await writeFile(file, "not a directory");
  const supported = {
    currentWorkspace() {
      return defaultWorkspace;
    },
    async listWorkspaces() {
      return [defaultWorkspace];
    },
    async listWorkspaceSessions(workspace) {
      return { workspace, sessions: [] };
    },
  };

  const invalidUsage = (
    await runWorkspaceCommand("/sessionlist relative/path", supported)
  ).message;
  assert.match(invalidUsage, /工作区必须是绝对路径/);
  assert.match(invalidUsage, /\/sessionlist {2}列出当前工作区会话/);
  assert.match(invalidUsage, /\/sessionlist 工作区序号/);
  assert.match(invalidUsage, /\/sessionlist 工作区绝对路径/);
  assert.match(
    (await runWorkspaceCommand("/sessionlist 0", supported)).message,
    /序号不存在/,
  );
  assert.match(
    (await runWorkspaceCommand("/sessionlist 99", supported)).message,
    /\/workspacelist/,
  );
  assert.match(
    (
      await runWorkspaceCommand(
        `/sessionlist ${join(root, "missing")}`,
        supported,
      )
    ).message,
    /工作区路径不存在/,
  );
  assert.match(
    (await runWorkspaceCommand(`/sessionlist ${file}`, supported)).message,
    /工作区路径必须指向一个目录/,
  );
  assert.match(
    (await runWorkspaceCommand("/sessionlist", {})).message,
    /暂不支持/,
  );
  assert.match(
    (
      await runWorkspaceCommand("/sessionlist", {
        currentWorkspace() {
          return defaultWorkspace;
        },
        async listWorkspaceSessions() {
          throw new Error("private Harness detail");
        },
      })
    ).message,
    /暂时无法获取/,
  );

  const stale = new Error("old bot lifecycle");
  stale.code = "workspace-bot-not-found";
  const staleResult = await runWorkspaceCommand("/sessionlist", {
    currentWorkspace() {
      return defaultWorkspace;
    },
    async listWorkspaceSessions() {
      throw stale;
    },
  });
  assert.match(staleResult.message, /正在移除或已重新接入/);
  assert.doesNotMatch(
    staleResult.message,
    /old bot lifecycle|private Harness detail/,
  );
});

test("/workspacelist and /sessionlist canonicalize a symbolic-link workspace", async (t) => {
  const { root } = await fixture(t);
  const canonicalWorkspace = join(root, "canonical-workspace");
  const linkedWorkspace = join(root, "linked-workspace");
  await mkdir(canonicalWorkspace);
  await symlink(canonicalWorkspace, linkedWorkspace, "dir");
  const requested = [];
  const harness = {
    currentWorkspace() {
      return linkedWorkspace;
    },
    async listWorkspaces() {
      return [canonicalWorkspace, linkedWorkspace];
    },
    async listWorkspaceSessions(workspace) {
      requested.push(workspace);
      return {
        workspace,
        sessions: [
          {
            sessionId: "session-through-link",
            title: "Canonical workspace session",
            archived: false,
            summaryAvailable: true,
          },
        ],
      };
    },
  };

  const workspaces = await runWorkspaceCommand("/workspacelist", harness);
  assert.match(workspaces.message, /工作区（1）/);
  assert.match(
    workspaces.message,
    new RegExp(
      `1\\. ${canonicalWorkspace.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}（当前）`,
    ),
  );

  const current = await runWorkspaceCommand("/sessionlist", harness);
  const absolute = await runWorkspaceCommand(
    `/sessionlist ${linkedWorkspace}`,
    harness,
  );
  assert.match(
    current.message,
    new RegExp(
      `工作区：${canonicalWorkspace.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    ),
  );
  assert.match(current.message, /session-through-link/);
  assert.match(absolute.message, /session-through-link/);
  assert.deepEqual(requested, [canonicalWorkspace, canonicalWorkspace]);
});

test("/sessionlist splits a long complete session list without losing IDs", async (t) => {
  const { defaultWorkspace } = await fixture(t);
  const sessions = Array.from({ length: 120 }, (_, index) => ({
    sessionId: `session-${String(index).padStart(3, "0")}`,
    title: `会话 ${index} ${"标题".repeat(12)}`,
    archived: index % 9 === 0,
    summaryAvailable: true,
  }));
  const result = await runWorkspaceCommand("/sessionlist", {
    currentWorkspace() {
      return defaultWorkspace;
    },
    async listWorkspaceSessions(workspace) {
      return { workspace, sessions };
    },
  });

  assert.ok(result.messages.length > 1);
  assert.ok(result.messages.every((message) => message.length <= 1_800));
  assert.equal(result.messages.join(""), result.message);
  for (const session of sessions)
    assert.ok(result.message.includes(session.sessionId));
});

test("the shared bridge sends every /sessionlist chunk without creating or prompting a session", async (t) => {
  const { defaultWorkspace } = await fixture(t);
  const sent = [];
  const seen = new Set();
  let sessionCalls = 0;
  const sessions = Array.from({ length: 120 }, (_, index) => ({
    sessionId: `bridge-session-${String(index).padStart(3, "0")}`,
    title: `Bridge title ${index} ${"detail ".repeat(8)}`,
    archived: false,
    summaryAvailable: true,
  }));
  const bridge = new TextHarnessBridge({
    descriptor: { key: "test", label: "Test" },
    bot: {
      async sendText(_target, text) {
        sent.push(text);
      },
    },
    harness: {
      currentWorkspace() {
        return defaultWorkspace;
      },
      async listWorkspaceSessions(workspace) {
        return { workspace, sessions };
      },
      async createSession() {
        sessionCalls += 1;
      },
      async ask() {
        sessionCalls += 1;
      },
    },
    state: {
      hasSeen(messageId) {
        return seen.has(messageId);
      },
      async markSeen(messageId) {
        seen.add(messageId);
      },
    },
  });

  await bridge.accept({
    messageId: "message-sessionlist",
    senderId: "sender",
    conversationId: "conversation",
    kind: "direct",
    content: "/sessionlist",
    replyTarget: "target",
  });

  assert.ok(sent.length > 1);
  assert.ok(sent.every((message) => message.length <= 1_800));
  for (const session of sessions)
    assert.ok(sent.join("").includes(session.sessionId));
  assert.equal(sessionCalls, 0);
  assert.equal(seen.has("message-sessionlist"), true);
});

test("workspace command message splitting bounds a single very long path", () => {
  const message = `/workspace/${"nested/".repeat(600)}project-😀`;
  const messages = splitWorkspaceCommandMessage(message);
  assert.ok(messages.length > 1);
  assert.ok(messages.every((part) => part.length <= 1_800));
  assert.equal(messages.join(""), message);
});

test("all nine channel bridge families advertise and fan out workspace command replies", async () => {
  const bridgeFiles = [
    "../src/channels/shared/text-harness-bridge.ts",
    "../src/channels/weixin/weixin-bridge.ts",
    "../src/channels/feishu/bridge.ts",
    "../src/channels/dingtalk/dingtalk-bridge.ts",
    "../src/channels/wecom/wecom-bridge.ts",
    "../src/channels/qq/qq-bridge.ts",
  ];
  for (const file of bridgeFiles) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.match(source, /usageGuideText|helpText\(|t\('\/help/);
    assert.match(
      source,
      /workspaceCommand\.messages \?\? \[workspaceCommand\.message\]/,
    );
  }
});

test("Telegram RPC explains network and proxy failures without exposing credentials", async () => {
  const token = "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef123456";
  for (const code of [
    "telegram-transport-error",
    "telegram-timeout",
    "telegram-response-invalid",
  ]) {
    const controller = {
      status() {
        return { bots: [] };
      },
      bindCredentials() {
        const error = new Error("Telegram request failed");
        error.code = code;
        throw error;
      },
      reconnectBot() {
        return { bots: [] };
      },
      deleteBot() {
        return { bots: [] };
      },
    };
    const handler = createTokenBotRpcHandler(controller, {
      channel: "Telegram",
    });

    const result = await handler(TOKEN_BOT_ENDPOINTS.bindCredentials, {
      token,
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "telegram-network-error");
    assert.match(result.error.message, /Telegram Bot API/);
    assert.match(result.error.message, /NODE_USE_ENV_PROXY/);
    assert.doesNotMatch(result.error.message, new RegExp(token));
  }
});

test("a stale bot scope cannot finish listing workspaces after same-id rebinding", async (t) => {
  const { path, defaultWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, {
    defaultWorkspace,
  }).load();
  await workspaces.ensure("bot_list");
  let finishList;
  const harness = {
    listWorkspaces() {
      return new Promise((resolve) => {
        finishList = resolve;
      });
    },
  };
  const oldScope = createBotScopedHarness(harness, {
    botId: "bot_list",
    workspaces,
    state: { async clearSessions() {} },
  });
  const pending = oldScope.listWorkspaces();
  await workspaces.retireAfterConfigCommit("bot_list");
  await workspaces.ensure("bot_list");
  finishList([defaultWorkspace]);

  await assert.rejects(pending, { code: "workspace-bot-not-found" });
});

test("a stale bot scope cannot finish listing workspace sessions after same-id rebinding", async (t) => {
  const { path, defaultWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, {
    defaultWorkspace,
  }).load();
  await workspaces.ensure("bot_session_list");
  let finishList;
  const oldScope = createBotScopedHarness(
    {
      listWorkspaceSessions() {
        return new Promise((resolveList) => {
          finishList = resolveList;
        });
      },
    },
    {
      botId: "bot_session_list",
      workspaces,
      state: { async clearSessions() {} },
    },
  );
  const pending = oldScope.listWorkspaceSessions(defaultWorkspace);
  await workspaces.retireAfterConfigCommit("bot_session_list");
  await workspaces.ensure("bot_session_list");
  finishList({ workspace: defaultWorkspace, sessions: [] });

  await assert.rejects(pending, { code: "workspace-bot-not-found" });
});

for (const [name, Client] of [
  ["Weixin", WeixinHarnessClient],
  ["Feishu", FeishuHarnessClient],
  ["DingTalk", DingtalkHarnessClient],
]) {
  test(`${name} Harness creates a session by Host project id only`, async () => {
    const client = new Client({
      baseUrl: "http://127.0.0.1:3080",
      workspace: "/default-workspace",
      agentPreset: "standard",
      autostart: false,
      dshBin: "dsh",
    });
    const calls = [];
    client.ensureRunning = async () => true;
    client.rpc = async (method, payload, _timeout, options) => {
      calls.push({ method, payload, options });
      if (method === "workspace.list") {
        return {
          items: [
            {
              workspaceId: "project-a",
              title: "Alpha",
              path: "/explicit-workspace",
              sessionIds: [],
            },
          ],
          archivedSessionIds: [],
        };
      }
      if (method === "session.create") return { sessionId: "session-new" };
      throw new Error(`Unexpected RPC: ${method}`);
    };

    const signal = new AbortController().signal;
    const options =
      name === "DingTalk"
        ? { workspaceId: "project-a", signal }
        : { workspaceId: "project-a" };
    assert.equal(await client.createSession(options), "session-new");
    expect(calls).not.toContainEqual(
      expect.objectContaining({ method: "workspace.create" }),
    );
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: "session.create",
        payload: { workspaceId: "project-a", agentPreset: "standard" },
      }),
    );
    const created = calls.find((call) => call.method === "session.create");
    assert.ok(!("cwd" in created.payload) && !("workspace" in created.payload));
    if (name === "DingTalk") assert.equal(calls[0].options.signal, signal);

    calls.length = 0;
    await assert.rejects(
      client.createSession(),
      (error) => error?.code === "workspace-project-missing",
    );
    await assert.rejects(
      client.createSession({ workspaceId: "project-deleted" }),
      (error) => error?.code === "workspace-project-not-found",
    );
    assert.deepEqual(
      calls.filter((call) => call.method === "session.create"),
      [],
    );
  });
}

test("schema v2 keeps a newly ensured bot pending until a catalog project is selected", async (t) => {
  const { path, defaultWorkspace } = await fixture(t);
  const store = await new BotWorkspaceStore(path, { defaultWorkspace }).load();

  assert.equal(await store.ensure("bot_new"), null);
  assert.equal(await store.ensure("bot_other"), null);
  assert.equal(store.projectFor("bot_new"), null);
  assert.equal(store.workspaceFor("bot_new"), null);
  assert.equal(store.workspacePendingFor("bot_new"), true);
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), {
    version: 2,
    projects: { bot_new: null, bot_other: null },
  });
  const decorated = store.decorateStatus({ bots: [{ botId: "bot_new" }] })
    .bots[0];
  assert.equal(decorated.workspacePending, true);
  assert.equal(decorated.workspaceId, null);
  assert.equal(decorated.workspaceTitle, null);
  assert.equal(decorated.workspace, null);

  const released = [];
  const waitingNew = store.whenWorkspaceReady("bot_new").then((project) => {
    released.push(["bot_new", project]);
    return project;
  });
  const waitingOther = store.whenWorkspaceReady("bot_other").then((project) => {
    released.push(["bot_other", project]);
    return project;
  });
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.deepEqual(released, []);

  store.setProjectCatalog(async () => [
    projectRow("project-a", defaultWorkspace, "Alpha"),
  ]);
  const selected = await store.setProject("bot_new", "project-a");
  assert.equal(selected.workspaceId, "project-a");
  assert.equal(selected.title, "Alpha");
  assert.equal(selected.path, defaultWorkspace);
  assert.equal((await waitingNew).workspaceId, "project-a");
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.deepEqual(
    released.map(([botId]) => botId),
    ["bot_new"],
    "selecting one bot must release exactly its own waiters",
  );
  assert.equal(store.workspacePendingFor("bot_new"), false);
  assert.equal(store.workspacePendingFor("bot_other"), true);
  assert.equal(store.workspaceFor("bot_new"), defaultWorkspace);
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), {
    version: 2,
    projects: {
      bot_new: {
        workspaceId: "project-a",
        title: "Alpha",
        path: defaultWorkspace,
      },
      bot_other: null,
    },
  });

  const reloaded = await new BotWorkspaceStore(path, {
    defaultWorkspace: tmpdir(),
  }).load();
  assert.equal(reloaded.projectFor("bot_new").workspaceId, "project-a");
  assert.equal(reloaded.workspacePendingFor("bot_new"), false);
  assert.equal(reloaded.workspacePendingFor("bot_other"), true);
  const rejection = assert.rejects(waitingOther, {
    code: WORKSPACE_SESSION_STALE,
  });
  const removal = await store.beginRemoval("bot_other");
  await store.finishRemoval(removal);
  await rejection;
});

test("setProject validates the bot, the catalog, and the selected project id", async (t) => {
  const { path, defaultWorkspace } = await fixture(t);
  const store = await new BotWorkspaceStore(path, { defaultWorkspace }).load();
  await store.ensure("bot_pick");
  store.setProjectCatalog(async () => [
    projectRow("project-a", defaultWorkspace),
  ]);

  await assert.rejects(store.setProject("bot_pick", ""), {
    code: "workspace-project-missing",
  });
  await assert.rejects(store.setProject("bot_pick", "project-deleted"), {
    code: "workspace-project-not-found",
  });
  await assert.rejects(store.setProject("bot_unknown", "project-a"), {
    code: "workspace-bot-not-found",
  });
  assert.equal(store.workspacePendingFor("bot_pick"), true);

  store.setProjectCatalog(async () => {
    throw new Error("Host unreachable");
  });
  await assert.rejects(store.setProject("bot_pick", "project-a"), {
    code: "workspace-catalog-unavailable",
  });
  assert.equal(store.workspacePendingFor("bot_pick"), true);
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")).projects, {
    bot_pick: null,
  });
});

test("v1 path bindings migrate to a unique catalog project only after reconciliation succeeds", async (t) => {
  const { path, defaultWorkspace, alternateWorkspace } = await fixture(t);
  await writeFile(
    path,
    `${JSON.stringify({
      version: 1,
      workspaces: {
        bot_legacy: defaultWorkspace,
        bot_stray: alternateWorkspace,
      },
    })}\n`,
  );
  const store = await new BotWorkspaceStore(path, { defaultWorkspace }).load();
  assert.equal(store.projectFor("bot_legacy"), null);
  assert.equal(store.workspacePendingFor("bot_legacy"), true);
  assert.equal(store.workspacePendingFor("bot_stray"), true);
  let migrated = null;
  const waiting = store.whenWorkspaceReady("bot_legacy").then((project) => {
    migrated = project;
    return project;
  });

  store.setProjectCatalog(async () => {
    throw new Error("Host unreachable");
  });
  await assert.rejects(store.reconcileProjects(), {
    code: "workspace-catalog-unavailable",
  });
  assert.equal(store.workspacePendingFor("bot_legacy"), true);
  assert.equal(migrated, null);
  assert.equal(
    JSON.parse(await readFile(path, "utf8")).version,
    1,
    "a failed reconciliation must not rewrite or discard v1 data",
  );

  store.setProjectCatalog(async () => [
    projectRow("project-a", defaultWorkspace, "Alpha"),
  ]);
  await store.reconcileProjects();
  assert.equal(migrated?.workspaceId, "project-a");
  assert.equal(store.workspacePendingFor("bot_legacy"), false);
  assert.equal(store.projectFor("bot_stray"), null);
  assert.equal(store.workspacePendingFor("bot_stray"), true);
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), {
    version: 2,
    projects: {
      bot_legacy: {
        workspaceId: "project-a",
        title: "Alpha",
        path: defaultWorkspace,
      },
      bot_stray: null,
    },
  });

  // The discarded legacy path must never re-migrate on a later reconciliation.
  store.setProjectCatalog(async () => [
    projectRow("project-a", defaultWorkspace, "Alpha"),
    projectRow("project-reborn", alternateWorkspace, "Stray reborn"),
  ]);
  await store.reconcileProjects();
  assert.equal(store.projectFor("bot_stray"), null);
  assert.equal(store.workspacePendingFor("bot_stray"), true);
  await waiting;
});

test("an ambiguous legacy path match stays pending", async (t) => {
  const { path, defaultWorkspace } = await fixture(t);
  await writeFile(
    path,
    `${JSON.stringify({
      version: 1,
      workspaces: { bot_ambiguous: defaultWorkspace },
    })}\n`,
  );
  const store = await new BotWorkspaceStore(path, { defaultWorkspace }).load();
  store.setProjectCatalog(async () => [
    projectRow("project-one", defaultWorkspace, "One"),
    projectRow("project-two", defaultWorkspace, "Two"),
  ]);
  await store.reconcileProjects();
  assert.equal(store.projectFor("bot_ambiguous"), null);
  assert.equal(store.workspacePendingFor("bot_ambiguous"), true);
});

test("a missing v2 project returns the bot to pending, clears sessions, and never revives by path", async (t) => {
  const { path, defaultWorkspace } = await fixture(t);
  const store = await new BotWorkspaceStore(path, { defaultWorkspace }).load();
  await store.ensure("bot_selected");
  let catalog = [projectRow("project-old", defaultWorkspace, "Old")];
  store.setProjectCatalog(async () => catalog);
  await store.setProject("bot_selected", "project-old");
  const generation = store.generationFor("bot_selected");
  const cleared = [];
  const clearSessions = async (botId) => {
    cleared.push(botId);
  };

  // A transient catalog failure preserves the last known binding.
  store.setProjectCatalog(async () => {
    throw new Error("Host unreachable");
  });
  await assert.rejects(store.reconcileProjects({ clearSessions }), {
    code: "workspace-catalog-unavailable",
  });
  assert.equal(store.projectFor("bot_selected").workspaceId, "project-old");
  assert.equal(store.workspacePendingFor("bot_selected"), false);
  assert.deepEqual(cleared, []);

  // Deleting project-old and recreating the same path as project-new must not
  // revive the stale id: v2 bindings reconcile by id only.
  catalog = [projectRow("project-new", defaultWorkspace, "Recreated")];
  store.setProjectCatalog(async () => catalog);
  await store.reconcileProjects({ clearSessions });
  assert.equal(store.projectFor("bot_selected"), null);
  assert.equal(store.workspacePendingFor("bot_selected"), true);
  assert.deepEqual(cleared, ["bot_selected"]);
  assert.notEqual(store.generationFor("bot_selected"), generation);
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")).projects, {
    bot_selected: null,
  });

  await store.setProject("bot_selected", "project-new");
  assert.equal(store.projectFor("bot_selected").workspaceId, "project-new");

  // A successfully fetched empty catalog is authoritative for every bot.
  catalog = [];
  await store.reconcileProjects({ clearSessions });
  assert.equal(store.projectFor("bot_selected"), null);
  assert.equal(store.workspacePendingFor("bot_selected"), true);
  assert.deepEqual(cleared, ["bot_selected", "bot_selected"]);
});

test("one malformed catalog row rejects the snapshot and preserves the binding", async (t) => {
  const { path, defaultWorkspace } = await fixture(t);
  const store = await new BotWorkspaceStore(path, { defaultWorkspace }).load();
  await store.ensure("bot_bound");
  store.setProjectCatalog(async () => [
    projectRow("project-a", defaultWorkspace, "Alpha"),
  ]);
  await store.setProject("bot_bound", "project-a");
  const cleared = [];
  const clearSessions = async (botId) => {
    cleared.push(botId);
  };

  // The bound project is still present, but one malformed row poisons the
  // whole snapshot: nothing may be unbound on unreadable catalog data.
  store.setProjectCatalog(async () => [
    projectRow("project-a", defaultWorkspace, "Alpha"),
    { workspaceId: "project-broken", title: "Broken", path: "relative/path" },
  ]);
  await assert.rejects(store.reconcileProjects({ clearSessions }), {
    code: "workspace-catalog-unavailable",
  });
  assert.equal(store.projectFor("bot_bound").workspaceId, "project-a");
  assert.equal(store.workspacePendingFor("bot_bound"), false);
  assert.deepEqual(cleared, []);
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")).projects, {
    bot_bound: {
      workspaceId: "project-a",
      title: "Alpha",
      path: defaultWorkspace,
    },
  });
});

test("inbound session creation stays blocked while the project binding is pending", async (t) => {
  const { path, defaultWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, {
    defaultWorkspace,
  }).load();
  await workspaces.ensure("bot_blocked");
  let catalog = [projectRow("project-a", defaultWorkspace, "Alpha")];
  workspaces.setProjectCatalog(async () => catalog);
  const created = [];
  const harness = {
    async createSession(options) {
      created.push(options);
      return `session-${created.length}`;
    },
    async sessionExists() {
      return true;
    },
    async ask() {
      return "answer";
    },
  };
  let persistedSession = null;
  const state = {
    sessionFor() {
      return persistedSession;
    },
    async setSession(_key, sessionId) {
      persistedSession = sessionId;
    },
    async clearSessions() {
      persistedSession = null;
    },
  };
  const scope = createBotWorkspaceScope(harness, {
    botId: "bot_blocked",
    workspaces,
    state,
  });

  const prompting = askInWorkspaceSession({
    harness: scope.harness,
    state: scope.state,
    key: "conversation",
    text: "hello",
  });
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.deepEqual(created, []);

  await workspaces.setProject("bot_blocked", "project-a", {
    clearSessions: () => state.clearSessions(),
  });
  assert.equal((await prompting).sessionId, "session-1");
  assert.deepEqual(created, [{ workspaceId: "project-a" }]);

  catalog = [];
  await workspaces.reconcileProjects({
    clearSessions: () => state.clearSessions(),
  });
  assert.equal(workspaces.workspacePendingFor("bot_blocked"), true);
  assert.equal(persistedSession, null);
  let second = false;
  const blockedAgain = scope.harness.createSession().then((sessionId) => {
    second = true;
    return sessionId;
  });
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(second, false);
  assert.equal(
    created.length,
    1,
    "no session is created while the binding is pending",
  );

  catalog = [projectRow("project-b", defaultWorkspace, "Beta")];
  await workspaces.setProject("bot_blocked", "project-b", {
    clearSessions: () => state.clearSessions(),
  });
  assert.equal(await blockedAgain, "session-2");
  assert.deepEqual(created[1], { workspaceId: "project-b" });
});

test("the scoped session proxy passes only the bound project id and strips caller targets", async (t) => {
  const { path, defaultWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, {
    defaultWorkspace,
  }).load();
  await workspaces.ensure("bot_project", { defaultAgentPreset: "standard" });
  await workspaces.ensure("bot_pending");
  workspaces.setProjectCatalog(async () => [
    projectRow("project-a", defaultWorkspace, "Alpha"),
  ]);
  await workspaces.setProject("bot_project", "project-a");
  const calls = [];
  const harness = {
    async createSession(options) {
      calls.push(options);
      return "session-project";
    },
  };
  const scope = createBotWorkspaceScope(harness, {
    botId: "bot_project",
    workspaces,
    state: { async clearSessions() {} },
  });

  assert.equal(
    await scope.harness.createSession({
      cwd: "/tmp/injected",
      workspace: "/tmp/injected",
      workspaceId: "project-spoofed",
    }),
    "session-project",
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].workspaceId, "project-a");
  assert.equal(calls[0].agentPreset, "standard");
  assert.ok(!("cwd" in calls[0]) && !("workspace" in calls[0]));

  const pendingScope = createBotWorkspaceScope(harness, {
    botId: "bot_pending",
    workspaces,
    state: { async clearSessions() {} },
  });
  await assert.rejects(
    pendingScope.harness.createSession({ signal: AbortSignal.timeout(25) }),
  );
  assert.equal(calls.length, 1, "a pending bot never reaches session.create");
});

test("inbound session reuse reconciles the catalog and re-blocks a deleted project", async (t) => {
  const { path, defaultWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, {
    defaultWorkspace,
  }).load();
  let catalog = [projectRow("project-a", defaultWorkspace, "Alpha")];
  workspaces.setProjectCatalog(async () => catalog);
  await workspaces.ensure("bot_stale");
  await workspaces.setProject("bot_stale", "project-a");
  const created = [];
  const asks = [];
  const harness = {
    async createSession(options) {
      created.push(options);
      return "session-b";
    },
    async sessionExists() {
      return true;
    },
    async ask(sessionId) {
      asks.push(sessionId);
      return "answer";
    },
  };
  let persistedSession = "session-old";
  const state = {
    sessionFor() {
      return persistedSession;
    },
    async setSession(_key, sessionId) {
      persistedSession = sessionId;
    },
    async clearSessions() {
      persistedSession = null;
    },
  };
  const scope = createBotWorkspaceScope(harness, {
    botId: "bot_stale",
    workspaces,
    state,
  });

  // The project disappears after the binding was persisted.
  catalog = [];
  let finished = false;
  const prompting = askInWorkspaceSession({
    harness: scope.harness,
    state: scope.state,
    key: "conversation",
    text: "hello",
  }).then((result) => {
    finished = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(finished, false, "a deleted project must re-block inbound work");
  assert.deepEqual(asks, [], "the stale persisted session must not be reused");
  assert.deepEqual(created, []);
  assert.equal(workspaces.workspacePendingFor("bot_stale"), true);
  assert.equal(
    persistedSession,
    null,
    "invalidation clears the bot session mapping",
  );

  catalog = [projectRow("project-b", defaultWorkspace, "Beta")];
  await workspaces.setProject("bot_stale", "project-b", {
    clearSessions: () => state.clearSessions(),
  });
  assert.equal((await prompting).sessionId, "session-b");
  assert.deepEqual(created, [{ workspaceId: "project-b" }]);
  assert.deepEqual(asks, ["session-b"]);
});

test("v2 persistence keeps leftover v1 paths until a catalog reconciliation succeeds", async (t) => {
  const { path, defaultWorkspace } = await fixture(t);
  await writeFile(
    path,
    `${JSON.stringify({
      version: 1,
      workspaces: { bot_legacy: defaultWorkspace },
    })}\n`,
  );
  const store = await new BotWorkspaceStore(path, { defaultWorkspace }).load();

  // Any pre-reconciliation write (here: a new bot) must not drop the v1 key.
  await store.ensure("bot_new");
  const saved = JSON.parse(await readFile(path, "utf8"));
  assert.equal(saved.version, 2);
  assert.equal(saved.projects.bot_legacy, null);
  assert.equal(saved.legacyPaths?.bot_legacy, defaultWorkspace);

  const reloaded = await new BotWorkspaceStore(path, {
    defaultWorkspace,
  }).load();
  reloaded.setProjectCatalog(async () => [
    projectRow("project-a", defaultWorkspace, "Alpha"),
  ]);
  await reloaded.reconcileProjects();
  assert.equal(reloaded.projectFor("bot_legacy").workspaceId, "project-a");
  assert.equal(
    "legacyPaths" in JSON.parse(await readFile(path, "utf8")),
    false,
  );
});

test("an unmatched v1 path invalidation clears sessions like a deleted v2 project", async (t) => {
  const { path, defaultWorkspace, alternateWorkspace } = await fixture(t);
  await writeFile(
    path,
    `${JSON.stringify({
      version: 1,
      workspaces: { bot_legacy: defaultWorkspace },
    })}\n`,
  );
  const store = await new BotWorkspaceStore(path, { defaultWorkspace }).load();
  const generation = store.generationFor("bot_legacy");
  const cleared = [];
  // reconcileProjects passes the botId; setProject's hook takes no argument.
  const clearSessions = async () => {
    cleared.push("bot_legacy");
  };

  // No current project owns the legacy path: the bot goes pending and its old
  // session mapping is cleared exactly like a deleted v2 binding.
  store.setProjectCatalog(async () => [
    projectRow("project-b", alternateWorkspace, "Beta"),
  ]);
  await store.reconcileProjects({ clearSessions });
  assert.equal(store.projectFor("bot_legacy"), null);
  assert.equal(store.workspacePendingFor("bot_legacy"), true);
  assert.deepEqual(cleared, ["bot_legacy"]);
  assert.notEqual(store.generationFor("bot_legacy"), generation);

  // A later explicit pick is a fresh binding, not a resume of stale sessions.
  await store.setProject("bot_legacy", "project-b", { clearSessions });
  assert.deepEqual(cleared, ["bot_legacy", "bot_legacy"]);
  assert.equal(store.projectFor("bot_legacy").workspaceId, "project-b");
});

test("workspace RPC binds an existing project by id and rejects path payloads", async (t) => {
  const { path, defaultWorkspace, alternateWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, {
    defaultWorkspace,
  }).load();
  workspaces.setProjectCatalog(async () =>
    defaultProjects(defaultWorkspace, alternateWorkspace),
  );
  await workspaces.ensure("bot_one");
  assert.equal(workspaces.workspacePendingFor("bot_one"), true);
  const base = {
    status() {
      return { bots: [{ botId: "bot_one", connected: true }] };
    },
    bindCredentials() {
      return this.status();
    },
    reconnectBot() {
      return this.status();
    },
    deleteBot() {
      return { bots: [] };
    },
  };
  const controller = createWorkspaceAwareController(base, {
    workspaces,
    stateFor: async () => ({ async clearSessions() {} }),
  });
  const handler = createTokenBotRpcHandler(controller, { channel: "Telegram" });

  // Path payloads and extra keys fail closed; only { botId, workspaceId } binds.
  for (const payload of [
    { botId: "bot_one", workspace: alternateWorkspace },
    {
      botId: "bot_one",
      workspaceId: "project-alternate",
      path: alternateWorkspace,
    },
    { botId: "bot_one" },
  ]) {
    const rejected = await handler(TOKEN_BOT_ENDPOINTS.setWorkspace, payload);
    assert.equal(rejected.ok, false, JSON.stringify(payload));
    assert.equal(rejected.error.code, "invalid-payload");
  }
  // Well-formed but unknown ids are catalog misses, not path bindings.
  for (const workspaceId of ["/tmp/project", "../escape"]) {
    const rejected = await handler(TOKEN_BOT_ENDPOINTS.setWorkspace, {
      botId: "bot_one",
      workspaceId,
    });
    assert.equal(rejected.ok, false, workspaceId);
    assert.equal(rejected.error.code, "workspace-project-not-found");
  }
  assert.equal(workspaces.workspacePendingFor("bot_one"), true);
  assert.equal(workspaces.projectFor("bot_one"), null);

  const success = await handler(TOKEN_BOT_ENDPOINTS.setWorkspace, {
    botId: "bot_one",
    workspaceId: "project-alternate",
  });
  assert.equal(success.ok, true);
  assert.equal(success.value.bots[0].workspace, alternateWorkspace);
  assert.equal(success.value.bots[0].workspaceId, "project-alternate");
  assert.equal(success.value.bots[0].workspaceTitle, "Alternate");
  assert.equal(success.value.bots[0].workspacePending, false);
  assert.equal(workspaces.workspacePendingFor("bot_one"), false);
});

test("workspace RPC reports stale and deleted project ids without mutating bindings", async (t) => {
  const { path, defaultWorkspace, alternateWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, {
    defaultWorkspace,
  }).load();
  let catalog = defaultProjects(defaultWorkspace, alternateWorkspace);
  workspaces.setProjectCatalog(async () => catalog);
  await workspaces.ensure("bot_one");
  await workspaces.setProject("bot_one", "project-default");
  let clears = 0;
  const base = {
    status() {
      return { bots: [{ botId: "bot_one", connected: true }] };
    },
    bindCredentials() {
      return this.status();
    },
    reconnectBot() {
      return this.status();
    },
    deleteBot() {
      return { bots: [] };
    },
  };
  const controller = createWorkspaceAwareController(base, {
    workspaces,
    stateFor: async () => ({
      async clearSessions() {
        clears += 1;
      },
    }),
  });
  const handler = createTokenBotRpcHandler(controller, { channel: "Telegram" });

  // A stale card still naming a deleted project is a public not-found error,
  // never a silent rebind, a pending clear, or a generic channel failure.
  catalog = catalog.filter((row) => row.workspaceId !== "project-alternate");
  const stale = await handler(TOKEN_BOT_ENDPOINTS.setWorkspace, {
    botId: "bot_one",
    workspaceId: "project-alternate",
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.error.code, "workspace-project-not-found");
  assert.equal(
    stale.error.message,
    "这个项目已不存在。请刷新后重新选择 Web 中已有项目。",
  );
  assert.equal(workspaces.projectFor("bot_one").workspaceId, "project-default");
  assert.equal(workspaces.workspacePendingFor("bot_one"), false);
  assert.equal(clears, 0);

  const unknown = await handler(TOKEN_BOT_ENDPOINTS.setWorkspace, {
    botId: "bot_one",
    workspaceId: "project-never-existed",
  });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.error.code, "workspace-project-not-found");
  assert.equal(workspaces.projectFor("bot_one").workspaceId, "project-default");
  assert.equal(clears, 0);

  // An unavailable catalog stays public and keeps the last safe binding.
  workspaces.setProjectCatalog(async () => {
    const error = new Error("connection closed");
    error.code = "harness-connect-failed";
    throw error;
  });
  const offline = await handler(TOKEN_BOT_ENDPOINTS.setWorkspace, {
    botId: "bot_one",
    workspaceId: "project-default",
  });
  assert.equal(offline.ok, false);
  assert.equal(offline.error.code, "workspace-catalog-unavailable");
  assert.equal(offline.error.message, "暂时无法读取项目列表。请稍后重试。");
  assert.equal(workspaces.projectFor("bot_one").workspaceId, "project-default");
  assert.equal(workspaces.workspacePendingFor("bot_one"), false);
});

test("publicWorkspaceError maps approved codes to canonical text and hides internal detail", () => {
  const hostile = "/private/host/path internal rpc trace";
  const expected = {
    "workspace-bot-not-found": "找不到要修改的机器人。",
    "workspace-project-missing":
      "这个机器人尚未选择项目。请先选择 Web 中已创建的项目。",
    "workspace-project-not-found":
      "这个项目已不存在。请刷新后重新选择 Web 中已有项目。",
    "workspace-catalog-unavailable": "暂时无法读取项目列表。请稍后重试。",
    "workspace-project-ambiguous":
      "多个项目指向这个路径。请在 Web 中按项目选择。",
  };
  for (const [code, message] of Object.entries(expected)) {
    assert.deepEqual(publicWorkspaceError({ code, message: hostile }), {
      code,
      message,
    });
  }
  for (const code of ["harness-rpc-rejected", "telegram-operation-failed"]) {
    assert.equal(publicWorkspaceError({ code, message: hostile }), null);
  }
});

test("synchronous status results still reconcile the live project catalog", async (t) => {
  const { path, defaultWorkspace, alternateWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, {
    defaultWorkspace,
  }).load();
  let catalog = defaultProjects(defaultWorkspace, alternateWorkspace);
  workspaces.setProjectCatalog(async () => catalog);
  await workspaces.ensure("bot_sync");
  await workspaces.setProject("bot_sync", "project-default");
  const cleared = [];
  // Production controllers expose synchronous status(); a deleted project
  // must still flip status to pending and clear sessions on the next result.
  const controller = createWorkspaceAwareController(
    {
      status() {
        return { bots: [{ botId: "bot_sync", connected: true }] };
      },
    },
    {
      workspaces,
      stateFor: async () => ({
        async clearSessions() {
          cleared.push("bot_sync");
        },
      }),
    },
  );

  catalog = catalog.filter((row) => row.workspaceId !== "project-default");
  const status = await controller.status();
  assert.equal(status.bots[0].workspacePending, true);
  assert.equal(status.bots[0].workspaceId, null);
  assert.deepEqual(cleared, ["bot_sync"]);

  // Agent Preset updates route through the same reconciliation.
  await workspaces.setProject("bot_sync", "project-alternate");
  cleared.length = 0;
  catalog = catalog.filter((row) => row.workspaceId !== "project-alternate");
  const updated = await controller.updateAgentPreset("bot_sync", null);
  assert.equal(updated.bots[0].workspacePending, true);
  assert.equal(updated.bots[0].workspaceId, null);
  assert.deepEqual(cleared, ["bot_sync"]);
});

test("instruction RPC writes the bot role and scoped ask prepends it", async (t) => {
  const { path, defaultWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, {
    defaultWorkspace,
  }).load();
  await workspaces.ensure("bot_one");
  const asks = [];
  const harness = {
    async ask(sessionId, prompt) {
      asks.push({ sessionId, prompt });
      return "ok";
    },
  };
  const scope = createBotWorkspaceScope(harness, {
    botId: "bot_one",
    workspaces,
    state: { async clearSessions() {} },
  });
  await scope.harness.ask("session-1", "你好");
  assert.equal(asks[0].prompt, "你好");

  const controller = createWorkspaceAwareController(
    {
      status() {
        return { bots: [{ botId: "bot_one", connected: true }] };
      },
      bindCredentials() {
        return this.status();
      },
      reconnectBot() {
        return this.status();
      },
      deleteBot() {
        return { bots: [] };
      },
    },
    {
      workspaces,
      stateFor: async () => ({ async clearSessions() {} }),
    },
  );
  const handler = createTokenBotRpcHandler(controller, { channel: "Telegram" });
  const saved = await handler(TOKEN_BOT_ENDPOINTS.setInstruction, {
    botId: "bot_one",
    instruction: "只做客服，不改代码。",
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.value.bots[0].instruction, "只做客服，不改代码。");

  await scope.harness.ask("session-1", "你好");
  assert.match(
    asks[1].prompt,
    /## 机器人职责\n只做客服，不改代码。\n\n## 用户消息\n你好/,
  );

  const rejected = await handler(TOKEN_BOT_ENDPOINTS.setInstruction, {
    botId: "bot_one",
    instruction: 12,
  });
  assert.equal(rejected.error.code, "bad-request");
});

test("display name RPC writes a local alias onto public bot status", async (t) => {
  const { path, defaultWorkspace } = await fixture(t);
  const workspaces = await new BotWorkspaceStore(path, {
    defaultWorkspace,
  }).load();
  await workspaces.ensure("bot_one");
  const controller = createWorkspaceAwareController(
    {
      status() {
        return {
          bots: [
            {
              botId: "bot_one",
              connected: true,
              bot: { name: "Telegram机器人", idMasked: "id••1" },
            },
          ],
        };
      },
      bindCredentials() {
        return this.status();
      },
      reconnectBot() {
        return this.status();
      },
      deleteBot() {
        return { bots: [] };
      },
    },
    {
      workspaces,
      stateFor: async () => ({ async clearSessions() {} }),
    },
  );
  const handler = createTokenBotRpcHandler(controller, { channel: "Telegram" });
  const saved = await handler(TOKEN_BOT_ENDPOINTS.setDisplayName, {
    botId: "bot_one",
    name: "  值班机器人  ",
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.value.bots[0].bot.name, "值班机器人");
  assert.equal(saved.value.bots[0].name, "值班机器人");
  assert.equal(workspaces.displayNameFor("bot_one"), "值班机器人");

  const cleared = await handler(TOKEN_BOT_ENDPOINTS.setDisplayName, {
    botId: "bot_one",
    name: null,
  });
  assert.equal(cleared.ok, true);
  assert.equal(cleared.value.bots[0].bot.name, "Telegram机器人");
  assert.equal(workspaces.displayNameFor("bot_one"), null);

  const rejected = await handler(TOKEN_BOT_ENDPOINTS.setDisplayName, {
    botId: "bot_one",
    name: 12,
  });
  assert.equal(rejected.error.code, "bad-request");
});
