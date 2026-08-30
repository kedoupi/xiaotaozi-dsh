# IM Workspace Onboarding Design

## Goal

Open the workspace picker as soon as a newly bound IM bot has durable credentials, a stable `botId`, and a prepared `BotWorkspaceStore` entry. Do not wait for the platform runtime to become fully connected.

The picker must also recover after a transient provisioning-poll failure, status-RPC failure, page reload, or client remount. The first inbound action must continue waiting until the user confirms a workspace.

## Problem

The current browser flow treats a successful provisioning poll as both:

1. transport progress for QR binding; and
2. the one-time trigger for required workspace onboarding.

For Weixin, WeCom, and Feishu, the client waits for the platform runtime to report `connected`, then performs another `connection.status` request, then calls the in-memory React helper `promptAfterBind()`. This creates visible delay from:

- provisioning poll intervals;
- Harness readiness checks;
- credential and config persistence;
- platform WebSocket or long-poll startup;
- platform authentication and retries;
- the final status refresh.

The same coupling creates a correctness defect. `BotWorkspaceStore` already publishes `workspacePending: true`, but client normalizers discard it. If the terminal provisioning poll is lost or the page reloads, the React prompt state is gone while `whenWorkspaceReady()` can still block the first action indefinitely.

## Design Principles

- Host state is authoritative; browser state is only a projection.
- Workspace onboarding and platform connectivity are independent state machines.
- Polling may improve latency, but correctness must not depend on one successful poll response.
- Keep the existing `BotWorkspaceStore` first-action fence.
- Do not add push infrastructure, dependencies, or a second workspace store.
- Treat one transport error as unknown progress, not a terminal provisioning failure.

## Authoritative State Contract

`BotWorkspaceStore.decorateStatus()` remains the source of `workspace` and `workspacePending`.

Every client account normalizer used by `WorkspaceEditor` must preserve:

```text
workspacePending: value.workspacePending === true
```

This applies to all `BotWorkspaceStore`-backed IM channels, not only the three reported channels. Otherwise the same lost-prompt defect remains in sibling callers of the shared workspace editor.

Bindings loaded from disk after a Host restart remain confirmed, matching the existing convention: `BotWorkspaceStore.load()` does not restore in-memory pending state.

## Picker Coordination

`WorkspaceEditor` gains an authoritative pending input. A page selects at most one pending bot at a time and passes the pending signal only to that bot's editor. This prevents multiple portals if several bots are awaiting confirmation.

The editor opens when its bot becomes pending, including on the first render after a page reload. It keeps a local latch only to avoid reopening during the short interval between a successful confirmation RPC and the next status snapshot. The latch is not the source of truth: remounting with `workspacePending: true` opens the picker again.

The existing imperative `promptAfterBind()` path is removed after all callers use the authoritative field. This is deletion rather than maintaining two competing trigger systems.

Selecting a directory awaits `bot.workspace.set`. The picker closes only after success.

Cancelling means “confirm the current provisional default”, as required by the onboarding convention. Cancellation must use the same awaited save path. If confirmation fails, the picker stays open and shows the error instead of silently leaving the Host pending.

After one pending bot is confirmed, the page may select the next pending bot from the next authoritative snapshot.

## Fast Path Before Full Connectivity

The status snapshot is the recovery path. Provisioning progress remains the latency fast path.

### Weixin

While provisioning reports `connecting`, the client performs a silent status refresh. The controller already exposes `connecting` without waiting for runtime startup. As soon as config persistence and `BotWorkspaceStore.ensure(..., { confirmWorkspace: false })` are visible in status, the account card opens the picker. `WeixinRuntime.start()` and its `ensureRunning()` / `notifyStart()` work continue in the background.

### WeCom

`WecomController.registrationStatus()` must stop awaiting the complete activation transition when the attempt is `connecting`. It returns the current non-terminal attempt immediately. The client then performs a silent status refresh while connecting. Once the decorated bot reports `workspacePending`, the picker opens while WebSocket authentication continues.

This is the only required Host control-flow change. It does not mark the bot connected early and does not bypass credential, config, or workspace-store preparation.

### Feishu

The registration status already exposes a saving/connecting phase and `botId` before the runtime handshake completes. During that phase the client performs a silent status refresh. The picker opens when the decorated bot reports `workspacePending`; the Feishu WebSocket handshake continues independently.

### Other IM Channels

Manual credential binds already return a fresh status snapshot, so preserving `workspacePending` opens the picker immediately. QR-based sibling channels gain reload and status-refresh recovery through the same authoritative field. Platform-specific latency tuning outside Weixin, WeCom, and Feishu is not part of this change.

