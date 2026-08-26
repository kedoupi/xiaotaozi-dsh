---
name: xtz-cli
description: >
  Develop or verify the Xiaotaozi CLI (`xtz`). Use when the user wants 改 CLI,
  xtz, doctor, plugin list, status, apps/cli, Node 22.19.0, CLI 只读, dual
  install inspection, or runs /xtz-cli.
---

# xtz-cli

Read `AGENTS.md`, `docs/conventions.md` § Users and § `xtz` CLI, and `docs/workflow.md` § CLI development (Chinese: `docs/conventions.zh.md`, `docs/workflow.zh.md`). Do not copy those sections here.

`apps/cli/` is a standalone workspace. Use exactly the Node in `apps/cli/.node-version` (must match `versions.json` `node`). Root `pnpm install` does not install it.

## Inner loop (fake home)

```bash
cd apps/cli
fnm use
pnpm check
node lib/cli.js --help
node lib/cli.js version --json
```

Prefer `node lib/cli.js` over `pnpm link --global`. Tests must not start or mutate the official service.

## Real official home (read-only)

```bash
cd apps/cli
fnm use
node lib/cli.js plugin list
node lib/cli.js doctor
```

Fixed to `~/.dsh` and `127.0.0.1:3080`. Ignore `.dsh-home` / 3081 even if `DSH_HOME` is set. A red `doctor` on a dirty official home is expected; do not weaken checks. Dual install does not add write commands: `plugin add` stays fail closed. Git install is not an `xtz` job.

Do not implement `start` / `web` / `open` / `run` / `ask` / `config dump` / `defaults` / `stop` / `update` until the shared supervisor exists.

## Publish

Do not `npm publish` until release Desktop seed, pack, and `doctor` agree on hello / sidebar / providers / memory / im, and a reseeded official home has been inspected. bun/pnpm/`install.sh` only fetch `xiaotaozi-dsh-cli`. No Homebrew.

## Done

Say Node version used, whether the run was fake-home tests or real `~/.dsh`, and the exit code. If `doctor` failed, say whether that is CLI or official-home dirt.
