# Plugin Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two competing plugin-management surfaces with one main-area Plugin Center, embedding the four existing first-party configuration components and safely managing installed third-party packages.

**Architecture:** `dsh-market` owns the product directory, installed projection, navigation and a root-scoped keyed detail slot declared by its `shell.overlay` registration. Independent plugins contribute their existing components and inject faces; their Host APIs and durable state stay where they are. `dsh-xtz-ui` relocates upstream runtime settings into Advanced using the existing settings-scope and credential domains, with a narrowly scoped DSH compatibility adapter hiding obsolete navigation.

**Tech Stack:** TypeScript, React 18.3, React DOM portals, pinned DSH `0.1.1-rc.2`, existing Vitest/react-test-renderer/node:test suites, existing semantic CSS. No new dependencies.

**Spec:** [Approved design](../specs/2026-09-04-plugin-center-design.md). Read both documents before execution.

## Global Constraints

- Approved delivery: “独立 spec、独立 topic branch、单个原子 PR”. These tasks are reviewable increments of one cross-package migration, not separately shipped features.
- “不新增依赖，不新建共享 package，不从 sibling plugin import source。” Each Git-path package must compile in isolation. Type-only local structural contracts are permitted; importing another first-party package's implementation is not.
- “不 fork DSH，不把独立插件合并成单体，也不复制各插件的业务状态。”
- “组件从旧入口迁移到 detail slot；它们的 Host API、settings namespace、credentials、session、storage 和用户配置路径不变。”
- “现有 intent 串行化、失败 settlement 和 same-origin/loopback guard 保持不变。”
- “不改变 catalog 的三条精选记录或安装来源。” No product/default-spec/plugin version bumps, reconciliation changes, remote sources, authentication-policy work or generated third-party forms.
- Capability ids are exactly `xiaotaozi`, `side-workbench`, `models`, `im`; slot is exactly `xiaotaozi.plugin-center.detail`, `{ kind: "keyed", scope: "root" }`.
- “插件中心只有两个一级页签：`已安装`（默认）与 `发现插件`。” No URL router/history. Built-ins cannot be removed or stopped by Plugin Center.
- “不读取、显示或复制 credentials 值。” Existing saved literals never enter read models; a newly typed replacement is write-only, memory-only and cleared only after confirmed success or explicit discard.
- “375px 无页面级横向滚动；coarse pointer 目标至少 44×44px”；“focus ring 可见，至少 2px”；“motion 只使用 120–160ms opacity/color/small transform，并遵守 `prefers-reduced-motion`。”
- Sole visual authority: [MASTER](../../../design-system/xiaotaozi-dsh/MASTER.md), including host font, DSH neutral surfaces, Fruit Orange primary emphasis, existing SVG family and no nested interactive elements. The approved main-area design supersedes MASTER's old **Marketplace: modal shell** sentence; Task 11 updates that sentence, not the palette or font.
- Gates use Node `22.19.0` / pnpm `11.22.0`. No dependency installs or gates were executed while writing this plan.
- Execution isolation ruling: from the authorized topic cwd, prefix **every** test/install/build/gate (including commands described only as “full tests/typecheck”) with `.superpowers/sdd/2026-09-05-plugin-center-plan/test-env.sh`. Exact examples: `.superpowers/sdd/2026-09-05-plugin-center-plan/test-env.sh pnpm --filter dsh-market test` and `.superpowers/sdd/2026-09-05-plugin-center-plan/test-env.sh node --test scripts/check-ui-design.test.mjs scripts/check-manifest.test.mjs`. The owned ignored wrapper isolates HOME/DSH_HOME/XDG/userconfig and uses external non-Git `/private/tmp/dsh-plugin-center-tests.VLFS38` for TMPDIR/TMP/TEMP. Installed Node/pnpm were resolved before HOME replacement; no real config/credentials are copied. See execution-contract for evidence and fail-closed rules. Historical baseline commands are not authorization to bypass this wrapper.
- Current task is **planning only**. No staging, commits, push, PR, service changes, network operations or functional edits are authorized by writing this document. Commit checkpoints below are for a later explicitly authorized execution; never stage unrelated work.
- Future behavior tests use fake/temporary homes and ephemeral test ports, never real profiles. The healthy clean-main hub owns **3081**. Browser acceptance requires an explicitly coordinated bounded transfer under [workflow](../../workflow.md#bounded-3081-transfer), then restoration of the hub. Never touch official `~/.dsh`/3080, sessions, storages or other profiles.

## Starting state and source evidence

Planning checkout: `/Users/codepi/Coding/dsh-plugins/.worktrees/plugin-center`, `feat/plugin-center`, HEAD `77c20c7a767c4360e7b90461dc89c091179078d6`. The pre-existing untracked approved spec is intentional and must not be rewritten. Its SHA-256 at planning time is `5cf66f31a7f718b9283f4445c3094613733a13f302c0ff25e54d4b0ec7e6057d`.

Read authority: [AGENTS](../../../AGENTS.md), [conventions](../../conventions.md), [workflow](../../workflow.md), [Harness deltas](../../harness-plugin.md), [plugin skill](../../../.grok/skills/dsh-plugin/SKILL.md). UI planning used ui-ux-pro-max's focused `keyboard tab focus restoration` UX search and `effect cleanup state preservation` React search. Visible/unobscured focus and effect disposal apply; its React 19 `useEffectEvent` recommendation does **not** apply to React 18.

| Inspected seam | Actual contract and consequence |
| --- | --- |
| `plugins/market/src/catalog.ts` | `MARKET_PLUGINS` has exactly Agent Teams, Context and OpenContext. Existing install detection matches package name **or exact spec**; preserve alias/spec matching. |
| `plugins/market/src/profile-deps.ts` | `readProfileDependencies(env)` currently catches every error and returns `{}`; it also follows `DSH_PROFILE`, while the mutator always targets `web`. Task 1 must fail explicitly on unreadable/malformed data and refuse a non-web profile, not manufacture an empty installed list or remove against a different profile. |
| `plugins/market/src/routes.ts` | `MarketStores`, `catalogPayload`, `intentFromBody`, `serializeMutation`, append-before-mutate and `settleIntent` already exist. A cleanup failure can mean `mutationApplied: true`; do not turn that into a retryable installation failure. |
| `plugins/market/src/plugin-mutate.ts` | `PluginMutator(action, entry: CatalogEntry, env?)`; install uses `entry.installSpec`, remove uses `entry.packageName`. `resolvePinnedDshLaunch` proves current Host package/bin/version; spawn is `shell: false`. No change to this transport or its guards is needed. |
| `plugins/market/src/client/MarketPanel.tsx` | Existing Card/Detail/RemoveConfirmation, filters, intent presentation, retry and cleanup-warning logic are the migration starting point, not a replacement business API. |
| `plugins/xtz-ui/src/client/center-mount.ts` and `board-css.ts` | Main-area anchor is `[data-pane="conversation"], [class*="centerCol"]`; mutual exclusion event is `dsh-xtz-ui-panel-activate`, detail `board`. Board hides sibling conversation DOM without unmounting it. Implement a small **market-owned** portal adapter against this contract, not an import/copy of `mountCenterPanel` and not a second React root. |
| `plugins/market/node_modules/@deepseek-ai/dsh-client-ui-slots/lib/types/index.d.ts` | `children` claims runtime declaration and render authorization. Keyed registration uses **`key`**, rendering uses **`entryKey`**. `PropsRenderSlots<S>["renderSlot"]` is delegated through props. `entriesOfSlot()` gives live winners including crash abdication; its array is fresh, so subscribe with numeric `getVersion`, not that array as a uSES snapshot. |
| `plugins/xtz-ui/node_modules/@deepseek-ai/dsh-client-runtime/lib/types/client/slots.d.ts` | `ctx.slots.inject` waits and re-registers over declaration lifetimes. `ctx.slots.renderSlot` is root-only; never use it for the detail slot. `subscribe`, `getVersion`, `entriesOfSlot` and `onEntryError` exist. |
| `plugins/xtz-ui/node_modules/@deepseek-ai/dsh-client-ui-layout/lib/types/client/index.d.ts` | `shell.overlay` is exactly `{ kind: 'list'; scope: 'root' }`, without required owner props. Market can mirror this type-only declaration locally rather than add a layout dependency. Runtime declaration still belongs to DSH. |
| `plugins/xtz-ui/node_modules/@deepseek-ai/dsh-client-runtime/lib/types/client/contract/settings-scope.d.ts` | `SettingsScope<T>` exposes stable `getSnapshot`, `subscribe`, `set(field,value): Promise<void>`, `unset(field): Promise<void>`. Snapshot has status/value/base/user/revision/writable/mode. Writes serialize and recover Host state on rejection; **resolved Promise is not proof of acceptance**. Compare returned user-layer presence/value. |
| `plugins/xtz-ui/node_modules/@deepseek-ai/dsh-client-ui-settings/lib/types/client/settings-scope.d.ts` and `settings-mirror.d.ts` | `ctx.settingsScope.bind({namespace})` is caller-lifecycle scoped. `describe()` exposes `ensure()`, shared snapshot/error and subscription. No new settings mirror, file or raw `settings.mutate` wrapper is needed. |
| `plugins/sidebar/src/client/SideCardSection.tsx` | Business props are `{store: SidebarStore, service: BetterSidebarService}`; its old props include `PropsRuntime<'settings.section'>` (and hence `close`). It does not need Settings close; change that type to the new detail slot, retaining the original store/service and fenced API. |
| `plugins/providers/src/client/index.ts` | Existing injection is `{rpc: connection.rpc, api: connection.api, t}` into `ModelsWorkspace`; keep auth/model/session routes and tool-view registrations. Empty-pool guidance in `src/router/empty-pool.ts` must point to the new location. |
| `plugins/im/src/client/index.ts` | Existing `hubProps()` contains all ten channel RPC callbacks, `officeEnabled` and `workspaceProjects: ctx.workspaces`. Pass this unchanged to `IMSettingsTab`; remove only IM manager overlay/entry, not the separate **session-follow dialog** `shell.overlay` registration. |
| IM channel source | Old `settings.plugins.tab` registrations exist in dingtalk, feishu, qq, wecom and weixin only. Slack/Telegram/Discord/WhatsApp/Office still render through the combined component; do not delete channels. |
| `scripts/check-ui-design.mjs` | Currently requires identical shared tools-row rules in **market and IM**. Removing IM's entry must migrate this gate to the remaining owner, market. The board uses its own `.dsh-xtz-ui-tools` row, not the same selector; do not invent shared ownership or weaken global CSS/color/glyph checks. |

The topic has no `apps/cli/node_modules`. For read-only pinned Host/UI evidence, planning inspected the clean-main hub's installed `0.1.1-rc.2` packages under `/Users/codepi/Coding/dsh-plugins/apps/cli/node_modules/.pnpm/` (no home/service inspection):

- `@deepseek-ai/dsh-host-plugin-inventory/lib/types/types.d.ts`: snapshot `{entries}`; each row has `entryId`, `moduleName`, `enabled`, `fiberPhase: 'pending'|'loading'|'active'|'failed'|'unloading'|null`.
- Its `lib/typert.remote-client.d.ts`: `remote.pluginInventory.list(): Promise<RemoteResult<PluginInventorySnapshot>>`, **not** `connection.api.pluginInventory` and not an `{result: ...}` envelope. The pinned inventory UI unwraps `result.ok/result.value` from `ctx.remote.pluginInventory.list()`.
- `@deepseek-ai/dsh-client-ui-settings-plugins/lib/client.js`: original namespaces/fields are shell `timeoutMs`, `maxOutputBytes`; agent-loop `maxParallelToolCalls`; web-search-deepseek `baseURL`, `maxUses`, reference `apiKeyEnv || 'DEEPSEEK_API_KEY'`. Credentials use `connection.api.credentials.describe({refs})` and `.set({ref,value})`, with `{result:{ok,value/error}}` envelopes; `credentials/reference-updated` invalidates metadata.
- `@deepseek-ai/dsh-client-ui-settings-general/lib/client.js`: Settings nav is `[class*="navList"] > button` with `[class*="navLabel"]` text and `aria-current="true"`; content is `[class*="options"]`. No section suppression API or nav `data-section` exists. Match exact bilingual labels inside the Settings modal, not substring matches across the document.

## File/responsibility map and order

Tasks 1–2 own Host truth/security; 3 owns pure navigation/inventory logic; 4 owns slot/portal lifecycle; 5 owns the visible center and mutation orchestration; 6–7 migrate existing contributors; 8–9 relocate Advanced settings; 10 tightens visual/accessibility contracts; 11 updates documentation/repository gates and records final acceptance. Tasks are sequential integration checkpoints; do not ship before all eleven pass.

New focused modules: market `plugin-center-contract.ts` (slot types), `plugin-center-open.ts` (memory navigation), `plugin-inventory.ts` (read-only projection), `plugin-center-mount.ts` (DOM anchor lifecycle), `PluginCenterHost.tsx` (authorized portal), `PluginCenter.tsx` (page), `PluginDetail.tsx` and `RemoveConfirmation.tsx` (extract market-owned existing UI); xtz-ui `advanced-runtime.ts` (staged form), `AdvancedRuntimeSettings.tsx` (view), `advanced-runtime-locales.ts` (copy). Each first-party contributor has a tiny local `plugin-center-contract.ts` type declaration. No shared package or persisted UI state.

## Task 1: Make installed projection and profile-read failure explicit

**Files:**

- Modify: `plugins/market/src/catalog.ts` (types, pure installed projection; leave three rows unchanged).
- Modify: `plugins/market/src/profile-deps.ts` (strict read and web-profile identity).
- Modify: `plugins/market/src/routes.ts` (`CatalogPayload`, `catalogPayload`, guard error projection and existing-catalog post-action outcome preservation).
- Modify: `plugins/market/src/client/api.ts` (`CatalogSnapshot`, parser and mutation snapshot).
- Modify/Test: `plugins/market/tests/catalog.test.ts`.
- Modify/Test: `plugins/market/tests/routes.test.ts`.
- Create/Test: `plugins/market/tests/profile-deps.test.ts`.
- Create/Test: `plugins/market/tests/client-api.test.ts`.
- Modify/Test: `plugins/market/tests/client-interaction.test.ts` (required installedPlugins fixture data only; page migration remains Task 5).

**Interfaces:** Consumes `CatalogEntry`, `MarketSource`, `MarketStores.readDependencies`. Produces `InstalledPlugin` exactly as the spec; `installedPluginId(packageName: string): string`, `installedPluginsFor(dependencies: Record<string,string>): InstalledPlugin[]`; `PROFILE_SOURCE_ID = 'profile'`; `ProfileDependenciesError`; snapshot requires `installedPlugins: InstalledPlugin[]`. No second installed state file.

- [x] **1. Write failing projection tests** in catalog.test.ts:

```ts
import { installedPluginId, installedPluginsFor } from '../src/catalog.ts';
it('projects top-level third-party packages, retaining actual aliases and specs', () => {
  const rows = installedPluginsFor({
    '@deepseek-ai/dsh': '0.1.1-rc.2',
    'dsh-xtz-ui': 'link:../xtz-ui', 'dsh-sidebar': 'link:../sidebar',
    'dsh-providers': 'link:../providers', 'dsh-im': 'link:../im',
    'dsh-market': 'link:../market', 'dsh-wecom-office': 'link:../wecom-office',
    alias: 'github:bowenliang123/dsh-context',
    '@example/extra': '^2.0.0',
  });
  expect(rows).toHaveLength(2);
  expect(rows.find(row => row.packageName === 'alias')).toMatchObject({
    id: installedPluginId('alias'), name: '会话上下文', source: 'catalog',
    catalogEntryId: 'context', version: '0.21.1',
    installSpec: 'github:bowenliang123/dsh-context',
  });
  expect(rows.find(row => row.packageName === '@example/extra')).toEqual({
    id: installedPluginId('@example/extra'), packageName: '@example/extra',
    name: '@example/extra', installSpec: '^2.0.0', source: 'external',
  });
  expect(installedPluginId('@example/extra')).not.toBe(installedPluginId('extra'));
});
```

- [x] **2. Add a temporary-home failure test** in profile-deps.test.ts:

```ts
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { readProfileDependencies, profilePackagePath } from '../src/profile-deps.ts';
it('does not disguise malformed or missing web profiles as empty', () => {
  const home = mkdtempSync(join(tmpdir(), 'market-profile-'));
  const env = { DSH_HOME: home, DSH_PROFILE: 'web' };
  try {
    expect(() => readProfileDependencies(env)).toThrow('Web profile');
    mkdirSync(join(home, 'profiles', 'web'), { recursive: true });
    writeFileSync(profilePackagePath(env), '{');
    expect(() => readProfileDependencies(env)).toThrow('Web profile');
    writeFileSync(profilePackagePath(env), JSON.stringify({ dependencies: {} }));
    expect(readProfileDependencies(env)).toEqual({});
    expect(() => readProfileDependencies({ ...env, DSH_PROFILE: '../other' })).toThrow('Web profile');
  } finally { rmSync(home, { recursive: true, force: true }); }
});
```

Add cases for array/null top-level, array dependencies, non-string/empty specs and inaccessible read via an injected read function or directory at package.json. Do not rely on chmod under a privileged test user. Missing `dependencies` on an otherwise valid package object is legitimately `{}`; a missing **file** is an error.

- [x] **3. Run red:** `.superpowers/sdd/2026-09-05-plugin-center-plan/test-env.sh pnpm --filter dsh-market test -- tests/catalog.test.ts tests/profile-deps.test.ts`. Expect missing exports and the existing swallow-to-empty behavior to fail.

- [x] **4. Implement the projection** using actual dependency keys, never decoding client identifiers:

```ts
export interface InstalledPlugin {
  id: string; packageName: string; name: string; installSpec: string;
  source: 'catalog' | 'external'; catalogEntryId?: string; version?: string;
}
export const PROFILE_SOURCE_ID = 'profile';
const FIRST_PARTY_PACKAGES = new Set([
  'dsh-xtz-ui', 'dsh-sidebar', 'dsh-providers', 'dsh-im', 'dsh-market', 'dsh-wecom-office',
]);
export function installedPluginId(packageName: string): string {
  return `installed:${encodeURIComponent(packageName)}`;
}
export function installedPluginsFor(dependencies: Record<string, string>): InstalledPlugin[] {
  return Object.entries(dependencies)
    .filter(([name]) => !name.startsWith('@deepseek-ai/') && !FIRST_PARTY_PACKAGES.has(name))
    .map(([packageName, installSpec]) => {
      const catalog = MARKET_PLUGINS.find(entry => entry.packageName === packageName)
        ?? MARKET_PLUGINS.find(entry => entry.installSpec === installSpec);
      return {
        id: installedPluginId(packageName), packageName,
        name: catalog?.name ?? packageName, installSpec,
        source: catalog === undefined ? 'external' as const : 'catalog' as const,
        ...(catalog === undefined ? {} : { catalogEntryId: catalog.id, version: catalog.version }),
      };
    })
    .sort((a, b) => a.packageName.localeCompare(b.packageName));
}
```

Profile parser accepts only safe npm identifiers (max 214 chars; `^(?:@[a-z0-9][a-z0-9._-]*/)?[a-z0-9][a-z0-9._-]*$`, case-insensitive for legacy names), nonempty string specs and plain object dependencies. Reject unsafe names such as `--help`, control characters or path traversal rather than feed them to a CLI. React renders the safe name as text, never HTML. Spec strings are not executed or made links in cards. Preserve the raw current spec Host-side for catalog matching; never send URL userinfo/query values to the browser. Add `publicInstallSpec(spec:string):string` to catalog.ts and apply it to each installed row's installSpec **only at catalogPayload's response boundary**, not to the dependencies used by resolution. For a URL-like spec, strip the optional `git+` prefix before parsing, clear username/password, replace the entire search string with `?redacted`, then reattach the prefix. Non-URL npm/GitHub shorthands remain unchanged. Source text still shows the host/path and Git revision/path fragment for trust; label redaction explicitly. Add a test with `git+https://user:secret@example.test/repo.git?token=secret#v1` asserting the serialized payload never contains `secret` while its projected Host target can still resolve by dependency key.

Implement strict read and public spec sanitization as follows. Keep the existing dshHome import and Node imports in profile-deps.ts:

```ts
export class ProfileDependenciesError extends Error {
  constructor() { super('Web profile could not be read. Check it with xtz doctor, then retry.'); }
}
export function profilePackagePath(env:NodeJS.ProcessEnv = process.env):string {
  const profile = env.DSH_PROFILE?.trim();
  if (profile && profile !== 'web') throw new ProfileDependenciesError();
  return join(dshHome(env), 'profiles', 'web', 'package.json');
}
export function readProfileDependencies(env:NodeJS.ProcessEnv = process.env):Record<string,string> {
  try {
    const parsed:unknown = JSON.parse(readFileSync(profilePackagePath(env), 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new ProfileDependenciesError();
    const deps = (parsed as Record<string,unknown>).dependencies;
    if (deps === undefined) return {};
    if (!deps || typeof deps !== 'object' || Array.isArray(deps)) throw new ProfileDependenciesError();
    const rows = Object.entries(deps);
    for (const [name,spec] of rows) {
      if (name.length > 214 || !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(name)
        || typeof spec !== 'string' || spec.trim() === '') throw new ProfileDependenciesError();
    }
    return Object.fromEntries(rows) as Record<string,string>;
  } catch { throw new ProfileDependenciesError(); }
}
```

Implement `publicInstallSpec` against a separate normalized response-only copy: apply WHATWG preprocessing (trim leading/trailing U+0000–U+0020 and remove embedded ASCII tab/LF/CR) **before** optional `git+` and URL-scheme detection. Then strip URL userinfo, redact the entire query and restore the git+ prefix. Unsafe/unparseable URL-like values must return generic unavailable copy, never raw input. Non-URL npm/GitHub shorthands remain unchanged. Never normalize the raw Host dependency map or echo raw specs in errors. Cover whitespace/control prefixes, embedded tab/LF/CR, git+ URLs, malformed URLs, ordinary npm/GitHub shorthand and raw alias matching; serialized responses must contain no synthetic secrets.

Route guard imports ProfileDependenciesError and returns 500 `{ok:false, code:'market-profile-unavailable', error: error.message}` before the generic internal branch **only where no mutation outcome has been established**. Post-action projection errors must be handled locally as specified below, never escape to this outcome-erasing guard. Preserve `MarketStateError` handling independently; do not add profile to its persisted-state kinds.

- [x] **5. Extend payload/API and red/green response tests.** `catalogPayload` adds `installedPlugins: installedPluginsFor(dependencies).map(row => ({...row, installSpec: publicInstallSpec(row.installSpec)}))`. `asSnapshot` rejects missing/non-array collections; queueIntent accepts a snapshot only when sources, entries and installedPlugins are all arrays (even on a failed mutation). Retain allowThirdPartySources/sources for compatibility, although no Sources tab will render. In client-api.test.ts stub fetch to return `{ok:true,sources:[],entries:[]}` and assert `loadCatalog()` rejects; return `installedPlugins:[]` and assert it resolves. In routes.test.ts use existing `memoryStores` with throwing readDependencies and verify catalog is 500, not empty-success. Add only required installedPlugins fixture data to client-interaction.test.ts; no page migration now.

**Task 1 must also land minimal existing-catalog response-outcome safety now**, because this task introduces the throwing reader. Keep mutation/settlement separate from response projection in the existing route, without a new transaction framework. After a known mutation outcome and settlement, catch a fresh projection failure locally. Do not lose settled intents or replace the outcome with the outer profile-only error. For known success return HTTP 500 `ok:false`, `mutationApplied:true`, settled `intents`, safe profile diagnostic (`market-profile-unavailable` and generic doctor/refresh guidance), no snapshot collections, and explicit completed/Do-not-retry-mutation wording. This uses the existing applied-warning/refresh-only path, not a new endpoint or schema. For known mutation failure preserve `mutated.error` and failed outcome, append the safe profile-refresh diagnostic in existing error text, include settled intents, omit snapshot and do not claim mutationApplied:true. Do not expose raw read errors/specs. Existing cleanup-failure responses still retain their logical settled intents and original outcomes; do not add an unnecessary projection read on that path.

Regression tests must cover successful target validation and in-queue profile read, followed by a post-action profile read failure for **both** mutator `{ok:true}` and `{ok:false,error:<original>}` outcomes. In Task 1 use existing catalog validation (which currently reads sources, not dependencies); make the first in-queue dependency read succeed and the post-action read throw. Assert the mutator ran once, settlement persisted, returned intents match settlement, no partial/fabricated snapshot, safe diagnostic, applied marker only for known success and original failure text retained. Task 2 extends the same tests to its added pre-enqueue dependency read. Client-api tests parse both HTTP-500 payloads: queueIntent returns settled intents plus optional error/applied flag and no snapshot instead of throwing away known outcomes. Existing old-page applied-warning tests remain green in Task 1; the new UI's no-repeat-mutation interaction proof belongs to Task 5.

Run `.superpowers/sdd/2026-09-05-plugin-center-plan/test-env.sh pnpm --filter dsh-market test -- tests/catalog.test.ts tests/profile-deps.test.ts tests/client-api.test.ts tests/routes.test.ts`, the full market suite (including existing interactions), and `.superpowers/sdd/2026-09-05-plugin-center-plan/test-env.sh pnpm --filter dsh-market typecheck`; expect all pass.

- [ ] **6. Review checkpoint:** installed membership is exclusively current web dependencies; no catalog/version specs changed. Later authorized commit: `feat(market): project installed web profile plugins` (stage only this task's nine files).

## Task 2: Resolve installed removal on the Host inside the existing transaction

**Files:**

- Modify: `plugins/market/src/routes.ts` (target resolution before enqueue and again inside serializeMutation).
- Modify/Test: `plugins/market/tests/routes.test.ts` (reuse withMarketServer/memoryStores).
- Modify/Test: `plugins/market/tests/plugin-mutate.test.ts` (scoped package argv case; existing fake pinned runtime).

**Interfaces:** Consumes Task 1 projection and `PROFILE_SOURCE_ID`, unchanged `InstallIntent` wire/durable schema, unchanged `PluginMutator`. Produces `resolveIntentTarget(config: MarketConfig, sources: MarketSource[], dependencies: Record<string,string>, intent: InstallIntent): CatalogEntry | undefined`. `sourceId: 'profile'` permits **remove only** and `entryId` must equal a currently projected installed id; arbitrary body spec/packageName never authorizes a target.

- [x] **1. Add the failing HTTP test** to the existing routes.test.ts harness:

```ts
import { installedPluginId, PROFILE_SOURCE_ID } from '../src/catalog.ts';
it('removes only the Host-resolved installed name, ignoring a forged body spec', async () => {
  let deps: Record<string, string> = { '@example/extra': 'link:/temporary/extra' };
  const calls: Array<[string, string | undefined]> = [];
  const stores = memoryStores({
    readDependencies: () => deps,
    mutatePlugin: async (action, entry) => {
      calls.push([action, entry.packageName]); deps = {}; return { ok: true };
    },
  });
  await withMarketServer(stores, async (request, base) => {
    const result = await request(MARKET_INTENTS_ROUTE, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: base },
      body: JSON.stringify({ entryId: installedPluginId('@example/extra'),
        sourceId: PROFILE_SOURCE_ID, action: 'remove',
        packageName: 'dsh-market', installSpec: '--help' }),
    });
    expect(result.status).toBe(200);
    expect(calls).toEqual([['remove', '@example/extra']]);
    expect(stores.readIntents()).toEqual([]);
  });
});
```

Add table cases: profile-source install → 400; synthetic built-in/core/unknown ids → 404 with no queued intent or mutator call; non-loopback/cross-origin → existing rejection; malformed profile → 500 before mutation; same catalog exact-spec alias removes the dependency key, not the catalog's different package name. Retain old catalog install/remove requests.

- [x] **2. Run red:** `.superpowers/sdd/2026-09-05-plugin-center-plan/test-env.sh pnpm --filter dsh-market test -- tests/routes.test.ts`; current resolver returns “unknown catalog entry”.

- [x] **3. Implement target resolution**:

```ts
export function resolveIntentTarget(
  config: MarketConfig, sources: MarketSource[], dependencies: Record<string, string>, intent: InstallIntent,
): CatalogEntry | undefined {
  if (intent.sourceId !== PROFILE_SOURCE_ID) {
    const entry = catalogPayload(config, sources, dependencies).entries.find(
      row => row.id === intent.entryId && row.sourceId === intent.sourceId,
    );
    if (entry === undefined || intent.action === 'install') return entry;
    const installed = installedPluginsFor(dependencies).find(row => row.catalogEntryId === entry.id);
    return installed === undefined ? { ...entry, installed: false }
      : { ...entry, packageName: installed.packageName, installed: true };
  }
  if (intent.action !== 'remove') throw new RouteError(400, 'profile entries support removal only');
  const installed = installedPluginsFor(dependencies).find(row => row.id === intent.entryId);
  if (installed === undefined) return undefined;
  return { id: installed.id, name: installed.name, version: installed.version ?? '',
    summary: '', tags: [], kind: 'plugin', sourceId: PROFILE_SOURCE_ID,
    installed: true, packageName: installed.packageName };
}
```

Before append, reject unavailable target; then preserve append/write pending. Inside `serializeMutation`, call the resolver **again** with freshly read sources/dependencies. If a previously validated profile removal disappeared while queued, return `{ok:true}` (already removed); never reuse the stale target. Undefined after a successful fresh projection means absent, whereas a thrown read error remains a mutation failure, not idempotent success. Catalog unavailable remains a failed outcome. Keep `(intent.action === 'install') === current.installed` idempotence and call the existing mutator only with the newly resolved entry. Reading dependencies or mutating may throw; preserve the existing mutation try/catch and settlement path. Do not move settlement into the queue, drop requestId, serialize source edits differently or rewrite intents schema.

- [x] **4. Test races and all settlement outcomes.** Use a deferred first mutator in the existing concurrency fixture; enqueue two removals, delete deps after the first, assert one subprocess call, two distinct requestIds and no pending intents. Repeat cleanup-write failure after successful external remove and assert 500 plus `mutationApplied:true`, logical settled intents and “Do not retry”; repeat failure+cleanup failure and assert retained actionable error. Extend Task 1’s post-action projection-failure regression to external profile removals: validation read and queued read succeed, mutation returns success or failure, settlement succeeds, final read throws. For success retain mutationApplied:true/settled intents and refresh-only warning; for failure retain original mutation error/failed outcome plus safe refresh diagnostic. Both omit snapshot collections. Do not defer or reimplement the existing-catalog safety already landed in Task 1. Existing state-corruption/read/write tests remain. In fake-runtime plugin-mutate.test.ts assert remove argv ends `['plugin','--profile','web','remove','@example/extra']`, not the stored link spec or client text. Run `.superpowers/sdd/2026-09-05-plugin-center-plan/test-env.sh pnpm --filter dsh-market test -- tests/routes.test.ts tests/plugin-mutate.test.ts tests/intents.test.ts tests/loopback.test.ts`; expect pass.

- [ ] **5. Review checkpoint:** no change to `http.ts`, `loopback.ts`, `plugin-mutate.ts`, state file schema, pinned version or install allowlist. Later authorized commit: `feat(market): authorize installed removal from live profile`.

## Task 3: Define memory navigation and read-only runtime-state projection

**Files:**

- Create: `plugins/market/src/client/plugin-center-open.ts`.
- Create: `plugins/market/src/client/plugin-inventory.ts`.
- Create/Test: `plugins/market/tests/plugin-center-open.test.ts`.
- Create/Test: `plugins/market/tests/plugin-inventory.test.ts`.

**Interfaces:** `CenterTab = 'installed'|'discover'`; `CenterLocation = {tab: CenterTab; detail?: {kind:'capability'|'installed'|'catalog'; id:string}; query:string; tag:string; scrollTop:number}`; `createPluginCenterOpen(): PluginCenterOpen` exposes `getSnapshot(): {open:boolean; location:CenterLocation}`, `subscribe(fn)`, `open()`, `close()`, `navigate(location)`. Store holds navigation only, never catalog/install/config/credential truth. Runtime loader signature `loadPluginInventory(remote: InventoryRemote | undefined): Promise<readonly InventoryEntry[] | undefined>`; undefined means unknown, not uninstalled.

- [x] **1. Write red tests**:

```ts
import { expect, it } from 'vitest';
import { createPluginCenterOpen } from '../src/client/plugin-center-open.ts';
it('opens installed by default and preserves a list return location', () => {
  const center = createPluginCenterOpen(); center.open();
  expect(center.getSnapshot()).toMatchObject({ open: true, location: { tab: 'installed' } });
  const list = { tab: 'discover' as const, query: 'memory', tag: '记忆', scrollTop: 220 };
  center.navigate(list);
  center.navigate({ ...list, detail: { kind: 'catalog', id: 'opencontext' } });
  center.navigate(list);
  expect(center.getSnapshot().location).toEqual(list);
  center.close(); expect(center.getSnapshot().open).toBe(false);
});
```

```ts
import { expect, it } from 'vitest';
import { loadPluginInventory, runtimeStateFor } from '../src/client/plugin-inventory.ts';
it('does not confuse inventory failure or transitive names with installed truth', async () => {
  expect(await loadPluginInventory({ pluginInventory: { list: async () => { throw Error('offline'); } } })).toBeUndefined();
  expect(runtimeStateFor('@example/extra', undefined)).toBe('unknown');
  expect(runtimeStateFor('extra', [{ moduleName: 'extra-other', enabled: true, fiberPhase: 'active' }])).toBe('unknown');
  expect(runtimeStateFor('@example/extra', [{ moduleName: '@example/extra/client', enabled: true, fiberPhase: 'active' }])).toBe('running');
});
```

- [x] **2. Run red:** `.superpowers/sdd/2026-09-05-plugin-center-plan/test-env.sh pnpm --filter dsh-market test -- tests/plugin-center-open.test.ts tests/plugin-inventory.test.ts` (new modules absent).

- [x] **3. Implement the bounded models**:

```ts
export type InventoryEntry = {
  moduleName: string; enabled: boolean;
  fiberPhase: 'pending'|'loading'|'active'|'failed'|'unloading'|null;
};
export type InventoryRemote = { pluginInventory: { list(): Promise<
  {ok:true; value:{entries:readonly InventoryEntry[]}} | {ok:false; error:{code:string;message:string}}
> } };
export async function loadPluginInventory(remote: InventoryRemote | undefined) {
  try { const result = await remote?.pluginInventory.list();
    return result?.ok === true ? result.value.entries : undefined;
  } catch { return undefined; }
}
export type RuntimeState = 'running'|'loading'|'error'|'disabled'|'unknown';
export function runtimeStateFor(packageName: string, inventory: readonly InventoryEntry[] | undefined): RuntimeState {
  const rows = inventory?.filter(row => row.moduleName === packageName || row.moduleName.startsWith(`${packageName}/`));
  if (rows === undefined || rows.length === 0) return 'unknown';
  const enabled = rows.filter(row => row.enabled);
  if (enabled.length === 0) return 'disabled';
  if (enabled.some(row => row.fiberPhase === 'failed')) return 'error';
  if (enabled.some(row => row.fiberPhase === 'pending' || row.fiberPhase === 'loading' || row.fiberPhase === 'unloading')) return 'loading';
  if (enabled.every(row => row.fiberPhase === 'active')) return 'running';
  return 'unknown';
}
```

Do not match by display name, suffix, DOM, package substring or guessed Git path. Unknown is appropriate where Loader module specifiers cannot be mapped precisely; show no raw Fiber values. Test every phase, disabled-with-failed, multiple entries and `{ok:false}`.

Implement navigation with the following complete store, no localStorage/window globals. A detail's list-return location is captured by the page before navigate; the store never owns secrets:

```ts
export type CenterTab = 'installed' | 'discover';
export type CenterLocation = { tab: CenterTab; query: string; tag: string; scrollTop: number;
  detail?: {kind:'capability'|'installed'|'catalog';id:string} };
export type CenterSnapshot = {open:boolean;location:CenterLocation};
export interface PluginCenterOpen {
  getSnapshot(): CenterSnapshot;
  subscribe(listener:()=>void):()=>void;
  open():void; close():void; navigate(location:CenterLocation):void;
}
export function createPluginCenterOpen(): PluginCenterOpen {
  const initial = ():CenterLocation => ({tab:'installed',query:'',tag:'',scrollTop:0});
  let snapshot:CenterSnapshot = {open:false,location:initial()};
  const listeners = new Set<()=>void>();
  const publish = (next:CenterSnapshot):void => { snapshot = next; for (const fn of listeners) fn(); };
  return {
    getSnapshot:()=>snapshot,
    subscribe(listener) { listeners.add(listener); return ()=>{ listeners.delete(listener); }; },
    open() { if (!snapshot.open) publish({open:true,location:initial()}); },
    close() { if (snapshot.open) publish({...snapshot,open:false}); },
    navigate(location) { publish({...snapshot,location}); },
  };
}
```

- [x] **4. Run green:** the two test files and market typecheck. Test stable snapshot reference until a mutation and no listener after unsubscribe. Later authorized commit: `feat(market): define center navigation and runtime projection`.

## Task 4: Register the authorized detail parent and main-area portal

**Files:**

- Create: `plugins/market/src/client/plugin-center-contract.ts`.
- Create: `plugins/market/src/client/plugin-center-mount.ts`.
- Create: `plugins/market/src/client/PluginCenterHost.tsx`.
- Modify: `plugins/market/src/client/sidebar-entry.ts` (expanded/controls state and label; actual apply wiring is Task 5).
- Create/Test: `plugins/market/tests/plugin-center-host.test.ts`.
- Modify/Test: `plugins/market/tests/sidebar-entry.test.ts`.

**Interfaces:** `DETAIL_SLOT = 'xiaotaozi.plugin-center.detail'`; local augmentation for this keyed/root slot and identical type-only `shell.overlay` list/root declaration. Export `CenterPageFace = PropsRenderSlots<typeof DETAIL_SLOT> & {ctx:ClientContext; center:PluginCenterOpen; t:(key:MarketKey)=>string; onClose:()=>void}` and `PluginCenterHostProps = Omit<CenterPageFace,'onClose'> & {renderPage:(props:CenterPageFace)=>ReactNode}`. Export `registerPluginCenter(ctx:ClientContext, face:Pick<PluginCenterHostProps,'center'|'t'|'renderPage'>): ()=>void` from PluginCenterHost.tsx; this reusable registration function is wired into apply in Task 5, so this task compiles/tests without a provisional page. Export `mountPluginCenter(options:{doc:Document;center:PluginCenterOpen;onAnchor:(anchor:HTMLElement|null)=>void}): ()=>void`. Extend `mountMarketEntry(doc:Document,label:()=>string,onOpen:()=>void,center?:PluginCenterOpen):()=>void` with an optional fourth argument, preserving existing callers until Task 5.

- [x] **1. Write static registration red test**:

```ts
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
it('declares details on shell.overlay and never takes conversation ownership', () => {
  const source = readFileSync(new URL('../src/client/PluginCenterHost.tsx', import.meta.url), 'utf8');
  expect(source).toContain('name: "shell.overlay"');
  expect(source).toContain('[DETAIL_SLOT]: { kind: "keyed", scope: "root" }');
  expect(source).not.toContain('createRoot');
  expect(source).not.toMatch(/name:\s*["'](?:root|conversation)["']/);
});
```

Run `.superpowers/sdd/2026-09-05-plugin-center-plan/test-env.sh pnpm --filter dsh-market test -- tests/plugin-center-host.test.ts`; current imperative overlay fails the contract.

- [x] **2. Implement the registration/type declaration** (imports from same package or existing deps only):

```ts
// plugin-center-contract.ts
import type {} from '@deepseek-ai/dsh-client-ui-slots';
export const DETAIL_SLOT = 'xiaotaozi.plugin-center.detail';
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'xiaotaozi.plugin-center.detail': { kind: 'keyed'; scope: 'root' };
    // Exact DSH 0.1.1-rc.2 type mirror; the host still declares this at runtime.
    'shell.overlay': { kind: 'list'; scope: 'root' };
  }
}
```

```ts
// PluginCenterHost.tsx: registration helper, no page implementation import.
export function registerPluginCenter(ctx: ClientContext,
  face: Pick<PluginCenterHostProps, 'center'|'t'|'renderPage'>): () => void {
  return ctx.slots.inject("shell.overlay", () => ctx.slots.register({
    name: "shell.overlay", id: "plugin-center", order: 55,
    children: { [DETAIL_SLOT]: { kind: "keyed", scope: "root" } },
    inject: () => ({ ctx, ...face }),
  }, PluginCenterHost));
}
```

Unit-test the exported registration helper with a capturing slots facade and `renderPage: () => createElement('h1', {tabIndex:-1}, '插件中心')`; assert the runtime child declaration and injected function identity. Test the adapter directly. The old entry remains wired until Task 5 replaces it; no unresolved import or provisional page is added. In mountMarketEntry, subscribe to center when supplied, set `aria-expanded` from its snapshot and `aria-controls="dsh-plugin-center"`, and reapply these attributes whenever the DOM observer recreates the button. Dispose that subscription along with the observer.

- [x] **3. Implement anchor/activation lifecycle** as a market-owned adapter: find the existing center column, append one `div[data-dsh-plugin-center-view]`; MutationObserver reattaches only when the column/anchor disconnects. `onAnchor(element|null)` updates React state; it does not create a React root. Subscribe to navigation with a remembered previous `open` boolean: only the closed→open edge sets `data-dsh-plugin-center-active` and dispatches `CustomEvent('dsh-xtz-ui-panel-activate',{detail:'plugin-center'})`; detail/query changes do not redispatch. On open→closed remove only that marker. An event with any other detail closes the center synchronously. Mirror the existing board's sidebar session/project/search/new-session click-close behavior by matching its documented selectors, without changing session selection itself. Dispose observer, center subscription, event/click listeners, own marker and own anchor.

```tsx
// PluginCenterHost: the authorized renderer stays inside the shell's React tree.
const state = useSyncExternalStore(center.subscribe, center.getSnapshot, center.getSnapshot);
const [anchor, setAnchor] = useState<HTMLElement | null>(null);
useEffect(() => mountPluginCenter({ doc: document, center, onAnchor: setAnchor }), [center]);
return !state.open || anchor === null ? null : createPortal(
  renderPage({ ctx, center, t, renderSlot, onClose: () => center.close() }), anchor,
);
```

Capture opener before opening; after portal is committed focus the page h1 with `tabIndex=-1`. Explicit Close/Escape restores focus to the **current** connected `[data-dsh-market-entry]` (sidebar can rerender). Mutual-exclusion/session-click closes must not steal focus back from the newly opened board/session control: restore only when focus was inside this center or its own close control. Window bubbling Escape listener checks `defaultPrevented`, `isComposing`, and active nested `dialog/alertdialog`; nested confirmations/config dialogs consume Escape first. No body overflow lock, backdrop or global focus trap on this non-modal page. Keep focus trapping only for actual destructive dialogs.

- [x] **4. Add executable adapter tests with DOM facades** in plugin-center-host.test.ts: use EventTarget/CustomEvent plus minimal doc/query/anchor stubs as existing sidebar tests do; open center → exactly one activation/marker; dispatch board activation → closed and marker removed; reopen → dispatch activates once; call disposer → all listeners/anchor removed; remove the first column → observer creates a new anchor, no duplicate center. Use react-test-renderer's createNodeMock for h1/opener focus and nested defaultPrevented Escape. This is lifecycle simulation, **not** real rendered focus proof. Run `.superpowers/sdd/2026-09-05-plugin-center-plan/test-env.sh pnpm --filter dsh-market test -- tests/plugin-center-host.test.ts tests/sidebar-entry.test.ts` and `.superpowers/sdd/2026-09-05-plugin-center-plan/test-env.sh pnpm --filter dsh-market typecheck`; expect pass with the old page still wired. Later authorized checkpoint: `feat(market): add authorized plugin center portal host`.

## Task 5: Build Installed / Discover / Detail around existing market behavior

**Files:**

- Create: `plugins/market/src/client/PluginCenter.tsx`.
- Create: `plugins/market/src/client/PluginDetail.tsx` (move/adapt current Detail and Chips).
- Create: `plugins/market/src/client/RemoveConfirmation.tsx` (move current confirmation unchanged except minimal entry-name props).
- Modify: `plugins/market/src/client/index.ts` (remove imperative overlayOpener/createRoot and wire registerPluginCenter plus actual renderPage).
- Modify: `plugins/market/src/client/locales.ts` (bilingual product copy; remove obsolete Sources/auto-update copy).
- Modify: `plugins/market/src/client/icons.tsx` (reuse outline SVG ids; capability mapping).
- Delete: `plugins/market/src/client/MarketOverlay.tsx`, `plugins/market/src/client/MarketPanel.tsx` after moving retained behavior.
- Modify/Test: `plugins/market/tests/client-interaction.test.ts` (migrate to PluginCenter, preserve mutation/confirmation cases).
- Modify/Test: `plugins/market/tests/client-ui.test.ts` (non-modal page contract replaces overlay assertions).

**Interfaces:** `PluginCenter(props:CenterPageFace):JSX.Element` consumes Tasks 1–3 and unchanged `installPresentation`/`queueIntent`. Fixed capability metadata is `[{id:'xiaotaozi',name:'小桃子功能'}, {id:'side-workbench',name:'侧边工作台'}, {id:'models',name:'模型'}, {id:'im',name:'IM 机器人'}]` with localized summary and existing SVG icon. Define `DetailTarget = {kind:'catalog';entry:CatalogEntry}|{kind:'installed';entry:InstalledPlugin}`. Export `PluginDetail(props:{target:DetailTarget;snapshot:CatalogSnapshot;presentation:InstallPresentation;runtimeState:RuntimeState;configuration?:ReactNode;t:(key:MarketKey)=>string;onBack:()=>void;onQueue:(entryId:string,sourceId:string,action:'install'|'remove')=>void}):JSX.Element`. RemoveConfirmation keeps its existing trigger/confirmedFocus/onCancel/onConfirm/t props, narrowing `entry` to `{name:string}`; no install spec input. Move the existing `errorMessage(error:unknown):string` helper into PluginCenter.tsx (unchanged Error.message/String fallback) instead of referring to the deleted MarketPanel module.

- [x] **1. Write a runnable red interaction test** using the existing renderer pattern (add imports for createPluginCenterOpen and PluginCenter, replace renderMarket helper):

```tsx
it('shows all four built-ins while catalog loads, with installed selected', async () => {
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
  const center = createPluginCenterOpen(); center.open();
  const slots = { getVersion: () => 0, subscribe: () => () => {}, entriesOfSlot: () => [] };
  let view;
  await act(async () => { view = create(React.createElement(PluginCenter, {
    center, ctx: { slots, get: () => undefined }, t, onClose: () => center.close(),
    renderSlot: (_name, _owner, options) => options.fallback,
  })); });
  const tabs = view.root.findAllByProps({ role: 'tab' });
  expect(tabs).toHaveLength(2);
  expect(tabs[0].props['aria-selected']).toBe(true);
  expect(view.root.findAllByProps({ 'data-capability': 'models' })).toHaveLength(1);
  expect(JSON.stringify(view.toJSON())).toContain(t('unavailable'));
  expect(JSON.stringify(view.toJSON())).toContain(t('loading'));
  expect(JSON.stringify(view.toJSON())).not.toContain(t('installedEmpty'));
  await act(async () => view.unmount());
});
```

Run `.superpowers/sdd/2026-09-05-plugin-center-plan/test-env.sh pnpm --filter dsh-market test -- tests/client-interaction.test.ts` red for new page/import, then adapt all old helper fixtures to required `installedPlugins` and default Installed tab. Do not drop existing retry/race/confirmation tests merely because selectors change.

- [x] **2. Wire the page and compose fixed capability availability** without a second state registry. In index.ts remove overlayOpener and its createRoot import, import PluginCenter, createPluginCenterOpen and registerPluginCenter, then use this apply wiring:

```ts
const center = createPluginCenterOpen();
registerPluginCenter(ctx, { center, t,
  renderPage: props => createElement(PluginCenter, props),
});
ctx.effect(() => mountMarketEntry(document, () => t('nav'), () => center.open(), center),
  'dsh-market plugin center entry');
```

Inside PluginCenter use the authorized renderSlot from props:

```tsx
useSyncExternalStore(
  listener => ctx.slots.subscribe(DETAIL_SLOT, listener),
  () => ctx.slots.getVersion(DETAIL_SLOT),
  () => 0,
);
const available = new Set(ctx.slots.entriesOfSlot(DETAIL_SLOT).map(entry => entry.options.key));
const unavailable = <p className="dsh-market-unavailable">{t('unavailable')} — {t('doctorHint')}</p>;
const detail = renderSlot(DETAIL_SLOT, {}, { entryKey: selectedId, fallback: unavailable });
```

Never render `StoredEntry.component` yourself. The DSH slot renderer isolates an entry crash and abdicates its keyed cell; version subscription then updates both card state and fallback. Test the page with a fake live-winner list becoming empty after notification. Real crash containment is a browser gate. Third-party **配置** is offered only if `available.has(installed.packageName)`; otherwise show details/uninstall only. Do not infer forms from settings namespaces or send configuration calls from market.

- [x] **3. Preserve fetching and mutation semantics**, splitting failure domains:

```tsx
useEffect(() => {
  let alive = true;
  void loadCatalog().then(value => { if (alive) { setSnapshot(value); setCatalogError(undefined); } })
    .catch(error => { if (alive) setCatalogError(errorMessage(error)); });
  void loadIntents().then(value => { if (alive) setIntents(value); })
    .catch(error => { if (alive) setIntentError(errorMessage(error)); });
  return () => { alive = false; };
}, [reloadKey]);
```

Keep built-in cards and their details outside catalog-error branches. Until catalog succeeds, third-party Installed and Discover show loading; after failure show an error/retry, not empty. Since the existing endpoint combines profile and catalog, its failure can make both data sections unavailable; built-ins remain accessible. Intents failure disables mutation until retry but must not block viewing/configuring. Inventory loads only on first visit to Installed or an installed detail, through optional `ctx.get('remote') as InventoryRemote | undefined`; request failure only resets runtime data to unknown. Never make remote availability a required lifecycle inject dependency that prevents the center from mounting. Late promises after unmount cannot navigate or update the new visit; use an alive/generation guard.

Extract the existing onQueue algorithm: preserve busyId single-operation guard, retryingId, pending intent presentation, failure action identity, cleanup warning and refresh behavior. For installed details call `queueIntent(installed.id, PROFILE_SOURCE_ID, 'remove')`. For discovery install call catalog id/source id only. On clean install success locate `result.snapshot.installedPlugins` by catalogEntryId (fallback exact packageName) and navigate to Installed detail. On `mutationApplied:true` (cleanup failure **or post-action projection failure with no snapshot**) use the existing applied-warning/refresh-only path: refresh catalog, retain the known outcome and warning even if refresh fails, and disable re-mutation until refreshed/repaired state is confirmed; never show a mutation-retry button or resend the action. Do not navigate using an absent result snapshot; refresh is a read, not mutation retry. On ordinary failure stay in the current detail/list with query/tag/scroll and show retry for the same action. Remove success returns to Installed list, focuses its heading and announces the removed name. Do not pretend uninstall erased plugin credentials/data.

- [x] **4. Implement semantic navigation and concise lists**. The page root is `<section id="dsh-plugin-center" className="dsh-market-center" aria-labelledby="dsh-plugin-center-title">` with a single h1 carrying that title id. Use `<div role="tablist">` with two button refs and `role="tab"`, `aria-selected`, `aria-controls`, roving tabIndex. Home/End and Left/Right select and focus; controls with composition in progress are ignored. Render both associated panel wrappers with inactive `hidden` so aria-controls always resolves. Store query/tag/scroll per list visit; before opening details record actual scrollTop, and on Back restore after DOM commit using layout effect/requestAnimationFrame and focus the original card button without scrolling it to top. Page h1 and detail h2 are programmatically focusable. Capability cards are real open buttons; discovery cards retain article + sibling open/install buttons, not nested buttons. Remove installedOnly and Sources tabs/form; retain backend sources/intents files and API compatibility. Normal cards never print package/spec/CLI commands. Details show source, exact non-secret trust spec, version if available (label catalog version as catalog metadata, do not claim a resolved external version), compatibility warning and user runtime state. “Run” means the plugin's existing contribution remains available in DSH, not a new launch/enable API.

Add locale keys with exact Chinese product semantics and English translations: `tabInstalled/已安装/Installed`, `tabDiscover/发现插件/Discover plugins`, `builtIn/内置/Built-in`, `unavailable/暂不可用/Temporarily unavailable`, `doctorHint/请运行 xtz doctor 检查/Run xtz doctor to diagnose`, `externalInstall/外部安装/External install`, `configure/配置/Configure`, `running/已运行/Running`, `runtimeLoading/加载中/Loading`, `runtimeError/异常/Error`, `disabled/已停用/Disabled`, `runtimeUnknown/状态未知/Unknown state`. Add separate installed-empty, load-failed and retry messages. Replace “自动保持最新”/“silently kept fresh” with honest discovery/configuration copy.

- [ ] **5. Run green interaction coverage:** `.superpowers/sdd/2026-09-05-plugin-center-plan/test-env.sh pnpm --filter dsh-market test -- tests/client-interaction.test.ts tests/client-ui.test.ts tests/plugin-center-host.test.ts tests/install-presentation.test.ts`; typecheck too. Include loading-v-empty, missing slot, inventory rejection, keyboard tabs, install→installed detail, ordinary failure→retry, applied-warning refresh failure, post-action projection failure with mutationApplied:true/no snapshot (including another failed refresh and a successful refresh: assert no second POST/mutation retry), failed mutation plus projection diagnostic retains original failure/action and never claims success, external remove named confirmation, Escape cancel/no mutation, concurrent global busy, Back filters/scroll and missing third-party config. One atomic live region belongs to the current market context; do not render its announcer while an embedded capability renders its own status region. All state changes include visible text. Later authorized commit: `feat(market): replace market overlay with plugin center`.

## Task 6: Migrate Xiaotaozi, Side Workbench and Models registrations

**Files:**

- Create: `plugins/xtz-ui/src/client/plugin-center-contract.ts`.
- Create: `plugins/sidebar/src/client/plugin-center-contract.ts`.
- Create: `plugins/providers/src/client/plugin-center-contract.ts`.
- Modify: `plugins/xtz-ui/src/client/index.ts`.
- Modify: `plugins/sidebar/src/client/index.tsx`.
- Modify: `plugins/sidebar/src/client/SideCardSection.tsx` (props type only and ownership comment).
- Modify: `plugins/sidebar/src/client/layout.css` (remove obsolete settings-nav-icon selectors only).
- Delete: `plugins/sidebar/src/client/settings-nav-icon.ts`.
- Modify: `plugins/providers/src/client/index.ts`.
- Modify: `plugins/providers/src/router/empty-pool.ts` (location copy only).
- Modify/Test: `plugins/xtz-ui/tests/settings-ui.test.ts`.
- Modify/Test: `plugins/sidebar/tests/ui-contract.test.ts`.
- Modify/Test: `plugins/providers/tests/ui-contract.test.ts`.
- Modify/Test: `plugins/providers/tests/smart-ux.test.ts` (existing exact empty-pool location assertion).

**Interfaces:** Each local contract declares only `xiaotaozi.plugin-center.detail` with the exact keyed/root shape. Existing business interfaces remain Xiaotaozi `{ctx}`, Sidebar `SideCardSectionInjected`, Providers `ModelsWorkspaceInjected`. No namespace rename and no close callback added to the detail-slot contract.

- [x] **1. Add static red registration assertions** to each existing UI test, reading its own package's index file:

```ts
it('contributes its original settings component under a keyed capability', () => {
  const source = readFileSync(new URL('../src/client/index.ts', import.meta.url), 'utf8');
  expect(source).toContain('name: "xiaotaozi.plugin-center.detail"');
  expect(source).toContain('key: "models"');
  expect(source).toContain('rpc: connection.rpc, api: connection.api, t');
  expect(source).not.toMatch(/name:\s*["']settings\.section["']/);
});
```

For sidebar use `index.tsx`, key `side-workbench`, assert `inject: () => ({ store: sidebarStore, service })`; for xtz-ui key `xiaotaozi`, assert `createElement(XiaotaoziSettings, { ctx })` and absence of old `id: XTZ_UI_SETTINGS_SECTION_ID` registration (Advanced will still use settings.section). Run each filtered test to see the old registrations fail.

- [x] **2. Change only registration seats**, importing local contract for type augmentation:

```ts
ctx.slots.inject("xiaotaozi.plugin-center.detail", () => ctx.slots.register({
  name: "xiaotaozi.plugin-center.detail", key: "xiaotaozi",
}, () => createElement(XiaotaoziSettings, { ctx })));
```

```ts
ctx.slots.inject('xiaotaozi.plugin-center.detail', () => ctx.slots.register({
  name: 'xiaotaozi.plugin-center.detail', key: 'side-workbench',
  inject: () => ({ store: sidebarStore, service }),
}, SideCardSection));
// SideCardSection.tsx
export type SideCardSectionProps = PropsRuntime<'xiaotaozi.plugin-center.detail'> & SideCardSectionInjected;
```

```ts
ctx.slots.inject("xiaotaozi.plugin-center.detail", () => ctx.slots.register({
  name: "xiaotaozi.plugin-center.detail", key: "models",
  inject: (): ModelsWorkspaceInjected => ({ rpc: connection.rpc, api: connection.api, t }),
}, ModelsWorkspace));
```

Remove only sidebar's icon registration effect/import and icon-only CSS. Preserve module/chunk/bootstrap, sidebarStore construction, own settings fence/revision, service, prefs, external suspension, session/file/Git/terminal behavior. Keep Providers smart UX/toolviews and Xiaotaozi theme/board/archive/settings-live. Change EMPTY_POOL_GUIDE to `还没有可自动选择的模型。请到插件中心 → 已安装 → 模型勾选至少一个已授权模型。` and update its exact-copy assertion.

- [x] **3. Run green:** `.superpowers/sdd/2026-09-05-plugin-center-plan/test-env.sh pnpm --filter dsh-xtz-ui typecheck`, `.superpowers/sdd/2026-09-05-plugin-center-plan/test-env.sh pnpm --filter dsh-sidebar typecheck`, `.superpowers/sdd/2026-09-05-plugin-center-plan/test-env.sh pnpm --filter dsh-providers typecheck`, then each package's full test command. The existing behavioral settings/auth/route suites must remain green without changed namespaces/credential references. Static registrations alone are not proof of saving embedded forms; Task 11 browser checks do that. Later authorized commit: `refactor(plugins): contribute first-party center details`.

## Task 7: Embed IM manager and remove only obsolete IM entry paths

**Files:**

- Create: `plugins/im/src/client/plugin-center-contract.ts`.
- Modify: `plugins/im/src/client/index.ts`.
- Modify: `plugins/im/src/client/channels/dingtalk/index.ts`.
- Modify: `plugins/im/src/client/channels/feishu/index.ts`.
- Modify: `plugins/im/src/client/channels/qq/index.ts`.
- Modify: `plugins/im/src/client/channels/wecom/index.ts`.
- Modify: `plugins/im/src/client/channels/weixin/index.ts`.
- Modify: `plugins/im/src/client/styles.ts` (remove hub-only scrim/header/entry/shared-row CSS, retain IMSettingsTab styles).
- Delete: `plugins/im/src/client/sidebar-entry.ts`.
- Delete/Test migration: `plugins/im/tests/sidebar-entry.test.ts` (obsolete entry tests move to new registration assertions, not channel behavior).
- Modify/Test: `plugins/im/tests/client-ui.test.ts`.

**Interfaces:** Existing `hubProps` renamed `detailProps` with identical fields and callbacks. `IMSettingsTab` remains the rendered component. Session-follow actions and follow-dialog remain unchanged; experimental AI Office visibility still comes from config, and WeCom office remains **inside WecomSettingsTab's bot card**, not a fifth capability.

- [x] **1. Convert the existing apply test at client-ui.test.ts's combined-registration fixture** to expect `options.name === 'xiaotaozi.plugin-center.detail'`, `options.key === 'im'`, `component === IMSettingsTab`, unchanged injected workspaceProjects and officeEnabled. Keep assertions for `im-follow` and `im-follow-dialog` registrations. Assert no `im-hub` id or `im-hub: sidebar entry` effect. Run `.superpowers/sdd/2026-09-05-plugin-center-plan/test-env.sh pnpm --filter dsh-im test -- tests/client-ui.test.ts` red.

- [x] **2. Implement the seat migration**:

```ts
ctx.slots.inject('xiaotaozi.plugin-center.detail', () => ctx.slots.register({
  name: 'xiaotaozi.plugin-center.detail', key: 'im',
  locale: IM_LOCALE_NAMESPACE, inject: detailProps,
}, IMSettingsTab));
```

Remove hubOpen/listeners/open/close exports, ImHubOverlay, its CloseGlyph/HubMark/imports and mountImEntry effect. Keep IMSettingsTab, channelIndexForKey, logos, loopback recovery, workspace provider, all channel styles, inbound-file restyling and session follow. Remove only the old `settings.plugins.tab` registration blocks from the five named channel files; if their `apply` becomes unused with no remaining service/effects, remove that dead apply plus now-unused imports. Do not remove tab component exports, RPC channel constants or Host channel registration. Local contract declaration matches Task 6 exactly, with no market import.

- [x] **3. Replace obsolete modal-only assertions with embedded reachability**:

```ts
test('combined manager remains reachable as a detail contribution', () => {
  const calls = [];
  const callbacks = Object.fromEntries(['dingtalk','discord','feishu','qq','slack','telegram','wecom','weixin','whatsapp','office']
    .map(channel => [`${channel}RpcCall`, async (...args) => { calls.push([channel, args]); return { ok: true, value: {} }; }]));
  const markup = renderToStaticMarkup(React.createElement(IMSettingsTab, callbacks));
  assert.match(markup, /IM机器人设置/);
  assert.match(markup, /dim-tab-weixin/);
  assert.match(markup, /dim-tab-whatsapp/);
  assert.doesNotMatch(markup, /dim-hubScrim|dim-hubPanel/);
});
```

Keep existing nine-channel default/ten-channel enabled, English-copy, first-bind workspace pending/cancel, loopback recovery, nested remove-focus and WeCom office tests. Add a source scan over exactly the five channel files asserting absence of `settings.plugins.tab` while each exported settings component remains. This scan is contract evidence only; existing renderer tests and browser clicking every tab establish reachability.

- [ ] **4. Run green:** (Tests/typecheck passed and independently reviewed; later commit NOT RUN / NOT AUTHORIZED.) IM typecheck/full tests. Removing shared row CSS temporarily makes the root design gate red until Task 11 migrates owner pairing; do not weaken the rule locally. Later authorized commit: `refactor(im): embed bot manager in plugin center`.

## Task 8: Preserve runtime-setting drafts through Host and credential failures

**Files:**

- Create: `plugins/xtz-ui/src/client/advanced-runtime.ts`.
- Create/Test: `plugins/xtz-ui/tests/advanced-runtime.test.ts`.

**Interfaces:** Import **type** `SettingsScope`, `SettingsScopeSnapshot` from existing runtime/client. Bound scopes remain Host truth, not the form. Export these exact local types and factory from advanced-runtime.ts:

```ts
export type RuntimeNamespace = 'shell'|'agent-loop'|'web-search-deepseek';
export type RuntimeValues = Record<string,unknown>;
export type RuntimeWire<T> = {result:{ok:true;value:T}|{ok:false;error:{message:string}}};
export interface RuntimeCredentials {
  describe(payload:{refs:string[]}):Promise<RuntimeWire<{credentials:Record<string,{configured?:boolean;writable?:boolean}>}>>;
  set(payload:{ref:string;value:string}):Promise<RuntimeWire<unknown>>;
}
export type RuntimeFormSnapshot = {
  fields:Record<string,{text:string;overridden:boolean;invalid:boolean}>;
  dirty:boolean; invalid:boolean; busy:boolean; available:boolean; writable:boolean;
  error:'invalid'|'saveFailed'|undefined; status:'idle'|'saving'|'saved';
  credential:{configured:boolean;writable:boolean;loading:boolean;error:boolean};
};
export interface RuntimeForm {
  getSnapshot():RuntimeFormSnapshot;
  subscribe(listener:()=>void):()=>void;
  edit(field:string,text:string):void; reset(field:string):void; discard():void;
  save():Promise<void>; refreshCredential():Promise<void>; dispose():void;
}
export type CreateRuntimeForm = (namespace:RuntimeNamespace,
  scope:SettingsScope<RuntimeValues>, credentials?:RuntimeCredentials)=>RuntimeForm;
```

Export `createRuntimeForm: CreateRuntimeForm` using the closure/save implementation in steps 2–3. Metadata contains no credential literal; `apiKey` field text contains only a newly typed replacement.

- [x] **1. Write red save-acceptance tests with a scope facade**:

```ts
import { expect, it, vi } from 'vitest';
import { createRuntimeForm } from '../src/client/advanced-runtime.ts';
it('retains draft if a resolved scope write recovered the old Host value', async () => {
  const snapshot = { status: 'ready' as const, value: { timeoutMs: 1000 },
    base: { timeoutMs: 1000 }, user: {}, revision: 1, writable: true, mode: 'host' as const };
  const scope = { getSnapshot: () => snapshot, subscribe: () => () => {},
    set: vi.fn(async () => {}), unset: vi.fn(async () => {}) };
  const form = createRuntimeForm('shell', scope);
  form.edit('timeoutMs', '2000'); await form.save();
  expect(scope.set).toHaveBeenCalledWith('timeoutMs', 2000);
  expect(form.getSnapshot()).toMatchObject({ dirty: true, busy: false });
  expect(form.getSnapshot().fields.timeoutMs.text).toBe('2000');
  expect(form.getSnapshot().error).toBeTruthy();
  form.dispose();
});
```

Add credentials case: metadata already says configured true, but set returns `{result:{ok:false,error:{message:'denied'}}}`; draft must **not** clear. A configured badge alone cannot prove this replacement succeeded. Add throw, mid-save scope change/ref change, discard, read-only and stale metadata response cases. Run `.superpowers/sdd/2026-09-05-plugin-center-plan/test-env.sh pnpm --filter dsh-xtz-ui test -- tests/advanced-runtime.test.ts` red.

- [x] **2. Implement explicit field definitions, parsing and acceptance checks** (not an upstream controller copy):

```ts
export const RUNTIME_FIELDS = {
  shell: { timeoutMs: 'number', maxOutputBytes: 'number' },
  'agent-loop': { maxParallelToolCalls: 'number' },
  'web-search-deepseek': { baseURL: 'text', maxUses: 'number' },
} as const;
type Draft = { text: string; clear: boolean };
export function runtimeWrite(kind: 'number'|'text', draft: Draft):
  {kind:'unset'} | {kind:'set';value:string|number} | undefined {
  const text = draft.text.trim();
  if (draft.clear || text === '') return {kind:'unset'};
  if (kind === 'text') return {kind:'set',value:text};
  const value = Number(text);
  return Number.isFinite(value) ? {kind:'set',value} : undefined;
}
function userRecord(scope: SettingsScope<Record<string, unknown>>): Record<string, unknown> {
  const user = scope.getSnapshot().user;
  return typeof user === 'object' && user !== null && !Array.isArray(user) ? user as Record<string, unknown> : {};
}
async function writeField(scope: SettingsScope<Record<string, unknown>>, field: string,
  write: {kind:'unset'} | {kind:'set';value:string|number}, isDisposed:()=>boolean): Promise<boolean> {
  if (isDisposed()) return false; // No await between this guard and either call.
  if (write.kind === 'unset') { await scope.unset(field); return !Object.hasOwn(userRecord(scope), field); }
  await scope.set(field, write.value);
  return Object.hasOwn(userRecord(scope), field) && userRecord(scope)[field] === write.value;
}
```

Do not add invented numeric constraints beyond finite numbers; Host schema/validators are authority. Reset stages an unset and displays the composition base, preserving the distinction between equal-value override and absence. Blank credential means keep, not unset; runtime blank means unset. Invalid numeric text blocks the entire Save without dropping it.

- [x] **3. Implement the form lifecycle and save algorithm**:

The following lifecycle/acceptance algorithm replaces the unsafe illustrative save/factory snippets; implement it inside the existing `createRuntimeForm` closure, not as a new transaction framework:

1. Maintain immutable ordinary Draft objects, a stable cached `RuntimeFormSnapshot`, listeners, disposed/busy/status, metadata generation/reference, and an **owned active save capture**. Scope snapshots remain the only Host truth. Project ordinary field text from draft or Host value, reset text from composition base, overridden from user-layer own-property presence; apiKey text comes only from a newly typed draft, never Host value. Rebuild/publish on edits or scope updates without overwriting drafts; keep snapshot reference stable between publications.
2. Save is a no-op when disposed, busy, empty, unavailable or read-only. Capture ALL ordinary intended fields (including no-ops), parsed writes and current credential ref; record only whether a replacement was intended, **not** a key string or key Draft reference across earlier field awaits. Invalid input blocks all writes and retains drafts. No-op filtering uses user-layer presence/value, never effective inherited equality: equal inherited value still calls set if user lacks that field; unset without an override is a no-op. Set busy/status=saving and publish; edits/reset/discard are disabled while busy.
3. Before **every** not-yet-started `scope.set`, `scope.unset` or `credentials.set`, synchronously check disposal at the call boundary, with no intervening await. Check again on returning from each await before continuing. Disposal can happen during publication or any deferred write; it forbids all later calls, not just late UI updates. `writeField` must accept a lifecycle predicate and check it immediately before either setter (step 2 helper above). Only a call already started before disposal may settle; no cancellation/rollback or Host-scope disposal is implied.
4. For each required ordinary write, retain its user-layer acceptance result. Just before a credential call, recheck disposal, current ref and metadata writable/loading/error. Obtain/trim the replacement from the currently owned draft only at this point and construct the payload in a short synchronous call helper; do not keep a secret local or Draft reference live in the async save frame during earlier awaits or later metadata refresh. The started credentials transport may necessarily retain its payload until settlement. Blank key means keep, never unset. Acceptance is the set envelope’s result.ok, never configured metadata. Ref mismatch fails acceptance. A later metadata-refresh failure is metadata error only, not fabricated write failure or automatic replacement replay.
5. Immediately before clearing drafts, check disposal, ready/writable state, current credential ref and final user-layer presence/value for **ALL** captured ordinary intentions, including filtered no-ops. A field accepted earlier may have changed during a later await. Any mismatch or failed write retains ALL drafts and reports saveFailed/unconfirmed state, including partial durable success; this is not rollback, CAS, atomic cross-field/credential saving or a guarantee against later concurrency. Only confirmed success clears captured ordinary drafts by identity and the intended replacement (busy prevents intervening edits). Empty/invalid paths release the active capture too. Set busy=false, status=saved or idle, and publish only while alive. Clear owned active save capture on every completion path.
6. Scope subscription projects snapshots and refreshes metadata on reference changes; callbacks start with a disposed guard. Metadata reads use generation/ref checks before publishing, including rejection paths. Refresh after disposal is a no-op; check disposal again immediately before starting describe, including after publishing its loading state. Unsubscribed/disposed listeners must never receive a late notification, including a listener that disposes the form during publication; stop the notification loop when disposed. Do not register new listeners after disposal.
7. Dispose is idempotent: mark disposed, increment metadata generation, unsubscribe scope, clear owned replacement draft and ordinary drafts, clear/detach the active save capture, clear listeners, and **replace the current cached snapshot directly without publishing**. The disposed snapshot has empty apiKey text, no dirty/busy state and unavailable/read-only controls; do not call publish (it intentionally refuses disposed forms) or read credential values. This releases owned references only: no promise of JavaScript secure erasure, cancellation of an already-started transport or invalidation of historical snapshots held by external code. The form’s own `getSnapshot()` after disposal must not expose replacement text.

Add explicit deferred-first-field → dispose → settle tests with a second field and apiKey staged: no second field or credential call starts, current apiKey text is empty, active capture/drafts are released, and listener count never increases after disposal. Repeat with first-call rejection. Separately defer an already-started credential call, dispose, then settle it: one already-started call may complete, but no later writes/metadata calls, notifications or secret-restoring snapshot updates occur. Include disposal during initial saving publication before the first call. Preserve earlier approved final-consistency tests: deferred later field while earlier Host value changes, filtered no-op changes, ready/writable loss and credential-ref changes. Test inherited-equal user overrides, explicit discard, stale metadata suppression and metadata failure after successful credential set without replay.

Preserve the factory’s remaining action contracts: reject unknown field names; edits set error=undefined/status=idle and blank replacement input removes only the apiKey draft; reset is ignored for apiKey and otherwise stages unset with base text; discard clears drafts/error/status while idle, never the Host. Start credential metadata refresh for search on activation only, expose configured/writable/loading/error metadata without any saved literal, and preserve unavailable/read-only state. Every action and subscription callback respects disposal/busy guards as applicable.

For search, `credentialRef()` is current nonempty `scope.value.apiKeyEnv` or `DEEPSEEK_API_KEY`. Metadata starts loading/read-only until describe succeeds. Track generation plus reference for late response suppression; subscribe externally to `credentials/reference-updated` in Task 9. Metadata read failure shows retry text, never “no key” as fact and never erases the replacement draft. Save success requires the set envelope's `result.ok`, not metadata.configured. Do not log errors containing credentials/payloads or reflect response objects as arbitrary HTML.

- [ ] **4. Run green:** (Tests/typecheck passed and independently reviewed; later commit NOT RUN / NOT AUTHORIZED.) advanced-runtime tests and xtz-ui typecheck. Cover every field, number/blank/reset, equal-value override, scope resolved rejection, rejected promise, revision recovery, partial failure, invalid input, metadata failure, configured-old-key+failed replacement, ref race, disposable subscriptions, deferred-write disposal/no-later-calls/current-snapshot clearing, already-started settlement and final all-intention consistency. Later authorized commit: `feat(xtz-ui): stage advanced runtime settings safely`.

## Task 9: Render Advanced and suppress only obsolete upstream Settings surfaces

**Files:**

- Create: `plugins/xtz-ui/src/client/AdvancedRuntimeSettings.tsx`.
- Create: `plugins/xtz-ui/src/client/advanced-runtime-locales.ts`.
- Modify: `plugins/xtz-ui/src/client/index.ts` (bind/inject Advanced, adapter effect).
- Modify: `plugins/xtz-ui/src/client/hide-official.ts` (replace keep-last-Models logic).
- Modify: `plugins/xtz-ui/src/client/styles.ts` (Advanced scoped rows/control states).
- Modify/Test: `plugins/xtz-ui/tests/hide-official.test.ts`.
- Create/Test: `plugins/xtz-ui/tests/advanced-runtime-ui.test.ts`.

**Interfaces:** `AdvancedRuntimeSettings({forms, mirror, t})` receives the three RuntimeForms and shared SettingsDescribeFace. `hideOfficialSettings(doc:Document = document): ()=>void` matches exact `模型/Models/插件/Plugins` in the pinned Settings modal and selects visible `高级/Advanced` on stale hidden selection. `isObsoleteSettingsLabel(text:string):boolean`. No new settings namespace or shadow registration of id `plugins` (which would leave legacy ledger duplicates).

- [x] **1. Add red pure matching and markup tests**:

```ts
it('matches only exact obsolete Settings labels, not model-related preferences', () => {
  expect(isObsoleteSettingsLabel(' 模型 ')).toBe(true);
  expect(isObsoleteSettingsLabel('Plugins')).toBe(true);
  expect(isObsoleteSettingsLabel('设置模型')).toBe(false);
  expect(isObsoleteSettingsLabel('模型缓存')).toBe(false);
  expect(isObsoleteSettingsLabel('高级')).toBe(false);
});
```

Advanced static render with loading fake forms must have heading 高级, three named sections, visible labels, password input with `autoComplete="new-password"` and no server credential value, disabled saving controls and one atomic status region. Test forms via Task 8, not static markup for write behavior. Run the two xtz-ui tests red.

- [x] **2. Bind original namespaces via existing service**. Add `settingsScope` and `remote` to xtz-ui's runtime `inject` (not new dependency packages; settings base/connection are already client inject packages). Keep `remote` use narrow. In apply bind three forms once per activation, register new locale namespace, and register:

```ts
const mirror = ctx.settingsScope.describe();
const forms = {
  shell: createRuntimeForm('shell', ctx.settingsScope.bind({namespace:'shell'})),
  'agent-loop': createRuntimeForm('agent-loop', ctx.settingsScope.bind({namespace:'agent-loop'})),
  'web-search-deepseek': createRuntimeForm('web-search-deepseek',
    ctx.settingsScope.bind({namespace:'web-search-deepseek'}), credentials),
};
ctx.slots.inject('settings.section', () => ctx.slots.register({
  name: 'settings.section', id: 'advanced-runtime', order: 90,
  label: () => advancedT('nav'),
  inject: () => ({ forms, mirror, t: advancedT }),
}, AdvancedRuntimeSettings));
ctx.effect(() => () => Object.values(forms).forEach(form => form.dispose()), 'dsh-xtz-ui runtime forms');
ctx.effect(() => remote.$on('credentials/reference-updated', () => {
  void forms['web-search-deepseek'].refreshCredential();
}), 'dsh-xtz-ui runtime credential metadata');
```

Obtain `credentials` from `ctx.get('connection').api.credentials` with the local structural RuntimeCredentials type, preserving method receiver binding (use `describe: payload => api.credentials.describe(payload)` and `set: payload => api.credentials.set(payload)`). Do not use provider source or `ctx.remote` envelope for credentials. On mount call `mirror.ensure()`; render mirror.error with retry calling ensure when its status returns idle. React reads mirror/forms using useSyncExternalStore with cleanup; API failures do not drop drafts. If namespace unavailable, show localized unavailable/read-only copy, not editable defaults.

- [x] **3. Implement all three forms**, using the descriptor list from Task 8 to avoid missing shell output cap or search maxUses. Each field has a persistent label, hint, override indicator and staged Reset. Use type=text/inputMode=decimal for numeric drafts so invalid text can stay visible, an ordinary URL text field for baseURL and a password field for newly entered key. Set aria-invalid/aria-describedby beside invalid numeric input. Each namespace has Save/Discard buttons; no input commits on blur/change. Example row:

```tsx
<label htmlFor={`${namespace}-${field}`}>{t(field)}</label>
<input id={`${namespace}-${field}`} value={state.fields[field].text}
  inputMode={kind === 'number' ? 'decimal' : undefined}
  aria-invalid={state.fields[field].invalid}
  aria-describedby={`${namespace}-${field}-hint`}
  disabled={!state.writable || state.busy}
  onChange={event => form.edit(field, event.currentTarget.value)} />
<p id={`${namespace}-${field}-hint`}>{state.fields[field].invalid ? t('invalidNumber') : t(`${field}Hint`)}</p>
<button type="button" disabled={!state.writable || state.busy}
  onClick={() => form.reset(field)}>{t('reset')}</button>
```

Use typed key unions for all labels in advanced-runtime-locales.ts, with Chinese/English dictionaries. Copy names: 高级/Advanced, Shell, Agent loop, DeepSeek 搜索/DeepSeek search; explanatory text says runtime parameters, not plugin inventory. One page status aggregates busy/success/failure; field-level errors are linked text, not additional live announcers. Preserve drafts while navigating Settings sections because forms belong to plugin activation, not view mount. Credential draft clears only after confirmed success, explicit discard or activation disposal, never on navigation or failure and never persisted. Task 8 disposal must clear the current cached snapshot/capture and prevent subsequent writes while allowing already-started calls to settle; view unmount only unsubscribes, it does not dispose activation-owned forms.

- [x] **4. Implement the pinned DOM adapter with reversible mutations**:

```ts
export function isObsoleteSettingsLabel(text: string): boolean {
  return ['模型','Models','插件','Plugins'].includes(text.replace(/\s+/g, '').trim());
}
```

Within `[role="dialog"][aria-modal="true"]` that contains `[class*="navList"]`, inspect only direct nav buttons and their `[class*="navLabel"]` text. Hide all obsolete rows, not “all but last”; snapshot original hidden/style.display/aria-hidden/tabIndex in a Map before modification. If an obsolete row is `aria-current=true`, temporarily hide its current `[class*="options"]` contents and invoke the same dialog's exact Advanced button `.click()` to transfer selection; restore that temporary suppression on the next observed render when a non-obsolete row (Advanced or General) is current. If Advanced is not yet registered, transfer to General/通用设置 instead; never show technical content while waiting. Do not query `.dshM-wrap` or hide siblings of a provider form; it now lives outside Settings. Preserve general preferences and other non-obsolete sections. Coalesce childList/subtree changes and aria-current changes; ignore self-created mutations when values already match. On dispose stop observer/queued work and restore only still-connected nodes' original attributes/styles. Add a DSH `0.1.1-rc.2` upgrade comment with exact selectors and the removal condition: a formal suppression API.

Test with doc facades: English/Chinese rows, one or multiple obsolete rows, outside-dialog Models button untouched, stale Plugins active routes to Advanced, late Advanced falls back to General, HMR restores attributes, observer coalescing and no infinite self-scan. Actual DSH modal DOM and dynamic timing remain mandatory browser acceptance, not proven by string matching.

- [ ] **5. Run green:** (Tests/typecheck passed and independently reviewed; later commit NOT RUN / NOT AUTHORIZED.) `.superpowers/sdd/2026-09-05-plugin-center-plan/test-env.sh pnpm --filter dsh-xtz-ui test -- tests/advanced-runtime.test.ts tests/advanced-runtime-ui.test.ts tests/hide-official.test.ts tests/settings-ui.test.ts` and typecheck. Later authorized commit: `feat(xtz-ui): relocate runtime controls to advanced settings`.

## Task 10: Finish responsive main-area styling and accessibility contracts

**Files:**

- Modify: `plugins/market/src/client/market-css.ts`.
- Modify: `plugins/market/src/client/PluginCenter.tsx`.
- Modify: `plugins/market/src/client/PluginCenterHost.tsx`.
- Modify: `plugins/market/src/client/PluginDetail.tsx`.
- Modify: `plugins/market/tests/client-ui.test.ts`.
- Modify: `plugins/market/tests/client-interaction.test.ts`.
- Modify: `plugins/xtz-ui/tests/advanced-runtime-ui.test.ts`.

**Interfaces:** Existing market semantic custom properties keep their meanings but move from `.dsh-market-dialog` to `.dsh-market-center`. Global selectors are only the explicitly marker-scoped center takeover and current shared sidebar recipe. No new style system, fonts or UI dependencies.

- [x] **1. Write red CSS/markup contracts**:

```ts
it('uses a main-area view, narrow/coarse targets and reduced motion', () => {
  expect(marketCss).toContain('html[data-dsh-plugin-center-active]');
  expect(marketCss).toContain('[data-dsh-plugin-center-view]');
  expect(marketCss).toMatch(/:focus-visible[^}]*outline:\s*2px/s);
  expect(marketCss).toContain('@media (max-width: 768px), (pointer: coarse)');
  expect(marketCss).toMatch(/min-height:\s*44px/);
  expect(marketCss).toContain('@media (prefers-reduced-motion: reduce)');
  expect(marketCss).not.toContain('.dsh-market-overlay');
});
```

Run market client-ui test red against old modal stylesheet. Keep trapDialogTab tests for RemoveConfirmation even though the page itself is not a dialog.

- [x] **2. Replace only obsolete overlay layout**, retaining approved semantic fallbacks/confirmation styles:

```css
html[data-dsh-plugin-center-active] [data-pane='conversation'],
html[data-dsh-plugin-center-active] [class*='centerCol'] { position: relative; }
[data-dsh-plugin-center-view] { display: none; position: absolute; inset: 0; min-width: 0; min-height: 0; }
html[data-dsh-plugin-center-active] [data-dsh-plugin-center-view] { display: block; z-index: 60; background: var(--dsw-alias-bg-base); }
html[data-dsh-plugin-center-active] [data-pane='conversation'] > :not([data-dsh-plugin-center-view]),
html[data-dsh-plugin-center-active] [class*='centerCol'] > :not([data-dsh-plugin-center-view]) { display: none !important; }
.dsh-market-center { box-sizing: border-box; width: 100%; height: 100%; min-width: 0; display: flex; flex-direction: column; color: var(--dsw-alias-label-primary); font-family: inherit; }
.dsh-market-center-head { display: flex; align-items: center; gap: 12px; flex: none; padding: 16px; }
.dsh-market-center-scroll { flex: 1; min-height: 0; min-width: 0; overflow: auto; padding: 16px; scroll-padding-block: 12px; }
.dsh-market-center :is(button,input,select):focus-visible { outline: 2px solid var(--mk-focus); outline-offset: 2px; }
.dsh-market-detail code { overflow-wrap: anywhere; white-space: pre-wrap; }
@media (max-width: 768px), (pointer: coarse) {
  .dsh-market-center :is(button,input,select) { min-height: 44px; min-width: 44px; }
  .dsh-market-center .dsh-market-grid { grid-template-columns: minmax(0, 1fr); }
  .dsh-market-center-scroll { padding: 12px; }
}
@media (prefers-reduced-motion: reduce) {
  .dsh-market-center *, .dsh-market-confirm * { animation: none !important; transition: none !important; }
}
```

Use explicit market-owned class selectors where input minimum width could override grid shrink. Head does not scroll over focused body controls. Desktop width follows the center column rather than viewport/modal max-width. Inner component boundaries remain their packages' CSS; verify they shrink to 375px inside the new parent, not only in their former full modal. Neutral lists/open sections, no nested decorative card towers. Danger actions use existing error ink/fill, not fruit orange. Icons remain existing outline SVG; no ×/‹ text glyphs. No full-page orange/cream, WebFonts or feature-specific dark-mode branching; consume resolved tokens with existing allowed fallback recipe.

- [ ] **3. Add interaction contract cases** for exactly one active tab/roving zero, matching panel ids, no button descendant of button/role=button, one active market atomic live region, nested confirmation cancel receives Escape before page close, no backdrop confirmation, missing-slot doctor hint and status words. CSS checks are static; record browser-only checks separately (overflow, contrast, focus not obscured, screen reader announcements and slot crash). Run market and Advanced UI tests green. Validation passed and independently reviewed; this combined checkbox remains unchecked because the commit is NOT RUN. Later authorized commit: `style(market): apply accessible responsive center layout`.

## Task 11: Migrate docs/contract gates and perform acceptance

**Files:**

- Modify: `AGENTS.md` (ownership hard rule: first-party configuration is contributed to Plugin Center; no replicated procedure tables).
- Modify: `docs/conventions.md`, `docs/conventions.zh.md` (Plugin Center entry, capability/advanced boundary, market remains catalog authority).
- Modify: `docs/workflow.md`, `docs/workflow.zh.md` (where to open UI; bounded transfer remains unchanged).
- Modify: `docs/harness-plugin.md`, `docs/harness-plugin.zh.md` (child-slot authorization and pinned Settings adapter deltas; not copied upstream tutorials).
- Modify: `docs/README.md`, `docs/README.zh.md` (documentation map).
- Modify: `README.md`, `README.zh.md`.
- Modify: `plugins/market/README.md`, `plugins/market/README.zh.md`.
- Modify: `plugins/xtz-ui/README.md`, `plugins/xtz-ui/README.zh.md`.
- Modify: `plugins/sidebar/README.md`, `plugins/sidebar/README.zh.md`.
- Modify: `plugins/providers/README.md`, `plugins/providers/README.zh.md`.
- Modify: `plugins/im/README.md`, `plugins/im/README.zh.md`.
- Modify: `plugins/wecom-office/README.md`, `plugins/wecom-office/README.zh.md` (entry path only).
- Modify: `design-system/xiaotaozi-dsh/MASTER.md` (Marketplace surface-pattern sentence only).
- Modify: `scripts/check-ui-design.mjs`, `scripts/check-ui-design.test.mjs` (single remaining tools-row owner gate; slot-registration source contract).
- Modify: `scripts/check-manifest.mjs`, `scripts/check-manifest.test.mjs` (new user-navigation docs assertions, retaining existing version/catalog/install safeguards).
- Modify: `plugins/xtz-ui/tests/sidebar-entry.test.ts`, `plugins/market/tests/sidebar-entry.test.ts` (market's row versus the board's separate row, no IM entry expectation).
- Modify: `plugins/market/package.json`, `plugins/im/package.json`, `plugins/xtz-ui/package.json` (description strings only, no dependency/version/inject changes).
- Create: `docs/superpowers/plans/2026-09-05-plugin-center-acceptance.md` (execution evidence, not created by the planning session).

**Interfaces:** Public navigation strings are `Plugin Center → Installed → Models/IM bots/Xiaotaozi/Side workbench`, Chinese `插件中心 → 已安装 → 模型/IM 机器人/小桃子功能/侧边工作台`; runtime controls are `Settings → Advanced` / `设置 → 高级`. Developer package names/specs remain in install/diagnostic docs. One atomic PR carries all registration removals and additions.

- [x] **1. Add failing doc/contract tests**. In check-ui-design.test.mjs test a new exported pure `pluginCenterContractErrors(files: Map<string,string>): string[]` from check-ui-design.mjs. Inspect the market parent in `PluginCenterHost.tsx` and its apply wiring in `index.ts`. Assert it rejects a parent missing the child declaration, any of four missing capability registrations, sidebar/providers old settings.section registrations, IM manager entry and channel settings.plugins.tab; assert it allows `im-follow-dialog` shell.overlay. Replace market/IM equality with exactly one market declaration per SHARED_TOOLS_SELECTORS selector and zero declarations in IM; preserve the existing normalized market declarations as the expected recipe. The board's separate `.dsh-xtz-ui-tools` rules retain their own existing tests, including their 36px desktop control size. Keep glyph, semantic colors, theme contrast and global selector rules intact.

```js
test('plugin center gate rejects legacy Models navigation', () => {
  const files = new Map([['plugins/providers/src/client/index.ts',
    'ctx.slots.register({ name: "settings.section", id: "models" }, ModelsWorkspace)']]);
  assert.ok(pluginCenterContractErrors(files).some(error => error.includes('providers')));
});
```

Implement the helper as explicit per-source assertions and integrate it into check-ui-design's already-collected allClientSources; incomplete fixture maps must yield missing-owner errors, not silently pass. Add exported `pluginCenterDocErrors(path, text): string[]` to check-manifest.mjs and test it with literal strings in check-manifest.test.mjs, following that file's existing pure-helper tests (it has no temporary-repo fixture). Read each named current README in the manifest gate and apply this helper to reject obsolete market-versus-Settings separation and require its current English or Chinese navigation. Do not require package install tables to stop spelling developer package names. Do not scan historical approved specs/plans/changelog as current product instructions. Run `.superpowers/sdd/2026-09-05-plugin-center-plan/test-env.sh node --test scripts/check-ui-design.test.mjs scripts/check-manifest.test.mjs` red before implementation.

- [x] **2. Write exact replacement docs and descriptions**, not a second technical spec:

```md
## Plugin Center

Open **Plugin Center** below **New Session**. It occupies the conversation area;
the sidebar and right workbench remain available. **Installed** is the default,
with Xiaotaozi, Side workbench, Models and IM bots as built-in capabilities.
**Discover plugins** uses the curated catalog. External top-level plugins appear
under Installed and can be removed after confirmation. Removing a package does
not promise to delete its credentials, sessions or saved data.

Runtime controls live under **Settings → Advanced**. The technical Loader
inventory is not a user settings page; use `xtz doctor` for diagnosis.
```

Provide corresponding Chinese text. Replace old sidebar IM/models/settings/market modal navigation in all named docs; remove source-management UI instructions while documenting that historical sources.json remains and remote sources still fail closed. Keep catalog three-row/source statements. Update root feature tables without removing technical install columns/portrait assets. Remove or explicitly label outdated screenshots as pre-center examples until replacement captures exist; do not claim old screenshots show the new interface. No website deployment/screenshot generation is part of this plan. MASTER sentence becomes `Plugin Center: main-area shell, Installed/Discover tabs, responsive lists and in-area details; destructive confirmation remains modal.` Package descriptions become honest center/embedded-IM/Advanced descriptions, removing market's existing obsolete desktop/workflow-pack queue language.

Add Harness delta text: only the shell.overlay parent's props renderSlot can dispatch its declared details; contributors use `key`, keep local type declarations and existing inject faces; no sibling import or ctx-level non-root renderSlot. Settings adapter is pinned to DSH 0.1.1-rc.2 and must be reverified on RC upgrades. AGENTS stays hard-rules only. Do not change home, Git Flow, CLI command list, versions or default seed rules.

- [x] **3. Run static gates green**, then the entire approved gate list **during execution only**:

```bash
.superpowers/sdd/2026-09-05-plugin-center-plan/test-env.sh pnpm --filter dsh-market typecheck
.superpowers/sdd/2026-09-05-plugin-center-plan/test-env.sh pnpm --filter dsh-market test
.superpowers/sdd/2026-09-05-plugin-center-plan/test-env.sh pnpm --filter dsh-xtz-ui typecheck
.superpowers/sdd/2026-09-05-plugin-center-plan/test-env.sh pnpm --filter dsh-xtz-ui test
.superpowers/sdd/2026-09-05-plugin-center-plan/test-env.sh pnpm --filter dsh-sidebar typecheck
.superpowers/sdd/2026-09-05-plugin-center-plan/test-env.sh pnpm --filter dsh-sidebar test
.superpowers/sdd/2026-09-05-plugin-center-plan/test-env.sh pnpm --filter dsh-providers typecheck
.superpowers/sdd/2026-09-05-plugin-center-plan/test-env.sh pnpm --filter dsh-providers test
.superpowers/sdd/2026-09-05-plugin-center-plan/test-env.sh pnpm --filter dsh-im typecheck
.superpowers/sdd/2026-09-05-plugin-center-plan/test-env.sh pnpm --filter dsh-im test
.superpowers/sdd/2026-09-05-plugin-center-plan/test-env.sh pnpm check
.superpowers/sdd/2026-09-05-plugin-center-plan/test-env.sh pnpm check:build
.superpowers/sdd/2026-09-05-plugin-center-plan/test-env.sh pnpm check:path
.superpowers/sdd/2026-09-05-plugin-center-plan/test-env.sh pnpm check:cli
.superpowers/sdd/2026-09-05-plugin-center-plan/test-env.sh git diff --check
```

`check:path` can perform isolated installs/network and `check:cli` requires the standalone workspace's dependencies, which are absent in this topic at planning time. Obtain execution authorization/environment readiness first; do not claim these gates were run here. The owned ignored test-tools/pnpm shim handles nested pnpm with pinned installed code; do not fall back to ambient fnm/corepack, restore real HOME, or change repository packages. Use the wrapper for every gate above and any authorized setup. The unchanged check:path temporary install inherits the external root and isolated environment; retain its existing finally cleanup. Infrastructure failures are a stop, not permission to change execution mode or downgrade gates.

- [ ] **4. Request explicit bounded 3081 transfer after gates**, naming topic/hub paths, responsible monitor, start/end window and restoration acknowledgement. Until authorized do **not** run dev, link-plugin, smoke, browser mutations or read/write real credentials. During the transfer execute and record this matrix in the acceptance artifact:

| Journey | Actual browser evidence required |
| --- | --- |
| 1440/1024/768/375; light/dark; coarse pointer | Screenshots, scrollWidth/clientWidth comparison at 375, resolved foreground/background contrast and 44×44 target measurements. Static CSS regexes are not this evidence. |
| Open/Close/Escape | Heading receives focus; left/right columns unchanged; conversation draft/session survives; explicit close restores current entry; nested remove/config Escape closes only nested dialog. |
| Mutual exclusion / navigation | Open board→center and center→board; only one active marker; selecting another session closes center without stealing focus; no browser history changes. |
| Installed / Discover / Back | Default Installed, all four fixed capabilities, loading distinct from empty, query/tag/scroll/card focus restored. |
| Slot absent / crash | Temporarily disable a contributor only in a disposable sandbox fixture, or a fixture contribution that throws; its card becomes unavailable/doctor, other details and session shell survive. Restore fixture afterward. |
| First-party settings | Save/reopen archive/board/gitGraph/announce flags; sidebar prefs use same store/revision; Models credentials/model pool and session model binding remain; all nine IM tabs plus config-enabled Office remain reachable. |
| WeCom and first work | Office stays within WeCom bot card. If binding an account for QA, unconfirmed/cancelled workspace selection creates no first session/file; confirm a registered target then first action lands only there. Reuse a disposable account/target with explicit authorization; do not change IM trust policy. |
| Third-party mutation | Approved disposable package: discovery install→installed detail; external package removable by name after confirmation; fail/retry preserves context; backend profile matches UI; applied-cleanup-warning does not offer repeat mutation. No new third-party source registration. |
| Failure isolation | Inventory rejected→unknown while installed/config/remove remain; catalog/profile failed→actionable retry rather than empty; built-ins still open. |
| Advanced | Shell two fields, parallel calls, search endpoint/max uses, metadata-only key status. Reject save/revision conflict/credential write→draft preserved; reset means inherit; read-only disabled; General preferences remain. |
| Settings suppression | No Models/Plugins/technical inventory or first-party duplicated columns in English/Chinese; stale active Plugins redirects; no unrelated settings hidden. |
| Console/accessibility | No new console errors except intentionally exercised fixture crash; one context-appropriate live announcement; visible unobscured focus, keyboard tabs, no nested interactive elements, reduced-motion respected. |

Never install an unreviewed arbitrary package merely to make the matrix green. An unavailable account/network permission makes that browser row **not run**, not passed. Stop topic sandbox afterward, restore hub at 3081 and confirm healthy monitor/listener under the workflow; official 3080 remains untouched.

- [ ] **5. Review and authorized commit checkpoint.** Task 11 independent spec/code review passed with no findings; final deterministic validation is recorded in the acceptance artifact. This combined checkpoint remains unchecked because commit/publication is NOT RUN / NOT AUTHORIZED. Update acceptance artifact with actual commands/results, screenshots/log locations, exact tested commit, static vs browser distinction, unresolved failures and hub restoration. Request independent spec/code review before an atomic PR. Do not stage build outputs, home state, node_modules or unrelated pre-existing files. Later authorized commit: `docs(repo): document and gate plugin center migration`. Push/PR/merge remain separate authorization; follow required green PR/post-merge loop when eventually approved, never implement in the hub.

## Spec coverage self-review

| Approved requirement / automation item | Implementing task and evidence |
| --- | --- |
| Single sidebar entry, main-area takeover, prior conversation, focus, mutual exclusion, no router | 3–5, 7, 10; adapter/interaction tests plus browser matrix |
| Installed default, exactly two tabs, fixed four capabilities, unavailable not silent disappearance | 3–5; keyboard/loading/slot-winner tests |
| Dependencies as third-party truth; six first-party + core excluded; catalog/external classification | 1–2; projection, strict profile and alias tests |
| Host-authoritative synthetic-id removal, no client spec authority | 2; forged id/spec, race, core exclusions and argv tests |
| Remote inventory user semantics and failure isolation | 3, 5; phase table/remote failure tests; live browser unknown-state path |
| Existing discovery search/tags/details/trust/install; no Sources tab; old source files retained | 1, 5, 11; API/interaction/source-store regression tests |
| Install success→installed detail; failure/retry/context/settlement preserved | 2, 5; concurrency, mutationApplied and renderer interaction tests |
| Root keyed detail slot from shell.overlay parent, independent packages, original inject faces | 4, 6–7; exact declarations/typechecks/contract gates and browser rendering |
| Four existing full configuration components, nested WeCom office, all IM channels | 6–7; unchanged behavioral suites and browser save/reachability |
| Remove first-party Settings registrations, upstream inventory/Models and IM manager entry | 6–7, 9, 11; source/adapter contracts and actual Settings navigation |
| Advanced original namespaces/revisions/credentials, error/conflict retains drafts | 8–9; Host-readback/credential-envelope/race tests plus browser |
| Same-origin, loopback, pinned runtime, serialization, state-file safety | 1–2 unchanged guards; existing route/mutate/state suites |
| Accessibility/visual system, 375px/coarse/focus/live/motion, no nested controls | 5, 9–11; static contracts explicitly separate from measured rendered acceptance |
| Documentation, contract gate migration, isolated package build/install and CLI gates | 11; exact bilingual docs and gate file list |
| Non-goals and home safety | Global constraints + Task 11 authorization gates; no new versions/dependencies/services |

**Self-review disposition:** All spec sections are mapped. The old MASTER modal pattern, market-vs-Settings README section and market/IM CSS gate are known legacy contracts to migrate under the already approved interaction, not new product decisions. Pinned API limitations are explicit: no suppression API; no runtime version or installed truth in inventory; settings setters can resolve after rejected writes. No unresolved product decision is required by this plan. Exact path/source checks and any corrections are recorded in the planning handoff; actual implementation, tests, builds and browser acceptance remain unperformed.
