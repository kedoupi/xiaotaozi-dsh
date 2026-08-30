# IM Workspace Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open and recover the IM workspace picker from Host-authoritative pending state before Weixin, WeCom, or Feishu finishes connecting.

**Architecture:** Preserve `workspacePending` from `BotWorkspaceStore.decorateStatus()` through every client account normalizer, derive the existing workspace prompt context from current bot snapshots, and delete imperative post-bind prompt calls. Keep provisioning polling as a latency fast path: reconcile status while connecting, retry transient poll failures, and make WeCom QR polling return its connecting state without awaiting WebSocket authentication.

**Tech Stack:** TypeScript/JavaScript, React, DSH plugin RPC, Vitest, `react-test-renderer`, pnpm.

**Spec:** `docs/superpowers/specs/2026-08-31-im-workspace-onboarding-design.md`

## Global Constraints

- Work only in `/Users/codepi/.grok/worktrees/coding-dsh-plugins/im-workspace-onboarding` on branch `fix/im-workspace-onboarding`.
- Use red-green-refactor for every production behavior change.
- Host state is authoritative; browser state may latch an already-open prompt but may not invent pending state.
- Keep `BotWorkspaceStore.whenWorkspaceReady()` and workspace path validation unchanged.
- Do not add dependencies, server-push infrastructure, or another workspace store.
- Do not shorten global or platform polling intervals.
- Do not change platform authentication, connection timeout, or restored-binding semantics.
- Do not bump plugin, CLI, or product versions.
- Do not touch official `~/.dsh`, port 3080, or another checkout's port 3081.
- Do not mix IM streaming-card, delivery, or unrelated UI changes into this branch.

---

### Task 1: Make the shared workspace prompt authoritative and make cancellation durable

**Files:**
- Modify: `plugins/im/src/client/workspace-editor.ts`
- Modify: `plugins/im/tests/workspace-editor.test.ts`

**Interfaces:**
- Consumes: normalized bot rows shaped as `{ botId: string, workspacePending?: boolean }`.
- Produces: `useWorkspaceBindPrompt(bots)` returning `{ workspacePromptBotId, consumeWorkspacePrompt }`.
- Preserves: `WorkspaceBindPromptProvider` and `WorkspaceEditor` public component names so channel pages need no new provider.
- Removes: `addedBotId()` and imperative `promptAfterBind()`.

- [ ] **Step 1: Replace the `addedBotId` unit test with authoritative prompt-hook tests**

Add a small harness near the existing workspace-editor helpers:

```ts
function PromptHarness({ bots, picker, onSave = async () => {} }) {
  const { workspacePromptBotId, consumeWorkspacePrompt } = useWorkspaceBindPrompt(bots);
  return React.createElement(
    WorkspaceBindPromptProvider,
    { promptBotId: workspacePromptBotId, consume: consumeWorkspacePrompt },
    React.createElement(React.Fragment, null, ...bots.map((bot) => (
      React.createElement(WorkspaceEditor, {
        key: bot.botId,
        botId: bot.botId,
        workspace: bot.workspace,
        directoryPicker: bot.picker ?? picker,
        onSave,
      })
    ))),
  );
}
```

Import `useWorkspaceBindPrompt` instead of `addedBotId`, then add tests that prove:

```ts
test('authoritative workspacePending opens once and reopens after remount', async () => {
  const picker = { async listDirectory(path) { return directoryListing(path ?? '/workspace'); } };
  const bot = { botId: 'bot-1', workspace: '/workspace/current', workspacePending: true };
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(PromptHarness, { bots: [bot], picker }));
    await flushMicrotasks();
  });
  assert.equal(renderer.root.findAllByProps({ role: 'dialog' }).length, 1);
  await act(async () => { renderer.unmount(); });
  await act(async () => {
    renderer = create(React.createElement(PromptHarness, { bots: [bot], picker }));
    await flushMicrotasks();
  });
  assert.equal(renderer.root.findAllByProps({ role: 'dialog' }).length, 1);
});

test('confirmed state does not open the workspace picker', async () => {
  const listed = [];
  const picker = {
    async listDirectory(path) {
      listed.push(path);
      return directoryListing(path ?? '/workspace');
    },
  };
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(PromptHarness, {
      bots: [{ botId: 'bot-1', workspace: '/workspace/current', workspacePending: false }],
      picker,
    }));
    await flushMicrotasks();
  });
  assert.deepEqual(listed, []);
  assert.equal(renderer.root.findAllByProps({ role: 'dialog' }).length, 0);
});

test('the first pending bot is the only prompt candidate', async () => {
  const firstListed = [];
  const secondListed = [];
  const firstPicker = {
    async listDirectory(path) {
      firstListed.push(path);
      return directoryListing(path ?? '/workspace');
    },
  };
  const secondPicker = {
    async listDirectory(path) {
      secondListed.push(path);
      return directoryListing(path ?? '/workspace');
    },
  };
  const first = {
    botId: 'bot-1', workspace: '/workspace/first', workspacePending: true, picker: firstPicker,
  };
  const second = {
    botId: 'bot-2', workspace: '/workspace/second', workspacePending: true, picker: secondPicker,
  };
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(PromptHarness, { bots: [first, second] }));
    await flushMicrotasks();
  });
  assert.deepEqual(firstListed, [undefined]);
  assert.deepEqual(secondListed, []);
  assert.equal(renderer.root.findAllByProps({ role: 'dialog' }).length, 1);

  await act(async () => {
    buttonNamed(renderer.root, '取消').props.onClick();
    await flushMicrotasks();
  });
  assert.equal(renderer.root.findAllByProps({ role: 'dialog' }).length, 0);
  await act(async () => {
    renderer.update(React.createElement(PromptHarness, {
      bots: [{ ...first, workspacePending: false }, second],
    }));
    await flushMicrotasks();
  });
  assert.deepEqual(secondListed, [undefined]);
  assert.equal(renderer.root.findAllByProps({ role: 'dialog' }).length, 1);
});
```

