# Plugin Observability and Test Gap Review

## Snapshot

- Date: 2026-08-29
- Branch: `chore/plugin-observability-tests`
- Reviewed base SHA: `ce5f4e48dc3230ded0306c870e8ce8e4cd4fb2dd`
- Initial working tree: approved design and execution plan only; no plugin source or test modifications
- Node.js used for baseline: `v24.18.0`
- pnpm used for baseline: `11.22.0`
- First-party plugins:
  - `dsh-im`: 220 tracked source files, 109 test files
  - `dsh-sidebar`: 111 tracked source files, 9 test files
  - `dsh-providers`: 44 tracked source files, 19 test files
  - `dsh-wecom-office`: 23 tracked source files, 16 test files
  - `dsh-market`: 24 tracked source files, 10 test files
  - `dsh-xtz-ui`: 71 tracked source files, 21 test files

## Baseline gates

| Gate | Result | Evidence |
| --- | --- | --- |
| `pnpm check` | PASS | 6 plugin manifests and 2 templates checked; UI checks passed; all plugin typechecks passed; 152 plugin test files / 1,372 plugin tests passed; 63 script tests passed |
| `pnpm check:build` | PASS | All 6 plugins built; manifest check passed with required `lib/` |
| `pnpm check:path` | PASS | All 6 standalone Git path installs verified; pnpm emitted non-fatal peer-dependency warnings |
| `pnpm check:cli` | PASS with environment warning | CLI typecheck, build, and 65 tests passed; pnpm warned that Node `24.18.0` does not match required Node `22.19.0` |

The Node engine warning is baseline environment evidence, not a plugin failure. Phase 1 does not modify the CLI or Node installation.

## Severity model

- `Critical`: exploitable security issue, likely data loss, credential exposure, or system-wide unsafe behavior.
- `Important`: material correctness, reliability, permission, lifecycle, or recovery defect.
- `Minor`: limited-impact defect or meaningful maintainability risk.

## Findings

### [Critical] `dsh-im` can deliver arbitrary host-readable files to an IM conversation

- Location: `plugins/im/src/channels/shared/semantic/artifact.ts:181-199`, `plugins/im/src/channels/shared/semantic/artifact.ts:587`, `plugins/im/src/channels/shared/semantic/artifact.ts:645`
- Trigger: the model calls `dsh_im_return_file` with an absolute path or a workspace-relative symlink whose canonical target is outside the Session workspace.
- Impact: a file readable by the DSH process, including credential or configuration files, can be copied to managed storage and sent through the active IM conversation without a per-request file-access gate.
- Evidence: `snapshotFile()` canonicalizes the target but never compares it with the canonical workspace. The tool advertises absolute paths and is registered explicitly without a per-request Gate. Existing tests at `plugins/im/tests/outbound-artifact.test.ts:83-118` deliberately prove delivery of outside-workspace paths, escaping symlinks, and a sensitive-looking `.env` file. The focused existing test passed unchanged during this review.
- Smallest remediation: constrain normal delivery to strict canonical children of the Session workspace. Any broader existing-file delivery must use an explicit Harness-authorized file-read/approval boundary.

### [Critical] `dsh-sidebar` can overwrite a large file with only its displayed prefix

- Location: `plugins/sidebar/src/index.ts:206-239`, `plugins/sidebar/src/index.ts:351-363`, `plugins/sidebar/src/client/TextEditor.tsx:228-240`, `plugins/sidebar/src/client/TextEditor.tsx:318`
- Trigger: open a text file larger than `readLimit`, edit the displayed prefix, then save through the editor, host toolbar, or `Cmd/Ctrl+S`.
- Impact: the save succeeds while permanently deleting every byte beyond `readLimit`.
- Evidence: `readText()` returns only the leading `readLimit` bytes with `truncated: true`. `TextEditor` receives that flag but defines editability only as `content !== undefined`; `save()` sends the partial document to `fs.write`, which atomically replaces the full file.
- Smallest remediation: make truncated text read-only and hard-block every save entry point when `truncated === true`.

### [Critical] `dsh-providers` accepts distinct custom-provider IDs that overwrite one credential reference

