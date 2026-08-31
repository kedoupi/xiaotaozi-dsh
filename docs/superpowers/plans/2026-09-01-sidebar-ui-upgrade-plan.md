# Sidebar Workbench UI/UX Upgrade Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unify Sidebar workbench chrome and make unsaved, loading, conflict, running, disconnected, and failed states explicit without changing editor, terminal, Diff, Markdown, or Mermaid renderer semantics.

**Architecture:** Keep `Sidebar`/`state.ts` geometry and split-pane architecture. Refine shell CSS and existing component state markup; derive Git conflict presentation from existing porcelain `xy` values rather than adding a new file-conflict subsystem. Preserve all specialist renderer color systems and local scrollers.

**Tech Stack:** React, TypeScript, CSS Modules, DSH primitives, CodeMirror/xterm presentation boundaries, Vitest source-contract/pure tests, tsdown.

**Prerequisite:** General visual language stable after earlier phases. Start `feat/sidebar-ui-upgrade` from updated `main`.

## Task 1: Pin and normalize workbench shell geometry

**Files:**
- Modify: `plugins/sidebar/tests/ui-contract.test.ts`
- Modify: `plugins/sidebar/src/client/sidebar.module.css`
- Modify: `plugins/sidebar/src/client/SideCardSection.module.css`
- Modify: `plugins/sidebar/src/client/SideChatView.module.css`
- Modify: `plugins/sidebar/src/client/SubagentView.module.css`
- Modify only if a proven geometry bug exists: `plugins/sidebar/src/client/state.ts`, `Sidebar.tsx`, `layout.css`

### Step 1: Add failing geometry and color contracts

Assert compact controls ≥32px, standard controls 36–40px, tab/tree/Git/terminal chrome shares radius and spacing roles, coarse/narrow controls reach 44px, and panel/tab/terminal/editor content keeps local overflow. Pin existing panel bounds unless rendered QA proves a defect. Require approved orange semantic fallbacks in chrome and reject `#a84c2c`, `#8f3f27`, `#b5522a`, `#5a3228`, `#f8e6d9`, and `#d06840` from all Sidebar client CSS modules.

### Step 2: Verify red

```bash
pnpm --filter dsh-sidebar test -- ui-contract.test.ts
```

### Step 3: Normalize CSS only

Prefer CSS token/selector changes over state geometry changes. Replace legacy fallback literals with Foundation semantic action/soft/ink roles in the four Sidebar CSS modules. Keep `PANEL_MIN/MAX/DEFAULT`, bottom/floating bounds, drag behavior, persistence keys, and layout push unchanged unless a focused test demonstrates breakage. Do not recolor content surfaces.

### Step 4: Verify green

```bash
pnpm --filter dsh-sidebar test -- ui-contract.test.ts
node scripts/check-ui-design.mjs
```

### Step 5: Commit

```bash
git add plugins/sidebar/src/client/sidebar.module.css plugins/sidebar/src/client/SideCardSection.module.css plugins/sidebar/src/client/SideChatView.module.css plugins/sidebar/src/client/SubagentView.module.css plugins/sidebar/tests/ui-contract.test.ts
git commit -m "style(sidebar): normalize workbench chrome"
```

## Task 2: Unify file tree and tab-bar keyboard/action treatment

**Files:**
- Modify: `plugins/sidebar/src/client/FileTree.tsx`
- Modify: `plugins/sidebar/src/client/TabBar.tsx`
- Modify: `plugins/sidebar/src/client/split-pane.tsx`
- Modify: `plugins/sidebar/src/client/sidebar.module.css`
- Modify: `plugins/sidebar/tests/ui-contract.test.ts`

### Step 1: Extend failing interaction contracts

Require row main action and secondary actions as sibling native buttons, visible focus on every control, selected/current tab text semantics, status badge text/label when color is used, horizontal tab scrolling without page overflow, and keyboard-reachable empty-pane actions.

### Step 2: Verify red

```bash
pnpm --filter dsh-sidebar test -- ui-contract.test.ts
```

### Step 3: Implement markup/CSS gaps

Reuse existing `tabMain`, `tabClose`, `explorerRowMain`, `getTabBadge`, and DSH icons. Do not add nested interactive elements or change file opening/tab persistence behavior. Keep drag/drop and middle-click semantics intact.

### Step 4: Verify green

```bash
pnpm --filter dsh-sidebar test -- ui-contract.test.ts file-mentions.test.ts
pnpm --filter dsh-sidebar typecheck
```

### Step 5: Commit

```bash
git add plugins/sidebar/src/client/FileTree.tsx plugins/sidebar/src/client/TabBar.tsx plugins/sidebar/src/client/split-pane.tsx plugins/sidebar/src/client/sidebar.module.css plugins/sidebar/tests/ui-contract.test.ts
git commit -m "feat(sidebar): unify tree and tab interactions"
```

## Task 3: Make all six workbench states explicit

**Files:**
- Create: `plugins/sidebar/src/client/git-entry-state.ts`
- Create: `plugins/sidebar/tests/git-entry-state.test.ts`
- Modify: `plugins/sidebar/src/client/GitView.tsx`
- Modify: `plugins/sidebar/src/client/TextEditor.tsx`
- Modify: `plugins/sidebar/src/client/EditorHost.tsx`
- Modify: `plugins/sidebar/src/client/TerminalView.tsx`
- Modify: `plugins/sidebar/src/client/DiffTab.tsx`
- Modify: `plugins/sidebar/src/client/SubagentView.tsx`
- Modify: `plugins/sidebar/src/client/SideChatView.tsx`
- Modify: `plugins/sidebar/src/client/locales.ts`
- Modify: `plugins/sidebar/src/client/sidebar.module.css`
- Modify: `plugins/sidebar/tests/ui-contract.test.ts`, `editor-truncation.test.ts`