Retain the existing “starts at Host home” assertion (`listed[0] === undefined`).

- [ ] **Step 2: Add a failing test that cancellation waits for Host confirmation**

Use the existing `deferred()` helper:

```ts
test('bind cancellation stays open until the provisional workspace is confirmed', async () => {
  const save = deferred();
  const picker = { async listDirectory(path) { return directoryListing(path ?? '/workspace'); } };
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(PromptHarness, {
      bots: [{ botId: 'bot-1', workspace: '/workspace/current', workspacePending: true }],
      picker,
      onSave: () => save.promise,
    }));
    await flushMicrotasks();
  });
  await act(async () => {
    buttonNamed(renderer.root, '取消').props.onClick();
    await flushMicrotasks();
  });
  assert.equal(renderer.root.findAllByProps({ role: 'dialog' }).length, 1);
  save.resolve();
  await act(async () => { await flushMicrotasks(); });
  assert.equal(renderer.root.findAllByProps({ role: 'dialog' }).length, 0);
});
```

Add a rejection case whose `onSave` throws `new Error('保存失败')`; assert the dialog remains and the error text is visible.

- [ ] **Step 3: Run the focused tests and verify they fail for the intended reasons**

Run:

```bash
cd /Users/codepi/.grok/worktrees/coding-dsh-plugins/im-workspace-onboarding
pnpm --filter dsh-im exec vitest run tests/workspace-editor.test.ts
```

Expected: failures because `useWorkspaceBindPrompt` does not accept bots, still exposes `promptAfterBind`, and cancellation closes before `onSave` settles.

- [ ] **Step 4: Implement snapshot-derived prompt selection**

Replace the old helper and hook with:

```ts
export function useWorkspaceBindPrompt(bots = []) {
  const pendingBotId = (bots ?? []).find(
    (bot) => bot?.botId && bot.workspacePending === true,
  )?.botId ?? null;
  const [consumedBotId, setConsumedBotId] = React.useState(null);

  React.useEffect(() => {
    if (!pendingBotId || (consumedBotId && consumedBotId !== pendingBotId)) {
      setConsumedBotId(null);
    }
  }, [consumedBotId, pendingBotId]);

  const consumeWorkspacePrompt = React.useCallback(() => {
    setConsumedBotId(pendingBotId);
  }, [pendingBotId]);

  return {
    workspacePromptBotId: pendingBotId && pendingBotId !== consumedBotId
      ? pendingBotId
      : null,
    consumeWorkspacePrompt,
  };
}
```

Delete `addedBotId()` and `promptAfterBind()`.

- [ ] **Step 5: Make bind cancellation use the existing awaited save path**

Keep `pick()` responsible for setting `saving`, awaiting `onSave`, retaining the dialog on error, and calling `finish()` only after success. Remove `confirmBind` and the fire-and-forget save from `finish()` so it only resets refs/state, closes, and restores focus. Add this callback after `pick()`:

```ts
const cancel = React.useCallback(() => {
  if (fromBindRef.current && workspace) {
    void pick(workspace);
    return;
  }
  finish();
}, [finish, pick, workspace]);
```

