# Market UI/UX Upgrade Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Market a clear discovery and installation surface with first-level search/filter/installed controls, concise cards, useful detail, and announced queued/installing/completed/failed/retrying/installed states.

**Architecture:** Keep catalog and mutation routes intact. `MarketPanel` owns transient UI state; catalog dependencies remain the durable installed truth. Derive the six user-visible states from existing pending intents, active mutation, result/error, retry attempt, and installed snapshot rather than expanding the host intent schema.

**Tech Stack:** React, TypeScript, plugin CSS-in-TS, Vitest, optional package-local `react-test-renderer` for interaction tests, tsdown.

**Prerequisite:** Foundation merged. Start `feat/market-ui-upgrade` from updated `main`.

## Task 1: Add an interaction harness and pin first-level controls

**Files:**
- Modify: `plugins/market/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `plugins/market/tests/client-interaction.test.ts`
- Modify: `plugins/market/src/client/MarketPanel.tsx`
- Modify: `plugins/market/src/client/market-css.ts`

### Step 1: Add the smallest test dependency

Add `react-test-renderer` at the same React 18 range used by `plugins/im`, package-local only. Do not add a browser/screenshot framework.

### Step 2: Write failing interaction tests

Stub `global.fetch` for catalog/intents. Assert typing search filters results, category buttons expose `aria-pressed`, installed filter is first-level, and no matches render an explanation plus reset action.

### Step 3: Verify red

```bash
pnpm --filter dsh-market test -- client-interaction.test.ts
```

### Step 4: Implement only missing control semantics

Keep `searchCatalog`, `tagsOf`, and `isCatalogEntryInstalled` as the logic owners. Add an Installed filter if absent and a reset action for empty search. Search, category, and installed state must precede the grid in reading/focus order.

### Step 5: Verify green and commit

```bash
pnpm --filter dsh-market test -- client-interaction.test.ts catalog.test.ts
git add plugins/market/package.json pnpm-lock.yaml plugins/market/src/client plugins/market/tests/client-interaction.test.ts
git commit -m "feat(market): prioritize discovery controls"
```

## Task 2: Simplify cards and strengthen detail

**Files:**
- Modify: `plugins/market/src/client/MarketPanel.tsx`
- Modify: `plugins/market/src/client/market-css.ts`
- Modify: `plugins/market/src/client/locales.ts`
- Modify: `plugins/market/tests/client-interaction.test.ts`
- Verify: `plugins/market/src/catalog.ts`

### Step 1: Add failing presentation assertions

Require catalog cards to show only name, purpose, source, installed state, and one install/open action. Require detail to show full description, version, exact source/install specification, and a risk/compatibility section.

### Step 2: Verify red

```bash
pnpm --filter dsh-market test -- client-interaction.test.ts
```

### Step 3: Implement without a catalog schema expansion

Resolve source labels from `snapshot.sources`. Derive transparent detail notes from available data: identify bundled/first-party vs upstream Git/npm source, tell the user to review upstream source/permissions before install, and state “compatibility not declared” when no metadata exists. Do not invent compatibility claims or add placeholder host fields.

Keep the card opener and action as sibling controls; do not nest buttons.

### Step 4: Verify green and commit

```bash
pnpm --filter dsh-market test -- client-interaction.test.ts catalog.test.ts
git add plugins/market/src/client plugins/market/tests/client-interaction.test.ts
git commit -m "feat(market): clarify catalog cards and detail"
```

## Task 3: Model and announce the six install presentations

**Files:**
- Create: `plugins/market/src/client/install-presentation.ts`
- Create: `plugins/market/tests/install-presentation.test.ts`
- Modify: `plugins/market/src/client/MarketPanel.tsx`
- Modify: `plugins/market/src/client/locales.ts`
- Modify: `plugins/market/tests/client-interaction.test.ts`
- Verify unchanged: `plugins/market/src/intents.ts`, `plugins/market/src/routes.ts`

### Step 1: Write failing pure-state tests

Define a pure presentation helper whose inputs are: installed truth, pending intent, active mutation id, last failed id, retrying id, and latest completion. Assert precedence and copy/tone for:

```text
queued → installing → completed → installed
failed → retrying → completed/installed
```

Completed is transient confirmation followed by durable installed state. Failed keeps retry available. Color is never the only signal.

### Step 2: Verify red

```bash
pnpm --filter dsh-market test -- install-presentation.test.ts
```

### Step 3: Implement the helper and local state

Keep `InstallIntent.status` as `pending` and keep synchronous route mutation. In `MarketPanel`, record the owning entry for failure, mark a subsequent attempt as retrying, announce completion/removal, then refresh installed truth. Preserve the existing `role="alert"` error and add `role="status"`/`aria-live` announcements for every silent button/state transition.

### Step 4: Verify interactions

```bash
pnpm --filter dsh-market test -- install-presentation.test.ts client-interaction.test.ts routes.test.ts intents.test.ts
```

Expected: route/store semantics are unchanged while all six UI presentations are covered.

### Step 5: Commit

```bash
git add plugins/market/src/client plugins/market/tests
git commit -m "feat(market): announce installation lifecycle"
```

## Task 4: Align modal, responsive, and semantic styling

**Files:**
- Modify: `plugins/market/tests/client-ui.test.ts`
- Modify: `plugins/market/src/client/market-css.ts`
- Verify: `plugins/market/src/client/MarketOverlay.tsx`, `dialog-focus.ts`

### Step 1: Update the failing CSS contract

Pin approved orange fallbacks, pressed state, leaf-success-only rule, 24px desktop dialog radius, near-edge safe-area mobile layout, 44px coarse targets, visible focus, and reduced motion. Remove the old `--dsw-static-deepseek-600` expectation where it encodes legacy color rather than a semantic alias.

### Step 2: Verify red

```bash
pnpm --filter dsh-market test -- client-ui.test.ts
```

### Step 3: Implement the visual contract

Use DSH neutral layers and semantic aliases. Keep danger separate. Preserve focus trap, Escape, backdrop close, focus restore, and scroll lock. Avoid nested card stacks and page-level overflow at 375px.

### Step 4: Verify green and commit

```bash
pnpm --filter dsh-market test -- client-ui.test.ts client-interaction.test.ts
node scripts/check-ui-design.mjs
git add plugins/market/src/client/market-css.ts plugins/market/tests/client-ui.test.ts
git commit -m "style(market): align responsive dialog surface"
```

## Task 5: Validate Market end-to-end

**Files:** none unless validation exposes a defect.

### Step 1: Run automated gates

```bash
pnpm --filter dsh-market typecheck
pnpm --filter dsh-market test
pnpm --filter dsh-market build
pnpm check
pnpm check:build
pnpm check:path
git diff --check
```

### Step 2: Browser QA on sandbox 3081

At 1440/1024/375 in light/dark, exercise loading, empty search, search/category/installed filters, detail/back, queued, installing, completed, installed, forced failure, retrying, retry success, source error, disabled action, remove confirmation, keyboard flow, focus restoration, and console cleanliness.

### Step 3: Open the Market PR

Include state-transition evidence. Do not expand the intent persistence schema or add third-party catalog capability in this visual phase.
