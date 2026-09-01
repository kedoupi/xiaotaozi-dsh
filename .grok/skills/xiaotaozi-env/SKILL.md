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
3. Extra checkouts / git worktrees have their own `.dsh-home` but do not claim machine-wide **3081** in the normal path. They may use it only through the explicit bounded transfer in `docs/workflow.md`; if 3081 belongs to another checkout, stop that sandbox there first and never steal the port.
4. Hand off:
   - plugin source or sandbox install → `dsh-plugin`
   - revive Desktop / `.dmg` / pack apply → refuse; history is `git show archive/desktop`
   - `xtz` code, `pnpm check:cli`, or `doctor` / `status` → `xtz-cli`
5. Stop and name the correct environment instead if they asked to merge homes, `link:` this repo into `~/.dsh`, `rm -rf ~/.dsh`, ship a desktop pack, add Git Flow standing branches, or start a second sandbox on 3081.

How to phrase the job: `docs/workflow.md` § Talking to agents (`docs/workflow.zh.md` 向 Agent 下指令).

## Sandbox dogfood monitoring

Trigger: 启动沙箱 / 启动监控 / 持续监控 / dogfood watch.

This is one set for the session (`docs/workflow.md` § Sandbox dogfood monitoring). Spec: `docs/conventions.md` § Homes (sandbox dogfood).

Keep-alive is mandatory. Journey-break grep is not a substitute. The hub monitor does not implement product fixes (`docs/workflow.md` § Sandbox dogfood monitoring).

1. Confirm this is the clean repository-root `main` hub, then start `pnpm dev` here on **3081** as a background command with `timeout: 0`. Wrapper ~10h `max_runtime` still kills it — that is a hang, not done. Restart in the same turn. If this checkout's marked sandbox is already healthy, attach the watches; do not bounce it.
2. Watch **all**: process death / **3081** not listening / `sandbox web exited`; a persistent `grep --line-buffered` `journey event=.*break=1` on **this** `pnpm dev` log, plus `.dsh-home/traces/YYYY-MM-DD.jsonl`; and `origin/main` at least every **10 minutes**. Do not grep generic `error`. Journey grep cannot see process death. Do not chatter when `main` is already in sync.
3. If `pnpm dev` dies: restart it here (same 3081 identity rules). Confirm **3081** LISTENs and `xtz --sandbox` stayed up. A retry-loop of `sandbox web exited` is not up — file an issue if it is a product boot defect; keep trying keep-alive; do not patch product code in the hub. Kill the stale watch, start a new one on the **new** log.
4. Never start, stop, or probe official **3080**. Do not wait for the user to notice the sandbox is down.

A break is classify-and-file-issue. Do not wait for 帮我修 / 优化:

5. Read the msgid/stream in `.dsh-home/traces/YYYY-MM-DD.jsonl`. Classify: ours / platform limit / ops. Ours: search open issues, then open a GitHub issue; another fixing session uses a dedicated topic worktree and green PR. Do not implement in this hub session.
6. Do not commit or push unless asked. Do not paste secrets or message bodies.
