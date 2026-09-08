# Harness plugin docs (ours vs upstream)

English | [中文](harness-plugin.zh.md)

This page is the **delta**. Cordis and Harness plugin APIs live in official DeepSeek Harness docs. This repository does not vendor `deepseek-harness` and does not copy those tutorials. Package identity, homes, layout, and gates stay in [conventions.md](conventions.md). How to create / install stays in [workflow.md](workflow.md) § Create.

If an official page disagrees with a pinned `@deepseek-ai/*` package, the pin in `versions.json` `dshRc` (currently `0.1.2-rc.1`) wins.

## Official docs (read, do not copy)

| Need | English | 中文 |
| --- | --- | --- |
| First Harness plugin (`apply`, `inject`, `ctx.effect`) | [Your first plugin](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/) | [第一个插件](https://deepseek-harness.github.io/deepseek-harness/develop/basic/) |
| Fiber lifecycle, HMR, dispose | [Plugins and lifecycle](https://deepseek-harness.github.io/deepseek-harness/en/develop/framework/) | [插件与生命周期](https://deepseek-harness.github.io/deepseek-harness/develop/framework/) |
| Cordis ideas (`ctx`, services, events) | [Cordis primer](https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-primer) | [Cordis 入门](https://deepseek-harness.github.io/deepseek-harness/reference/cordis-primer) |
| Hands-on Cordis (harness repo scratch dir) | [Cordis tutorial](https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/) | [Cordis 教程](https://deepseek-harness.github.io/deepseek-harness/develop/cordis-tutorial/) |
| Tool DSL | [Build a tool](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/tool) | [开发工具](https://deepseek-harness.github.io/deepseek-harness/develop/basic/tool) |
| Plugin config | [Plugin configuration](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/config) | [插件配置](https://deepseek-harness.github.io/deepseek-harness/develop/basic/config) |

The Cordis tutorial and “your first plugin” assume a **harness checkout**. Use them for API shape only.

## Do not follow from the official first-plugin path

| Official tutorial | This repo |
| --- | --- |
| Clone `deepseek-harness`; `mkdir scratch-plugin` | Do not clone or vendor the harness. `pnpm new <slug>` → `plugins/<slug>/` |
| Absolute path to `src/*.ts` in a `cordis.yml` overlay | Profile loads `lib/`. Git install is `#path:plugins/<slug>`. `prepare` / `tsdown` stay inside the package |
| `pnpm dsh web --patch …` on **3080** | Develop in a dedicated topic worktree. Live sandbox uses `link-plugin` + `pnpm dev` → `xtz --sandbox` on **3081** only in the clean-main hub or a bounded transfer. Never steal official 3080 |
| `node --import tsx` / no build | Build `lib/`. `@deepseek-ai/*` stays external (`deps.neverBundle: true`) |
| `import { … } from '@deepseek-ai/dsh-tools'` | Do not value-import `dsh-tools`. Register a plain tool object on `ctx.tools` |
| Hand-written overlay `id` / file path | Four names agree: directory, `package.json` `name`, `cordis.patch.yml` `name`, patch `id` |
| Config examples in the harness tree | Exported Schemastery `Config` on the plugin |

## Plugin Center composition

`dsh-market` registers `PluginCenterHost` under `shell.overlay`, declaring the child `xiaotaozi.plugin-center.detail` as `{ kind: "keyed", scope: "root" }`. Only that parent's props `renderSlot` is authorized to dispatch its declared details, including through the main-area portal. Do not call a ctx-level non-root `renderSlot` or replace the whole conversation slot.

Contributors register with `key` (not list `id`): `xiaotaozi`, `side-workbench`, `models`, or `im`. Keep type declarations local to each package and retain existing inject faces and Host APIs. No sibling source imports or shared workspace package; a Git path install must remain self-contained.

The `dsh-xtz-ui` Settings suppression adapter is pinned to **DSH 0.1.2-rc.1**. Reverify its modal/nav selectors, stale-selection redirect and restoration on every RC upgrade. It hides obsolete first-party/technical navigation without hiding General preferences; **Settings → Advanced** still binds the original settings namespaces and credentials domain. Remove the DOM adapter when upstream offers a supported hide/replace contract; do not fork Harness.

## Pits official pages do not cover

- Isolated Git `#path:plugins/<slug>` must `prepare` without this monorepo (`pnpm check:path`).
- Deterministic gates run in the topic worktree without **3081**. In the clean-main hub or a bounded transfer, `pnpm dev` rebuilds `lib/` and restarts host output on :3081; Client `lib/client.js` is host HMR (hard-refresh if the UI did not update).
- `process.cwd()` under `pnpm dev` is this checkout. Bind-then-work plugins wait for the user to confirm the target ([conventions.md](conventions.md) § Onboarding and first work).
- Two homes. Plugin source stays in its dedicated topic worktree; `link-plugin` targets that checkout's `.dsh-home`, while live **3081** normally belongs to the clean-main hub. Do not `link:` this repo into `~/.dsh`.
- Cordis Client `inject` of `"remote"` does not authorize dotted `remote.settings` / `remote.llm` / `remote.credentials`. Official Models injects those four. Missing a dotted name throws `cannot get property "remote.settings" without inject` and the SPA shows Failed to load plugins.
- DSH 0.1.2 `ctx.remote` Typert methods are `listConfigurableProviders`, positional `discoverModels(ns, request)`, `settings.describe()`, `credentials.describe(refs)` returning `{ok,value}` — not `llm.providers({})` / `{result:{ok,…}}`. Calling `.bind` on a missing method crashes the whole Client apply. Host identity 200 does not prove the SPA loaded.

Add a row here only when the same upstream-vs-us trap repeats. Do not paste Cordis API tables into this file.
