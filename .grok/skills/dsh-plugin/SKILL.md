---
name: dsh-plugin
description: >
  Run this repo's DeepSeek Harness plugin loop: scaffold, fork an upstream
  plugin, implement, install into a dsh profile, verify dump-config, simplify,
  and commit. Use when the user wants to 创建插件, 新建插件, scaffold, pnpm new,
  fork, 迁移, 从上游, 看到一个插件, 安装插件, dsh plugin add, link to dsh-dev
  or web, dump-config, 提交, commit, ship, 优化, simplify, review
  over-engineering, or runs /dsh-plugin.
argument-hint: create|fork|install|commit|optimize [slug]
---

# dsh-plugin

You execute the work. Do not stop at instructions.

## Before anything

1. Read `AGENTS.md` (rules), `docs/conventions.md` (spec; Chinese: `docs/conventions.zh.md`), and `docs/workflow.md` (steps; Chinese: `docs/workflow.zh.md`). Do not invent a second layout or a second command sequence.
2. Pick one workflow from the user intent. If they asked for a new plugin end-to-end, run 创建 → 安装 → 优化, and 提交 only when they want it committed. If they dropped a GitHub URL, or said 迁移 / fork / 从上游, run 从上游 fork — do not `link:` `externals/` and do not skip the intake gate.

## 创建

Follow `docs/workflow.md` Create (`docs/workflow.zh.md` 创建).

- Default `host`. Ask only when UI vs tool is actually unclear.
- After `pnpm new`, replace the greet sample in the same turn. Leaving the template tool in place is not done.
- Logic that can run without Cordis stays in a separate file; tests import that file only.
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

- Run `node scripts/link-plugin.mjs --profile <profile> <slug>` from the repo root. That writes into `.dsh-home`, not `~/.dsh`. Do not hand-edit profile `package.json`. Never `link:` or `dsh plugin add` a path under `externals/`. Only `plugins/<slug>` is installable.
- `dsh-dev` = load check. `web` = UI / model-callable tools, then `pnpm dev` (sandbox on port 3081). Never `dsh web` against the user's daily home.
- Claim installed only when the script printed `Verified # == dsh-<slug>`.
- After source edits, rebuild and restart the sandbox `pnpm dev`. Do not restart the user's daily dsh.

## 提交

Follow `docs/workflow.md` Commit (`docs/workflow.zh.md` 提交).

- Run `git status`, `git diff`, and `git log` yourself. Stage only source and docs. Never stage `lib/`, `node_modules`, tarballs, `.dsh-home/`, or anything under `$DSH_HOME`.
- `pnpm check` must pass first.
- One concern per commit. Message language matches the diff (Chinese repo docs → Chinese message is fine).
- Do not push unless asked.

## 优化

Follow `docs/workflow.md` Simplify (`docs/workflow.zh.md` 优化).

- Do this after the plugin works, before commit, unless they said to skip.
- Delete, do not add: unused template files, empty Client halves, speculative shared libraries, extra abstractions.
- If `lib/index.js` imported `@deepseek-ai/dsh-tools` or bundled `node_modules`, fix the plugin. Do not weaken `scripts/check-manifest.mjs` to pass.

## Done

Say what you ran, which profile has the plugin, and the dump-config layer name. If something was not verified, say so.
