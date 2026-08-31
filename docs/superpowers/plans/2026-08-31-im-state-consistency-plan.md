# IM State Consistency Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the confirmed dsh-im binding, chat-delivery, Session, Follow, and persistence races without redesigning the product.

**Architecture:** Keep the existing authoritative owners: Host controllers own provisioning, `BotWorkspaceStore` owns workspace confirmation, `ConversationStateStore` owns conversation bindings, and channel bridges own delivery. Fix each root at its existing shared seam, then let channel-specific code project that state without inventing another store or facade.

**Tech Stack:** TypeScript/JavaScript, React, DSH plugin RPC, Vitest, pnpm.

**Spec:** `docs/conventions.md` § Onboarding and first work; `plugins/im/README.md` command contracts; `docs/superpowers/specs/2026-08-31-im-workspace-onboarding-design.md` Host-authority principles.

## Global Constraints

- Work only in `/Users/codepi/Coding/dsh-plugins/.worktrees/fix-im-state-consistency` on branch `fix/im-state-consistency`.
- Use red-green-refactor for every production behavior change: add the smallest failing test, run it and confirm the expected failure, then implement.
- Do not change the unresolved product semantics of `/new` while a bot has an active Follow binding; record the existing conflict for later design discussion.
- Explicit `/session` and `/compact` must operate on the same currently resolved Session used by the next normal prompt.
- An unconfirmed workspace must block Session listing/binding and reuse as well as Session creation.
- Host state remains authoritative for provisioning; client poll state must not announce cancellation or completion that Host status contradicts.
- Do not add dependencies, stores, facades, card protocols, or push infrastructure.
- Do not change platform authentication limits, timeouts, restored-binding semantics, or product/plugin versions.
- Do not touch official `~/.dsh`, port 3080, `.dsh-home`, or port 3081 during implementation/unit verification.
- Do not edit generated `plugins/im/lib/` directly.

---

### Task 1: Make Session commands and first-work reuse honor authoritative state

**Files:**
- Modify: `plugins/im/src/channels/shared/bot-workspace-store.ts`
- Modify: `plugins/im/src/channels/shared/workspace-session.ts`
- Modify: `plugins/im/src/channels/shared/workspace-command.ts`
- Modify: `plugins/im/src/channels/shared/compact-command.ts`
- Modify: `plugins/im/src/channels/shared/text-harness-bridge.ts`
- Modify: `plugins/im/src/channels/weixin/weixin-bridge.ts`
- Modify: `plugins/im/src/channels/wecom/wecom-bridge.ts`
- Modify: `plugins/im/src/channels/feishu/bridge.ts`
- Test: `plugins/im/tests/workspace.test.ts`
- Test: `plugins/im/tests/session-bind-command.test.ts`
- Test: `plugins/im/tests/compact-command.test.ts`
- Test: `plugins/im/tests/session-follow.test.ts`

**Interfaces:**
- Existing `BotWorkspaceStore.whenWorkspaceReady(botId)` remains the only confirmation fence.
- Existing Session-resolution precedence remains Follow then conversation binding for normal prompts.
- `/session` and `/compact` consume that same resolved binding rather than reading/writing a different Session silently.
- A stale missing Follow binding is removed/reported and must not silently fall through to an older conversation Session.

- [ ] **Step 1: Add failing first-work tests**

Add an unconfirmed bot fixture which invokes Session listing/binding and then `askInWorkspaceSession`. Assert that no `listSessions`, `bindSession`, `sessionExists`, `createSession`, or `ask` side effect occurs before `setWorkspace`/confirmation resolves. A representative assertion is:

```ts
assert.deepEqual(events, []);
await workspaceStore.setWorkspace(botId, '/chosen/project');
await pending;
assert.deepEqual(events, ['list:/chosen/project', 'bind:session-id', 'ask:session-id']);
```

- [ ] **Step 2: Run the first-work tests and confirm RED**

Run:

```bash
pnpm --filter dsh-im exec vitest run tests/workspace.test.ts tests/session-bind-command.test.ts
```

Expected: Session list/bind or reuse occurs while the workspace is still unconfirmed.

- [ ] **Step 3: Put the existing confirmation fence on bind/list/reuse paths**

Use the existing `whenWorkspaceReady`/scope method before Session enumeration, Session binding, and reuse. Do not add a second pending flag. Ensure the chosen workspace value is read after the wait resolves, not captured before it.

- [ ] **Step 4: Add failing Session-resolution command tests**

Cover:

```ts
// Follow S, conversation T: /compact must compact S.
assert.equal(compactedSessionId, 'S');

// Follow S, explicit /session U: the next normal prompt must use U.
assert.equal(askedSessionId, 'U');

// Follow points at missing S while conversation points at T:
// no silent ask in T; stale Follow is cleared/reported.
assert.notEqual(askedSessionId, 'T');
```

Do not add or change a `/new`-with-Follow assertion in this task.

- [ ] **Step 5: Run Session command tests and confirm RED**

Run:

```bash
pnpm --filter dsh-im exec vitest run tests/session-bind-command.test.ts tests/compact-command.test.ts tests/session-follow.test.ts
```

Expected: commands use the conversation key while normal prompts use Follow, and stale Follow falls through to T.

- [ ] **Step 6: Reuse the existing Session-resolution seam**

Make `/compact` consume the same resolved Session as the prompt path. Make explicit `/session U` update the active binding that prompt resolution will consume. Clear stale Follow when its Session no longer exists and return a user-visible stale binding result instead of silently asking the old conversation Session. Keep `/new` unchanged.

- [ ] **Step 7: Run focused Task 1 tests**

```bash
pnpm --filter dsh-im exec vitest run \
  tests/workspace.test.ts \
  tests/session-bind-command.test.ts \
  tests/compact-command.test.ts \
  tests/session-follow.test.ts
```

Expected: all pass.

---

### Task 2: Bind Follow and persistence resources to bot lifecycle

**Files:**
- Modify: `plugins/im/src/channels/shared/session-follow.ts`
- Modify: `plugins/im/src/host/channels/shared/production.ts`
- Modify channel-specific production controllers only where they duplicate registration/disposal.
- Modify: `plugins/im/src/channels/shared/conversation-state-store.ts`
- Modify: `plugins/im/src/client/session-follow-badges.ts`
- Test: `plugins/im/tests/session-follow.test.ts`
- Test: `plugins/im/tests/session-bind-store.test.ts`
- Test: `plugins/im/tests/session-follow-badges.test.ts` or the existing client-follow test containing badge generation coverage.

**Interfaces:**
- Existing `registerFollowSource()` unregister callback becomes part of bot deletion/close.
- Existing persist queue remains the serialization mechanism; `remove()` joins it.
- Existing Host Follow generation remains monotonic at the client.
- Existing single-Follow contract is serialized; no new lock class.

- [ ] **Step 1: Add failing lifecycle and persistence tests**

Cover:

```ts
assert.equal(followSources().some((source) => source.botId === deletedBotId), false);
assert.equal(await pathExists(deletedStatePath), false); // after delayed prior persist settles
```

Also issue two concurrent Follow set operations and assert exactly one final target is active according to completion order.

- [ ] **Step 2: Run tests and confirm RED**

```bash
pnpm --filter dsh-im exec vitest run tests/session-follow.test.ts tests/session-bind-store.test.ts
```

Expected: deleted source remains registered, delayed persist can recreate state, or concurrent clear-then-set interleaves.

- [ ] **Step 3: Use existing disposal and queue seams**

Store the unregister callback alongside each bot state and call it exactly once on delete/close. Serialize Follow clear-then-set with the smallest existing promise/lock pattern in the module. Make `ConversationStateStore.remove()` enqueue deletion after prior writes rather than unlinking outside the queue.

- [ ] **Step 4: Add failing client generation test**

Apply generation 6 from watch, then generation 5 from index. Assert both rendered bindings and the next watch cursor stay at generation 6.

- [ ] **Step 5: Run the generation test and confirm RED**

Run the focused test file containing `session-follow-badges` coverage. Expected: client generation rewinds to 5.

- [ ] **Step 6: Ignore stale generations**

Before applying an index/watch snapshot, retain the current client state when `nextGeneration < currentGeneration`. Do not change Host generation semantics or polling intervals.

- [ ] **Step 7: Run focused Task 2 tests**

```bash
pnpm --filter dsh-im exec vitest run \
  tests/session-follow.test.ts \
  tests/session-bind-store.test.ts
```

Expected: all lifecycle, persistence, locking, and badge-generation cases pass.

---

### Task 3: Keep provisioning UI and registration Host-authoritative

**Files:**
- Modify: `plugins/im/src/client/channels/weixin/index.ts`
- Modify: `plugins/im/src/client/channels/wecom/index.ts`
- Modify: `plugins/im/src/client/channels/qq/index.ts`
- Modify: `plugins/im/src/client/channels/whatsapp/index.ts`
- Modify: `plugins/im/src/channels/feishu/multi-bot-controller.ts`
- Modify: `plugins/im/src/client/channels/feishu/index.ts`
- Test the existing Weixin, WeCom, QQ, WhatsApp, and Feishu client/controller suites.

**Interfaces:**
- `connection.status` bot snapshots decide when a provision UI is terminal.
- A Cancel result that reports a terminal connected Host record must reconcile instead of announcing cancellation.
- Active Weixin attempts never regress from `connecting` to `pending` due to an older silent status response.
- Feishu permits one active registration attempt; starting another cancels/invalidates the previous attempt before credentials can commit.

- [ ] **Step 1: Add failing client authority tests**

Cover:

```ts
// Poll says connected but status snapshot lacks the bot.
assert.equal(addButtonEnabled, false);
assert.equal(connectingSurfaceVisible, true);

// Weixin Host cancel response says connected.
assert.doesNotMatch(noticeText, /已取消/);
assert.ok(statusReloaded);

// Same attempt: current connecting + incoming stale pending.
assert.equal(merged.status, 'connecting');
```

