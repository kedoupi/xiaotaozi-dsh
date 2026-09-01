# Fruit Orange UI Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the legacy red-brown theme-owner mapping with the approved Fruit Orange × DSH semantic roles and make theme regressions fail repository checks.

**Architecture:** Keep `plugins/xtz-ui` as the sole brand/theme owner. Preserve the existing `applyPeachTheme` integration and public export names to avoid needless churn, but revalue the palette and make Xtz client feature CSS consume its semantic aliases. Update the normative design-system document and add a staged legacy-color guard that becomes repository-wide in the final Sidebar phase.

**Tech Stack:** TypeScript theme records, DSH `overrideTokens`, plugin CSS-in-TS, Vitest, Node test runner, `scripts/check-ui-design.mjs`.

**Prerequisite:** Start branch `feat/ui-foundation` from current `main`; the approved design is `docs/superpowers/specs/2026-09-01-ui-ux-upgrade-design.md`.

## Task 1: Pin the approved semantic palette in tests

**Files:**
- Modify: `plugins/xtz-ui/tests/peach.test.ts`
- Modify: `plugins/xtz-ui/src/client/peach.ts`

### Step 1: Write the failing assertions

Assert at minimum:

```ts
expect(PEACH[100]).toBe("#FFF0E6");
expect(PEACH[600]).toBe("#B94305");
expect(PEACH[700]).toBe("#9F3703");
expect(PEACH[800]).toBe("#7C2C00");
expect(BRAND.display.light).toBe("#FC8940");
expect(BRAND.ink.light).toBe("#A33B04");
expect(BRAND.cream.light).toBe("#FFF0E6");
expect(BRAND.leaf.light).toBe("#78A317");
```

Also assert the action/brand/status token mappings remain semantic and no value in `PEACH`, `BRAND`, or `PEACH_TOKENS` equals the banned legacy family.

### Step 2: Verify red

```bash
pnpm --filter dsh-xtz-ui test -- peach.test.ts
```

Expected: failure on the old `#a84c2c`/red-brown values.

### Step 3: Revalue the theme

In `peach.ts`, keep `PEACH`, `BRAND`, `STATUS_INK`, `PEACH_TOKENS`, `PEACH_SOURCE`, and `applyPeachTheme`. Set approved light roles exactly, including `PEACH[100] = "#FFF0E6"` for the soft/static-100 role so the old cream literal is removed. Derive dark foreground pairs that pass the existing dark-surface contrast checks; do not add feature-level theme branches.

Keep:

```ts
"--dsw-alias-state-business-primary": {
  light: PEACH[600],
  dark: PEACH[200],
}
```

### Step 4: Verify green and contrast

```bash
pnpm --filter dsh-xtz-ui test -- peach.test.ts
node scripts/check-ui-design.mjs
```

Expected: palette tests and current contrast checks pass.

### Step 5: Commit

```bash
git add plugins/xtz-ui/src/client/peach.ts plugins/xtz-ui/tests/peach.test.ts
git commit -m "feat(xtz-ui): adopt fruit-orange theme roles"
```

## Task 2: Update the normative design system

**Files:**
- Modify: `design-system/xiaotaozi-dsh/MASTER.md`
- Modify: `design-system/xiaotaozi-dsh/reference.png`

### Step 1: Replace legacy palette documentation

Document the approved display, action, hover, pressed, soft, ink, focus, leaf, and cocoa roles from design §5.2. Replace “peach is emphasis” with “fruit orange is emphasis, not wallpaper.” Add the restrictions from design §5.3 and retain DSH primitive/token ownership.

### Step 2: Replace the obsolete desktop reference

The current PNG depicts the retired desktop product and legacy palette. Replace it with a ≥800×600 reference export for the actual Web product language: DSH neutral surfaces, approved token swatches, control geometry, state treatments, and restrained mascot use. Do not depict a revived desktop client or capabilities outside this repository.

### Step 3: Verify terminology and image contract

```bash
! rg -ni '#a84c2c|#8f3f27|#b5522a|red-brown|peach is emphasis' design-system/xiaotaozi-dsh/MASTER.md
node scripts/check-ui-design.mjs
```

Expected: no legacy guidance; the design check accepts the updated reference image.

### Step 4: Commit

```bash
git add design-system/xiaotaozi-dsh/MASTER.md design-system/xiaotaozi-dsh/reference.png
git commit -m "docs(ui): define fruit-orange design roles"
```