## Poll and Recovery Behavior

For Weixin, WeCom, and Feishu:

- An explicit Host result of `failed`, `expired`, or `cancelled` remains terminal.
- A thrown RPC/transport error is non-terminal while the attempt may still be active.
- On a poll error, request a silent status reconciliation and schedule another poll using the existing channel interval.
- If reconciliation reveals a pending bot, open the picker even if the provisioning response was lost.
- Keep the existing visible status-refresh warning or equivalent retry feedback; do not report a successful connection prematurely.
- A page reload runs the normal initial status request. Any pending bot reopens the picker without needing the original provisioning attempt in browser memory.

No interval is shortened merely to mask the coupling. Existing platform intervals and limits remain unchanged.

## State Flow

The successful path becomes:

1. User confirms the platform QR flow.
2. Host validates and stores credentials and bot config.
3. Host prepares the bot workspace entry with `confirmWorkspace: false`.
4. A status snapshot exposes the bot with `workspacePending: true`.
5. Client opens the workspace picker.
6. Platform runtime startup continues concurrently.
7. User selects a directory or explicitly confirms the provisional default by cancelling.
8. `bot.workspace.set` succeeds and clears pending state.
9. Any first inbound action waiting in `whenWorkspaceReady()` resumes in the confirmed workspace.
10. Platform connectivity reaches connected independently.

The order of steps 5–6 is intentionally unconstrained after step 4.

## Failure and Race Handling

- If directory listing fails, the picker remains open and keeps its existing retry UI.
- If workspace confirmation fails, the picker remains open and the Host remains pending.
- If runtime startup fails after workspace confirmation, the bot is configured with the chosen workspace and displays its existing connection error; onboarding is not repeated.
- If runtime startup fails before confirmation, the pending picker still allows the user to establish the correct durable target for a later reconnect.
- If a bot is removed while the picker is open, `bot.workspace.set` returns `workspace-bot-not-found`; the picker shows the safe error and closes when the authoritative account disappears.
- If a status response races with a workspace mutation, the existing workspace snapshot fence prevents stale state from overwriting the mutation result.
- The first-action fence is unchanged and remains the final defense against work landing in `process.cwd()`.

## Testing Strategy

Use existing Vitest seams and add the smallest behavior-focused tests.

Shared workspace editor tests:

- authoritative pending opens the picker on initial render;
- only the selected pending bot opens;
- successful selection closes and clears through the save callback;
- cancellation awaits confirmation of the current workspace;
- failed cancellation confirmation keeps the picker open;
- remounting with pending state reopens the picker;
- confirmed state does not reopen.

Normalizer tests:

- every account normalizer used by `WorkspaceEditor` preserves `workspacePending` and defaults it to false.

Channel client tests for Weixin, WeCom, and Feishu:

- a connecting provisioning result triggers status reconciliation before `connected`;
- a pending decorated bot opens the picker without waiting for runtime connectivity;
- one transport poll failure is retried and does not become terminal;
- a reload/status-only snapshot recovers the picker without `promptAfterBind()`.

Host tests:

- WeCom `registrationStatus()` returns `connecting` without waiting for runtime authentication;
- it still reports `connected` only after the activation transition completes;
- existing `BotWorkspaceStore` first-action race tests remain green.

Verification after implementation:

```bash
pnpm --filter dsh-im test
pnpm --filter dsh-im typecheck
pnpm --filter dsh-im build
pnpm check
pnpm check:build
pnpm check:path
```

Sandbox verification is required after confirming port 3081 is free or belongs to this checkout:

1. bind Weixin, WeCom, and Feishu as a user would;
2. measure from Host workspace-pending state to picker visibility;
3. verify the picker appears before the channel reports fully connected;
4. interrupt one browser poll or reload during connecting and confirm recovery;
5. send the first real message and verify work appears only in the selected directory.

Do not touch official `~/.dsh` or port 3080.

## Non-goals

- No server-push event system for provisioning.
- No shorter global polling intervals.
- No change to platform authentication or connection timeout policy.
- No change to workspace path validation.
- No change to existing bindings restored after a Host restart.
- No plugin or product version bump.
- No unrelated IM card, streaming, or message-delivery changes.

## Main Risk

The largest risk is opening more than one picker when multiple bots are pending. The page-level “first pending bot” selection and editor latch prevent duplicate portals while retaining reload recovery. A secondary risk is reporting connection success too early; the design avoids this by changing only workspace readiness, never the channel's connected state.
