# WeCom Local File Containment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permit local-file upload/import only for canonical regular files inside the current Session workspace.

**Architecture:** The tool execution context supplies `exec.agent.session.header.cwd`. A plugin-local policy recursively finds known credential-safe local path fields (`file_path`, `content_path`, `local_path`, `source_path`) in named and generic CLI JSON, canonicalizes them against the Session workspace, rejects escape/symlink/special-file inputs, and replaces accepted values with canonical in-workspace paths before spawning `wecom-cli`.

**Tech Stack:** TypeScript, Node.js `realpath`/`lstat`/`path`, DSH plain tool definitions, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-29-plugin-observability-tests-design.md`

## Global Constraints

- Approved policy A: only canonical regular files inside the current Session workspace.
- Calls without `exec.agent.session.header.cwd` may continue only when their JSON contains no local-file path.
- Keep the existing `allowWrite` default and service allowlist unchanged.
- Never log or expose requested/canonical paths, filenames, content, or full identifiers.
- Apply the same policy to named tools and `wecom_run` / `wecom_docs_run`.
- No new dependencies, public APIs, or credential changes; do not commit or push.

---

### Task 1: Local-file policy

**Files:**
- Create: `plugins/wecom-office/src/local-file-policy.ts`
- Create: `plugins/wecom-office/tests/local-file-policy.test.ts`

**Interfaces:**
- Produces: `containLocalFiles(value: Record<string, unknown>, workspace: string | undefined): Promise<Record<string, unknown>>`.
- Throws: `OfficeError("local-file-denied", fixed safe message)`.

- [ ] Add failing tests for no workspace, outside absolute path, `..` escape, escaping symlink, directory, and FIFO/special file.
- [ ] Add passing tests for an in-workspace regular file, an in-workspace symlink whose canonical target remains inside, relative paths, nested `attachments`/`inline_images`, and JSON with no local path.
- [ ] Assert returned accepted path fields contain canonical paths while the input object remains unchanged.
- [ ] Run the focused test and confirm RED because the policy module does not exist.
- [ ] Implement recursive copy-on-write traversal over arrays/plain objects; only the four approved key names are path-bearing. Resolve relative values below canonical workspace, use `realpath`, enforce strict containment with `relative`, and require `lstat(canonical).isFile()`.
- [ ] Re-run focused tests and confirm GREEN.

### Task 2: Tool execution wiring and trace safety

**Files:**
- Modify: `plugins/wecom-office/src/tools.ts`
- Modify: `plugins/wecom-office/src/errors.ts`
- Modify: `plugins/wecom-office/tests/tools.test.ts`
- Modify: `plugins/wecom-office/tests/trace.test.ts`

**Interfaces:**
- `registerOfficeTools` passes `exec.agent?.session.header.cwd` into `executeOfficeTool`.
- `executeOfficeTool` applies `containLocalFiles` after building JSON and before auth/spawn.

- [ ] Add failing tests proving `wecom_disk_upload`, `wecom_media_upload`, `wecom_mail_send`, `wecom_run`, and `wecom_docs_run` reject an outside canary before runner invocation.
- [ ] Add a passing tool test proving an in-workspace path reaches the runner only as its canonical path.
- [ ] Add a trace assertion that requested and canonical canaries never occur; only `error=local-file-denied` is emitted.
- [ ] Run focused tests and confirm RED.
- [ ] Add the fixed user message/code, accept the tool run context as the second execute argument, apply the policy, and keep existing control flow for path-free calls.
- [ ] Re-run focused tests and confirm GREEN.
- [ ] Run `pnpm --filter dsh-wecom-office test`, `typecheck`, and `build` sequentially.
