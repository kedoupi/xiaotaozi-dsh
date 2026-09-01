# Harness plugin docs (ours vs upstream)

English | [中文](harness-plugin.zh.md)

This page is the **delta**. Cordis and Harness plugin APIs live in official DeepSeek Harness docs. This repository does not vendor `deepseek-harness` and does not copy those tutorials. Package identity, homes, layout, and gates stay in [conventions.md](conventions.md). How to create / install stays in [workflow.md](workflow.md) § Create.

If an official page disagrees with a pinned `@deepseek-ai/*` package, the pin in `versions.json` `dshRc` (currently `0.1.1-rc.2`) wins.

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
| `pnpm dsh web --patch …` on **3080** | Sandbox: `link-plugin` + `pnpm dev` → `xtz --sandbox` on **3081**. Never steal official 3080 |
| `node --import tsx` / no build | Build `lib/`. `@deepseek-ai/*` stays external (`deps.neverBundle: true`) |
| `import { … } from '@deepseek-ai/dsh-tools'` | Do not value-import `dsh-tools`. Register a plain tool object on `ctx.tools` |
| Hand-written overlay `id` / file path | Four names agree: directory, `package.json` `name`, `cordis.patch.yml` `name`, patch `id` |
| Config examples in the harness tree | Exported Schemastery `Config` on the plugin |

## Pits official pages do not cover

- Isolated Git `#path:plugins/<slug>` must `prepare` without this monorepo (`pnpm check:path`).
- `pnpm dev` rebuilds `lib/` and restarts host output on :3081; Client `lib/client.js` is host HMR (hard-refresh if the UI did not update).
- `process.cwd()` under `pnpm dev` is this checkout. Bind-then-work plugins wait for the user to confirm the target ([conventions.md](conventions.md) § Onboarding and first work).
- Two homes. Plugin source stays in `.dsh-home` **3081**. Do not `link:` this repo into `~/.dsh`.

Add a row here only when the same upstream-vs-us trap repeats. Do not paste Cordis API tables into this file.