Pass `onCancel: cancel` to `WorkspaceDirectoryPicker` and update the unchanged-directory branch in `pick()` to call `finish()`.

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm --filter dsh-im exec vitest run tests/workspace-editor.test.ts
```

Expected: all workspace-editor tests pass, including cancellation rejection and remount recovery.

- [ ] **Step 7: Commit**

```bash
git add plugins/im/src/client/workspace-editor.ts plugins/im/tests/workspace-editor.test.ts
git commit -m "fix(im): derive workspace prompt from pending state"
```

---

### Task 2: Carry `workspacePending` through every workspace-capable client and remove imperative callers

**Files:**
- Create: `plugins/im/tests/workspace-pending-client.test.ts`
- Modify: `plugins/im/src/client/channels/dingtalk/api.ts`
- Modify: `plugins/im/src/client/channels/qq/api.ts`
- Modify: `plugins/im/src/client/channels/whatsapp/api.ts`
- Modify: `plugins/im/src/client/channels/shared/token-api.ts`
- Modify: `plugins/im/src/client/channels/weixin/api.ts`
- Modify: `plugins/im/src/client/channels/wecom/api.ts`
- Modify: `plugins/im/src/client/channels/feishu/api.ts`
- Modify: `plugins/im/src/client/channels/dingtalk/index.ts`
- Modify: `plugins/im/src/client/channels/qq/index.ts`
- Modify: `plugins/im/src/client/channels/whatsapp/index.ts`
- Modify: `plugins/im/src/client/channels/shared/token-channel.ts`
- Modify: `plugins/im/src/client/channels/weixin/index.ts`
- Modify: `plugins/im/src/client/channels/wecom/index.ts`
- Modify: `plugins/im/src/client/channels/feishu/index.ts`

**Interfaces:**
- Consumes: Host bot rows decorated with `workspacePending?: boolean`.
- Produces: every normalized bot row has `workspacePending: boolean`.
- Consumes from Task 1: `useWorkspaceBindPrompt(model.bots)`.
- Removes from channel clients: `addedBotId` imports and every `promptAfterBind(...)` call.

- [ ] **Step 1: Write one cross-channel failing contract test**

Create `plugins/im/tests/workspace-pending-client.test.ts` with aliased imports for the six direct normalizers and `createTokenChannelApi`. Define the complete safe fixtures and assertions:

```ts
// @ts-nocheck
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { normalizeSnapshot as normalizeDingtalk } from '../src/client/channels/dingtalk/api.ts';
import { normalizeSnapshot as normalizeQq } from '../src/client/channels/qq/api.ts';
import { normalizeSnapshot as normalizeWhatsapp } from '../src/client/channels/whatsapp/api.ts';
import { createTokenChannelApi } from '../src/client/channels/shared/token-api.ts';
import { normalizeSnapshot as normalizeWeixin } from '../src/client/channels/weixin/api.ts';
import { normalizeSnapshot as normalizeWecom } from '../src/client/channels/wecom/api.ts';
import { normalizeBotsSnapshot as normalizeFeishu } from '../src/client/channels/feishu/api.ts';

const rows = {
  dingtalk: { botId: 'ding_test', connected: false, state: 'connecting', bot: { name: 'Ding' } },
  qq: { botId: 'qq_test', connected: false, state: 'connecting', bot: { name: 'QQ' } },
  whatsapp: { botId: 'wa_test', connected: false, state: 'connecting', bot: { name: 'WA' } },
  token: { botId: 'token_test', connected: false, state: 'connecting', bot: { name: 'Token' } },
  weixin: { botId: 'wx_test', connected: false, state: 'connecting', configured: true, bot: { name: 'WX' } },
  wecom: { botId: 'wecom_test', connected: false, state: 'connecting', bot: { name: 'WeCom' } },
  feishu: { botId: 'feishu_test', connected: false, state: 'connecting', configured: true, bot: { name: 'Feishu' } },
};

function normalizedBots(workspacePending) {
  const workspace = '/workspace/default';
  const pending = workspacePending === undefined ? {} : { workspacePending };
  const tokenApi = createTokenChannelApi('Discord', ' Gateway 长连接');
  return [
    normalizeDingtalk({ bots: [{ ...rows.dingtalk, workspace, ...pending }] }).bots[0],
    normalizeQq({ bots: [{ ...rows.qq, workspace, ...pending }] }).bots[0],
    normalizeWhatsapp({ bots: [{ ...rows.whatsapp, workspace, ...pending }] }).bots[0],
    tokenApi.normalizeSnapshot({ bots: [{ ...rows.token, workspace, ...pending }] }).bots[0],
    normalizeWeixin({ bots: [{ ...rows.weixin, workspace, ...pending }] }).bots[0],
    normalizeWecom({ bots: [{ ...rows.wecom, workspace, ...pending }] }).bots[0],
    normalizeFeishu({ schemaVersion: 2, bots: [{ ...rows.feishu, workspace, ...pending }] }).bots[0],
  ];
}

