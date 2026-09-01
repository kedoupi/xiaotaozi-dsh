# Trunk-Based Main Dogfood Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a clean `main` hub the permanent 3081 dogfood environment while all development lands through short-lived topic branches and green pull requests.

**Architecture:** This is a documentation-only policy change. `AGENTS.md` holds the hard invariant, `docs/conventions*` define the Git/sandbox truth, and `docs/workflow*` plus contributor docs define the procedure. Existing Git, GitHub CI, `pnpm dev`, and journey monitoring are reused; no new script, service, port, dependency, or branch type is added.

**Tech Stack:** Git worktrees, GitHub pull requests/Actions, pnpm, Markdown, sandbox port 3081

**Spec:** `docs/superpowers/specs/2026-09-01-trunk-based-main-dogfood-design.md`

## Global Constraints

- `main` is the only long-lived branch; do not add `develop`, `release/*`, or `hotfix/*`.
- The repository-root hub stays clean on current `main` and is the normal owner of `.dsh-home`, `pnpm dev`, port **3081**, and journey monitoring.
- Ordinary development uses a short-lived topic branch/worktree created from current `origin/main` and does not claim 3081.
- Required local gates and GitHub CI pass before merge.
- After merge, fast-forward the hub, confirm sandbox health, and exercise the affected real journey on merged `main`.
- Fix forward only for a small, deterministic, known correction; revert security, data-loss, startup, broad, or unclear regressions first.
- A topic worktree may own 3081 only through an explicit high-risk pre-merge transfer; never add a second sandbox port.
- Preserve active concurrent work. Never reset, force, stash, move, or delete the current hub work without an explicit owner handoff.
- Official `~/.dsh` and port **3080** are outside this loop and must not be touched.
- Keep English and Chinese normative documents synchronized.
- Do not add automation, dependencies, versions, package changes, or product behavior to this documentation-only implementation.

## Current State and File Map

The isolated implementation worktree is:

```text
/Users/codepi/Coding/dsh-plugins/.worktrees/trunk-based-main-dogfood
docs/trunk-based-main-dogfood
448fc34 docs(repo): design trunk-based main dogfood workflow
```

The repository-root hub currently has active, unmerged `feat/im-ui-upgrade` work and owns 3081. It is not part of this plan's edits. Do not touch it until that task is merged or its owner explicitly hands it off.

Files and responsibilities:

- `AGENTS.md`: hard agent rule for the hub/main/3081 invariant and mandatory post-merge cleanup.
- `docs/conventions.md`: normative English Git and sandbox dogfood contract.
- `docs/conventions.zh.md`: exact Chinese counterpart.
- `docs/workflow.md`: executable English start → PR → merge → main acceptance procedure.
- `docs/workflow.zh.md`: exact Chinese counterpart.
- `CONTRIBUTING.md`: concise contributor entry and pointers to normative details.
- `CONTRIBUTING.zh.md`: exact Chinese counterpart.
- `docs/superpowers/specs/2026-09-01-trunk-based-main-dogfood-design.md`: approved design; mark implemented only after normative docs pass review.

---

### Task 1: Make the main dogfood topology normative

**Files:**
- Modify: `AGENTS.md` near the existing Git, worktree, merge-cleanup, and sandbox rules
- Modify: `docs/conventions.md` § Git and § Homes / Sandbox dogfood
- Modify: `docs/conventions.zh.md` matching sections

**Interfaces:**
- Consumes: the approved invariants in `docs/superpowers/specs/2026-09-01-trunk-based-main-dogfood-design.md`
- Produces: one unambiguous hard rule and synchronized normative English/Chinese contracts consumed by Task 2

- [ ] **Step 1: Read the exact sections before editing**

Run:

```bash
cd /Users/codepi/Coding/dsh-plugins/.worktrees/trunk-based-main-dogfood
rg -n "only long-lived|Ordinary work lands|After a topic PR merges|Parallel checkouts|Sandbox dogfood|3081" \
  AGENTS.md docs/conventions.md docs/conventions.zh.md
```

Expected: existing topic-branch, cleanup, home, and 3081 rules are visible; no file outside this worktree is changed.

- [ ] **Step 2: Tighten the hard rule in `AGENTS.md`**

Merge the new requirement into the existing Git/sandbox bullets instead of adding a competing tutorial. The resulting hard rule must say, in equivalent concise prose:

```text
The repository-root hub checkout stays clean on current main and normally owns .dsh-home / 3081. Ordinary work uses a short-lived topic branch/worktree and does not claim 3081. After a green PR merges, immediately fast-forward the hub, keep or restore its sandbox and journey watch, verify the affected real journey on main, then clean the merged branch/worktree. Fix forward small known failures; revert security, data-loss, startup, or unclear regressions first. A high-risk pre-merge 3081 transfer must be explicit and must return 3081 to the main hub.
```