- Location: `plugins/providers/src/custom-provider.ts:6`, `plugins/providers/src/custom-provider.ts:53-55`, `plugins/providers/src/custom-provider.ts:129-139`, `plugins/providers/src/custom-provider.ts:180`
- Trigger: create two providers whose IDs differ only by repeated punctuation, such as `custom-acme-prod` and `custom-acme--prod`.
- Impact: both IDs derive the same credential reference. Creating the second provider overwrites the first provider's key; requests from the first provider can then send the second key to the first endpoint, and removal can unset a credential still referenced by the sibling provider.
- Evidence: `CUSTOM_ID` allows repeated hyphens while `credentialRef()` collapses each non-alphanumeric run to one underscore. Uniqueness checks compare provider IDs, not derived credential references. A temporary Vitest proof created both accepted IDs and observed one shared credential key with the second value.
- Smallest remediation: reject a create when its derived credential reference collides with any existing configurable provider; disallow repeated hyphens for new IDs while preserving legacy removal.

### [Critical] `dsh-xtz-ui` archive deletion accepts `.` and removes a workspace session bucket

- Location: `plugins/xtz-ui/src/archive/encode.ts:2-4`, `plugins/xtz-ui/src/archive/store.ts:123-135`, `plugins/xtz-ui/src/archive/store.ts:164-173`, `plugins/xtz-ui/src/archive/ledger.ts:326-370`
- Trigger: submit archive deletion with `sessionIds: ["."]`.
- Impact: all Session directories in the first workspace bucket are recursively deleted.
- Evidence: `isSafeSessionId(".")` returns true. `findSessionDir()` evaluates `join(workspaceBucket, ".")` as the bucket itself and returns it; `removeSessionDir()` recursively removes that path. A temporary Vitest proof created two Sessions in one bucket, called `deleteSessions(home, ["."])`, and confirmed the entire bucket was removed while the result reported `done: ["."]`.
- Smallest remediation: reject `.` and require every deletion target to be a strict canonical child of a workspace bucket before recursive removal.

The approved stop condition was reached. The remaining plugin flows and non-critical reviewer candidates are unassessed or not cross-validated; this report does not claim they are clean.

## Critical remediation status

All four Critical findings were subsequently fixed under their separately approved TDD plans:

- `dsh-im`: canonical targets must remain inside the canonical Session workspace; outside absolute paths and escaping symlinks are rejected, while in-workspace symlinks remain supported.
- `dsh-sidebar`: truncated prefixes stay visible but are read-only; the shared save guard uses the current editability state for button, host-toolbar, and keyboard paths.
- `dsh-providers`: new IDs have an injective grammar; creation checks actual credential refs across resolved/user/base settings layers and namespaces; removal requires user ownership, preserves shared refs, and custom-provider mutations are serialized.
- `dsh-xtz-ui`: `.` is rejected, symlinked workspace/session directories are not discovered, and recursive removal requires a canonical target exactly two levels below the Sessions root.

The review subsequently resumed across all six plugins. The additional evidence-backed remediation is summarized below.

## Observability gap matrix

| Plugin | Operation | Existing diagnostic | Missing terminal outcome | Safe fields | Existing test seam |
| --- | --- | --- | --- | --- | --- |
| `im` | `OutboundArtifactRegistry.stage()` | Delivery/provider failures occur later | registration accepted, policy rejected, aborted, preparation failed | shortened Session ID, result code, byte count, duration | `plugins/im/tests/outbound-artifact.test.ts` |
| `sidebar` | `fs.read` → editor load/save | truncated banner only | truncated read and blocked save | outcome, returned bytes, total bytes, configured limit | editor load tests plus a focused editor truncation test |
| `providers` | `CustomProviderStore.create/remove()` | RPC-level start/end only | credential-reference collision, compensation stage | shortened provider ID, stage, stable outcome, duration | `plugins/providers/tests/custom-provider.test.ts` |
| `xtz-ui` | archive delete route | start count only | success, partial failure, rejection, error | requested/deleted/not-found/error counts, duration | `plugins/xtz-ui/tests/archive.test.ts` |

## Test gap matrix

