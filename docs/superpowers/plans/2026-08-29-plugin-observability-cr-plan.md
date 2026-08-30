# Plugin Observability CR and Gap Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce an evidence-backed whole-system code-review report and exact observability/test gap matrix for all six first-party plugins before changing production code.

**Architecture:** This is Phase 1 of the approved design. Review one self-contained plugin at a time, preserve baseline failures, and synthesize only source-backed findings. The accepted report becomes the input for six small plugin-local implementation plans; this avoids inventing logs or tests before the real gaps are known.

**Tech Stack:** TypeScript, React where present, Vitest 4.1.11, tsdown, pnpm, DeepSeek Harness plugin APIs.

**Spec:** `docs/superpowers/specs/2026-08-29-plugin-observability-tests-design.md`

## Global Constraints

- Review `plugins/im`, `plugins/sidebar`, `plugins/providers`, `plugins/wecom-office`, `plugins/market`, and `plugins/xtz-ui` in that order.
- Do not change plugin business behavior in this phase.
- Do not edit any plugin `src/` or `tests/` file in this phase.
- Do not add dependencies, coverage thresholds, shared packages, metrics, telemetry, CI, API, auth, permission, release, or version changes.
- Do not expose tokens, credentials, complete messages, file contents, absolute user paths, or full user/session/message/task identifiers in commands or reports.
- Do not touch official `~/.dsh`, port 3080, or sandbox port 3081 in this phase.
- Stop and report immediately on a `Critical` security, credential-exposure, or data-loss finding.
- Report business defects; do not fix them.
- Do not commit or push.

---

### Task 1: Record the immutable baseline

**Files:**
- Create during execution: `docs/reviews/2026-08-29-plugin-observability-cr.md`
- Read: `package.json`
- Read: `pnpm-workspace.yaml`
- Read: `scripts/check-manifest.mjs`
- Read: `scripts/check-path-install.mjs`
- Read: `apps/cli/package.json`

**Interfaces:**
- Consumes: Git snapshot `ce5f4e4` on branch `chore/plugin-observability-tests`.
- Produces: a report header containing the reviewed SHA, working-tree state, tool versions, plugin inventory, and baseline command results.

- [ ] **Step 1: Confirm the review snapshot and protect unrelated work**

Run:

```bash
git status --short --branch
git rev-parse HEAD
git diff --check
node --version
pnpm --version
```

Expected before Phase 1 execution: `HEAD` is `ce5f4e4`; only the approved spec and plan are untracked. If any unrelated file is modified, stop without resetting it.

- [ ] **Step 2: Capture the first-party inventory without dependencies or generated output**

Run:

```bash
find plugins -mindepth 1 -maxdepth 1 -type d -print | sort
for d in plugins/*; do
  slug=$(basename "$d")
  sources=$(git ls-files "$d/src" | wc -l | tr -d ' ')
  tests=$(git ls-files "$d/tests/*.test.ts" "$d/tests/**/*.test.ts" | sort -u | wc -l | tr -d ' ')
  printf '%-20s sources=%-4s tests=%s\n' "$slug" "$sources" "$tests"
done
```

Expected plugin set: `im`, `market`, `providers`, `sidebar`, `wecom-office`, `xtz-ui`.

- [ ] **Step 3: Run the repository baseline gates exactly as shipped**

Run each command separately and record its exit status and concise final result in the report:

```bash
pnpm check
pnpm check:build
pnpm check:path
pnpm check:cli
```

Do not repair a failure in this phase. A baseline failure that prevents attribution is a stop condition; otherwise retain it as known baseline evidence.

- [ ] **Step 4: Create the report with factual baseline results**

Create `docs/reviews/2026-08-29-plugin-observability-cr.md` with these populated sections:

```markdown
# Plugin Observability and Test Gap Review

## Snapshot

## Baseline gates

## Severity model

## Findings

## Observability gap matrix

## Test gap matrix

## Per-plugin verification evidence

## Deferred business-fix backlog
```

Copy the severity definitions from the approved spec. Enter actual command results, not expected or inferred results. Leave no empty heading: use `None` only when the completed review has produced no entries for that section.

