# Trunk-Based Main Dogfood Design

**Date:** 2026-09-01
**Status:** Implemented in repository rules and workflow documentation

## Purpose

Keep the continuously running sandbox on the latest `main` so every merged change is exercised immediately in the real browser and IM journeys.

This repository will use trunk-based development with short-lived topic branches. Trunk-based does **not** mean editing or committing directly on `main`: changes still go through a pull request and required CI before they enter the trunk.

## Invariants

1. `main` is the only long-lived branch.
2. The hub checkout stays clean, checked out on `main`, and tracks `origin/main`.
3. The hub checkout is the only checkout allowed to own sandbox `.dsh-home` and port **3081** during normal development.
4. Feature work happens on a short-lived topic branch, preferably in a task worktree created from current `origin/main`.
5. Topic worktrees run tests and builds but do not start `pnpm dev` or claim 3081 during the normal path.
6. A pull request merges only after required local gates and GitHub CI pass against current `main`.
7. After merge, the hub fast-forwards to `origin/main`, keeps or restores the sandbox, and runs the real acceptance journey on the merged code.
8. A failed main journey is fixed forward immediately when the correction is small and known; security, data-loss, startup, or unclear regressions are reverted first.
9. Official `~/.dsh` and port **3080** remain outside this workflow.

## Checkout Topology

### Hub checkout

The repository root is the stable integration and dogfood checkout:

- branch: `main`
- state: clean before pull, review, release, or sandbox refresh
- owns: `.dsh-home`, `pnpm dev`, port 3081, and journey monitoring
- does not contain feature edits or uncommitted handoff work

If the hub contains an unmerged topic commit or uncommitted changes, the workflow stops before updating main. Preserve that work in its own topic branch/worktree; never reset, force, or discard it to make the hub look clean.

### Task worktrees

Each development task uses one short-lived topic branch. A worktree is the default when the hub or another task is active.

Task worktrees:

- branch from current `origin/main`
- contain all edits, tests, review fixes, and commits for that concern
- may run unit, type, build, path-install, CLI, and fake-home checks
- do not use 3081 in the normal path
- are removed after the reviewed topic commit is confirmed in `origin/main`

No standing `develop`, `release/*`, or `hotfix/*` branches are added.

## Normal Change Flow

### 1. Start

1. Confirm the hub is on clean `main` and the main sandbox is healthy.
2. Fetch `origin`.
3. Create a short-lived topic branch/worktree from `origin/main`.
4. Install dependencies in that worktree when required.

The running hub sandbox remains available while development proceeds elsewhere.

### 2. Develop and verify

Implement with the smallest relevant tests first. Run the gates required by the changed area. Do not use the shared sandbox as a substitute for deterministic tests.

Before opening or updating the pull request:

- the topic worktree is clean except for deliberate commits
- the branch includes current `origin/main`
- local required checks pass
- review findings are resolved

### 3. Pull request and merge

Open a pull request into `main`. Required GitHub CI must pass before merge. A stale branch is updated with current `main` and revalidated.

Keep pull requests small and short-lived. Incomplete work that cannot be safely exposed must be split smaller or placed behind a default-off feature flag.

### 4. Post-merge main refresh

Immediately after merge:

1. Confirm the reviewed topic head is contained in `origin/main`.
2. Fast-forward the clean hub with `git pull --ff-only`.
3. Delete the merged local and remote topic branch.
4. Remove the clean task worktree.
5. Confirm the hub remains on clean, current `main`.
6. Confirm this hub's `pnpm dev` and port 3081 are healthy; restart them here if needed.
7. Retarget journey monitoring if the sandbox process or log changed.

Merging a pull request does not stop dogfood monitoring.

### 5. Main acceptance

Run the affected real journey against the hub's 3081 sandbox after main refresh. Examples include browser interaction, authentication, IM bind, first inbound message, first durable write, or another product-specific path that unit tests cannot prove.

Record what was exercised and any unverified external dependency. Automated CI is the merge gate; main acceptance is the immediate dogfood gate.

## Failure Policy

A post-merge main failure is active work, not a deferred report.

- **Small, deterministic regression with a known correction:** create the shortest fix-forward branch and PR, run required CI, merge, and repeat main acceptance.
- **Security, data-loss, startup, broad, or unclear regression:** revert the merge first, restore a healthy main sandbox, then investigate in a task worktree.
- **Platform or operational limit:** classify it explicitly and apply a user-visible mitigation when possible; do not mislabel it as a code crash.

Main must not remain knowingly broken while unrelated work continues.

## Exceptions

### Default-off feature flags

Use a feature flag only when a capability must land in several independently safe pull requests and incomplete behavior cannot be exposed. Remove the flag when rollout is complete. Do not add speculative flag infrastructure.

### Pre-merge sandbox transfer

A topic worktree may temporarily own 3081 only when pre-merge validation is required for an irreversible migration, authentication boundary, external side effect, or similarly high-risk path that CI cannot safely cover.

The transfer must be explicit: stop the hub sandbox, start the topic sandbox, verify, stop it, return 3081 to the hub on main, and confirm monitoring is healthy. Never run two sandbox ports or let a worktree steal 3081.

## Adoption

The current hub may contain existing topic work. Before enforcing this design, preserve that work in its own worktree and restore the repository root to clean `main`. This is a one-time migration, not an exception to the steady-state rule.

The first implementation is documentation-only:

- make the hub/main/3081 invariant a hard rule in `AGENTS.md`
- update Git and sandbox truth in both `docs/conventions.md` languages
- update development, merge cleanup, and acceptance steps in both `docs/workflow.md` languages
- keep contributor guidance concise and point it at those normative files

No new branch manager, daemon, port, dependency, or custom automation is required. Existing Git, GitHub CI, `pnpm dev`, and journey monitoring are sufficient.

## Success Criteria

- The repository root is clean and on current `main` during normal operation.
- Only the root main checkout owns 3081 during normal development.
- Development occurs on short-lived topic branches/worktrees.
- Required CI passes before merge.
- Every merge is followed by hub fast-forward, sandbox health confirmation, and an affected real journey on main.
- Main failures are fixed forward or reverted immediately.
- Topic branches and worktrees are cleaned only after merge provenance and cleanliness are confirmed.
- Official 3080 is never touched by this loop.
