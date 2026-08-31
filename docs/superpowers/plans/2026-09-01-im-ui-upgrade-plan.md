# IM and Embedded WeCom Office UI/UX Upgrade Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give all IM channels one coherent connection and bot-management experience, with explicit onboarding states, contextual recovery, dedicated destructive dialogs, and WeCom office controls contained in the WeCom bot card.

**Architecture:** Preserve `IMSettingsTab` as the channel portal and each channel's protocol/RPC implementation. Standardize presentation through existing client seams (`CredentialBindingPanel`, `BotStatusMeta`, `ChannelListHeading`, workspace editors, shared `dim-*` CSS) rather than inventing a new component package. WeCom remains the reference card and the only user-visible office entry.

**Tech Stack:** React, TypeScript, plugin CSS-in-TS, `react-test-renderer`, Vitest, DSH settings slots, sandbox 3081.

**Prerequisite:** Foundation and Providers visual language merged. Start `feat/im-ui-upgrade` from updated `main`.

## Task 1: Establish the channel/action/entity hierarchy

**Files:**
- Modify: `plugins/im/tests/client-ui.test.ts`
- Modify: `plugins/im/src/client/index.ts`
- Modify: `plugins/im/src/client/channel-card-meta.ts`
- Modify: `plugins/im/src/client/styles.ts`
- Modify as needed: `plugins/im/src/client/channels/*/styles.ts`

### Step 1: Add failing UI contract assertions

Require three distinct levels: channel tablist with selected state, one connection action area with one primary action, and bot entity list headed by identity/health. Require purpose and state copy before repeated cards. Pin approved action fallbacks and ban legacy red-brown values.

### Step 2: Verify red

```bash
pnpm --filter dsh-im test -- client-ui.test.ts
```

### Step 3: Implement the hierarchy

Keep `CHANNELS`, roving keyboard behavior, channel order, and office gating unchanged. Remove duplicated empty-view primary actions where the heading already owns the action. Use open sections and separators before adding cards. Retain official channel logos and one primary connect action per local area.

Update local fallback literals in `styles.ts`, `session-follow.ts`, and affected channel style files to approved semantic orange roles; leave danger and channel-logo colors unchanged.

### Step 4: Verify green

```bash
pnpm --filter dsh-im test -- client-ui.test.ts
node scripts/check-ui-design.mjs
```

### Step 5: Commit

```bash
git add plugins/im/src/client plugins/im/tests/client-ui.test.ts
git commit -m "style(im): clarify channel and bot hierarchy"
```

## Task 2: Unify connection, credential, and recovery states

**Files:**
- Modify: `plugins/im/src/client/credential-binding.ts`
- Modify: `plugins/im/src/client/channel-card-meta.ts`
- Modify: `plugins/im/src/client/connection-test-notice.ts`
- Modify as needed: `plugins/im/src/client/channels/{dingtalk,discord,feishu,qq,slack,telegram,wecom,weixin,whatsapp}/index.ts`
- Modify: `plugins/im/tests/client-ui.test.ts`
- Verify: channel-specific `client-ui.test.ts` and API tests under `plugins/im/tests/channels/*/`

### Step 1: Add failing state-matrix tests

For representative credential and QR channels, assert distinct loading, empty, busy, success, error, unavailable, and disabled presentations. Failed credential submission must keep identity/secret inputs and channel context, expose `role="alert"`, and offer retry/cancel. Busy state must set `aria-busy` and disable conflicting actions.

### Step 2: Verify red

```bash
pnpm --filter dsh-im test -- client-ui.test.ts channels/wecom/client-ui.test.ts channels/feishu/client-api.test.ts
```

### Step 3: Fill only presentation gaps

Reuse `CredentialBindingPanel`, `connectionTestFeedback`, `LastMessageErrorSummary`, and per-channel sanitized `presentError`. Do not merge channel protocols or change endpoint payloads. Keep errors on the owning channel/card and keep user input after failure.

### Step 4: Verify green and secret fences

```bash
pnpm --filter dsh-im test -- client-ui.test.ts connection-test-notice.test.ts message-failure.test.ts channels/wecom/client-ui.test.ts channels/wecom/client-api.test.ts
```

### Step 5: Commit

```bash
git add plugins/im/src/client plugins/im/tests
git commit -m "feat(im): unify connection state feedback"
```

## Task 3: Make bot cards lead with identity and health

**Files:**
- Modify: `plugins/im/src/client/channel-card-meta.ts`
- Modify: shared editors in `plugins/im/src/client/{bot-display-name,agent-preset,bot-instruction,workspace-editor}.ts`
- Modify: bot-card composition in applicable `plugins/im/src/client/channels/*/index.ts`
- Modify: `plugins/im/src/client/styles.ts`
- Modify: `plugins/im/tests/client-ui.test.ts`
- Modify: applicable channel UI tests

### Step 1: Write failing composition tests

Assert card order: identity/name and text health → workspace → optional capabilities → footer actions/status. Assert full workspace path remains readable, card actions are sibling buttons, status is not color-only, and repeated cards do not contain nested decorative cards.

### Step 2: Verify red

```bash
pnpm --filter dsh-im test -- client-ui.test.ts channels/wecom/client-ui.test.ts
```

### Step 3: Recompose existing pieces

