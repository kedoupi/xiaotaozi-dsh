# Plugin Observability and Test Coverage Design

## Goal

Review all six first-party plugins, add missing high-value sandbox traces and necessary production warnings/errors, and add regression-focused unit tests without changing business behavior.

## Scope

The review and implementation cover these plugins in risk order:

1. `plugins/im`
2. `plugins/sidebar`
3. `plugins/providers`
4. `plugins/wecom-office`
5. `plugins/market`
6. `plugins/xtz-ui`

The work includes:

- a whole-system correctness, security, data-loss, lifecycle, and recovery review;
- a per-plugin observability and test-gap matrix;
- sandbox traces for missing critical lifecycle and operation boundaries;
- production `warn` or `error` logs only for actionable failures;
- unit tests for confirmed high-risk gaps;
- plugin-local and repository-wide verification.

## Non-goals

- Do not add a metrics, telemetry, tracing, or log aggregation platform.
- Do not add a shared package or cross-plugin logging abstraction.
- Do not set a line-coverage percentage target.
- Do not add logs to every function or test every implementation detail.
- Do not fix business defects found by the review. Report them for separately approved work.
- Do not change plugin versions, product versions, public APIs, CI, or release configuration.
- Do not touch official `~/.dsh` or port 3080.

## Current Baseline

All six plugins already use Vitest and expose `test`, `typecheck`, and `build` scripts. Each plugin already has a local `src/trace.ts` implementation and a `tests/trace.test.ts` contract. Sandbox development enables `DSH_PLUGIN_TRACE=1`; official `xtz start` does not.

The existing structure is sufficient. The implementation must reuse each plugin's local `pluginTrace()` and existing host/client logger rather than introducing another logging layer.

## Review Method

The review starts from a recorded Git `HEAD` and clean/dirty status. Existing test and build failures are recorded before edits so they are not misattributed to this task.

For each plugin, review these risk classes:

- lifecycle: mount, unmount, connect, reconnect, cancellation, shutdown;
- trust boundaries: user input, RPC payloads, file paths, uploads, permissions, credentials;
- durable work: sessions, files, settings, catalog mutation, task state;
- external dependencies: API calls, subprocesses, sockets, host services;
- asynchronous behavior: retries, races, queues, partial completion, cleanup;
- recovery: fallback paths, stale state, restart behavior, safe error responses;
- observability: whether an operator can identify the failed operation and outcome without sensitive data;
- tests: whether critical behavior would regress undetected.

Findings are classified as:

- `Critical`: exploitable security issue, likely data loss, credential exposure, or system-wide unsafe behavior;
- `Important`: material correctness, reliability, permission, lifecycle, or recovery defect;
- `Minor`: limited-impact defect or meaningful maintainability risk.

Each finding includes an exact file and line, trigger, impact, evidence, and the smallest credible remediation. Findings are reported but not fixed in this task.

## Logging Contract

### Sandbox traces

Use the plugin's existing `pluginTrace()` for critical paths that are otherwise difficult to diagnose. Candidate events are:

- plugin or long-lived runtime startup and shutdown;
- external connection state changes;
- RPC and tool start plus terminal outcome;
- durable mutation start or terminal outcome;
- retry, fallback, recovery, cancellation, and cleanup outcomes;
- asynchronous task terminal states.

Prefer compact, stable fields:

```text
operation target=<short-id> start
operation target=<short-id> ok ms=<duration>
operation target=<short-id> error=<safe-code> ms=<duration>
```

Not every operation needs all three lines. High-frequency paths should log only the minimum events needed to distinguish accepted, dropped, recovered, and failed work.

### Production logs

Use existing host `ctx.logger.warn/error` or the plugin's established logger only when the failure is actionable in the official environment. Production success and routine lifecycle messages remain silent. Existing client `console.warn/error` calls are not mass-migrated unless the review identifies an operational gap.

### Data safety

Logs and traces must not include:

- tokens, passwords, secrets, credentials, authorization headers, or encryption keys;
- complete message text, prompts, generated content, documents, or file contents;
- full user, bot, session, message, task, or workspace identifiers;
- unfiltered external payloads or stack objects that may contain secrets;
- absolute user paths unless an existing safe diagnostic contract explicitly requires them.

Use existing `shortId`, safe error codes, counts, booleans, operation names, and durations. Any new summarizer must stay plugin-local and exist only when direct formatting cannot meet the safety rule.

Logging must not alter control flow, swallow an existing error, add a retry, or turn a successful operation into a failure.

## Test Strategy

Tests are selected by behavior risk, not file count or coverage percentage. Priorities are:

1. state transitions and terminal outcomes;
2. trust-boundary validation and redaction;
3. timeout, failure, fallback, and cleanup behavior;
4. races and duplicate work;
5. persistence consistency after success or failure.

Tests import pure logic where possible and use existing seams around host services. They do not mock the whole Harness. A new abstraction is not added solely to make logging mockable.

Production changes follow red-green-refactor:

1. add one failing test that demonstrates the missing trace or unsafe failure diagnostic;
2. run it and confirm the expected failure;
3. make the smallest production change;
4. run the focused test and the plugin suite;
5. simplify while keeping the suite green.

Characterization tests for unchanged behavior must identify the concrete production mutation that would make them fail. Assertions focus on behavior and stable event fields, not complete timestamped log strings or internal call counts.

Likely review focus by plugin:

- `im`: binding confirmation race, deduplication, channel connection lifecycle, delivery terminal states, reconnect/recovery, interaction cancellation, trace redaction;
- `sidebar`: file/path trust boundaries, upload failures, terminal lifecycle, API/tool terminal outcomes, callback isolation, reconnect termination;
- `providers`: authentication lifecycle, catalog fallback/invalidation, generation terminal outcomes, input/reference validation, RPC failures;
- `wecom-office`: identity activation, QR lifecycle, CLI argument redaction, tool terminal outcomes, document operation failures;
- `market`: source validation, install/remove intent outcomes, partial mutation failure, safe error mapping;
- `xtz-ui`: archive/board/git-graph durable mutations, task execution lifecycle, recovery and route failures.

These are review targets, not pre-authorized code changes. The gap matrix determines exact tests and trace points.

## Execution Batches

### Batch 0: Baseline and review

- Record `HEAD`, branch, and working tree state.
- Run the existing repository checks and record failures.
- Review all six plugins and build the finding and gap matrices.
- Stop and report immediately if a `Critical` issue affects security or data safety.

### Batches 1–6: Per-plugin changes

Process one plugin at a time in the approved risk order. Each batch:

1. confirms exact trace and test gaps from the review;
2. adds characterization tests for unchanged critical behavior;
3. adds failing tests before any production trace/log change;
4. makes only the minimum plugin-local production edits;
5. runs that plugin's focused tests, full tests, typecheck, and build;
6. records changes and unresolved findings before moving on.

Changes stay under the current plugin's `src/` and `tests/` unless a verified repository gate defect requires separate approval.

### Final system verification

Run:

```bash
pnpm check
pnpm check:build
pnpm check:path
pnpm check:cli
```

After confirming port 3081 is free or owned by this checkout, use the sandbox only to verify representative real trace output with `DSH_PLUGIN_TRACE=1`. Do not start or modify the official service.

If sandbox verification cannot run safely, report it as unverified rather than taking the port.

## Deliverables

- Whole-system CR findings, ordered by severity.
- Per-plugin observability and unit-test gap matrix.
- Exact list of added trace/log points and their safety fields.
- Exact list of added tests and protected behaviors.
- Commands run with actual pass/fail results.
- Separate backlog of business defects requiring future approval.

The work is not automatically committed or pushed.

## Stop Conditions

Pause and report before continuing when:

- a `Critical` security, credential exposure, or data-loss issue is found;
- a proposed log needs sensitive data to be useful;
- a new test exposes an existing business defect that would require behavior changes;
- the change would alter a public API, dependency set, CI, auth, permission, or release behavior;
- port 3081 belongs to another checkout;
- a baseline failure prevents reliable attribution of new failures.