test('workspace-capable client normalizers preserve Host pending state', () => {
  assert.deepEqual(normalizedBots(true).map((bot) => bot.workspacePending), Array(7).fill(true));
});

test('missing workspacePending normalizes to false', () => {
  assert.deepEqual(normalizedBots(undefined).map((bot) => bot.workspacePending), Array(7).fill(false));
});
```

Use valid bot IDs and the minimum `bot` object required by each existing normalizer; do not copy secrets into fixtures.

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
pnpm --filter dsh-im exec vitest run tests/workspace-pending-client.test.ts
```

Expected: strict-equality failures because all normalizers currently drop the property.

- [ ] **Step 3: Preserve the boolean in all seven normalization paths**

Add exactly this field beside `workspace` in each normalized bot return object:

```ts
workspacePending: value.workspacePending === true,
```

For Feishu, add it in `normalizeBotConnection(value, fallbackBotId)`. Do not pass through arbitrary Host fields.

- [ ] **Step 4: Switch every channel page to the authoritative hook**

In each listed channel page, change:

```ts
const { workspacePromptBotId, promptAfterBind, consumeWorkspacePrompt } = useWorkspaceBindPrompt();
```

to:

```ts
const { workspacePromptBotId, consumeWorkspacePrompt } = useWorkspaceBindPrompt(model.bots);
```

Delete `addedBotId` imports and delete only the `promptAfterBind(...)` statements. Keep surrounding status merges, announcements, focus behavior, and provisioning cleanup unchanged.

- [ ] **Step 5: Verify no imperative trigger remains**

Run:

```bash
rg -n "promptAfterBind|addedBotId" plugins/im/src/client
```

Expected: no matches.

- [ ] **Step 6: Run focused and client suites**

Run:

```bash
pnpm --filter dsh-im exec vitest run \
  tests/workspace-editor.test.ts \
  tests/workspace-pending-client.test.ts \
  tests/channels/dingtalk/client-api.test.ts \
  tests/channels/qq/client-api.test.ts \
  tests/channels/whatsapp/client-ui.test.ts \
  tests/channels/telegram/client-ui.test.ts \
  tests/channels/discord/client-ui.test.ts \
  tests/channels/weixin/client-api.test.ts \
  tests/channels/wecom/client-api.test.ts \
  tests/channels/feishu/client-api.test.ts
```

Expected: all listed files pass.

- [ ] **Step 7: Commit**

```bash
git add \
  plugins/im/src/client/channels/dingtalk/api.ts \
  plugins/im/src/client/channels/qq/api.ts \
  plugins/im/src/client/channels/whatsapp/api.ts \
  plugins/im/src/client/channels/shared/token-api.ts \
  plugins/im/src/client/channels/weixin/api.ts \
  plugins/im/src/client/channels/wecom/api.ts \
  plugins/im/src/client/channels/feishu/api.ts \
  plugins/im/src/client/channels/dingtalk/index.ts \
  plugins/im/src/client/channels/qq/index.ts \
  plugins/im/src/client/channels/whatsapp/index.ts \
  plugins/im/src/client/channels/shared/token-channel.ts \
  plugins/im/src/client/channels/weixin/index.ts \
  plugins/im/src/client/channels/wecom/index.ts \
  plugins/im/src/client/channels/feishu/index.ts \
  plugins/im/tests/workspace-pending-client.test.ts
git commit -m "fix(im): preserve pending workspace onboarding"
```

---

### Task 3: Reconcile Weixin workspace state while connecting and retry transient polls

**Files:**
- Modify: `plugins/im/src/client/channels/weixin/index.ts`
- Modify: `plugins/im/tests/channels/weixin/client-api.test.ts`

**Interfaces:**
- Consumes from Task 2: `normalizeSnapshot()` rows with `workspacePending` and the authoritative prompt hook.
- Preserves: existing `createPollScheduler`, `pollIntervalMs`, explicit terminal status handling, and `connection.status` workspace fence.
- Produces: a silent status refresh for `connecting` and after a thrown poll error.

- [ ] **Step 1: Add failing status-only recovery and connecting fast-path tests**

Import `WEIXIN_ENDPOINTS` and `WorkspaceDirectoryPickerContext`. Add a `directoryListing()` fixture matching the shared editor test.

First add a reload/remount recovery test whose only RPC response is `WEIXIN_ENDPOINTS.status` with one disconnected `wx_new` bot carrying `workspacePending:true`. Render under the picker provider, flush the initial load, assert one dialog, and assert no `beginProvisioning` or `pollProvisioning` call occurred.