Move existing components only; do not alter bot snapshots or save semantics. Use progressive disclosure for optional preset/instruction/office detail where density requires it, but keep workspace confirmation visible while pending. Keep action rows compact at desktop and 44px on coarse/narrow input.

### Step 4: Verify green

```bash
pnpm --filter dsh-im test -- client-ui.test.ts channels/wecom/client-ui.test.ts channels/dingtalk/client-ui.test.ts
pnpm --filter dsh-im typecheck
```

### Step 5: Commit

```bash
git add plugins/im/src/client plugins/im/tests
git commit -m "refactor(im): standardize bot card composition"
```

## Task 4: Replace inline removal with a dedicated accessible dialog

**Files:**
- Modify: `plugins/im/src/client/channels/wecom/index.ts`
- Modify: equivalent inline removals in other channel `index.ts` files if present
- Modify: `plugins/im/src/client/styles.ts`
- Modify: `plugins/im/src/client/channels/*/styles.ts` where channel-specific confirm CSS exists
- Modify: `plugins/im/tests/channels/wecom/client-ui.test.ts`
- Modify: `plugins/im/tests/client-ui.test.ts`

### Step 1: Make current inline behavior fail

Assert removal leaves the bot card visible behind a dedicated overlay, renders `role="alertdialog"` or `role="dialog"` with `aria-modal="true"`, labels title/body, traps Tab, closes on Escape, and restores focus to the remove button. Assert confirm uses danger semantics and cancel receives initial focus.

### Step 2: Verify red

```bash
pnpm --filter dsh-im test -- channels/wecom/client-ui.test.ts client-ui.test.ts
```

### Step 3: Implement the dialog

Render a channel-scoped overlay sibling to the card list rather than replacing `.dim-botCardBody`. Reuse the existing focusable-control/Escape pattern; do not add a second dialog library. Add near-edge/safe-area narrow styling and reduced-motion behavior.

### Step 4: Verify green

```bash
pnpm --filter dsh-im test -- channels/wecom/client-ui.test.ts client-ui.test.ts
node scripts/check-ui-design.mjs
```

### Step 5: Commit

```bash
git add plugins/im/src/client plugins/im/tests
git commit -m "fix(im): use dedicated bot removal dialogs"
```

## Task 5: Polish embedded WeCom office states without moving the entry

**Files:**
- Modify: `plugins/im/src/client/channels/wecom/index.ts`
- Modify: `plugins/im/src/client/channels/wecom/styles.ts`
- Modify: `plugins/im/tests/channels/wecom/client-ui.test.ts`
- Verify unchanged: `plugins/im/src/client/channels/wecom/office-api.ts`
- Verify unchanged host boundary: `plugins/wecom-office/src/status-route.ts`, `plugins/wecom-office/src/names.ts`

### Step 1: Extend existing office interaction tests

Cover loading/unavailable, CLI missing, inactive bot, active/authorized success, busy mutation, rollback failure on target card, permission disabled reason, and retry. Assert office errors never change chat card health or the page phase.

### Step 2: Verify red for the missing semantics

```bash
pnpm --filter dsh-im test -- channels/wecom/client-ui.test.ts channels/wecom/office-api.test.ts
```

### Step 3: Refine `OfficeRow`

Keep setup, active-bot selection, status, permission, and advanced details inside the matching WeCom card. Add `aria-busy`, durable status copy, disabled reasons, and progressive disclosure for CLI/config metadata. Preserve the separate office state and the existing safe browser payload.

### Step 4: Verify green

```bash
pnpm --filter dsh-im test -- channels/wecom/client-ui.test.ts channels/wecom/office-api.test.ts
pnpm --filter dsh-im typecheck
```

### Step 5: Commit

```bash
git add plugins/im/src/client/channels/wecom plugins/im/tests/channels/wecom
git commit -m "feat(im): polish embedded WeCom office setup"
```

## Task 6: Prove workspace onboarding and assembled behavior

**Files:**
- Modify tests only if a real gap is found: `plugins/im/tests/workspace-pending-client.test.ts`, `workspace.test.ts`
- Verify: `plugins/im/src/client/workspace-editor.ts`, `workspace-directory-picker.ts`, `workspace-snapshot-fence.ts`
- Verify host fence: `plugins/im/src/channels/shared/bot-workspace-store.ts`, `workspace-session.ts`

### Step 1: Run complete automated gates

```bash
pnpm --filter dsh-im test
pnpm --filter dsh-im typecheck
pnpm --filter dsh-im build
pnpm check
pnpm check:build
pnpm check:path
git diff --check
```

### Step 2: Run mandatory first-action sandbox verification

Confirm 3081 belongs to this checkout, then start `pnpm dev`. Bind a test bot, observe `workspacePending`, choose a non-repository target directory, and perform the first real message/tool action. Prove the durable result lands under the confirmed target and nothing new lands in this repository because of `process.cwd()`.

### Step 3: Complete rendered QA

At 1440/1024/375 in light/dark, test all nine channel tabs, QR and credential methods, bot cards, removal dialog, workspace picker, office states, keyboard flow, reduced motion, no page overflow, and console cleanliness.

### Step 4: Open the IM PR

Include the first-action evidence explicitly. Do not alter `plugins/wecom-office` host routes unless a separately proven contract bug requires its own focused PR.
