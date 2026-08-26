# Xiaotaozi CLI (`xtz`)

English | [中文](README.zh.md)

`xtz` is the Xiaotaozi DSH command-line product for users who are comfortable with terminals and configuration. `apps/cli/` is a standalone, publishable pnpm workspace; it is not a Harness plugin or a member of the root `plugins/*` workspace.

This first release is a **read-only safety foundation**. It inspects the official Xiaotaozi environment at `~/.dsh` and `127.0.0.1:3080` without starting DSH, executing a task, opening an unverified service, or changing the official profile. It never probes or falls back to the repository sandbox at `.dsh-home` / `3081`.

The CLI runtime is pinned to exactly Node.js `22.19.0` and `@deepseek-ai/dsh` `0.1.1-rc.2`. Other Node or DSH versions are not treated as compatible. npm and bun only install the package; `xtz` always runs on Node.

## Install

Requires Node.js `22.19.0` on `PATH`. Then pick one:

```bash
curl -fsSL https://raw.githubusercontent.com/kedoupi/xiaotaozi-dsh/main/apps/cli/scripts/install.sh | sh
curl -fsSL https://raw.githubusercontent.com/kedoupi/xiaotaozi-dsh/main/apps/cli/scripts/install.sh | sh -s -- --bun
npm install -g xiaotaozi-dsh-cli
bun add -g xiaotaozi-dsh-cli
```

The script uses `npm` when both npm and bun are present; pass `--bun` or `--pnpm` to choose. After install:

```bash
xtz --help
xtz doctor
```

## Available commands

```bash
xtz --help               # show help
xtz --version            # print the CLI version
xtz version              # print CLI, Node, and pinned DSH versions
xtz status               # inspect port 3080 without changing anything
xtz config path          # print the official web profile patch path
xtz plugin list          # read plugin dependencies directly from package.json
xtz doctor               # inspect runtime, Desktop seed, profile, and port metadata
```

`xtz` accepts a service as healthy only when the loopback-only, versioned Xiaotaozi identity endpoint returns the exact v1 contract. Any other HTTP response on port 3080 is reported as occupied but unverified and is never opened or adopted.

## Intentionally disabled

`start`, `web`, `open`, `run`, `ask`, `config dump`, `config defaults`, `stop`, and `update` fail closed in this release. They stay disabled until Desktop and CLI share all three safety primitives:

1. a trusted cross-process supervisor for engine ownership and lifecycle;
2. authenticated instance ownership on top of the current product-level identity endpoint;
3. a locked, transactional boundary for official-profile preparation and pack updates.

This also means the first release does not promise headless-task parity with the Desktop/Web plugin environment. Even commands that look read-only at the DSH layer can prepare or rewrite generated profile state, so `xtz` does not invoke them against `~/.dsh` yet. Signed plugin updates remain a Desktop transaction.

## Develop in this repository

`apps/cli/` is a standalone workspace; a root `pnpm install` does not install it. Use exactly the Node version in `.node-version`. Then:

```bash
cd apps/cli
pnpm install
pnpm check
node lib/cli.js --help
node lib/cli.js version --json
node lib/cli.js doctor
```

`pnpm check` typechecks, rebuilds `lib/`, and runs unit tests against a fake home. `node lib/cli.js` inspects the real official `~/.dsh` / `3080` read-only. Do not point the CLI at `.dsh-home` / `3081`. A failing `doctor` on a dirty official home is expected; do not weaken the checks to make it green.

Installing Desktop plus `xtz` does not add write commands: plugin ownership stays with Desktop; `plugin add` stays fail closed.

`pnpm link --global` is optional, only when you need `xtz` on `PATH` the way a user would.

## Exit codes

- `0`: the requested read-only operation succeeded.
- `1`: the service is stopped or a readiness check failed.
- `2`: invalid usage, an unverified port occupant, or an operation blocked by the safety policy.
