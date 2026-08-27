---
name: dsh-plugin
description: >
  Run this repo's DeepSeek Harness plugin loop in the sandbox: scaffold, fork,
  implement, link-plugin into .dsh-home, verify dump-config, simplify, commit,
  or ship a signed desktop pack. Use when the user wants to 创建插件, 新建插件,
  scaffold, pnpm new, fork, 迁移, 从上游, 沙箱安装, link-plugin, dsh-dev, web
  profile in .dsh-home, dump-config, 提交, commit, 发插件包, publish-pack, 优化,
  simplify, or runs /dsh-plugin. Not for installing into ~/.dsh or xtz plugin add.
argument-hint: create|fork|install|commit|optimize|publish-pack [slug]
---

# dsh-plugin

You execute the work. Do not stop at instructions.

## Before anything

1. Read `AGENTS.md` (rules), `docs/conventions.md` (spec; Chinese: `docs/conventions.zh.md`), and `docs/workflow.md` (steps; Chinese: `docs/workflow.zh.md`). Do not invent a second layout or a second command sequence. If the job is which home/port, start from `xiaotaozi-env`.
2. Pick one workflow from the user intent. If they asked for a new plugin end-to-end, run 创建 → 安装 → 优化, and 提交 only when they want it committed. If they dropped a GitHub URL, or said 迁移 / fork / 从上游, run 从上游 fork — do not `link:` `externals/` and do not skip the intake gate. If they asked to ship to users / 桌面插件包, that is 发桌面插件包, not `pnpm --filter dsh-<slug> publish`, and not `xtz plugin add`.
3. After cloning, run `pnpm install` before builds/checks. `versions.json` is the sole dsh RC / Node / Python / pnpm / desktop app version source; manifests remain literal and the gate checks them.

## 创建

Follow `docs/workflow.md` Create (`docs/workflow.zh.md` 创建).

- Default `host`. Ask only when UI vs tool is actually unclear.
- Shipped DSH chrome (brand, Session log, Open configuration file, duplicate official nav, peach accent tokens) plus archive, task board, and git graph live in `plugins/hello`. The right-hand files / Git / terminal panel lives in `plugins/sidebar`. Models, memory, IM, context, and agent-teams stay in those plugins.
- After `pnpm new`, replace the greet sample in the same turn. Leaving the template tool in place is not done.
- Logic that can run without Cordis stays in a separate file; tests import that file only.
- If the plugin binds / connects then creates a session or writes files, follow `docs/conventions.md` § Onboarding and first work. `process.cwd()` under `pnpm dev` is this repo. First work waits for the user to confirm the target; the bind picker must not open at the plugin repo cwd; tests must cover that race.
- Finish by installing into the sandbox `dsh-dev` profile and confirming the layer.

## 从上游 fork

Follow `docs/workflow.md` Fork (`docs/workflow.zh.md` 从上游 fork). Spec: `docs/conventions.md` § Externals.

- Stop unless it is a DeepSeek Harness plugin, the license is permissive, and we will second-develop **and** install the fork. `externals/` is not a watch list. Do not submodule a bookmark.
- `git submodule add` into `externals/<upstream-dir>` using the upstream repo name. Then `pnpm new <slug>` (mixed if there is UI). Port `src`, catalogize, never edit the submodule.
- `link-plugin` only `plugins/<slug>`. Never `link:` or `dsh plugin add` a path under `externals/`.
- Root README gets both the plugin row and the `externals/…` → `plugins/…` row. Fork README must not send users to the author's npm.
- Later pull: `git submodule update --remote`, diff, port selected changes. Two commits when asked: gitlink, then the plugin. Do not commit unless asked.

## 安装

Follow `docs/workflow.md` Install (`docs/workflow.zh.md` 安装).

- Run `node scripts/link-plugin.mjs --profile <profile> <slug>` from the repo root. That writes into `.dsh-home` (sandbox). Not `~/.dsh`. Do not hand-edit profile `package.json`. Never `link:` or `dsh plugin add` a path under `externals/`. Only `plugins/<slug>` is installable.
- `dsh-dev` = load check. `web` = UI / model-callable tools, then `pnpm dev` (sandbox on port 3081). Never `dsh web` against the official default or the desktop home while iterating a plugin.
- Debug desktop (`pnpm tauri dev`) attaches to sandbox `.dsh-home` port 3081. The installed 小桃子DSH.app and release builds stay on `~/.dsh` port 3080 and must not probe 3081. Do not verify `link:` checkouts in the installed app.
- Claim installed only when the script printed `Verified # == dsh-<slug>`.
- After source edits, leave sandbox `pnpm dev` running: it rebuilds `plugins/*/lib` and restarts `dsh web` only when host output changes. `pnpm dev -- --once` is build-once. Do not restart the user's official `dsh web` or the desktop sidecar.
- Bind-then-work plugins: in the sandbox, bind as a user, confirm the target, then do the **first** real action. Work must not land in this repo / `process.cwd()`. A later action landing correctly does not excuse the first. `pnpm --filter dsh-<slug> test` green is not this check. Steps: `docs/workflow.md` § Install.

## 提交

Follow `docs/workflow.md` Commit (`docs/workflow.zh.md` 提交).

- Run `git status`, `git diff`, and `git log` yourself. Stage only source and docs. Never stage `lib/`, `node_modules`, tarballs, `.dsh-home/`, or anything under `$DSH_HOME`.
- Run proportional gates: `pnpm check` is policy/type/tests; `pnpm check:build` builds and inspects `lib/`; `pnpm check:path` proves isolated Git path install; `pnpm check:desktop` covers desktop script/frontend/Rust checks without publishing. `pnpm check-home` is diagnosis only and never repairs profiles.
- One concern per commit. Message language matches the diff (Chinese repo docs → Chinese message is fine).
- Do not push unless asked.

## 发桌面插件包

If they asked to 发插件包 / `publish-pack` / 用户更新 / 桌面更新: follow `docs/workflow.md` Ship a desktop plugin pack (`docs/workflow.zh.md` 发桌面插件包). Sandbox on 3081 first. Aggregate all target tarballs under one signed `packVersion`, then `cd apps/desktop && pnpm publish-pack`. Do not `link:` into `~/.dsh`. Do not skip CDN purge. This is not `pnpm --filter dsh-<slug> publish` and not an `xtz` install. The Ed25519 envelope is a contract; old clients must upgrade the app first, never reshape `latest.json` to unsigned JSON. Generate keys with `pnpm generate-pack-key`, never commit the private key, and supply release automation via `XIAOTAOZI_PACK_SIGNING_KEY`.

## 优化

Follow `docs/workflow.md` Simplify (`docs/workflow.zh.md` 优化).

- Do this after the plugin works, before commit, unless they said to skip.
- Delete, do not add: unused template files, empty Client halves, speculative shared libraries, extra abstractions.
- If `lib/index.js` imported `@deepseek-ai/dsh-tools` or bundled `node_modules`, fix the plugin. Do not weaken `scripts/check-manifest.mjs` to pass.

## Done

Say what you ran, which profile has the plugin, and the dump-config layer name. For a desktop pack: the live `packVersion` on `https://s.xiaotaozi.cc/dsh/packs/latest.json`. If something was not verified, say so.
