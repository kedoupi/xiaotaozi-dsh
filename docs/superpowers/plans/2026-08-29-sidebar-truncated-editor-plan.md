# Sidebar Truncated Editor Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep truncated text visible while making it impossible to edit or save the partial prefix over the original file.

**Architecture:** Add one pure editor policy beside existing pure load planning. `TextEditor` uses that policy for CodeMirror read-only state, save guards, toolbar state, and rendering; no host API changes are required.

**Tech Stack:** TypeScript, React, CodeMirror 6, Vitest.

**Spec:** Approved Critical-fix design in the 2026-08-29 conversation; finding in `docs/reviews/2026-08-29-plugin-observability-cr.md`.

## Global Constraints

- Truncated text remains viewable and selectable.
- Every save path—button, host toolbar, and `Mod-s`—must fail closed.
- Do not increase `readLimit` or append an unread tail heuristically.
- Do not add dependencies or commit/push.

---

### Task 1: Define and apply the truncated-text policy

**Files:**
- Create: `plugins/sidebar/tests/editor-truncation.test.ts`
- Modify: `plugins/sidebar/src/client/editor-load.ts`
- Modify: `plugins/sidebar/src/client/TextEditor.tsx:59-210,228-240,318,337,382-396`

**Interfaces:**
- Produces: `textEditorPolicy(content, truncated) -> { loaded, editable }`.
- Consumes: existing `FileViewerProps.content` and `FileViewerProps.truncated`.

- [ ] **Step 1: Write the failing pure policy test**

```ts
import { describe, expect, it } from 'vitest'
import { textEditorPolicy } from '../src/client/editor-load.ts'

describe('truncated text editor policy', () => {
  it('keeps a truncated prefix loaded but never editable', () => {
    expect(textEditorPolicy('prefix', true)).toEqual({ loaded: true, editable: false })
    expect(textEditorPolicy('complete', false)).toEqual({ loaded: true, editable: true })
    expect(textEditorPolicy(undefined, false)).toEqual({ loaded: false, editable: false })
  })
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm --filter dsh-sidebar exec vitest run tests/editor-truncation.test.ts
```

Expected: FAIL because `textEditorPolicy` does not exist.

- [ ] **Step 3: Add the minimum pure policy**

In `editor-load.ts`:

```ts
export function textEditorPolicy(content: string | undefined, truncated: boolean | undefined): {
  loaded: boolean
  editable: boolean
} {
  const loaded = content !== undefined
  return { loaded, editable: loaded && truncated !== true }
}
```

- [ ] **Step 4: Apply the policy to every editor entry point**

In `TextEditor.tsx`:

- import and compute `{ loaded, editable }` once per render;
- add `EditorState.readOnly.of(!editable)` and `CodeMirrorView.editable.of(editable)`;
- add `!editable` to the first guard in `save()`;
- keep toolbar `editable` sourced from the policy;
- render the CodeMirror surface when `loaded`, not only when `editable`;
- show the truncation banner whenever the truncated surface is visible.

Include `editable` in the editor-creation effect dependencies so a changed load policy cannot leave a stale writable view.

- [ ] **Step 5: Verify GREEN and plugin gates**

Run:

```bash
pnpm --filter dsh-sidebar exec vitest run tests/editor-truncation.test.ts
pnpm --filter dsh-sidebar test
pnpm --filter dsh-sidebar typecheck
pnpm --filter dsh-sidebar build
```

Expected: all pass; truncated content is loaded with `editable: false`.