Keep the existing prohibitions on standing Git Flow branches, stealing another checkout's 3081, force cleanup, and touching 3080.

- [ ] **Step 3: Update English conventions**

In `docs/conventions.md` § Git, define trunk-based development as short-lived PR branches rather than direct main edits. Add these exact facts without duplicating the workflow steps:

```text
- The repository-root hub is the stable integration checkout: clean main tracking origin/main.
- The hub is the normal owner of sandbox .dsh-home, port 3081, and dogfood monitoring.
- Topic worktrees run deterministic gates but do not claim 3081 in the normal path.
- Required CI precedes merge; affected real-journey acceptance follows immediately on merged main.
```

In § Homes / Sandbox dogfood, add the failure contract:

```text
A known post-merge main break is active work. Fix forward only when the correction is small and known; revert security, data-loss, startup, broad, or unclear regressions first. Main must not remain knowingly broken while unrelated work continues.
```

Also document the explicit high-risk transfer exception and mandatory return of 3081 to the main hub.

- [ ] **Step 4: Mirror the normative contract in Chinese**

Apply the same requirements to `docs/conventions.zh.md`. Use these terms consistently:

```text
trunk-based（基于主干）
仓库根 hub checkout
短生命周期 topic branch/worktree
合并后 main 真实旅程验收
小而确定的问题 fix-forward
安全、数据丢失、启动、范围广或原因不明的回归先 revert
```

Do not weaken or add requirements relative to English.

- [ ] **Step 5: Verify Task 1 consistency**

Run:

```bash
rg -n "trunk-based|clean.*main|3081|fix-forward|revert" \
  AGENTS.md docs/conventions.md docs/conventions.zh.md
git diff --check
git diff -- AGENTS.md docs/conventions.md docs/conventions.zh.md
```

Expected: all three files define the same topology and failure policy; no whitespace errors or unrelated edits.

- [ ] **Step 6: Commit Task 1**

```bash
git add AGENTS.md docs/conventions.md docs/conventions.zh.md
git commit -F - <<'EOF'
docs(repo): define trunk-based main dogfood
EOF
```

Expected: one documentation commit; worktree contains no uncommitted Task 1 files.

---

### Task 2: Document the executable contributor procedure

**Files:**
- Modify: `docs/workflow.md` § Dev environment / Parallel checkouts and the post-merge procedure
- Modify: `docs/workflow.zh.md` matching sections
- Modify: `CONTRIBUTING.md` § Inner loop
- Modify: `CONTRIBUTING.zh.md` matching section

**Interfaces:**
- Consumes: the normative hub/main/3081 and failure rules from Task 1
- Produces: synchronized steps that contributors and agents can execute without interpreting policy

- [ ] **Step 1: Add the English normal trunk loop**

In `docs/workflow.md` under Dev environment / Parallel checkouts, add one ordered procedure with these actions:

```text
1. Confirm the repository-root hub is clean, on main, current with origin/main, and healthy on 3081.
2. Fetch origin and create one short-lived topic branch/worktree from origin/main.
3. Develop and run area-specific gates in the task worktree without starting pnpm dev.
4. Update with current main, rerun required gates, and open a PR.
5. Merge only after required GitHub CI passes.
6. Confirm the reviewed topic head is contained in origin/main.
7. Fast-forward the hub with git pull --ff-only; never reset or overwrite active work.
8. Keep or restore hub pnpm dev, confirm 3081 LISTENs, and retarget journey monitoring if its process/log changed.
9. Exercise the affected real journey on merged main.
10. Fix forward a small known issue or revert a serious/unclear regression.
11. Delete merged local/remote topic branches and remove only a clean task worktree.
```

State that merge completion does not stop sandbox monitoring.

- [ ] **Step 2: Document the exceptional 3081 transfer**

Add the bounded exception in `docs/workflow.md`:

```text
For irreversible migration, authentication, external side effects, or equivalent high risk: explicitly stop the hub sandbox, start the topic sandbox on 3081, verify, stop it, return to the hub main sandbox, confirm 3081 and monitoring, then continue. Never add another port or steal 3081.
```

Do not make this the default plugin-development path.

- [ ] **Step 3: Mirror the procedure in Chinese**

Update `docs/workflow.zh.md` with the same 11 actions and exceptional-transfer sequence. Preserve exact commands and port/home values:

```text
git pull --ff-only
pnpm dev
3081
~/.dsh / 3080
```

