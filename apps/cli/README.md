# Xiaotaozi CLI (`xtz`)

English | [中文](README.zh.md)

`xtz` is the Xiaotaozi DSH **user product**: a pinned-dsh wrapper. `apps/cli/` is a standalone, publishable pnpm workspace; it is not a Harness plugin or a member of the root `plugins/*` workspace.

User path: `xtz` / `xtz start` prepares official `~/.dsh/profiles/web` (once), starts official `dsh web` in the background (default `127.0.0.1:3080`), prints the URL, and opens a browser. Extra plugins are installed in the in-app market. It never probes or falls back to the repository sandbox at `.dsh-home` / `3081`.

The CLI Node range matches DeepSeek Harness (`^22.19.0 || >=24.0.0`). DSH is pinned to `@deepseek-ai/dsh` `0.1.1-rc.2`; other DSH versions are not treated as compatible. npm and bun only install the package; `xtz` always runs on Node.

## Install

Requires Node.js `^22.19.0` or `>=24` on `PATH`. Then pick one:

```bash
curl -fsSL https://raw.githubusercontent.com/kedoupi/xiaotaozi-dsh/main/apps/cli/scripts/install.sh | sh
curl -fsSL https://raw.githubusercontent.com/kedoupi/xiaotaozi-dsh/main/apps/cli/scripts/install.sh | sh -s -- --bun
npm install -g xiaotaozi-dsh-cli
bun add -g xiaotaozi-dsh-cli
```

The script uses `npm` when both npm and bun are present; pass `--bun` or `--pnpm` to choose. After install:

```bash
xtz --help
xtz
xtz doctor
```

## Available commands

```bash
xtz                      # same as start
xtz start [--port N]     # seed defaults if needed, start in the background, print URL, open browser
xtz stop                 # stop the process xtz started
xtz restart              # stop then start
xtz open                 # open the current URL
xtz status               # inspect the remembered port without changing anything
xtz doctor               # inspect runtime, xtz stamp, profile, and port
xtz config path          # print the official web profile patch path
xtz version              # print CLI, Node, and pinned DSH versions
xtz help                 # show help
```

Default listen address is `127.0.0.1:3080`. If that port is occupied by something that is not Xiaotaozi, an interactive `xtz start` can offer `3082+` (never `3081`). Non-interactive runs refuse unless `--port` is set. `xtz` never kills a process it did not start.

`xtz` accepts a service as healthy only when the loopback-only, versioned Xiaotaozi identity endpoint returns the exact v1 contract.

Extra plugins: open Xiaotaozi and use the market. Do not `xtz plugin`.

## Intentionally disabled

`init`, `plugin`, `run`, `ask`, `config dump`, `config defaults`, and `update` fail closed.

## Develop in this repository

`apps/cli/` is a standalone workspace; a root `pnpm install` does not install it. Use exactly the Node version in `.node-version`. Then:

```bash
cd apps/cli
pnpm install
pnpm check
node lib/cli.js --help
node lib/cli.js version --json
```

`pnpm check` typechecks, rebuilds `lib/`, and runs unit tests against a fake home. Real `~/.dsh` / `3080` is the user environment. Official commands never use `.dsh-home` / `3081`. In this checkout, `pnpm dev` runs `node apps/cli/lib/cli.js --sandbox start --foreground` so the same CLI is what the sandbox boots. A failing `doctor` on a dirty official home is expected; do not weaken the checks to make it green.

Official home writes go through first `xtz start` (default seed) and the in-app market (extras). Do not `link:` this workspace into official web.

`pnpm link --global` is optional, only when you need `xtz` on `PATH` the way a user would.

## Exit codes

- `0`: the requested operation succeeded.
- `1`: the service is stopped or a readiness check failed.
- `2`: invalid usage, an unverified port occupant, or an operation blocked by the safety policy.
