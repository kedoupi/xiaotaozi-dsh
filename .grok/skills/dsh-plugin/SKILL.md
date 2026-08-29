---
name: dsh-plugin
description: >
  Run this repo's DeepSeek Harness plugin loop in the sandbox: scaffold, fork,
  implement, link-plugin into .dsh-home, verify dump-config, simplify, commit.
  Use when the user wants to 创建插件, 新建插件, scaffold, pnpm new, fork, 迁移,
  从上游, 沙箱安装, link-plugin, dsh-dev, web profile in .dsh-home, dump-config,
  提交, commit, 优化, simplify, or runs /dsh-plugin. Not for installing into
  ~/.dsh from this repo. Extra user installs go through the in-app market.
argument-hint: create|fork|install|commit|optimize [slug]
---

# dsh-plugin

You execute the work. Do not stop at instructions. Extra user installs go through the in-app market, not `xtz plugin`.

## Before anything

1. Read `AGENTS.md` (rules), `docs/conventions.md` (spec; Chinese: `docs/conventions.zh.md`), and `docs/workflow.md` (steps; Chinese: `docs/workflow.zh.md`). Doc map: `docs/README.md`. Do not invent a second layout or a second command sequence. If the job is which home/port, start from `xiaotaozi-env`. If it is branching, worktrees, or Git Flow, follow conventions § Git — do not add a skill.
2. Pick one workflow from the user intent. If they asked for a new plugin end-to-end, run 创建 → 安装 → 优化, and 提交 only when they want it committed. If they dropped a GitHub URL, or said 迁移 / 从上游 / 第三方 / 上架, add a row to `plugins/market` `MARKET_PLUGINS` unless they explicitly want us to own and seed it. Do not add `externals/` or clone the author's repo into this tree. If they asked to ship to users / 桌面插件包, refuse; extra user ship is the in-app market, or `pnpm --filter dsh-<slug> publish` for first-party npm.
3. After cloning, run `pnpm install` before builds/checks. `versions.json` is the sole dsh RC / Node / Python / pnpm / CLI version source; manifests remain literal and the gate checks them.

## 创建

Follow `docs/workflow.md` Create (`docs/workflow.zh.md` 创建).

- Default `host`. Ask only when UI vs tool is actually unclear.
- Shipped DSH chrome (brand, Session log, Open configuration file, duplicate official nav, peach accent tokens) plus archive, task board, and git graph live in `plugins/xtz-ui`. The right-hand files / Git / terminal panel lives in `plugins/sidebar`. Models, IM, WeCom office, and market stay in those plugins. Third-party plugins (Agent Teams, Context, OpenContext) are `MARKET_PLUGINS` rows — do not copy them into `plugins/` unless we take ownership and seed them.
- After `pnpm new`, replace the greet sample in the same turn. Leaving the template tool in place is not done.
- Logic that can run without Cordis stays in a separate file; tests import that file only.
- If the plugin binds / connects then creates a session or writes files, follow `docs/conventions.md` § Onboarding and first work. `process.cwd()` under `pnpm dev` is this repo. First work waits for the user to confirm the target; the bind picker must not open at the plugin repo cwd; tests must cover that race.
- Finish by installing into the sandbox `dsh-dev` profile and confirming the layer.

## 上架第三方

Follow `docs/workflow.md` List a third-party plugin (`docs/workflow.zh.md` 上架第三方). Spec: `docs/conventions.md` § Market catalog.

- Default: add a `MARKET_PLUGINS` row. Users install upstream Git/npm from the market. Do not copy into `plugins/` unless we take ownership and seed it.
- Never add `externals/` or clone the author's repo into this tree.
- `installSpec` is upstream Git or npm, never `link:` / `file:` / `#path:externals/`.
- Later update: bump version/summary/spec in the catalog. Do not commit unless asked.

## 安装

Follow `docs/workflow.md` Install (`docs/workflow.zh.md` 安装).

- Run `node scripts/link-plugin.mjs --profile <profile> <slug>` from the repo root. That writes into `.dsh-home` (sandbox). Not `~/.dsh`. Do not hand-edit profile `package.json`. Only `plugins/<slug>` is installable as first-party.
- `dsh-dev` = load check. `web` = UI / model-callable tools, then `pnpm dev` (sandbox on port 3081). If 3081 belongs to another checkout, stop that sandbox there first; do not steal the port. Never `dsh web` against the official default while iterating a plugin.
- Do not start leftover `pnpm tauri dev` as new work. Do not verify `link:` checkouts in a leftover 小桃子DSH.app.
- Claim installed only when the script printed `Verified # == dsh-<slug>`.
- After source edits, leave sandbox `pnpm dev` running: it rebuilds `plugins/*/lib` and restarts `xtz --sandbox` only when host output changes. `pnpm dev -- --once` is build-once. Do not restart the user's official `xtz` service. If they asked for sandbox monitoring / dogfood watch, follow `docs/workflow.md` § Sandbox dogfood monitoring: `pnpm dev` plus the journey-break watch as one pair; restart `pnpm dev` if it dies; a journey break is diagnose-and-fix, not log-watching.
- Bind-then-work plugins: in the sandbox, bind as a user, confirm the target, then do the **first** real action. Work must not land in this repo / `process.cwd()`. A later action landing correctly does not excuse the first. `pnpm --filter dsh-<slug> test` green is not this check. Steps: `docs/workflow.md` § Install.

## 提交

Follow `docs/workflow.md` Commit (`docs/workflow.zh.md` 提交).

- Run `git status`, `git diff`, and `git log` yourself. Stage only source and docs. Never stage `lib/`, `node_modules`, tarballs, `.dsh-home/`, or anything under `$DSH_HOME`.
- Run proportional gates: `pnpm check` is policy/type/tests; `pnpm check:build` builds and inspects `lib/`; `pnpm check:path` proves isolated Git path install; `pnpm check:cli` covers the user product. `pnpm check-home` is diagnosis only and never repairs profiles.
- Land on a topic branch; prefer a PR into `main`. Spec: `docs/conventions.md` § Git. Do not add Git Flow standing branches. Do not land ordinary work on a shared dirty `main` checkout.
- One concern per commit. Message language matches the diff (Chinese repo docs → Chinese message is fine).
- Do not push unless asked.

## 发桌面插件包

Refuse. There is no desktop pack path. Extra user ship is the in-app market. Developer ship is `pnpm --filter dsh-<slug> publish` or Git `#path:plugins/<slug>`.

## 优化

Follow `docs/workflow.md` Simplify (`docs/workflow.zh.md` 优化).

- Do this after the plugin works, before commit, unless they said to skip.
- Delete, do not add: unused template files, empty Client halves, speculative shared libraries, extra abstractions.
- If `lib/index.js` imported `@deepseek-ai/dsh-tools` or bundled `node_modules`, fix the plugin. Do not weaken `scripts/check-manifest.mjs` to pass.

## Done

Say what you ran, which profile has the plugin, and the dump-config layer name. If something was not verified, say so. Do not report a desktop `packVersion`.