## Task 3: Remove legacy fallbacks from Xtz client CSS

**Files:**
- Modify: `plugins/xtz-ui/src/client/styles.ts`
- Modify: `plugins/xtz-ui/src/client/archive-css.ts`
- Modify: `plugins/xtz-ui/src/client/board-css.ts`
- Modify: `plugins/xtz-ui/src/client/gitgraph-css.ts`
- Modify: `plugins/xtz-ui/src/client/sticky-prompt.css.ts`
- Modify: `plugins/xtz-ui/src/client/sidebar-entry.ts`

### Step 1: Establish the failing inventory

```bash
rg -ni '#a84c2c|#8f3f27|#b5522a|#5a3228|#f8e6d9|#d06840' plugins/xtz-ui/src/client
```

Expected: matches in feature CSS.

### Step 2: Replace only semantic fallback values

Map action fill/hover/pressed/soft/ink to `#B94305`, `#9F3703`, `#7C2C00`, `#FFF0E6`, and `#A33B04`, while retaining the surrounding `var(--dsw-…, fallback)` contract. Do not recolor the categorical Git graph lane palette.

### Step 3: Verify the sweep

```bash
! rg -ni '#a84c2c|#8f3f27|#b5522a|#5a3228|#f8e6d9|#d06840' plugins/xtz-ui/src/client
pnpm --filter dsh-xtz-ui test
pnpm --filter dsh-xtz-ui typecheck
```

### Step 4: Commit

```bash
git add plugins/xtz-ui/src/client
git commit -m "refactor(xtz-ui): remove legacy peach fallbacks"
```

## Task 4: Add the staged theme-owner policy guard

**Files:**
- Modify: `scripts/check-ui-design.mjs`
- Modify: `scripts/check-ui-design.test.mjs`

### Step 1: Write a failing unit test

Expose or exercise a helper that reports banned UI color literals. The fixture must include one banned literal and one approved orange literal; only the banned one should produce an error. Also add a fixture that rejects a routine `transition` duration above 200ms while accepting 120ms/160ms/200ms and ignoring continuous loading-spinner `animation` duration. Do not treat arbitrary contrast-helper test data as shipped UI.

### Step 2: Verify red

```bash
node --test scripts/check-ui-design.test.mjs
```

Expected: the new guard test fails because the helper/policy is absent.

### Step 3: Implement the smallest staged guard

During Foundation, scan only `plugins/xtz-ui/src/client/**/*.{ts,tsx,css}` case-insensitively for the explicit banned legacy list. Report path and literal. Other plugins intentionally clean their local fallbacks in their own PRs, so a repository-wide scan would make this first phase impossible to merge. Keep the helper scope-capable; the final Sidebar phase broadens the same guard to every `plugins/*/src/client` tree after all owning phases are clean.

In the same client-source policy pass, reject routine transition durations above 200ms; preserve the approved 120ms fast, 160ms ordinary, and ≤200ms dialog/popover contract. Exclude continuous progress/loading animations rather than forcing their cycle to 200ms.

Keep generated output, tests, docs, logos, and categorical color sets outside the color rule.

### Step 4: Verify green

```bash
node --test scripts/check-ui-design.test.mjs
node scripts/check-ui-design.mjs
```

### Step 5: Commit

```bash
git add scripts/check-ui-design.mjs scripts/check-ui-design.test.mjs
git commit -m "test(ui): reject legacy theme fallbacks"
```

## Task 5: Validate the foundation in the assembled sandbox

**Files:** none unless validation exposes a defect.

### Step 1: Run package and repository gates

```bash
pnpm --filter dsh-xtz-ui typecheck
pnpm --filter dsh-xtz-ui test
pnpm --filter dsh-xtz-ui build
pnpm check
pnpm check:build
pnpm check:path
git diff --check
```

### Step 2: Run browser QA on 3081

Confirm port 3081 is available to this checkout before starting `pnpm dev`. Check welcome, settings, archive, board, Git graph, dialogs, focus rings, and sidebar brand at 1440/1024/375 in light/dark. Verify no red-brown residual, no orange danger treatment, reduced motion, and no console errors.

### Step 3: Open the Foundation PR

Include command output and QA evidence. Do not include Providers, IM, Market, Xtz feature hierarchy, or Sidebar redesign in this PR.