Use delayed/rejected status RPCs to prove the UI does not expose a second bind surface.

- [ ] **Step 2: Run client tests and confirm RED**

```bash
pnpm --filter dsh-im exec vitest run \
  tests/weixin-client-api.test.ts \
  tests/client-lifecycle.test.ts \
  tests/channels/wecom/client-ui.test.ts \
  tests/channels/qq/client-ui.test.ts \
  tests/channels/whatsapp/client-ui.test.ts
```

Expected: QR/provision state clears too early or Weixin state regresses.

- [ ] **Step 3: Apply one existing client rule**

Follow the existing Weixin/DingTalk pattern: keep the connecting surface and Add disabled until the authoritative snapshot contains the connected bot. After Cancel, inspect/reconcile Host result before user copy. Ignore stale status regressions for an active Weixin attempt. Do not add a generic provisioning framework.

- [ ] **Step 4: Add a failing Feishu single-active test**

Start registration A, start registration B, then deliver A credentials. Assert A cannot save config/credentials or start a runtime; only B may commit.

- [ ] **Step 5: Run Feishu test and confirm RED**

Run the focused `multi-bot-controller`/registration test file. Expected: A still commits.

- [ ] **Step 6: Invalidate the prior Feishu attempt at Host start**

Use the controller's existing cancel/inactive state before assigning `#latestRegistrationId` to B. Ensure late callbacks from A fail the active-attempt check. Remove only comments/client code that falsely claims Host already supersedes attempts.

- [ ] **Step 7: Run focused Task 3 tests**

Run all modified channel client/controller test files. Expected: all pass.

---

### Task 4: Prevent Feishu and WeCom delivery loss

**Files:**
- Modify: `plugins/im/src/channels/feishu/bridge.ts`
- Modify: `plugins/im/src/channels/wecom/wecom-bridge.ts`
- Test: existing Feishu bridge/message failure tests.
- Test: existing WeCom bridge/stream tests.

**Interfaces:**
- Existing Feishu split-text sender is the overflow fallback.
- Existing shared `TextHarnessBridge` presentation coalescing is the behavioral reference for question replies.
- A WeCom `finish=false` keepalive must never complete after `finish=true` for the same stream.

- [ ] **Step 1: Add failing Feishu delivery tests**

Cover a 30,000-character completed answer and assert the split text path contains the answer even when card `setContent` rejects. Cover a delayed question-card send followed by an immediate actor answer and assert `respond(answer)` is called once, only one question is presented, and the answer message is not marked seen then discarded.

- [ ] **Step 2: Run Feishu tests and confirm RED**

Run the focused Feishu bridge/message failure files. Expected: only a failure card remains or the first question answer is dropped.

- [ ] **Step 3: Use existing fallback/coalescing behavior**

On final card overflow, call the existing split-text answer sender instead of treating the failure card as the only surface. Coalesce question presentation with one promise and retain/claim a concurrent actor answer as the shared bridge does. Do not create another card protocol.

- [ ] **Step 4: Add failing WeCom keepalive ordering test**

Hold a `finish=false` keepalive request unresolved, let processing issue `finish=true`, then release the keepalive. Assert no platform call with `finish=false` occurs after the `finish=true` call for that stream.

- [ ] **Step 5: Run WeCom test and confirm RED**

Run the focused WeCom bridge/stream test file. Expected: the detached keepalive completes after finish.

- [ ] **Step 6: Join or invalidate in-flight keepalive before final send**

Use the existing keepalive lifecycle to await or suppress the pending non-final request before sending `finish=true`. Do not add a new stream type or change the platform duration policy.

- [ ] **Step 7: Run focused Task 4 tests**

Run all modified Feishu and WeCom bridge tests. Expected: all pass.

---

### Task 5: Full validation and final review

**Files:**
- Modify only if a failing in-scope test exposes a defect.

- [ ] **Step 1: Run complete dsh-im checks**

```bash
pnpm --filter dsh-im test
pnpm --filter dsh-im typecheck
pnpm --filter dsh-im build
```

Expected: all commands exit 0.

- [ ] **Step 2: Run repository checks**

```bash
pnpm check
pnpm check:build
pnpm check:path
```

Expected: all commands exit 0. Do not weaken gates or edit unrelated plugins to hide a failure.

- [ ] **Step 3: Inspect scope and generated residue**

```bash
git diff --check origin/main...HEAD
git status --short
git diff --stat origin/main...HEAD
git log --oneline origin/main..HEAD
```

Expected: source/tests/plan plus the branch's `.gitignore` setup commit only; generated `lib/` remains ignored.

- [ ] **Step 4: Fresh-context final review**

Review all branch changes for current reachable P0/P1 issues, exact contract coverage, TDD evidence, and accidental `/new` semantic changes. Fix accepted findings once at their root, rerun affected tests, then rerun Steps 1–3.

## Deferred Design Decision

After this repair is complete, discuss one product choice separately: while a bot has an active Follow binding, should `/new` automatically clear Follow or refuse with guidance? This plan intentionally does not decide or change that behavior.