- [ ] **Step 5: Verify the report contains no accidental secret material**

Run:

```bash
rg -n -i 'authorization:|bearer |api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|credential' docs/reviews/2026-08-29-plugin-observability-cr.md
```

Expected: no credential values. Legitimate risk-category words such as “credential exposure” may appear without values.

---

### Task 2: Review `dsh-im`

**Files:**
- Read fully: every tracked file under `plugins/im/src/`
- Read fully: `plugins/im/tests/trace.test.ts`
- Read by reviewed behavior: corresponding files under `plugins/im/tests/`
- Modify: `docs/reviews/2026-08-29-plugin-observability-cr.md`

**Interfaces:**
- Consumes: baseline report from Task 1 and the logging/test contracts in the spec.
- Produces: source-backed `im` findings plus exact trace and test candidates.

- [ ] **Step 1: Inventory runtime boundaries and existing protection**

Run:

```bash
git ls-files 'plugins/im/src/**' | sort
rg -n 'pluginTrace\(|ctx\.logger|#logger|console\.(warn|error)|catch\s*\(|process\.cwd\(|writeFile|rename|unlink|rm\(|setTimeout|setInterval|AbortSignal|reconnect|retry|cleanup|credential|token|secret' plugins/im/src
rg -n 'workspace|confirm|first|dedup|reconnect|retry|cancel|cleanup|redact|credential|trace|delivery|interaction' plugins/im/tests
```

Use the file inventory to read all source files, not only grep hits. Grep locates cross-cutting call sites; it does not replace reading callers and callees.

- [ ] **Step 2: Trace the highest-risk flows end to end**

Trace these concrete flows through host registration, controller/runtime/bridge, shared Harness client, state store, and tests:

- account bind → workspace confirmation → first inbound action → session creation;
- inbound message → duplicate/incomplete filtering → Harness request → streamed/final delivery;
- connection failure → reconnect/recovery → stop/cleanup;
- Harness interaction/approval → reply/cancel/expiry;
- credential load/save/restore and diagnostic redaction;
- artifact/file handoff and cleanup.

For every flow, record existing `start`, terminal success, terminal failure, retry/fallback, and dropped-work diagnostics. Mark a gap only when an operator cannot distinguish materially different outcomes.

- [ ] **Step 3: Validate tests against realistic mutations**

For each critical branch, name one realistic mutation: bypass confirmation, remove deduplication, create a session before readiness, lose a cancellation, swallow a delivery error, leak a secret field, skip cleanup, or stop reconnecting. Cite the existing test that fails for that mutation. If none exists, add one exact candidate to the test gap matrix with production file, observable behavior, fixture boundary, and expected assertion.

- [ ] **Step 4: Run the plugin suite without edits**

Run:

```bash
pnpm --filter dsh-im test
pnpm --filter dsh-im typecheck
pnpm --filter dsh-im build
```

Record actual results under `Per-plugin verification evidence`.

- [ ] **Step 5: Add only evidenced entries to the report**

Each `im` finding must include severity, `file:line`, trigger, impact, and minimal remediation. Each observability gap must include operation, existing diagnostics, missing outcome, safe fields, and the existing test seam. Each test gap must name the production mutation it catches.

---

### Task 3: Review `dsh-sidebar`

**Files:**
- Read fully: every tracked file under `plugins/sidebar/src/`
- Read fully: `plugins/sidebar/tests/trace.test.ts`
- Read by reviewed behavior: corresponding files under `plugins/sidebar/tests/`
- Modify: `docs/reviews/2026-08-29-plugin-observability-cr.md`

**Interfaces:**
- Consumes: baseline report and completed `im` entries.
- Produces: source-backed `sidebar` findings plus exact trace and test candidates.

- [ ] **Step 1: Inventory host/client trust boundaries and diagnostics**

Run:

```bash
git ls-files 'plugins/sidebar/src/**' | sort
rg -n 'pluginTrace\(|ctx\.logger|console\.(warn|error)|catch\s*\(|readFile|writeFile|rename|unlink|rm\(|realpath|resolve\(|relative\(|node-pty|WebSocket|upload|terminal|AbortSignal|setTimeout|setInterval' plugins/sidebar/src
rg -n 'trust|security|path|media|upload|terminal|WebSocket|boundary|trace|error|reconnect|callback' plugins/sidebar/tests
```