Then install a fake `window.setTimeout` that queues callbacks in insertion order. Configure a second test's `rpcCall` with this exact progression:

```ts
let pollCalls = 0;
let statusCalls = 0;
const calls = [];
const rpcCall = async (endpoint, payload) => {
  calls.push({ endpoint, payload });
  if (endpoint === WEIXIN_ENDPOINTS.status) {
    statusCalls += 1;
    return { ok: true, value: {
      revision: statusCalls,
      bots: statusCalls < 3 ? [] : [{
        botId: 'wx_new', connected: false, state: 'connecting', configured: true,
        workspace: '/workspace/default', workspacePending: true,
        bot: { name: '微信机器人', accountIdMasked: 'wx•••new' },
        health: { summary: '微信连接当前离线' },
      }],
    } };
  }
  if (endpoint === WEIXIN_ENDPOINTS.beginProvisioning) return { ok: true, value: {
    attemptId: 'attempt_1', status: 'pending', expiresAt: Date.now() + 60_000,
    pollIntervalMs: 1_000, qrCodeDataUrl: 'data:image/png;base64,AAAA',
  } };
  if (endpoint === WEIXIN_ENDPOINTS.pollProvisioning) {
    pollCalls += 1;
    if (pollCalls === 1) throw new Error('temporary transport failure');
    return { ok: true, value: {
      attemptId: 'attempt_1', status: 'connecting', expiresAt: Date.now() + 60_000,
      pollIntervalMs: 1_000,
    } };
  }
  throw new Error(`Unexpected endpoint: ${endpoint}`);
};
```

Render the tab under a picker provider, click `生成微信二维码`, execute the first queued timeout, and assert no terminal error plus another timeout. Execute the second timeout and assert:

```ts
assert.doesNotMatch(textOf(renderer.root), /微信没有绑定完成/);
assert.ok(calls.filter(({ endpoint }) => endpoint === WEIXIN_ENDPOINTS.status).length >= 3);
assert.equal(renderer.root.findAllByProps({ role: 'dialog' }).length, 1);
assert.match(textOf(renderer.root), /正在连接/);
```

