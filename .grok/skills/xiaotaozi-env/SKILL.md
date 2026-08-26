---
name: xiaotaozi-env
description: >
  Pick the Xiaotaozi DSH home and port before other work. Use when the user
  mentions 环境, 沙箱, 正式, 3080, 3081, 双持, 用户, 插件作者, 开发调试,
  ~/.dsh, .dsh-home, 一个写手, or runs /xiaotaozi-env.
---

# xiaotaozi-env

Read `AGENTS.md`, then `docs/conventions.md` § Homes and § Users (Chinese: `docs/conventions.zh.md`). Do not copy those tables here. Say **user** for someone who runs Desktop.

1. Classify the person: user (Desktop only), plugin author, or dual install.
2. Classify the job:
   - sandbox `.dsh-home` **3081** — plugin source, `link-plugin`, `pnpm dev`, debug `pnpm tauri dev`
   - official `~/.dsh` **3080** write — release 小桃子DSH.app / `tauri build` / signed pack only
   - official `~/.dsh` **3080** read — first-release `xtz` only
3. Hand off:
   - plugin source, sandbox install, or desktop pack from a verified sandbox → `dsh-plugin`
   - shell, seed, `.dmg`, notarization, pack apply on official home → `dsh-desktop`
   - `xtz` code, `pnpm check:cli`, or `doctor` / `plugin list` → `xtz-cli`
4. Stop and name the correct environment instead if they asked to merge homes, point `tauri dev` at 3080, Git/npm/`dsh plugin add`/`link:` into `~/.dsh`, `rm -rf ~/.dsh`, or treat dual install as a third plugin pipeline.

How to phrase the job: `docs/workflow.md` § Talking to agents (`docs/workflow.zh.md` 向 Agent 下指令).
