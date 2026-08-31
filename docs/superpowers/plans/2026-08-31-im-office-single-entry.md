# IM Office Single-Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every user-facing WeCom office action into the corresponding `dsh-im` robot card while keeping `dsh-wecom-office` as the hidden host/tools package.

**Architecture:** `dsh-im` owns the only UI and calls the existing same-origin loopback office route. `dsh-wecom-office` keeps CLI/auth/tools/state, makes bot switching rollback-safe, and stops registering a settings client. No shared package or generic integration abstraction is added.

**Tech Stack:** TypeScript, React 18 without JSX in `dsh-im`, Cordis, Vitest, tsdown, Node.js `^22.19.0 || >=24.0.0`

**Spec:** `docs/superpowers/specs/2026-08-31-im-office-single-entry-design.md`

## Global Constraints

- Work only on branch `feat/im-office-single-entry`; do not touch official `~/.dsh` or port 3080.
- Keep `dsh-im` and `dsh-wecom-office` as separate Git-path-installable packages.
- Do not add `packages/`, a shared workspace package, or a generic capability framework.
- Preserve `$DSH_HOME/plugins/wecom-office`, package ids, patch ids, and all `wecom_*` tool names.
- Secret, `secretRef`, raw remote Bot ID, and CLI credentials must never enter browser responses or logs.
- The user deferred sandbox 3081 and real-account validation; run automated tests/build gates only and report manual verification as outstanding.
- Do not bump product or plugin versions.

---

### Task 1: Make office identity switching rollback-safe and narrow the host contract

**Files:**
- Modify: `plugins/wecom-office/tests/office-controller.test.ts`
- Modify: `plugins/wecom-office/src/office-controller.ts`
- Modify: `plugins/wecom-office/src/status-route.ts`
- Modify: `plugins/wecom-office/src/office-types.ts`
- Modify: `plugins/wecom-office/src/names.ts`
- Modify: `plugins/wecom-office/src/settings.ts`
- Delete: `plugins/wecom-office/tests/qr-auth.test.ts`
- Delete: `plugins/wecom-office/src/qr-auth.ts`

**Interfaces:**
- Consumes: existing `OfficeController.activate(botId, imAvailable)` and `CredentialStore.resolve(ref)`.
- Produces: `OfficeController.activate(botId, true)` that commits a new `activeBotId` only after successful auth and re-authenticates the previous identity after a failed switch.
- Produces: loopback actions `status`, `activate`, and `configure`; `select`, `qrStart`, `qrPoll`, `qrCancel`, `bindManual`, and `clearStandalone` are no longer accepted.
- Preserves: old standalone settings parsing for read compatibility.

- [ ] **Step 1: Add the failing rollback test**

Update the fake auth helper so `authInit` can fail selected remote bot ids and records every attempt:

```ts
function fakeAuth(state: {
  authorized: boolean;
  inits: string[];
  fail?: Set<string>;
}) {
  return {
    cliVersion: async () => "1.2.0",
    authStatus: async () => state.authorized ? "authorized" as const : "unauthorized" as const,
    authInit: async (options: { remoteBotId: string }) => {
      state.inits.push(options.remoteBotId);
      if (state.fail?.has(options.remoteBotId)) {
        state.authorized = false;
        throw new Error("target auth failed");
      }
      state.authorized = true;
    },
    clearCliCredentials: async () => { state.authorized = false; },
  };
}
```

Add a test with IM bots `old-bot` and `new-bot`, active identity `old-bot`, both secrets in `memoryCredentials`, and `new-bot` configured to fail. Assert:

```ts
expect(state.inits).toEqual(["new-bot", "old-bot"]);
expect(settings.activeBotId).toBe(old.botId);
expect(settings.activeIdentity?.botId).toBe(old.botId);
expect(snapshot.activeBotId).toBe(old.botId);
expect(snapshot.lastError?.code).toBeDefined();
expect(state.authorized).toBe(true);
```

Add a second test where rollback also fails and assert `authorized === false` and the snapshot does not report a healthy active state.

- [ ] **Step 2: Run the controller tests and confirm the new tests fail**

Run:

```bash
pnpm --filter dsh-wecom-office test -- office-controller.test.ts
```

Expected: the failed target is attempted once; the old identity is not yet re-authenticated.

- [ ] **Step 3: Implement minimal rollback in `OfficeController.activate`**

Before target auth, capture `settings.activeIdentity`. On target failure:

```ts
const previous = settings.activeIdentity;
try {
  const target = await this.#resolveBot(botId, settings);
  await this.#authenticate(target, settings);
  await this.#writeSettings?.({ activeBotId: target.botId, activeIdentity: target });
} catch (error) {
  this.#lastError = publicErrorMessage(error);
  if (previous && previous.botId !== botId) {
    await this.#authenticate(previous, settings).catch((rollbackError) => {
      this.#lastError = publicErrorMessage(rollbackError);
    });
  }
}
```

Extract only the duplicated credential lookup + `authInit` block into a private `#authenticate(identity, settings)` method. Do not create a new public abstraction.

- [ ] **Step 4: Delete unsupported standalone mutation flows**

Remove controller QR attempt state, QR constructor dependencies, and methods:

```text
bindManual
qrStart
qrPoll
qrCancel
clearStandalone
select
```

Keep `StandaloneBot`, `activeIdentity`, and parsing of old overlay data so existing credentials are not destroyed. Remove the matching status-route actions and QR constants. Unknown old actions must return the existing `400 unknown action` response.

- [ ] **Step 5: Update controller tests for the supported product contract**

Delete tests for manual binding and QR creation. Keep and adapt tests for:

- missing CLI;
- activating an IM bot;
- retaining an old stored identity when IM is absent;
- clearing an active IM identity when that bot disappears;
- `allowWrite` configuration.

- [ ] **Step 6: Run office unit tests**

Run:

```bash
pnpm --filter dsh-wecom-office test
```

Expected: all remaining office tests pass.

- [ ] **Step 7: Commit the host contract**

```bash
git add plugins/wecom-office/src plugins/wecom-office/tests
git commit -m "refactor(wecom-office): narrow office activation contract"
```

---

### Task 2: Add the office loopback client and robot-card controls to `dsh-im`

**Files:**
- Create: `plugins/im/src/client/channels/wecom/office-api.ts`
- Create: `plugins/im/tests/channels/wecom/office-api.test.ts`
- Modify: `plugins/im/src/client/channels/wecom/index.ts`
- Modify: `plugins/im/src/client/channels/wecom/styles.ts`
- Modify: `plugins/im/src/client/i18n.ts`
- Modify: `plugins/im/tests/channels/wecom/client-ui.test.ts`
- Modify: `plugins/im/tests/client-ui.test.ts`

**Interfaces:**
- Produces: `callOffice(action, payload?, fetchImpl?)` for same-origin POST requests.
- Produces: `normalizeOfficeStatus(value)` that returns only safe browser fields.
- `WecomSettingsTab` gains optional `officeCall` injection for tests; production defaults to `callOffice`.
- `AccountCard` gains `office`, `officeBusy`, `officeError`, `onOfficeActivate`, `onOfficeConfigure`, and `onOfficeRefresh` props.

- [ ] **Step 1: Write failing office API normalization tests**

Create tests for a valid status and invalid/error response:

```ts
const status = normalizeOfficeStatus({
  ok: true,
  cliInstalled: true,
  mainStatus: "active",
  activeBotId: "wecom_a",
  authorized: true,
  allowWrite: false,
  cliPath: "wecom-cli",
  configDir: "/safe/path",
  bots: [],
});
expect(status.activeBotId).toBe("wecom_a");
expect(status.allowWrite).toBe(false);
expect(() => normalizeOfficeStatus({ ok: false })).toThrow();
```

Test that `callOffice("activate", { botId: "wecom_a" }, fakeFetch)` sends:

```json
{"action":"activate","botId":"wecom_a","imAvailableHint":true}
```

and rejects non-JSON or non-OK payloads without echoing forbidden fields.

- [ ] **Step 2: Run the new API test and confirm it fails**

```bash
pnpm --filter dsh-im test -- tests/channels/wecom/office-api.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement `office-api.ts`**

Use the existing route literal and native `fetch`; add no dependency:

```ts
export const OFFICE_STATUS_ROUTE = "/_dsh/dsh-wecom-office/status";