The picker fixture returns `directoryListing('/workspace')` and never exposes local paths or credentials.

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm --filter dsh-im exec vitest run tests/channels/weixin/client-api.test.ts
```

Expected: no status reconciliation on `connecting`, and the catch path currently changes provisioning to `failed` without scheduling another poll.

- [ ] **Step 3: Add the connecting status reconciliation**

In the provisioning poll effect, after normalizing a non-terminal result and before scheduling the next poll:

```ts
if (result.status === 'connecting') {
  await loadStatus({
    signal: controller.signal,
    silent: true,
    restoreProvisioning: false,
  });
  if (scheduler.disposed) return;
}
```

Do not require the returned account to be `connected`; the authoritative hook reacts to `workspacePending`.

- [ ] **Step 4: Retry thrown poll errors without declaring terminal failure**

Replace the catch mutation to `status: 'failed'` with:

```ts
} catch (error) {
  if (scheduler.disposed || error?.name === 'AbortError') return;
  await loadStatus({
    signal: controller.signal,
    silent: true,
    restoreProvisioning: false,
  });
  if (scheduler.disposed) return;
  announce('微信绑定状态暂时无法刷新，正在重试。');
  scheduler.schedule(poll, provision.pollIntervalMs ?? 1_000);
}
```

Explicit `failed`, `expired`, and `cancelled` values returned by the Host remain handled by the normal result path.

- [ ] **Step 5: Run focused tests**

Run:

```bash
pnpm --filter dsh-im exec vitest run tests/channels/weixin/client-api.test.ts tests/workspace-editor.test.ts
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add plugins/im/src/client/channels/weixin/index.ts plugins/im/tests/channels/weixin/client-api.test.ts
git commit -m "fix(im): open Weixin workspace while connecting"
```

---

### Task 4: Make WeCom QR completion non-blocking and recover its client poll

**Files:**
- Modify: `plugins/im/src/channels/wecom/wecom-controller.ts`
- Modify: `plugins/im/src/client/channels/wecom/index.ts`
- Modify: `plugins/im/tests/channels/wecom/controller-and-rpc.test.ts`
- Modify: `plugins/im/tests/channels/wecom/client-ui.test.ts`

**Interfaces:**
- Produces: `WecomController.registrationStatus(attemptId)` returns `{ status: 'connecting' }` after QR success without awaiting `runtime.start()`.
- Preserves: `record.transition` for cancellation and terminal convergence; `connected` remains visible only after activation completes.
- Consumes from Task 2: status snapshots with `workspacePending`.

- [ ] **Step 1: Add a failing controller test around a deferred runtime start**

Add a local `deferred()` helper, then use complete in-test stubs so the runtime handshake can stay pending without a production abstraction:

```ts
test('Enterprise WeChat exposes connecting before runtime authentication completes', async () => {
  const runtimeStarted = deferred();
  const runtimeReady = deferred();
  onTestFinished(() => runtimeReady.resolve());
  const values = new Map();
  const configs = [];
  const runtimeStatus = {
    ready: false, wecomConnectionState: 'connecting', harnessReachable: true,
  };
  const controller = new WecomController({
    qrAuth: {
      start: async () => ({
        scode: 'host-only-code',
        verificationUrl: 'https://work.weixin.qq.com/ai/qc/auth?ticket=opaque',
        expiresAt: Date.now() + 10_000,
        pollIntervalMs: 500,
      }),
      poll: async () => ({
        status: 'success', remoteBotId: 'remote-bot', secret: 'private-secret', name: '企微客服',
      }),
    },
    credentials: {
      resolve: async (ref) => values.has(ref) ? { value: values.get(ref) } : undefined,
      set: async (ref, value) => values.set(ref, value),
      unset: async (ref) => values.delete(ref),
    },
    configStore: {
      list: () => [...configs],
      get: (id) => configs.find((value) => value.botId === id) ?? null,
      getByRemoteBotId: (id) => configs.find((value) => value.remoteBotId === id) ?? null,
      save: async (value) => { configs.splice(0, configs.length, value); },
      remove: async () => null,
    },
    createRuntime: async () => ({
      get status() { return { ...runtimeStatus }; },
      async start() {
        runtimeStarted.resolve();
        await runtimeReady.promise;
        runtimeStatus.ready = true;
        runtimeStatus.wecomConnectionState = 'connected';
      },
      async stop() {},
    }),
  });
  const started = await controller.startProvisioning();
  const statusPromise = controller.registrationStatus(started.attemptId);
  await runtimeStarted.promise;
  const connecting = await Promise.race([
    statusPromise,
    new Promise((resolve) => setTimeout(() => resolve(null), 100)),
  ]);
  assert.equal(connecting?.status, 'connecting');
  assert.equal(controller.status().bots[0].connected, false);

  runtimeReady.resolve();
  await vi.waitFor(() => assert.equal(controller.status().bots[0].connected, true));
  assert.equal((await controller.registrationStatus(started.attemptId)).status, 'connected');
  await controller.close();
});
```

- [ ] **Step 2: Run the controller test and verify it blocks/fails**

Run:

```bash
pnpm --filter dsh-im exec vitest run tests/channels/wecom/controller-and-rpc.test.ts
```

Expected: the test does not obtain `connecting` until `runtimeReady` resolves.

- [ ] **Step 3: Stop awaiting activation inside registration polling**

In `registrationStatus()` return `publicAttempt(record)` immediately when `record.state === 'connecting'`.

In `#pollAttempt()`, retain the transition but do not await it in the request that discovered QR success:

```ts
const transition = this.#completeProvisioning(record, result);
record.transition = transition;
void transition.catch(() => undefined);
```

`#completeProvisioning()` already records terminal success/failure and calls `#finishAttempt()`. Keep `cancelProvisioning()` awaiting `record.transition`.

- [ ] **Step 4: Run the controller suite**

Run:

```bash
pnpm --filter dsh-im exec vitest run tests/channels/wecom/controller-and-rpc.test.ts tests/channels/wecom/config-and-qr.test.ts
```

Expected: all pass; `connecting` is observable before `connected`.

- [ ] **Step 5: Add failing WeCom client tests for reconciliation and retry**

Import `WECOM_ENDPOINTS` and `WorkspaceDirectoryPickerContext`. First add a status-only recovery test: return a first `WECOM_ENDPOINTS.status` snapshot containing one disconnected `wecom_new` bot with `workspacePending:true`, render under the picker provider, flush, assert one dialog, and assert no provisioning endpoint was called.

Then queue callbacks from `window.setTimeout`; use a second test whose `rpcCall` returns these values in order:

```ts
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
        bot: { name: '企业微信客服', remoteBotIdMasked: 'wecom•••new' },
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
```

Render `WecomSettingsTab` under a picker provider, click `生成企业微信二维码`, run the failed poll timeout, and assert another timeout exists without `机器人没有绑定完成`. Run the next timeout and assert:

```ts
assert.ok(statusCalls >= 3);
assert.equal(renderer.root.findAllByProps({ role: 'dialog' }).length, 1);
assert.match(textOf(renderer.root), /正在连接/);
```

- [ ] **Step 6: Run client tests and verify they fail**

