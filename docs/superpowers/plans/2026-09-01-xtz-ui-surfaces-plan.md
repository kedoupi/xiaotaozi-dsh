# Xtz UI Feature Surfaces Upgrade Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Apply the approved hierarchy and state contract to Xiaotaozi settings, archive, task board, and Git graph while keeping restrained brand exposure.

**Architecture:** Keep each existing surface and host route/service intact. Reuse Xtz theme tokens, dialog focus utilities, existing SSR/source-contract test style, and feature-local CSS. Do not move Models, IM, Market, or Sidebar responsibilities into `xtz-ui`.

**Tech Stack:** React, TypeScript, CSS-in-TS, DSH settings/slot APIs, Vitest, tsdown.

**Prerequisite:** Foundation merged. Start `feat/xtz-ui-surfaces` from updated `main`.

## Task 1: Turn Xiaotaozi settings into a clear feature-state list

**Files:**
- Create: `plugins/xtz-ui/tests/settings-ui.test.ts`
- Modify: `plugins/xtz-ui/src/client/XiaotaoziSettings.tsx`
- Modify: `plugins/xtz-ui/src/client/styles.ts`
- Modify: `plugins/xtz-ui/src/client/locales.ts`
- Verify: `plugins/xtz-ui/src/client/settings-live.ts`
- Verify tests: `plugins/xtz-ui/tests/settings-store.test.ts`, `config.test.ts`

### Step 1: Write failing SSR/source contract tests

Require title + purpose, stable loading status, one row per feature, visible enabled/disabled state text in addition to the switch, dependency/unavailable explanation, one local primary action at most, `aria-busy`, `role="status"` for save completion, and `role="alert"` for failure. Require 44px narrow/coarse targets.

### Step 2: Verify red

```bash
pnpm --filter dsh-xtz-ui test -- settings-ui.test.ts
```

### Step 3: Implement the state list

Keep `TOP_LEVEL`, `loadSettingsLive`, and `patchSettingsLive`. Extend `Toggle` with text state and disabled reason. Add a stable loading region rather than showing “coming soon” before readiness. Preserve optimistic/current config on save failure and keep archive management secondary to the switch.

### Step 4: Verify green

```bash
pnpm --filter dsh-xtz-ui test -- settings-ui.test.ts settings-store.test.ts config.test.ts
pnpm --filter dsh-xtz-ui typecheck
```

### Step 5: Commit

```bash
git add plugins/xtz-ui/src/client/XiaotaoziSettings.tsx plugins/xtz-ui/src/client/styles.ts plugins/xtz-ui/src/client/locales.ts plugins/xtz-ui/tests/settings-ui.test.ts
git commit -m "feat(xtz-ui): clarify feature settings states"
```

## Task 2: Unify archive search, restore, empty, error, and deletion

**Files:**
- Modify: `plugins/xtz-ui/src/client/ArchivePanel.tsx`
- Modify: `plugins/xtz-ui/src/client/archive-css.ts`
- Modify: `plugins/xtz-ui/src/client/archive-locales.ts`
- Modify: `plugins/xtz-ui/tests/archive-ui.test.ts`
- Verify: `plugins/xtz-ui/tests/archive.test.ts`, `archive-live.test.ts`

### Step 1: Add failing archive UI tests

Using existing SSR/pure helper patterns, require: loading never appears as empty; search/filter controls precede results; empty state explains and offers reset/back; restore stays visible; permanent delete remains secondary and uses a dedicated accessible confirmation; busy disables conflicting actions; restore/delete success uses `role="status"`; errors preserve selection/preview and use `role="alert"`.

### Step 2: Verify red

```bash
pnpm --filter dsh-xtz-ui test -- archive-ui.test.ts
```

### Step 3: Implement presentation gaps

Reuse existing archive ledger/routes. Do not change archive membership or identity semantics. Keep selected rows, search/filter, preview, and recovery in one clear master/detail flow. Use mascot only in a genuine empty state, not repeated rows.

### Step 4: Verify green

```bash
pnpm --filter dsh-xtz-ui test -- archive-ui.test.ts archive.test.ts archive-live.test.ts
node scripts/check-ui-design.mjs
```

### Step 5: Commit

```bash
git add plugins/xtz-ui/src/client/ArchivePanel.tsx plugins/xtz-ui/src/client/archive-css.ts plugins/xtz-ui/src/client/archive-locales.ts plugins/xtz-ui/tests/archive-ui.test.ts
git commit -m "feat(xtz-ui): unify archive interaction states"
```

## Task 3: Polish task-board hierarchy and interaction feedback