### Step 1: Write the pure conflict test first

From existing Git porcelain `xy`, classify unmerged/conflict codes (`DD`, `AU`, `UD`, `UA`, `DU`, `AA`, `UU`) as conflict while ordinary `M`, `A`, `D`, `R`, and `??` remain normal change states. Return text tone/label data; do not add new host APIs.

### Step 2: Verify red

```bash
pnpm --filter dsh-sidebar test -- git-entry-state.test.ts
```

### Step 3: Implement conflict presentation

Use the helper in `GitView` to render a conflict label/icon and warning copy plus the existing open-diff action. Do not claim conflict resolution capability.

### Step 4: Add failing contracts for the other states

Pin:
- unsaved: dirty text/indicator and discard dialog;
- loading: stable `role="status"`/`aria-busy`;
- running: subagent/chat/terminal text plus state indicator;
- disconnected: terminal banner with reconnect status/action;
- failed: editor save, tree, Git, Diff, and terminal `role="alert"` plus recovery where available.

### Step 5: Wire missing ARIA/copy only

Reuse existing `saveState`, `EditorLoad`, Git `loading/error/busy`, terminal connection states, subagent activity, and side-chat `running`. Do not change save, process, websocket, Git, or renderer behavior.

### Step 6: Verify and commit

```bash
pnpm --filter dsh-sidebar test -- git-entry-state.test.ts ui-contract.test.ts editor-truncation.test.ts dialog-ui.test.ts
pnpm --filter dsh-sidebar typecheck
git add plugins/sidebar/src/client plugins/sidebar/tests
git commit -m "feat(sidebar): expose workbench operational states"
```

## Task 4: Preserve specialist renderers while polishing surrounding chrome

**Files:**
- Modify: `plugins/sidebar/tests/ui-contract.test.ts`
- Modify: `scripts/check-ui-design.mjs`
- Modify: `scripts/check-ui-design.test.mjs`
- Modify only chrome selectors: `plugins/sidebar/src/client/sidebar.module.css`
- Verify unchanged: `plugins/sidebar/src/client/cm-themes.ts`
- Verify unchanged: terminal `ANSI_DARK`/`ANSI_LIGHT` in `TerminalView.tsx`
- Verify unchanged: `DiffView.tsx`, `MarkdownHtml.tsx`, `mermaid.tsx`, `mermaid-blocks.ts`

### Step 1: Add preservation assertions

Assert no approved brand-orange literal appears in CodeMirror token rules, terminal ANSI arrays, Diff additions/deletions, Markdown content, or Mermaid output. Assert error/success semantics continue to use DSH state tokens and technical content remains locally scrollable.

### Step 2: Run the preservation test before CSS changes

```bash
pnpm --filter dsh-sidebar test -- ui-contract.test.ts
```

Expected: pass before and after; this is a regression fence, not a forced red test.

### Step 3: Polish chrome boundaries only

Adjust toolbars, banners, tabs, panel headers, separators, and focus states. Do not edit syntax/ANSI/diff/diagram palettes.

### Step 4: Broaden the staged legacy-color guard

Extend the scope-capable guard introduced by Foundation from `plugins/xtz-ui/src/client` to every `plugins/*/src/client` tree. Add a script test proving a legacy literal in a non-Xtz plugin is now rejected. At this point Providers, IM, Market, Xtz UI, and Sidebar have each removed their owned fallbacks, so the repository-wide gate can pass without an allowlist.

### Step 5: Verify and commit

```bash
pnpm --filter dsh-sidebar test
node --test scripts/check-ui-design.test.mjs
node scripts/check-ui-design.mjs
git add plugins/sidebar/src/client/sidebar.module.css plugins/sidebar/tests/ui-contract.test.ts scripts/check-ui-design.mjs scripts/check-ui-design.test.mjs
git commit -m "test(ui): enforce fruit-orange fallbacks repo-wide"
```

## Task 5: Validate responsive workbench behavior

**Files:** none unless QA exposes a defect.

### Step 1: Run automated gates

```bash
pnpm --filter dsh-sidebar typecheck
pnpm --filter dsh-sidebar test
pnpm --filter dsh-sidebar build
pnpm check
pnpm check:build
pnpm check:path
git diff --check
```

### Step 2: Browser QA on sandbox 3081

At 1440/1024/375 in light/dark, exercise panel resize/collapse, split panes, file tree, tabs, editor save/failure/unsaved discard, Git clean/dirty/conflict/busy/error, terminal connecting/running/disconnected/fatal, Diff loading/error, subagent running/failure, keyboard-only navigation, focus order, reduced motion, and browser console.

Verify editor/terminal/Diff/Markdown/Mermaid content colors are unchanged and all content overflow remains local. At 375px, confirm no surrounding page shift or page-level horizontal overflow.

### Step 3: Open the Sidebar PR

Attach state/viewpoint evidence. Any renderer-semantic defect discovered during QA belongs in a separate focused bug PR, not this visual upgrade.