Read every source file. Follow every externally reachable route/tool/client service into path checks, filesystem calls, terminal ownership, socket lifecycle, and error mapping.

- [ ] **Step 2: Trace the highest-risk flows end to end**

Trace:

- requested path → trust fence → read/write/upload result;
- terminal create/connect/input/resize/close and failed `node-pty` load;
- API/tool invocation → callback isolation → terminal outcome;
- reconnect loop → permanent stop condition;
- media preview and URL target handling;
- client render/plugin callback failures that could strand user state.

Record diagnostics only where they identify operation and terminal outcome without leaking absolute paths or content.

- [ ] **Step 3: Validate tests against realistic mutations**

Check whether tests fail if path containment is bypassed, symlink/media validation is removed, upload errors become success, terminal cleanup is skipped, a reconnect loop continues permanently, or one plugin callback aborts sibling callbacks. Add exact gaps to the report only where no current test protects the behavior.

- [ ] **Step 4: Run the plugin suite without edits**

Run:

```bash
pnpm --filter dsh-sidebar test
pnpm --filter dsh-sidebar typecheck
pnpm --filter dsh-sidebar build
```

Record actual results.

- [ ] **Step 5: Add only evidenced entries to the report**

Apply the same finding and matrix fields as Task 2. Do not treat low test-file count or source-line ratio as a defect by itself.

---

### Task 4: Review `dsh-providers`

**Files:**
- Read fully: every tracked file under `plugins/providers/src/`
- Read fully: `plugins/providers/tests/trace.test.ts`
- Read by reviewed behavior: corresponding files under `plugins/providers/tests/`
- Modify: `docs/reviews/2026-08-29-plugin-observability-cr.md`

**Interfaces:**
- Consumes: baseline report and prior plugin entries.
- Produces: source-backed `providers` findings plus exact trace and test candidates.

- [ ] **Step 1: Inventory provider, auth, generation, and cache boundaries**

Run:

```bash
git ls-files 'plugins/providers/src/**' | sort
rg -n 'pluginTrace\(|ctx\.logger|console\.(warn|error)|catch\s*\(|fetch\(|AbortSignal|setTimeout|credential|token|oauth|catalog|cache|invalidate|writeFile|image_generate|video_generate' plugins/providers/src
rg -n 'auth|device|catalog|cache|invalidate|selection|image|video|reference|abort|trace|error|fallback' plugins/providers/tests
```

- [ ] **Step 2: Trace the highest-risk flows end to end**

Trace:

- login/device authorization → credential persistence → logout/revocation;
- dynamic catalog discovery → cache/fallback → 401 invalidation;
- RPC dispatch → safe public error;
- image/video tool validation → external request → file result → terminal error;
- reference inputs and local/remote resource handling;
- cancellation and timeout propagation.

- [ ] **Step 3: Validate tests against realistic mutations**

Check whether tests fail if a 401 leaves stale catalog data, disabled providers become selectable, abort is ignored, invalid references reach a provider, failed generation reports success, partial files survive incorrectly, or an auth diagnostic exposes credential material. Add only unprotected behaviors to the matrices.

- [ ] **Step 4: Run the plugin suite without edits**

Run:

```bash
pnpm --filter dsh-providers test
pnpm --filter dsh-providers typecheck
pnpm --filter dsh-providers build
```

Record actual results.

- [ ] **Step 5: Add only evidenced entries to the report**

Distinguish operational quota/status responses from failures; do not recommend noisy traces for routine polling endpoints.

---

### Task 5: Review `dsh-wecom-office`

**Files:**
- Read fully: every tracked file under `plugins/wecom-office/src/`
- Read fully: `plugins/wecom-office/tests/trace.test.ts`
- Read by reviewed behavior: corresponding files under `plugins/wecom-office/tests/`
- Modify: `docs/reviews/2026-08-29-plugin-observability-cr.md`

