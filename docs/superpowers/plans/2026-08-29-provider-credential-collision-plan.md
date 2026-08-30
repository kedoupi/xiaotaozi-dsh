# Provider Credential Collision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent two accepted custom-provider IDs from deriving and sharing one credential reference.

**Architecture:** Tighten the existing ID grammar so each hyphen separates two non-empty alphanumeric segments. Because hyphen is the only accepted punctuation, this makes the current `credentialRef()` mapping injective for newly created IDs while legacy declared providers remain removable.

**Tech Stack:** TypeScript, Vitest, existing Host settings/credentials interfaces.

**Spec:** Approved Critical-fix design in the 2026-08-29 conversation; finding in `docs/reviews/2026-08-29-plugin-observability-cr.md`.

## Global Constraints

- Do not read or log credential values.
- Reject invalid IDs before `credentials.set()` or settings mutation.
- Preserve removal of legacy Host-declared IDs, including repeated-hyphen IDs.
- Do not add dependencies or commit/push.

---

### Task 1: Make custom-provider IDs credential-reference-safe

**Files:**
- Modify: `plugins/providers/tests/custom-provider.test.ts`
- Modify: `plugins/providers/src/custom-provider.ts:6,129-131`

**Interfaces:**
- Consumes: custom provider `id`.
- Produces: accepted new IDs matching `custom-<segment>(-<segment>)*`; legacy declared IDs remain removable.

- [ ] **Step 1: Write failing collision and legacy-removal tests**

Add a test that rejects `custom-acme--prod` before any write:

```ts
const rejected = makeHost({ declared: [{ provider: 'custom-acme-prod', declared: true }] })
await expect(new CustomProviderStore(rejected.host).create({
  ...draft,
  id: 'custom-acme--prod',
})).rejects.toThrow('ID')
expect(rejected.calls).toEqual([])
```

Extend the legacy-removal test with `custom-acme--prod` declared by the Host and assert settings unset plus `CUSTOM_ACME_PROD_API_KEY` credential cleanup still occurs.

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm --filter dsh-providers exec vitest run tests/custom-provider.test.ts
```

Expected: FAIL because repeated hyphens are accepted during create.

- [ ] **Step 3: Tighten only the create grammar**

Replace the current regex with:

```ts
const CUSTOM_ID = /^custom-[a-z0-9]+(?:-[a-z0-9]+)*$/;
```

Do not add another normalizer. Existing `remove()` already allows a non-matching ID when the Host declares it as custom, preserving legacy cleanup.

- [ ] **Step 4: Verify GREEN and plugin gates**

Run:

```bash
pnpm --filter dsh-providers exec vitest run tests/custom-provider.test.ts
pnpm --filter dsh-providers test
pnpm --filter dsh-providers typecheck
pnpm --filter dsh-providers build
```

Expected: all pass; no rejected create reaches credential or settings writes.
