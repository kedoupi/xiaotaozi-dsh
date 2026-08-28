---
name: xtz-cli
description: >
  Develop or verify the Xiaotaozi CLI (`xtz`), the user product. Use when the
  user wants 改 CLI, xtz, doctor, status, apps/cli, Node 22.19.0,
  web, stop, or runs /xtz-cli.
---

# xtz-cli

Read `AGENTS.md`, `docs/conventions.md` § Users and § `xtz` CLI, and `docs/workflow.md` § CLI development (Chinese: `docs/conventions.zh.md`, `docs/workflow.zh.md`). Do not copy those sections here.

`apps/cli/` is a standalone workspace and the user product: a pinned-dsh wrapper. Use exactly the Node in `apps/cli/.node-version` (must match `versions.json` `node`). Root `pnpm install` does not install it.

## Inner loop (fake home)

```bash
cd apps/cli
fnm use
pnpm check
node lib/cli.js --help
node lib/cli.js version --json
```

Prefer `node lib/cli.js` over `pnpm link --global`. Tests cover `start` / `stop` against a fake home; they must not start or mutate the real official service. `xtz --sandbox` is in-repo only (needs `versions.json` + `plugins/xtz-ui` + `apps/cli`); `pnpm dev` is the supervisor that calls it. Do not `pnpm link --global` this checkout into official `~/.dsh`.

## Real official home

```bash
cd apps/cli
fnm use
node lib/cli.js doctor
```

Fixed to `~/.dsh`. Preferred port **3080**; never **3081**. Ignore `.dsh-home` / 3081 even if `DSH_HOME` is set. A red `doctor` on a dirty official home is expected; do not weaken checks.

Boundary: only manage a process `xtz` started (`$DSH_HOME/xiaotaozi-xtz-web.pid`). Do not steal a port or kill by port. Interactive `xtz start` may offer 3082+ when 3080 is occupied by a non-Xiaotaozi process. If 3080 already serves Xiaotaozi identity but is not that pid, do not start a second instance. First `xtz start` seeds every first-party plugin under `plugins/`. Extra (third-party) plugins: the in-app market. Open commands match `docs/conventions.md` § `xtz` CLI. `init` / `plugin` / `run` / `ask` / `config dump` / `defaults` / `update` stay fail closed.

## Windows identity

PowerShell `Get-Process` can take >5s. The CLI waits 25s and parses ticks (`\d{10,}`) from noisy stdout. Never treat `typeof x === "object"` as a non-null check (`typeof null === "object"`).

## Publish

Product version is `versions.json` `cliApp` = git tag `vX.Y.Z`. Spec: `docs/conventions.md` § Versions. Steps: `docs/workflow.md` § Ship a product snapshot (Chinese: `docs/conventions.zh.md`, `docs/workflow.zh.md`).

Do not bump `cliApp` except in a release commit. Do not `npm publish` from this machine. Push tag `vX.Y.Z`; `.github/workflows/publish.yml` publishes `xiaotaozi-dsh-cli` via OIDC. bun/pnpm/`install.sh` only fetch that package. No Homebrew. Stay on 0.x.

If the version is already on npm, bump then tag. If the tag job failed before npm has that version, rerun that job; do not bump. `npm publish --dry-run` does not prove Trusted Publisher.

## Done

Say Node version used, whether the run was fake-home tests or real `~/.dsh`, and the exit code. If `doctor` failed, say whether that is CLI or official-home dirt.