**Interfaces:**
- Consumes: baseline report and prior plugin entries.
- Produces: source-backed `wecom-office` findings plus exact trace and test candidates.

- [ ] **Step 1: Inventory identity, CLI, tool, and document boundaries**

Run:

```bash
git ls-files 'plugins/wecom-office/src/**' | sort
rg -n 'pluginTrace\(|ctx\.logger|console\.(warn|error)|catch\s*\(|spawn|exec|argv|credential|token|secret|qr|activate|document|write|AbortSignal|setTimeout' plugins/wecom-office/src
rg -n 'auth|identity|qr|cli|redact|tool|document|layout|trace|error|activate' plugins/wecom-office/tests
```

- [ ] **Step 2: Trace the highest-risk flows end to end**

Trace:

- IM identity discovery/manual bind → activation → stale identity removal;
- QR start/poll/cancel/expiry/failure;
- CLI argument construction → subprocess result → safe trace;
- tool input → document operation → output normalization/error;
- status/configure RPC validation and public error mapping.

- [ ] **Step 3: Validate tests against realistic mutations**

Check whether tests fail if CLI secrets are logged, QR terminal state is wrong, a stale bot remains active, tool failures become successful output, document layout requirements are bypassed, or malformed RPC actions mutate configuration.

- [ ] **Step 4: Run the plugin suite without edits**

Run:

```bash
pnpm --filter dsh-wecom-office test
pnpm --filter dsh-wecom-office typecheck
pnpm --filter dsh-wecom-office build
```

Record actual results.

- [ ] **Step 5: Add only evidenced entries to the report**

Treat CLI stdout/stderr length as safe metadata; never copy their contents into the report.

---

### Task 6: Review `dsh-market`

**Files:**
- Read fully: every tracked file under `plugins/market/src/`
- Read fully: `plugins/market/tests/trace.test.ts`
- Read by reviewed behavior: corresponding files under `plugins/market/tests/`
- Modify: `docs/reviews/2026-08-29-plugin-observability-cr.md`

**Interfaces:**
- Consumes: baseline report and prior plugin entries.
- Produces: source-backed `market` findings plus exact trace and test candidates.

- [ ] **Step 1: Inventory catalog, source, mutation, and route boundaries**

Run:

```bash
git ls-files 'plugins/market/src/**' | sort
rg -n 'pluginTrace\(|ctx\.logger|console\.(warn|error)|catch\s*\(|fetch\(|installSpec|source|install|remove|update|validate|writeFile|AbortSignal' plugins/market/src
rg -n 'catalog|source|install|remove|intent|mutation|validation|trace|error|third.party' plugins/market/tests
```

- [ ] **Step 2: Trace the highest-risk flows end to end**

Trace:

- built-in and third-party catalog load → validation → search/display;
- source add/remove → persistence → refreshed catalog;
- install/remove intent → plugin mutation → settle/result mapping;
- malformed, unsupported, or forbidden install specs;
- partial mutation and host-command failure.

- [ ] **Step 3: Validate tests against realistic mutations**

Check whether tests fail if `link:`/`file:` input is accepted, source IDs collide, mutation failure reports success, remove targets the wrong package, third-party source policy is bypassed, or unsafe upstream errors reach the client.

- [ ] **Step 4: Run the plugin suite without edits**

Run:

```bash
pnpm --filter dsh-market test
pnpm --filter dsh-market typecheck
pnpm --filter dsh-market build
```

Record actual results.

- [ ] **Step 5: Add only evidenced entries to the report**

Do not recommend a host logger merely because none exists; require an actionable official-environment failure that current route results cannot diagnose.

---

### Task 7: Review `dsh-xtz-ui`

**Files:**
- Read fully: every tracked file under `plugins/xtz-ui/src/`
- Read fully: `plugins/xtz-ui/tests/trace.test.ts`
- Read by reviewed behavior: corresponding files under `plugins/xtz-ui/tests/`
- Modify: `docs/reviews/2026-08-29-plugin-observability-cr.md`

**Interfaces:**
- Consumes: baseline report and prior plugin entries.
- Produces: source-backed `xtz-ui` findings plus exact trace and test candidates.

