# IM Artifact Workspace Containment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent `dsh_im_return_file` from delivering files whose canonical target is outside the active Session workspace.

**Architecture:** Keep the existing snapshot and delivery pipeline. Add one stdlib canonical-containment check in `snapshotFile()`, preserve absolute paths only when they resolve inside the workspace, and retain existing support for in-workspace symlinks.

**Tech Stack:** JavaScript, Node.js `node:path`/`node:fs/promises`, Vitest.

**Spec:** Approved Critical-fix design in the 2026-08-29 conversation; finding in `docs/reviews/2026-08-29-plugin-observability-cr.md`.

## Global Constraints

- Do not add a file approval API or dependency.
- Do not block sensitive-looking names inside the approved workspace.
- Do not log paths, content, or credentials.
- Do not change artifact delivery after registration.
- Do not commit or push.

---

### Task 1: Reject canonical workspace escapes

**Files:**
- Modify: `plugins/im/tests/outbound-artifact.test.ts:83-118`
- Modify: `plugins/im/src/channels/shared/semantic/artifact.ts:5,181-199,587`

**Interfaces:**
- Consumes: `workspace` from `agent.session.header.cwd` and requested tool path.
- Produces: artifact snapshots only for canonical files inside the canonical workspace; rejected escapes carry `code: "artifact-outside-workspace"`.

- [ ] **Step 1: Write the failing regression test**

Replace the outside-workspace success test with assertions that both an absolute outside file and an escaping workspace symlink reject with `artifact-outside-workspace`, and that `registry.take()` returns `[]`. Keep the existing absolute in-workspace snapshot test and sensitive-looking in-workspace test unchanged.

```js
await assert.rejects(
  tool.definition.execute({ path: outsidePath }, execution(fx.agent, 'outside')),
  { code: 'artifact-outside-workspace' },
);
await assert.rejects(
  tool.definition.execute({ path: 'linked.txt' }, execution(fx.agent, 'linked')),
  { code: 'artifact-outside-workspace' },
);
assert.deepEqual(fx.registry.take('session-artifact', 7), []);
```

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm --filter dsh-im exec vitest run tests/outbound-artifact.test.ts -t 'outside-workspace'
```

Expected: FAIL because both files are currently delivered.

- [ ] **Step 3: Implement canonical containment with stdlib**

Import `relative` and `sep` from `node:path`. In `snapshotFile()`, canonicalize `workspace` and the candidate before copying:

```js
const canonicalWorkspace = await realpath(workspace);
const canonicalPath = await realpath(candidate);
const fromWorkspace = relative(canonicalWorkspace, canonicalPath);
if (fromWorkspace === '..' || fromWorkspace.startsWith(`..${sep}`) || isAbsolute(fromWorkspace)) {
  throw artifactError('artifact-outside-workspace', 'The requested file is outside the Session workspace.');
}
```

Keep the file-type check after containment. Update the parameter copy to “Path inside the current workspace; an absolute in-workspace path is also accepted.”

- [ ] **Step 4: Verify GREEN and plugin gates**

Run:

```bash
pnpm --filter dsh-im exec vitest run tests/outbound-artifact.test.ts
pnpm --filter dsh-im test
pnpm --filter dsh-im typecheck
pnpm --filter dsh-im build
```

Expected: all pass; absolute in-workspace and in-workspace symlink behavior remains covered.
