---
name: xiaotaozi-env
description: >
  Pick the Xiaotaozi DSH home and port before other work. Use when the user
  mentions 环境, 沙箱, 正式, 3080, 3081, 用户, 插件作者, 开发调试,
  ~/.dsh, .dsh-home, 一个写手, or runs /xiaotaozi-env.
---

# xiaotaozi-env

Read `AGENTS.md`, then `docs/conventions.md` § Homes and § Users (Chinese: `docs/conventions.zh.md`). Do not copy those tables here. Say **user** for someone who runs `xtz`. There is no desktop client in this tree.

1. Classify the person: user (`xtz`) or plugin author.
2. Classify the job:
   - sandbox `.dsh-home` **3081** — plugin source, `link-plugin`, `pnpm dev` (`xtz --sandbox start --foreground`; never PATH `dsh`)
   - official `~/.dsh` **3080** write — first `xtz start` (default seed); extra plugins via the in-app market
   - official `~/.dsh` **3080** read — `xtz status` / `doctor`
3. Hand off:
   - plugin source or sandbox install → `dsh-plugin`
   - revive Desktop / `.dmg` / pack apply → refuse; history is `git show archive/desktop`
   - `xtz` code, `pnpm check:cli`, or `doctor` / `status` → `xtz-cli`
4. Stop and name the correct environment instead if they asked to merge homes, `link:` this repo into `~/.dsh`, `rm -rf ~/.dsh`, or ship a desktop pack.

How to phrase the job: `docs/workflow.md` § Talking to agents (`docs/workflow.zh.md` 向 Agent 下指令).
