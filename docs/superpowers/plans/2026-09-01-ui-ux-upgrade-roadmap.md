# Xiaotaozi UI/UX Upgrade Roadmap

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this roadmap one phase at a time. Use superpowers:subagent-driven-development inside a phase when tasks are independent, and request code review before each PR.

**Goal:** Deliver the approved Fruit Orange × DSH visual and interaction upgrade across all first-party Web UI without changing plugin ownership or product entry points.

**Architecture:** `plugins/xtz-ui` remains the brand/theme owner; DSH primitives and `--dsw-*` aliases remain the shared layer; each Git-path plugin keeps its presentation self-contained. The rollout is a dependency-ordered series of reversible topic PRs, followed by assembled-product documentation and QA.

**Tech Stack:** React, TypeScript, plugin-scoped CSS/CSS Modules, DSH UI primitives/theme APIs, Vitest, tsdown, sandbox `xtz --sandbox` on port 3081.

**Approved design:** `docs/superpowers/specs/2026-09-01-ui-ux-upgrade-design.md`

## Delivery Map

| Order | Topic branch | Plan | Depends on | PR outcome |
|---|---|---|---|---|
| 1 | `feat/ui-foundation` | `2026-09-01-ui-foundation-plan.md` | Approved design | Fruit-orange tokens, normative design system, policy gates |
| 2 | `feat/providers-ui-upgrade` | `2026-09-01-providers-ui-upgrade-plan.md` | Foundation merged | Reference configuration and authentication surface |
| 3 | `feat/im-ui-upgrade` | `2026-09-01-im-ui-upgrade-plan.md` | Foundation + Providers language | Unified channel/bot onboarding, embedded WeCom office |
| 4 | `feat/market-ui-upgrade` | `2026-09-01-market-ui-upgrade-plan.md` | Foundation | Discovery, detail, install-state feedback |
| 5 | `feat/xtz-ui-surfaces` | `2026-09-01-xtz-ui-surfaces-plan.md` | Foundation | Settings, archive, board, Git graph polish |
| 6 | `feat/sidebar-ui-upgrade` | `2026-09-01-sidebar-ui-upgrade-plan.md` | Foundation + Providers + IM + Market + Xtz UI merged | Workbench chrome, explicit technical states, repository-wide legacy-color gate |
| 7 | `docs/ui-upgrade` | This roadmap, Final Assembly below | All six merged | Current screenshots and assembled-product acceptance |

Do not stack all implementation on `design/ui-ux-upgrade`. That branch owns the approved design and plans only. Start every implementation branch from updated `main`, open one PR, merge it, then perform the repository cleanup required by `AGENTS.md` before starting the next phase.

## Cross-Phase Rules

1. Do not create a root UI package, Tailwind setup, or sibling-plugin source import.
2. Use DSH primitives first; keep feature recipes local and minimal.
3. Brand literals live in the theme owner. Feature CSS consumes semantic aliases and only keeps approved fallback values.
4. Do not recolor provider/channel logos, CodeMirror syntax, terminal ANSI, Diff, Markdown, Mermaid, or generated media.
5. Danger uses error semantics, never orange. Leaf green is success-only.
6. Every non-trivial behavior change follows red → green → focused verification → commit.
7. Do not add a screenshot framework. Use existing contract/interaction tests plus real browser QA.
8. Never touch official home/port 3080. Confirm port 3081 belongs to this checkout before sandbox work.
9. Use 120ms fast feedback, 160ms ordinary transitions, and no more than 200ms for dialogs/popovers; continuous loading animations are exempt, and all non-essential motion stops under `prefers-reduced-motion`.

## Per-PR Acceptance Gate

Run the focused checks listed in the phase plan, then:

```bash
pnpm check
pnpm check:build
pnpm check:path
git diff --check
```

In the 3081 sandbox, verify both themes at 1440px, 1024px, and 375px. Exercise keyboard-only core flow; loading, empty, busy, success, warning, error, unavailable, disabled, and destructive states relevant to that surface; focus visibility; reduced motion; and browser console cleanliness.

Record manual evidence in the PR description:

```text
Sandbox: http://127.0.0.1:3081
Themes: light / dark
Viewports: 1440 / 1024 / 375
Keyboard flow: PASS
State matrix: PASS (list exercised states)
Console: PASS
Screenshots: attach before/after for changed surfaces
```

## Final Assembly: Documentation and Product QA

**Files:**
- Modify: root `README.md`, `README.zh.md` only where screenshots or UI descriptions are stale.
- Modify: affected `plugins/*/README.md`, `plugins/*/README.zh.md`, and `plugins/*/docs/*` screenshots.
- Verify: `docs/README.md` links and the approved design acceptance list.

### Step 1: Inventory stale product images

Run:

```bash
find . -path '*/docs/*' -type f \( -name '*.png' -o -name '*.jpg' -o -name '*.webp' \) -print
rg -n 'docs/.*\.(png|jpg|webp)|<img' README.md README.zh.md plugins/*/README*.md
```

Create a capture checklist for Providers, IM/WeCom office, Market, Xtz settings/archive/board/Git graph, and Sidebar.

### Step 2: Capture assembled product

Start only this checkout's sandbox, keep it alive, and capture representative light/dark desktop views plus a 375px operability view. Do not alter UI to manufacture screenshots.

### Step 3: Replace screenshots and copy

Update only stale images and adjacent descriptions. English README is canonical; update its Chinese counterpart in the same commit.

### Step 4: Run final gates

```bash
pnpm check
pnpm check:build
pnpm check:path
pnpm check:cli
! rg -ni '#a84c2c|#8f3f27|#b5522a|#5a3228|#f8e6d9|#d06840' plugins/*/src/client
git diff --check
```

Then walk every criterion in design §10.3. Any failure returns to the owning plugin in a new focused fix PR; do not hide implementation fixes in the documentation PR.

### Step 5: Commit and PR

```bash
git add README.md README.zh.md plugins/*/README.md plugins/*/README.zh.md plugins/*/docs docs/README.md
git commit -m "docs(ui): refresh upgraded product surfaces"
```

After merge, complete topic-branch/worktree cleanup per `AGENTS.md`.