| Plugin | Exact test file | Missing regression | Production mutation caught |
| --- | --- | --- | --- |
| `im` | `plugins/im/tests/outbound-artifact.test.ts` | outside-workspace absolute paths, escaping symlinks, and sensitive files are rejected with no committed artifact | removing or weakening canonical workspace containment |
| `sidebar` | `plugins/sidebar/tests/editor-truncation.test.ts` | a truncated text result is non-editable and every save command is disabled | deriving editability from content presence alone |
| `providers` | `plugins/providers/tests/custom-provider.test.ts` | two IDs with one derived credential reference cannot both be created or unset each other's key | omitting credential-reference collision validation |
| `xtz-ui` | `plugins/xtz-ui/tests/store.test.ts`, `plugins/xtz-ui/tests/archive.test.ts` | `.` is unsafe and cannot resolve to or delete a workspace bucket | allowing a non-strict-child recursive deletion target |

## Additional six-plugin remediation

- `dsh-im`: accepted queued file prompts transfer staged-file cleanup to a background owner keyed by Session/prompt RPC until the matching turn ends or the Session disappears; unconfirmed workspace waits now abort with the runtime and are rejected when removal begins; rejected WeCom message handlers are contained with a fixed safe warning.
- `dsh-sidebar`: atomic saves use exclusive owned sibling temporaries and preserve file mode; stale save completion cannot clear a newer draft; POSIX containment no longer treats backslash as a separator; dirty merged-mode navigation shares the discard confirmation; WebSocket close errors use bounded fixed reasons and terminate safely if close itself throws.
- `dsh-providers`: OAuth/device generations are invalidated by cancel/logout/unload, session commits are serialized and compensated if invalidated mid-write, and logout runs after in-flight compensation; generated-video downloads accept only credential-free HTTPS `x.ai` origins and validate every redirect.
- `dsh-wecom-office`: local files are canonical regular files strictly inside the Session workspace and are copied through validated handles into private snapshots; aggregate staging and CLI output are configurable and bounded; abort/timeout kills the POSIX process group or Windows process tree and waits for close; public errors and traces do not expose CLI payloads, paths, or raw output.
- `dsh-market`: profile mutations are process-wide serialized and revalidated after queue acquisition; timeout kills the POSIX process group and settles only after close; child output is drained rather than retained and raw subprocess errors no longer cross HTTP or trace boundaries.
- `dsh-xtz-ui`: archive membership, workspace identity, exact encoded lookup, transactional trash/rollback, and live fail-closed behavior were repaired; inherited `GIT_*` selectors are removed from Git children; board persistence is commit-before-publish and disposed services ignore late launch/poll results.

### Residual external CLI limitation

`wecom-cli` currently accepts Bot Secret and generic `--json` payloads only as command-line arguments. The plugin redacts traces/errors and shortens process lifetime, but cannot remove same-user OS process-list visibility without an upstream stdin/file-descriptor input contract. No secret or payload is written to repository logs or test output. Revisit when `wecom-cli` adds non-argv secret/JSON input.

## Post-remediation verification evidence

- TDD evidence: every added protection was observed failing before its implementation and passing afterward.
- Plugin gates passed after the final changes:
  - `dsh-im`: 109 test files / 1,032 tests, typecheck, build.
  - `dsh-sidebar`: 10 test files / 51 tests, typecheck, build.
  - `dsh-providers`: 19 test files / 110 tests, typecheck, build.
  - `dsh-wecom-office`: 17 test files / 79 tests, typecheck, build.
  - `dsh-market`: 10 test files / 55 tests, typecheck, build.
  - `dsh-xtz-ui`: 22 test files / 103 tests, typecheck, build.
- Final repository gates passed: `pnpm check`, `pnpm check:build`, `pnpm check:path`, and `pnpm check:cli`.
- `pnpm check:cli` retained the known environment warning: required Node `22.19.0`, current Node `24.18.0`; CLI typecheck, build, and 65 tests passed.
- Independent read-only review findings were addressed before final verification. No commit or push was performed.

## Remaining work

No evidence-backed repository defect remains open from this review. The only residual is the documented upstream `wecom-cli` argv input limitation. Final repository-wide gates and whole-branch review are recorded in the SDD ledger.
