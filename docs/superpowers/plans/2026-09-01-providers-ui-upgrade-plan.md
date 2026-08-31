# Providers UI/UX Upgrade Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn Providers into the reference Xiaotaozi configuration surface with clear identity/state hierarchy, focused authentication steps, separate model visibility, and progressive disclosure.

**Architecture:** Keep `ModelsWorkspace` as the stateful composition root, extract only small presentational/pure helpers into existing `workspace-panels.tsx` and `workspace-shared.ts`, and retain the host RPC/catalog/auth contracts. Consume Foundation semantic tokens; preserve official provider logo colors.

**Tech Stack:** React, TypeScript, DSH settings slot/primitives, plugin CSS-in-TS, Vitest, tsdown.

**Prerequisite:** Foundation PR merged. Start `feat/providers-ui-upgrade` from updated `main`.

## Task 1: Lock the new visual and hierarchy contract

**Files:**
- Modify: `plugins/providers/tests/ui-contract.test.ts`
- Modify: `plugins/providers/src/client/styles.ts`
- Modify: `plugins/providers/DESIGN.md`

### Step 1: Make the contract fail on legacy styling

Update assertions to require approved action fallbacks and an explicit pressed role:

```ts
expect(css).toContain("--dshM-primary: var(--dsw-alias-button-info-fill, #b94305)");
expect(css).toContain("--dshM-primary-hover: var(--dsw-alias-button-info-hover, #9f3703)");
expect(css).toContain("--dshM-primary-pressed:");
expect(css).not.toMatch(/#a84c2c|#8f3f27|#b5522a/i);
```

Pin page purpose, status summary, one-primary-action class, focus-visible, coarse-pointer, and reduced-motion contracts using existing source-string style.

### Step 2: Verify red

```bash
pnpm --filter dsh-providers test -- ui-contract.test.ts
```

### Step 3: Implement the token/geometry baseline

Update the `.dshM-wrap` token block and button `:active` state in `styles.ts`. Use DSH capsule geometry for primary actions, neutral surfaces for content, 8px inputs, 12px entity cards, and ≥44px narrow/coarse targets. Update `DESIGN.md` to Fruit Orange × DSH and the approved ownership/state rules.

### Step 4: Verify green

```bash
pnpm --filter dsh-providers test -- ui-contract.test.ts
node scripts/check-ui-design.mjs
```

### Step 5: Commit

```bash
git add plugins/providers/tests/ui-contract.test.ts plugins/providers/src/client/styles.ts plugins/providers/DESIGN.md
git commit -m "style(providers): align configuration surface"
```

## Task 2: Clarify rail identity, login method, and current state

**Files:**
- Modify: `plugins/providers/src/client/ModelsWorkspace.tsx`
- Modify: `plugins/providers/src/client/workspace-shared.ts`
- Modify: `plugins/providers/src/client/locales.ts`
- Modify: `plugins/providers/tests/ui-contract.test.ts`

### Step 1: Write the failing contract test

Assert each provider rail item exposes provider identity, `loginBadge(...)`, and a text state label, with the selected state carried by `aria-current` or `aria-selected`. Assert the detail pane has one heading and one-sentence purpose.

### Step 2: Verify red

```bash
pnpm --filter dsh-providers test -- ui-contract.test.ts
```

### Step 3: Implement the hierarchy

Reuse `loginBadge()` rather than creating a second method map. Render official `ProviderLogo`, method label, and current state only in the rail. Keep model counts and advanced values in the detail pane. Make exactly one local action primary; sign-out/remove remains danger or neutral-confirmed, never orange.

### Step 4: Verify green

```bash
pnpm --filter dsh-providers test -- ui-contract.test.ts
pnpm --filter dsh-providers typecheck
```

### Step 5: Commit

```bash
git add plugins/providers/src/client/ModelsWorkspace.tsx plugins/providers/src/client/workspace-shared.ts plugins/providers/src/client/locales.ts plugins/providers/tests/ui-contract.test.ts
git commit -m "feat(providers): clarify provider state hierarchy"
```

## Task 3: Add progressive disclosure without hiding the core task

**Files:**
- Create: `plugins/providers/tests/ui-disclosure.test.ts`
- Modify: `plugins/providers/src/client/workspace-panels.tsx`
- Modify: `plugins/providers/src/client/ModelsWorkspace.tsx`
- Modify: `plugins/providers/src/client/locales.ts`
- Modify: `plugins/providers/src/client/styles.ts`

### Step 1: Write failing SSR/source contract tests

Require a native `<details>`/`<summary>` advanced section that is closed by default and has localized copy. Core key/auth fields and selected-model controls must remain outside the disclosure.

### Step 2: Verify red

```bash
pnpm --filter dsh-providers test -- ui-disclosure.test.ts
```

### Step 3: Implement the disclosure

Reuse `.dshM-manual` styling. Put optional base URL, discovery details, custom-provider fields, and long “more models” content behind the disclosure only where they are not required to finish setup. Do not change catalog, persistence, or host payloads.

### Step 4: Verify green

```bash
pnpm --filter dsh-providers test -- ui-disclosure.test.ts
pnpm --filter dsh-providers typecheck
```

### Step 5: Commit

```bash
git add plugins/providers/src/client plugins/providers/tests/ui-disclosure.test.ts
git commit -m "feat(providers): disclose advanced configuration progressively"
```

## Task 4: Complete authentication and model-selection feedback

**Files:**
- Modify: `plugins/providers/src/client/ModelsWorkspace.tsx`
- Modify: `plugins/providers/src/client/workspace-panels.tsx`
- Modify: `plugins/providers/src/client/locales.ts`
- Modify: `plugins/providers/tests/ui-contract.test.ts`
- Verify unchanged behavior: `plugins/providers/tests/flow-cancel.test.ts`, `store.test.ts`, `selection.test.ts`, `host-catalog.test.ts`

### Step 1: Add failing state-contract assertions

Require stable initial loading, `aria-busy` during auth/save, `role="status"` for copied/saved/completed feedback, `role="alert"` for immediate failures, disabled-reason copy for unwritable credentials, and input retention on failed save.

### Step 2: Verify red

```bash
pnpm --filter dsh-providers test -- ui-contract.test.ts flow-cancel.test.ts store.test.ts selection.test.ts
```

### Step 3: Wire missing semantics only

Use the existing `subStatus`, `liveNote`, `busy`, confirmation, and cancel flows. Add markup/copy where a state is currently silent; do not change OAuth generations, cancellation, credentials, model persistence, or selection algorithms.

### Step 4: Verify green and regressions

```bash
pnpm --filter dsh-providers test
pnpm --filter dsh-providers typecheck
pnpm --filter dsh-providers build
```

### Step 5: Commit

```bash
git add plugins/providers/src/client plugins/providers/tests
git commit -m "feat(providers): complete setup state feedback"
```

## Task 5: Validate responsive configuration flows

**Files:** none unless QA exposes a defect.

### Step 1: Run repository gates

```bash
pnpm check
pnpm check:build
pnpm check:path
git diff --check
```

### Step 2: Browser QA on sandbox 3081

At 1440/1024/375 in light/dark, exercise: loading; no providers; subscription device authorization; API-key entry failure with retained input; success; model visibility save; env-locked disabled field with reason; sign-out/remove dialog; Escape/focus restore; keyboard-only flow. Confirm one primary action per local decision, no page overflow, official logo colors unchanged, and console clean.

### Step 3: Open the Providers PR

Attach focused test output and the state/viewpoint evidence. Do not include IM or other plugin work.
