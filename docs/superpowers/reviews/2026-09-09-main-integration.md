# Main integration — blocked Draft candidate

This is an integration handoff, **not a green or merge-ready candidate**. The owner explicitly authorized a Draft PR retaining the failing regression below. No automatic merge, release, service restart, real-account operation or third-party installation is authorized by this report.

## Lineage and conflict resolution

- Original remediation baseline: `3bc5f8cf68be4310ef83f45051e7cdeabda0c64f`.
- Saved remediation: `a0deee48789d4ea88ba8e79dcb9cd0b4eae49cc1`.
- First main integration: `19016c1c8fcebd5cbfb140244929fd86e61733a1`, incorporating `68b09a926045b0d0a6205297b4a44303f8bf10ee` with 13 conflicted files resolved.
- Follow-up main tip: `f21662abce422e43bcda429fcd9ad6fcfa73d8b7` (#223), removing the task board. Its two conflicts retain the board deletion, including the obsolete runtime-contract test.
- Preserve main's market presentation, ghost-style hero chips, canonical QUOTA/account-wide failover and board removal. Preserve remediation's request/generation fencing, session attribution, scoped refresh, credential intent and truthful market recovery.
- Hero positioning operates on owned nodes only. It does not move or style shared Host slot cells. Historical copy remains historical rather than claiming a current turn.

## Blocking findings

### 1. Same-step QUOTA failover leaves a stale system prompt

`plugins/providers/tests/router-runtime.test.ts` → `fails over a QUOTA model to another provider in the same step` fails intentionally as a retained regression, not a skipped test.

The adapter switches from `deepseek-official/deepseek-v4-pro` to `kimi/kimi-for-coding`, but its system prompt still says `provider=deepseek-official model=deepseek-v4-pro`. Published RC1 AgentLoop renders `system` once before its same-step retry loop; the `agent/request` waterfall changes call configuration, not that captured prompt. A supported solution preserving both prompt consistency and same-step failover has not been established. No upstream patch, second prepare call or dependency upgrade was introduced.

Focused reproduction (use an isolated disposable test HOME/DSH_HOME and the installed pinned toolchain):

```sh
pnpm --filter dsh-providers exec vitest run tests/router-runtime.test.ts
```

The regression also checks decision/session/step attribution and failover notice. Existing late-result, generation, authorization, cooldown and same-account exclusion tests remain enabled.

### 2. Rendered hero placement remains unverified

One separately authorized local composer fixture ran after the first integration build. It failed at `assertHeroPlacement` while checking the historical hero chip (`page.waitForFunction`, 10-second timeout). The cause is not established; do not classify this as merely a test problem or claim the later HMR/disposal assertions passed.

The earlier active-card width checks and selection/loading checks were reached before this failure. The complete fixture did **not** pass. The subsequent #223 integration was not browser-tested; the one-run authorization was not reused.

Chrome exited with code 0 after test cleanup. The three observed process IDs were independently absent and its temporary profile was removed. Browser stderr included display/allocator warnings, two TLS handshake failures and a deprecated registration-endpoint error. Destinations and background/system effects remain unknown. Page routing and temporary profiles are not OS-level isolation.

## Verification

Darwin arm64, Node 24.18.0, installed pnpm 11.22.0; no dependency installation. Commands used explicit safe expansions rather than claiming nested wrappers passed. Each invocation bound source inputs, logical stage rows, dependency metadata/links and toolchain hashes before/after.

| Check | Result |
| --- | --- |
| Final plugin unit suites (`pnpm -r --filter './plugins/**' test`) | **2501 passed, 1 failed**, 233 files; only the prompt-consistency regression failed |
| Final plugin typecheck | Passed |
| Script tests | 100 passed |
| Final pinned runtime contracts | 10 passed; board case removed by #223 |
| CLI tests / typecheck / build | 294 passed / passed / passed; CLI unchanged by subsequent main integration |
| Pinned protocol journeys, mocked external transport | 16 passed; relevant sources unchanged by #223 |
| Final plugin build / required-lib manifest | Passed / passed |
| Final manifest / UI design policy | Passed / passed |
| Local rendered composer fixture | **Failed** as above; no retry |
| Git whitespace / conflict-marker checks | Passed before merge completion |

An initial protocol invocation failed before product imports because its external temporary HOME did not satisfy the test's plan-owned HOME assertion. The runner was corrected to use a new owned plan fixture while retaining external TMPDIR, and all 16 tests passed. An intermediate typecheck caught four hook-fixture snapshots missing the newly consumed `blank` field; those fixtures were corrected and final typecheck passed. Earlier failures are retained, not relabeled successes.

## Remaining acceptance scope

R4 (supported stalled-attempt cancellation/retirement), R6 (complete UI journey), R9 (real third-party activation/functionality) and R11 (full acceptance) remain blocked. All 17 real user journeys remain unaccepted. No live DSH, official home/3080, sandbox/3081 transfer, real credentials/models, third-party/native installation, `check:path`, Node 22, Windows or Linux verification was performed in this integration.

The root main checkout and running services were left untouched. The topic worktree and local evidence are retained. Historical acceptance reports describe their original snapshots; they are not final-main acceptance seals.