export async function callOffice(action, payload = {}, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(OFFICE_STATUS_ROUTE, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, ...payload, imAvailableHint: true }),
  });
  const body = await response.json();
  return normalizeOfficeStatus(body);
}
```

Normalization must allow only `cliInstalled`, `mainStatus`, `activeBotId`, `authorized`, `allowWrite`, `cliPath`, `configDir`, and a cleaned public error. Do not carry bot secrets, raw remote ids, or arbitrary server fields.

- [ ] **Step 4: Add failing static card-state tests**

Render `AccountCard` with these office snapshots and assert exact copy/actions:

```text
cliInstalled=false              → 未安装 wecom-cli / 重新检查
activeBotId=this bot            → 办公能力已开通 / 办公设置
activeBotId=another bot         → 设为办公机器人
route error                     → 办公能力暂不可用 / 重新检查
```

For the active bot, assert the expanded details contain an `allowWrite` checkbox and do not expose `activeBotId`, `secretRef`, or raw remote id.

- [ ] **Step 5: Add failing interaction tests in `WecomSettingsTab`**

Inject `officeCall` and mount two bots. Assert:

```ts
expect(calls).toContainEqual(["status", {}]);
// click second card
expect(calls).toContainEqual(["activate", { botId: "wecom_second" }]);
// toggle active card write permission
expect(calls).toContainEqual(["configure", { field: "allowWrite", value: false }]);
```

Make the activate call reject and assert the failure appears only on the target card while the original active card remains marked active.

- [ ] **Step 6: Implement the minimal card UI and state**

In `WecomSettingsTab` keep office state separate from chat state so office failures never set the chat page to `phase: "error"`:

```ts
const [office, setOffice] = React.useState({ phase: "loading" });
const [officeBusyBotId, setOfficeBusyBotId] = React.useState(null);
const [officeErrorByBot, setOfficeErrorByBot] = React.useState({});
```

Load office status on mount and on the existing 15-second refresh cadence. `activate` and `configure` call the injected `officeCall` and commit returned status. When a successful response contains `lastError` (for example, target auth failed but rollback restored the old active bot), copy that safe error only to the target card while retaining the returned old active status. Transport/HTTP failures are handled the same way without replacing chat state. Do not introduce a context/provider for one channel.

Render one compact office row inside each existing card. Show global advanced settings only on the active card. Add styles inside the existing WeCom stylesheet and preserve 44px coarse-pointer targets, `focus-visible`, and reduced-motion behavior.

- [ ] **Step 7: Run IM tests**

```bash
pnpm --filter dsh-im test -- tests/channels/wecom/office-api.test.ts tests/channels/wecom/client-ui.test.ts tests/client-ui.test.ts
pnpm --filter dsh-im test
```

Expected: all IM tests pass.

- [ ] **Step 8: Commit the single-entry UI**

```bash
git add plugins/im/src/client plugins/im/tests
git commit -m "feat(im): manage WeCom office from robot cards"
```

---

### Task 3: Remove the independent office settings client and UI-only dependencies

**Files:**
- Delete: `plugins/wecom-office/src/client/index.tsx`
- Delete: `plugins/wecom-office/src/client/styles.ts`
- Delete: `plugins/wecom-office/tests/client-ui.test.ts`
- Modify: `plugins/wecom-office/src/index.ts`
- Modify: `plugins/wecom-office/package.json`
- Modify: `plugins/wecom-office/tsdown.config.ts`
- Modify: `scripts/check-ui-design.mjs`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Preserves host export `apply`, `Config`, package name `dsh-wecom-office`, patch id `wecom-office`, and all tools.
- Removes package export `./client` and `dsh.client` manifest metadata.
- Makes `tsdown.config.ts` build only `src/index.ts`.

- [ ] **Step 1: Add a failing manifest assertion**

Extend `plugins/wecom-office/tests/index.test.ts` or the repository manifest tests to read `package.json` and assert:

```ts
expect(manifest.exports["./client"]).toBeUndefined();
expect(manifest.dsh?.client).toBeUndefined();
```

Run:

```bash
pnpm --filter dsh-wecom-office test -- index.test.ts
```

Expected: failure because the client export and metadata still exist.

- [ ] **Step 2: Remove the settings registration and client build**

Delete `src/client/` and its test. Remove the browser target from `tsdown.config.ts`. Remove from `package.json`:

```text
exports["./client"]
dsh.client
qrcode
@types/qrcode
@types/react
react
@deepseek-ai/dsh-client-*
```

Keep dependencies still used by host source. Regenerate only the lockfile changes via:

```bash
pnpm install --lockfile-only
```

- [ ] **Step 3: Update the UI policy list**

Remove only `"wecom-office"` from `REQUIRED_UI_PLUGINS` in `scripts/check-ui-design.mjs`. Do not weaken checks for the remaining UI plugins; the new office controls are now covered under `plugins/im/src/client`.

- [ ] **Step 4: Build and inspect the host-only package**

```bash
pnpm --filter dsh-wecom-office test
pnpm --filter dsh-wecom-office build
test -f plugins/wecom-office/lib/index.js
test ! -f plugins/wecom-office/lib/client.js
```

If stale `lib/client.js` survives because generated files are ignored, inspect `tsdown --clean`; do not stage `lib/`.

- [ ] **Step 5: Commit the host-only package surface**

```bash
git add plugins/wecom-office scripts/check-ui-design.mjs pnpm-lock.yaml
git commit -m "refactor(wecom-office): remove the separate settings surface"
```

---

### Task 4: Align product and plugin documentation

**Files:**
- Modify: `plugins/wecom-office/docs/prd.zh.md`
- Modify: `plugins/wecom-office/docs/technical.zh.md`
- Modify: `plugins/im/README.md`
- Modify: `plugins/im/README.zh.md`
- Modify: `plugins/wecom-office/README.md`
- Modify: `plugins/wecom-office/README.zh.md`
- Modify: `README.md`
- Modify: `README.zh.md`

**Interfaces:**
- Documents one user entry: Sidebar → IM bots → WeCom robot card.
- Continues to document two internal packages and `wecom-cli` on `PATH`.

- [ ] **Step 1: Update the PRD contract**

Replace the old optional “second knife” card entry with the shipped primary path:

```text
主入口：IM 机器人 → 企业微信 → 对应机器人卡片
无独立“企业微信办公”设置入口
只装 dsh-wecom-office 时无 UI
```

Remove requirements for standalone QR/manual binding, settings-page selection, and automatic return to a settings page. Preserve the one-active-bot rule and clarify that card selection is explicit, not message-source following.

- [ ] **Step 2: Update the technical design**

Document the stable loopback actions, hidden host package, rollback behavior, old-data compatibility, and ownership split. Remove descriptions of the deleted client, QR UI, and settings section.

- [ ] **Step 3: Update bilingual public docs**

Use English in `README.md` and Chinese in `README.zh.md`. The user-facing instruction must point only to the WeCom robot card. Do not advertise a separate install/setup workflow for office UI.

- [ ] **Step 4: Run documentation and diff checks**

```bash
pnpm check
git diff --check
rg -n "Settings → 企业微信办公|设置 → 企业微信办公" README.md README.zh.md plugins/im plugins/wecom-office
```

Expected: no public instruction sends users to the removed settings page. Historical design text may remain only when explicitly marked obsolete; prefer updating it.

- [ ] **Step 5: Commit documentation**

```bash
git add README.md README.zh.md plugins/im/README.md plugins/im/README.zh.md plugins/wecom-office
git commit -m "docs: make IM the only WeCom office entry"
```

---

### Task 5: Automated verification and implementation review

**Files:**
- Modify only if a gate exposes a defect in the approved scope.

**Interfaces:**
- Produces automated evidence; does not perform sandbox or real-account validation.

- [ ] **Step 1: Run plugin checks**

```bash
pnpm --filter dsh-im test
pnpm --filter dsh-im build
pnpm --filter dsh-wecom-office test
pnpm --filter dsh-wecom-office build
```

Expected: all pass.

- [ ] **Step 2: Run repository gates**

```bash
pnpm check
pnpm check:build
```

Expected: all pass. Do not run `pnpm dev`, `pnpm smoke:sandbox`, or touch port 3081 because the user deferred manual validation.

- [ ] **Step 3: Inspect generated and source boundaries**

```bash
git status --short
git diff --check
rg -n "settings.section|qrStart|bindManual|clearStandalone" plugins/wecom-office/src plugins/wecom-office/package.json
rg -n "企业微信办公" plugins/wecom-office/src/client plugins/wecom-office/package.json 2>/dev/null || true
```

Expected: no independent office settings registration or standalone mutation action remains; no generated `lib/` files are staged.

- [ ] **Step 4: Request focused code review**

Review against the spec for:

- office failure isolation from IM chat;
- rollback restoring the previous CLI identity;
- no secret/raw id exposure;
- one active office bot;
- no second user entry;
- old settings path compatibility.

Fix only blocking/high findings, rerun proportional tests, and record residual risks.

- [ ] **Step 5: Report verification honestly**

Report automated command results and changed files. Explicitly list as not verified:

```text
sandbox 3081 UI
real wecom-cli auth init
real WeCom account switching
real failure rollback
```

Do not claim the feature is fully user-verified until the user's unified validation completes.