Run:

```bash
pnpm --filter dsh-im exec vitest run tests/channels/wecom/client-ui.test.ts
```

Expected: connecting does not refresh status and a thrown poll currently becomes terminal `failed`.

- [ ] **Step 7: Reconcile and retry in the WeCom client**

When `current.status === 'connecting'`, call:

```ts
await loadStatus({ signal: controller.signal, silent: true });
if (disposed || controller.signal.aborted || !mounted.current) return;
```

Then keep the existing state merge and timer scheduling.

In the catch path, do not set `status: 'failed'`. Reconcile status, retain the current provisioning record, announce a temporary retry message, and schedule `poll` with `provision.pollIntervalMs ?? 1_000` unless disposed/aborted.

- [ ] **Step 8: Run focused tests**

Run:

```bash
pnpm --filter dsh-im exec vitest run \
  tests/channels/wecom/controller-and-rpc.test.ts \
  tests/channels/wecom/config-and-qr.test.ts \
  tests/channels/wecom/client-api.test.ts \
  tests/channels/wecom/client-ui.test.ts
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add \
  plugins/im/src/channels/wecom/wecom-controller.ts \
  plugins/im/src/client/channels/wecom/index.ts \
  plugins/im/tests/channels/wecom/controller-and-rpc.test.ts \
  plugins/im/tests/channels/wecom/client-ui.test.ts
git commit -m "fix(im): decouple WeCom workspace from authentication"
```

---

### Task 5: Reconcile Feishu workspace state while its WebSocket starts

**Files:**
- Modify: `plugins/im/src/client/channels/feishu/index.ts`
- Modify: `plugins/im/tests/channels/feishu/connection-test-client.test.ts`

**Interfaces:**
- Consumes: Feishu provision poll result `{ status: 'connecting', operation: 'provision', botId }`.
- Consumes from Task 2: `normalizeBotsSnapshot()` rows with `workspacePending`.
- Preserves: callback-repair and group-message-permission flows, their cancel semantics, and Feishu polling interval.

- [ ] **Step 1: Add failing status-only recovery and initial-provision tests**

Reuse the file's existing fake window implementation and wrap `FeishuSettingsTab` in `WorkspaceDirectoryPickerContext`.

First add a status-only recovery test: the first `FEISHU_ENDPOINTS.status` response contains one disconnected/configured `bot_new` row with `workspacePending:true`. After initial render, assert one dialog and assert no provisioning endpoint was called.

Then configure a second test with:

```ts
let pollCalls = 0;
let statusCalls = 0;
const rpcCall = async (endpoint) => {
  if (endpoint === FEISHU_ENDPOINTS.status) {
    statusCalls += 1;
    return { ok: true, value: {
      schemaVersion: 2,
      revision: statusCalls,
      state: 'connecting',
      bots: statusCalls < 3 ? [] : [{
        botId: 'bot_new', connected: false, state: 'connecting', configured: true,
        workspace: '/workspace/default', workspacePending: true,
        bot: { name: '新机器人', appIdMasked: 'cli_new••••0001' },
        health: { status: 'offline', summary: '机器人尚未连接' },
      }],
    } };
  }
  if (endpoint === FEISHU_ENDPOINTS.beginProvisioning) return { ok: true, value: {
    attemptId: 'reg_new', operation: 'provision',
    verificationUrl: 'https://open.feishu.cn/page/launcher?tp=sdk&clientID=cli_new',
    qrCodeDataUrl: 'data:image/png;base64,AAAA',
    expiresAt: Date.now() + 60_000, pollIntervalMs: 800,
  } };
  if (endpoint === FEISHU_ENDPOINTS.pollProvisioning) {
    pollCalls += 1;
    if (pollCalls === 1) throw new Error('temporary transport failure');
    return { ok: true, value: {
      status: 'connecting', operation: 'provision', botId: 'bot_new',
    } };
  }
  throw new Error(`Unexpected endpoint: ${endpoint}`);
};
```

Click `扫码接入机器人`, run the first scheduled timeout, and assert the UI does not contain `飞书应用创建失败` and another timeout exists. Run the second timeout, flush microtasks, then assert:

```ts
assert.ok(statusCalls >= 3);
assert.equal(renderer.root.findAllByProps({ role: 'dialog' }).length, 1);
assert.match(textOf(renderer.toJSON()), /正在连接/);
```