**Files:**
- Create: `plugins/xtz-ui/tests/board-ui.test.ts`
- Modify: `plugins/xtz-ui/src/client/BoardPanel.tsx`
- Modify: `plugins/xtz-ui/src/client/EditTaskModal.tsx`
- Modify: `plugins/xtz-ui/src/client/board-css.ts`
- Modify: `plugins/xtz-ui/src/client/board-locales.ts`
- Verify: `plugins/xtz-ui/src/client/dialog-focus.ts`
- Verify tests: `board.test.ts`, `board-brand.test.ts`, `board-service.test.ts`, `board-runner.test.ts`, `board-routes.test.ts`

### Step 1: Write failing UI contracts

Require consistent column heading/count/action order, task identity before metadata, text status plus semantic dot, visible keyboard focus, drag source/target/drop feedback, busy/success/error announcements, and a labeled modal with focus trap, Escape, focus restore, and reachable actions. Preserve the approved branded empty state and leaf-success-only rule.

### Step 2: Verify red

```bash
pnpm --filter dsh-xtz-ui test -- board-ui.test.ts board-brand.test.ts
```

### Step 3: Implement the visual/interaction pass

Keep board service, cron, runner, routes, and task schema unchanged. Refine component order/classes and add missing ARIA/live copy. Keep board columns as a purposeful local scroller at 375px; prevent page-level overflow.

### Step 4: Verify green

```bash
pnpm --filter dsh-xtz-ui test -- board-ui.test.ts board-brand.test.ts board.test.ts board-service.test.ts board-runner.test.ts board-routes.test.ts
pnpm --filter dsh-xtz-ui typecheck
```

### Step 5: Commit

```bash
git add plugins/xtz-ui/src/client/BoardPanel.tsx plugins/xtz-ui/src/client/EditTaskModal.tsx plugins/xtz-ui/src/client/board-css.ts plugins/xtz-ui/src/client/board-locales.ts plugins/xtz-ui/tests/board-ui.test.ts
git commit -m "feat(xtz-ui): polish task board interactions"
```

## Task 4: Strengthen Git graph hierarchy without recoloring lanes

**Files:**
- Create: `plugins/xtz-ui/tests/git-graph-ui.test.ts`
- Modify: `plugins/xtz-ui/src/client/GitGraphChip.tsx`
- Modify: `plugins/xtz-ui/src/client/gitgraph-css.ts`
- Modify: `plugins/xtz-ui/src/client/gitgraph-locales.ts`
- Verify: `plugins/xtz-ui/tests/git-graph.test.ts`
- Verify: `scripts/check-ui-design.mjs`

### Step 1: Write failing UI contract tests

Require current branch and current node to carry text/ARIA semantics, commit subject to outrank author/time metadata, branch/tag chips to remain readable, loading/empty/error states to be distinct, and decorative chrome to be absent. Assert lane variables remain categorical and are not replaced by brand orange.

### Step 2: Verify red

```bash
pnpm --filter dsh-xtz-ui test -- git-graph-ui.test.ts git-graph.test.ts
```

### Step 3: Implement hierarchy-only changes

Adjust markup/classes/spacing/weight. Keep `computeLanes`, `layoutGraph`, service behavior, and all light/dark lane colors unchanged. Use orange only for the selected/current semantic role, not every branch or edge.

### Step 4: Verify green and contrast

```bash
pnpm --filter dsh-xtz-ui test -- git-graph-ui.test.ts git-graph.test.ts
node scripts/check-ui-design.mjs
```

### Step 5: Commit

```bash
git add plugins/xtz-ui/src/client/GitGraphChip.tsx plugins/xtz-ui/src/client/gitgraph-css.ts plugins/xtz-ui/src/client/gitgraph-locales.ts plugins/xtz-ui/tests/git-graph-ui.test.ts
git commit -m "style(xtz-ui): strengthen git graph hierarchy"
```

## Task 5: Validate all Xtz surfaces together

**Files:** none unless QA exposes a defect.

### Step 1: Run automated gates

```bash
pnpm --filter dsh-xtz-ui typecheck
pnpm --filter dsh-xtz-ui test
pnpm --filter dsh-xtz-ui build
pnpm check
pnpm check:build
pnpm check:path
git diff --check
```

### Step 2: Browser QA on sandbox 3081

At 1440/1024/375 in light/dark, test settings load/save/failure/disabled reasons; archive loading/search/empty/preview/restore/error/delete; board empty/create/edit/drag/busy/error; Git graph loading/current/branch/merge/error; all dialogs keyboard-only; reduced motion; local scrollers; and console cleanliness.

### Step 3: Open the Xtz UI surfaces PR

Attach before/after evidence and the state matrix. Do not include changes owned by Providers, IM, Market, or Sidebar.