- [ ] **Step 1: Inventory archive, board, Git, settings, and host-route boundaries**

Run:

```bash
git ls-files 'plugins/xtz-ui/src/**' | sort
rg -n 'pluginTrace\(|ctx\.logger|console\.(warn|error)|catch\s*\(|readFile|writeFile|rename|unlink|rm\(|git|archive|board|task|cancel|recover|settings|AbortSignal' plugins/xtz-ui/src
rg -n 'archive|board|runner|recover|git|settings|trace|error|cancel|delete|route' plugins/xtz-ui/tests
```

- [ ] **Step 2: Trace the highest-risk flows end to end**

Trace:

- archive/unarchive/delete and persistence outcome;
- board task create/move/run/cancel/delete;
- task runner start/terminal state/orphan recovery;
- Git graph read and branch switch validation/failure;
- settings write/remount and host route errors.

- [ ] **Step 3: Validate tests against realistic mutations**

Check whether tests fail if delete removes the wrong record, cancelled tasks remain running, orphan recovery is skipped, branch input reaches Git unsafely, failed persistence reports success, or settings remount loses enabled surfaces.

- [ ] **Step 4: Run the plugin suite without edits**

Run:

```bash
pnpm --filter dsh-xtz-ui test
pnpm --filter dsh-xtz-ui typecheck
pnpm --filter dsh-xtz-ui build
```

Record actual results.

- [ ] **Step 5: Add only evidenced entries to the report**

Do not duplicate shipped Session log behavior or add UI notifications as a substitute for host observability.

---

### Task 8: Synthesize and quality-gate the review

**Files:**
- Modify: `docs/reviews/2026-08-29-plugin-observability-cr.md`
- Read: `docs/superpowers/specs/2026-08-29-plugin-observability-tests-design.md`

**Interfaces:**
- Consumes: all six completed plugin reviews and baseline evidence.
- Produces: one review artifact ready for human approval and exact inputs for Phase 2 plans.

- [ ] **Step 1: Deduplicate cross-plugin findings without inventing a shared implementation**

When the same pattern appears in several plugins, keep separate `file:line` evidence and plugin-local remediation. Do not propose `packages/` or a shared logging package.

- [ ] **Step 2: Rank the implementation candidates**

Order observability and test gaps by:

1. credential/security/data-loss prevention;
2. durable-state correctness;
3. lifecycle and recovery reliability;
4. external-operation terminal visibility;
5. lower-impact diagnostics.

Every candidate must name one plugin, exact production file/function, exact behavior, safe event fields, exact test file, and the mutation the test catches.

- [ ] **Step 3: Validate every report citation**

Run:

```bash
rg -n '^### \[(Critical|Important|Minor)\]' docs/reviews/2026-08-29-plugin-observability-cr.md
rg -n 'T[B]D|T[O]DO|unknown[[:space:]]file|add[[:space:]]tests|improve[[:space:]]logging|appropri[a]te|as[[:space:]]needed' docs/reviews/2026-08-29-plugin-observability-cr.md
```

Expected: every finding heading has a severity; the second command returns no vague placeholders. Open every cited source location and confirm the report still matches it.

- [ ] **Step 4: Re-run documentation and diff safety checks**

Run:

```bash
git diff --check
git status --short --branch
git diff -- docs/superpowers/specs/2026-08-29-plugin-observability-tests-design.md docs/superpowers/plans/2026-08-29-plugin-observability-cr-plan.md docs/reviews/2026-08-29-plugin-observability-cr.md
```

Expected: only approved planning/review documents changed; no plugin source, tests, generated `lib/`, home, credential, or dependency file appears.

- [ ] **Step 5: Request human review before Phase 2**

Present:

- baseline gate results;
- findings ordered by severity;
- the ranked observability/test gap matrix;
- any stopped or unverified area;
- confirmation that no business behavior was changed.

After the report is approved, write one plugin-local implementation plan at a time in the approved risk order. Each Phase 2 plan must contain exact failing tests, exact source edits, focused commands, plugin gates, and the final repository gates from the spec. Do not begin Phase 2 production changes from an unapproved gap matrix.