- [ ] **Step 4: Keep contributor entry concise**

Replace the current generic branch sentence in `CONTRIBUTING.md` and `CONTRIBUTING.zh.md` with a short summary:

```text
The repository-root hub stays clean on main and owns sandbox 3081. Develop in a short-lived topic branch/worktree, merge a green PR, then fast-forward the hub and exercise the affected journey on main. See conventions § Git and workflow § Dev environment.
```

Use natural Chinese in `CONTRIBUTING.zh.md`; do not copy the full procedure or add a table.

- [ ] **Step 5: Verify Task 2 consistency**

Run:

```bash
rg -n "git pull --ff-only|origin/main|3081|real journey|真实旅程|fix.forward|revert" \
  docs/workflow.md docs/workflow.zh.md CONTRIBUTING.md CONTRIBUTING.zh.md
git diff --check
git diff -- docs/workflow.md docs/workflow.zh.md CONTRIBUTING.md CONTRIBUTING.zh.md
```

Expected: English and Chinese describe the same ordered flow; contributor docs remain a concise entry point.

- [ ] **Step 6: Commit Task 2**

```bash
git add docs/workflow.md docs/workflow.zh.md CONTRIBUTING.md CONTRIBUTING.zh.md
git commit -F - <<'EOF'
docs(repo): document the main dogfood loop
EOF
```

Expected: one procedure commit, with no product or generated files staged.

---

### Task 3: Close the design and verify the documentation set

**Files:**
- Modify: `docs/superpowers/specs/2026-09-01-trunk-based-main-dogfood-design.md`
- Verify: all files changed by Tasks 1–2

**Interfaces:**
- Consumes: approved design plus completed normative and procedural docs
- Produces: an implemented design status and a fully verified PR-ready branch

- [ ] **Step 1: Mark the design implemented**

Change only the status line to:

```markdown
**Status:** Implemented in repository rules and workflow documentation
```

- [ ] **Step 2: Run the spec coverage review**

Read the final diff and account for every design section:

```bash
git diff origin/main...HEAD -- \
  AGENTS.md \
  docs/conventions.md docs/conventions.zh.md \
  docs/workflow.md docs/workflow.zh.md \
  CONTRIBUTING.md CONTRIBUTING.zh.md \
  docs/superpowers/specs/2026-09-01-trunk-based-main-dogfood-design.md
```

Expected coverage:

```text
Purpose/Invariants -> AGENTS + conventions
Checkout Topology -> conventions + workflow
Normal Change Flow -> workflow + contributor entry
Failure Policy -> AGENTS + conventions + workflow
Exceptions -> conventions + workflow
Adoption -> Task 4 operational gate
Success Criteria -> final commands and Task 4 main verification
```

- [ ] **Step 3: Scan for ambiguity and placeholders**

Run:

```bash
rg -n "TBD|TODO|FIXME" \
  AGENTS.md docs/conventions.md docs/conventions.zh.md \
  docs/workflow.md docs/workflow.zh.md CONTRIBUTING.md CONTRIBUTING.zh.md \
  docs/superpowers/specs/2026-09-01-trunk-based-main-dogfood-design.md || true
rg -n "directly on main|直接在 main" \
  AGENTS.md docs/conventions.md docs/conventions.zh.md \
  docs/workflow.md docs/workflow.zh.md CONTRIBUTING.md CONTRIBUTING.zh.md \
  docs/superpowers/specs/2026-09-01-trunk-based-main-dogfood-design.md || true
git diff --check
```

Expected: no `TBD`, `TODO`, or `FIXME`; any phrase about direct main work explicitly says it is forbidden.

- [ ] **Step 4: Run the repository documentation gate**

```bash
pnpm check
```

Expected: manifest/design checks, typechecks, plugin tests, and script tests all pass. `pnpm check:build`, `pnpm check:path`, and `pnpm check:cli` are not required because this change modifies documentation only.

- [ ] **Step 5: Commit the implemented status and any review fixes**

If only the status changed:

```bash
git add docs/superpowers/specs/2026-09-01-trunk-based-main-dogfood-design.md
git commit -F - <<'EOF'
docs(repo): finalize trunk-based dogfood spec
EOF
```

If review required wording fixes, stage only the listed documentation files and use the same commit title. Do not amend Tasks 1–2.

- [ ] **Step 6: Confirm a clean PR-ready branch**

```bash
git status --short
git diff --check origin/main...HEAD
git log --oneline --decorate origin/main..HEAD
```

Expected: empty status, clean diff, and only the design plus implementation documentation commits.

---

### Task 4: Land the policy and adopt the main hub safely