No `provision.poll` response in this test returns `connected`.

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm --filter dsh-im exec vitest run tests/channels/feishu/connection-test-client.test.ts
```

Expected: status is refreshed only after `connected`, and the catch path currently converts the attempt to an error panel.

- [ ] **Step 3: Reconcile initial provisioning on `connecting`**

After normalizing a `connecting` result, and only when `provision.operation === FEISHU_REGISTRATION_OPERATIONS.PROVISION`, call:

```ts
await loadStatus({
  signal: controller.signal,
  silent: true,
  restoreProvisioning: false,
});
if (controller.signal.aborted) return;
```

Continue updating the provisioning phase to `connecting`; do not mark the bot connected and do not change callback-repair/group-permission behavior.

- [ ] **Step 4: Make thrown poll errors retryable**

In the catch path:

1. return immediately for `AbortError`;
2. run the same silent status reconciliation;
3. announce `飞书绑定状态暂时无法刷新，正在重试。`;
4. clone the still-current provisioning object in `setModel` so the existing effect schedules its next timeout;
5. do not set `phase: 'error'` for the transport exception.

The retry mutation must keep the same `attemptId` and operation:

```ts
setModel((current) => current.provisioning?.attemptId === provision.attemptId
  ? { ...current, provisioning: { ...current.provisioning } }
  : current);
```

Explicit Host `status: 'failed'` and `status: 'expired'` handling remains unchanged.

- [ ] **Step 5: Run Feishu client tests**

Run:

```bash
pnpm --filter dsh-im exec vitest run \
  tests/channels/feishu/client-api.test.ts \
  tests/channels/feishu/connection-test-client.test.ts
```

Expected: all pass, including existing callback repair and stale-attempt recovery.

- [ ] **Step 6: Commit**

```bash
git add plugins/im/src/client/channels/feishu/index.ts plugins/im/tests/channels/feishu/connection-test-client.test.ts
git commit -m "fix(im): open Feishu workspace while connecting"
```

---

### Task 6: Full verification and sandbox first-action check

**Files:**
- Modify only if a test reveals a defect in this approved scope.
- Do not modify the spec or plan to hide a failed check.

**Interfaces:**
- Consumes: all behavior and commits from Tasks 1–5.
- Produces: verified unit/build evidence and explicit sandbox residuals.

- [ ] **Step 1: Run static residue and diff checks**

Run:

```bash
if rg -n "promptAfterBind|addedBotId" plugins/im/src/client; then
  echo "imperative workspace prompt residue found" >&2
  exit 1
fi
git diff origin/main...HEAD --check
git status --short
```

Expected: no imperative prompt matches, no whitespace errors, and no uncommitted files before sandbox work.

- [ ] **Step 2: Run the complete IM plugin gate**

Run:

```bash
pnpm --filter dsh-im test
pnpm --filter dsh-im typecheck
pnpm --filter dsh-im build
```

Expected: all commands exit 0.

- [ ] **Step 3: Run repository gates required by the spec**

Run:

```bash
pnpm check
pnpm check:build
pnpm check:path
```

Expected: all commands exit 0. If an existing unrelated failure appears, record the exact command/output and stop instead of changing unrelated code.

- [ ] **Step 4: Confirm sandbox ownership before starting it**

Follow `docs/workflow.md` § Dev environment. Confirm port 3081 is free or already marked for this exact worktree. If another checkout owns it, stop and report; do not steal the port.

- [ ] **Step 5: Start this worktree's sandbox and persistent journey monitor**

Run `pnpm dev` from this worktree with the repository-prescribed background/no-wrapper-timeout setup. Monitor the new log for `journey event=.*break=1` and inspect `.dsh-home/traces/YYYY-MM-DD.jsonl`. Do not inspect or restart official port 3080.

- [ ] **Step 6: Verify Weixin, WeCom, and Feishu as a user would**

For each channel:

1. start a new QR bind;
2. confirm on the mobile/platform page;
3. record when the Host status first shows `workspacePending` and when the picker becomes visible;
4. verify the picker appears while the bot card may still say connecting;
5. choose a disposable project directory;
6. send the first real message;
7. confirm the new session/work appears only in that directory, never this repository or provisional `process.cwd()`.

- [ ] **Step 7: Verify recovery**

During one bind, reload the browser or interrupt one provisioning poll after platform confirmation. Verify the normal status snapshot reopens the pending picker. Confirm a failed workspace save leaves the picker open and a later retry succeeds.

- [ ] **Step 8: Review the final diff**

Run:

```bash
git diff --stat origin/main...HEAD
git diff origin/main...HEAD -- plugins/im/src plugins/im/tests
git log --oneline origin/main..HEAD
```

Check that changes are limited to workspace onboarding, three provisioning fast paths, tests, spec, and plan.

If Steps 2–7 expose an in-scope defect, return to the task that owns that file, add a failing regression test, make the smallest fix, rerun that task's focused and final gates, and commit only its listed files. Otherwise create no empty commit.
