---
name: xiaotaozi-env
description: >
  Pick the Xiaotaozi DSH home and port before other work. Use when the user
  mentions 环境, 沙箱, 正式, 3080, 3081, 用户, 插件作者, 开发调试,
  ~/.dsh, .dsh-home, 一个写手, worktree, Git Flow, 沙箱监控, 持续监控,
  dogfood, pnpm dev, or runs /xiaotaozi-env.
---

# xiaotaozi-env

Read `AGENTS.md`, then `docs/conventions.md` § Homes, § Users, and § Git (Chinese: `docs/conventions.zh.md`). Doc map: `docs/README.md`. Do not copy those tables here. Say **user** for someone who runs `xtz`. There is no desktop client in this tree.

1. Classify the person: user (`xtz`) or plugin author.
2. Classify the job:
   - sandbox `.dsh-home` **3081** — plugin source, `link-plugin`, `pnpm dev` (`xtz --sandbox start --foreground`; never PATH `dsh`)
   - official `~/.dsh` **3080** write — first `xtz start` (default seed); extra plugins via the in-app market
   - official `~/.dsh` **3080** read — `xtz status` / `doctor`
3. Extra checkouts / git worktrees still use **this** checkout's `.dsh-home` and machine-wide **3081**. If 3081 is another checkout, stop that sandbox there first; do not steal the port. Steps: `docs/workflow.md` § Dev environment.
4. Hand off:
   - plugin source or sandbox install → `dsh-plugin`
   - revive Desktop / `.dmg` / pack apply → refuse; history is `git show archive/desktop`
   - `xtz` code, `pnpm check:cli`, or `doctor` / `status` → `xtz-cli`
5. Stop and name the correct environment instead if they asked to merge homes, `link:` this repo into `~/.dsh`, `rm -rf ~/.dsh`, ship a desktop pack, add Git Flow standing branches, or start a second sandbox on 3081.

How to phrase the job: `docs/workflow.md` § Talking to agents (`docs/workflow.zh.md` 向 Agent 下指令).

## Sandbox dogfood monitoring

Trigger: 启动沙箱 / 启动监控 / 持续监控 / dogfood watch.

This is **one pair**, kept for the session (`docs/workflow.md` § Sandbox dogfood monitoring). Spec: `docs/conventions.md` § Homes (sandbox dogfood).

Keep-alive:

1. Start `pnpm dev` in this checkout on **3081** as a background command with `timeout: 0` (wrapper default 10h kill is a hang — restart, do not treat as done).
2. Start a **persistent** monitor on that `pnpm dev` log: `grep --line-buffered` `journey event=.*break=1`. Also read `.dsh-home/traces/YYYY-MM-DD.jsonl`. Do not grep generic `error`.
3. If `pnpm dev` dies: restart it here (same 3081 identity rules). Kill the stale watch, start a new one on the **new** log.
4. Never start, stop, or probe official **3080**.

A break is work. Do not wait for 帮我修 / 优化:

5. Read the msgid/stream in `.dsh-home/traces/YYYY-MM-DD.jsonl`. Classify: ours / platform limit / ops. Then fix in this sandbox, or say why you cannot. Verify the same path. Report the conclusion.
6. Do not commit or push unless asked. Do not paste secrets or message bodies.