**Files:**
- No source edits
- Operational state: repository-root hub, topic branch/worktree, GitHub PR, sandbox 3081

**Interfaces:**
- Consumes: the clean verified branch from Task 3 and an explicit handoff from any active hub task
- Produces: merged policy, clean current main hub, healthy main sandbox, and cleaned topic branch/worktree

- [ ] **Step 1: Refuse to disturb active hub work**

Inspect from the repository root:

```bash
cd /Users/codepi/Coding/dsh-plugins
git branch --show-current
git status --short
git log -1 --oneline
lsof -nP -iTCP:3081 -sTCP:LISTEN || true
```

Current expected state while `feat/im-ui-upgrade` is active: non-main branch and uncommitted files. Stop here until that task is merged/cleaned or its owner explicitly hands it off. Do not reset, restore, stash, archive, switch, or stop its sandbox merely to continue this plan.

- [ ] **Step 2: Update and revalidate the documentation branch**

After the hub task no longer blocks adoption:

```bash
cd /Users/codepi/Coding/dsh-plugins/.worktrees/trunk-based-main-dogfood
git fetch origin
git merge origin/main
pnpm check
git status --short
```

Expected: clean merge, green check, empty status. Resolve only documentation conflicts within this plan's files; do not absorb unrelated work.

- [ ] **Step 3: Push and open the pull request after user authorization**

```bash
cat > /tmp/trunk-based-main-dogfood-pr.md <<'EOF'
## Summary

- keep the repository-root hub clean on `main` as the normal owner of sandbox 3081
- develop through short-lived topic worktrees and merge only after required CI
- refresh and exercise merged `main` immediately, then fix forward or revert failures
- document the bounded high-risk sandbox-transfer exception

## Validation

- [x] `pnpm check`
- [x] English and Chinese policy/procedure review
- Official 3080 was not touched.
EOF

git push -u origin docs/trunk-based-main-dogfood
gh pr create \
  --base main \
  --head docs/trunk-based-main-dogfood \
  --title "docs(repo): adopt trunk-based main dogfood" \
  --body-file /tmp/trunk-based-main-dogfood-pr.md
```

Do not push or merge without the user's explicit authorization.

- [ ] **Step 4: Merge only after CI is green and the user approves**

Verify:

```bash
gh pr checks --watch
gh pr view --json state,mergeable,statusCheckRollup,headRefOid
```

Expected: every required check succeeds and the PR is mergeable. After explicit user approval, record the reviewed head and use the repository's merge-commit strategy:

```bash
reviewed_topic_head=$(git rev-parse docs/trunk-based-main-dogfood)
printf '%s\n' "$reviewed_topic_head" > /tmp/trunk-based-main-dogfood-reviewed-head
gh pr merge --merge
```

Expected: GitHub reports the PR merged; do not use `--delete-branch` here because cleanup occurs only after containment and worktree checks.

- [ ] **Step 5: Fast-forward and verify the main hub**

From the clean repository-root hub:

```bash
git switch main
git pull --ff-only origin main
git status --short
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
lsof -nP -iTCP:3081 -sTCP:LISTEN || true
```

Expected: clean `main`, `HEAD == origin/main`, and this hub's sandbox owns 3081. If `pnpm dev` exited or 3081 is absent, restart it from this hub and retarget journey monitoring before continuing. Never touch 3080.

- [ ] **Step 6: Exercise this change's real acceptance**

Because this is a workflow-only change, acceptance is operational rather than a UI feature:

```text
- repository root is clean main
- 3081 listener cwd is the repository root
- pnpm dev remains alive after the main fast-forward
- journey monitoring follows the current sandbox log
- a new development task can create a worktree without moving the hub off main
```

Record any item not exercised. A known failure is handled by the design's fix-forward/revert policy.

- [ ] **Step 7: Clean the merged documentation task**

Confirm the recorded reviewed topic head is contained in `origin/main`, then delete the remote/local topic branch and remove only the clean worktree. After merging, clean up from the repository root:

```bash
reviewed_topic_head=$(cat /tmp/trunk-based-main-dogfood-reviewed-head)
git fetch origin
git merge-base --is-ancestor "$reviewed_topic_head" origin/main
git -C /Users/codepi/Coding/dsh-plugins/.worktrees/trunk-based-main-dogfood status --short
git push origin --delete docs/trunk-based-main-dogfood
git worktree remove /Users/codepi/Coding/dsh-plugins/.worktrees/trunk-based-main-dogfood
git branch -d docs/trunk-based-main-dogfood
git worktree prune
```

Expected: containment succeeds, worktree status is empty, no force flag is used, and the root hub remains clean on current main with 3081 healthy.
