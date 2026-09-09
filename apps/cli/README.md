# Xiaotaozi CLI (`xtz`)

English | [中文](README.zh.md)

`xtz` is the Xiaotaozi DSH **user product**: a pinned-dsh wrapper. `apps/cli/` is a standalone, publishable pnpm workspace; it is not a Harness plugin or a member of the root `plugins/*` workspace. What `xtz` boots is shown in the [product gallery](https://github.com/kedoupi/xiaotaozi-dsh#see-xiaotaozi-dsh).

The CLI Node range matches DeepSeek Harness (`^22.19.0 || >=24.0.0`). DSH is pinned to `@deepseek-ai/dsh` `0.1.2-rc.1`; other DSH versions are not treated as compatible. npm and bun only install the package; `xtz` always runs on Node.

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

## Start Xiaotaozi

```bash
xtz start
```

`xtz` / `xtz start` prepares official `~/.dsh/profiles/web`, seeds every first-party plugin under `plugins/`, starts official `dsh web` in the background (default `127.0.0.1:3080`), prints the authenticated URL, and opens a browser. Extra plugins are installed in the in-app market.

On DSH 0.1.2 the printed URL carries a process-scoped `?token=` launch token. `xtz` captures the complete `dsh web:` announcement, saves `$DSH_HOME/xiaotaozi-xtz-web.auth` (mode 0600), and opens that URL. The token exchanges for a cookie and redirects to clean `/`; bare `/` without the cookie is `401`. First and repeated `xtz open` require a matching PID, verified process generation, host and port. Restart captures a new token; the previous process token must not be reused. Do not paste tokens into issues or logs.

Missing, malformed, unreadable or mismatched authentication records never fall back to a bare browser URL. `open` and browser-opening `start` / `restart` return 2 without opening it; a healthy owned service stays running and its PID record is retained. When ownership is verified, run `xtz restart` to recapture authentication (fix current-home file permissions first if needed). For an unknown/unverified process, contact whoever started it; xtz will not adopt, signal or restart it. `start --no-open` may return 0 for a healthy owned Host while explicitly reporting unavailable browser authentication. `--foreground --no-open` still supervises the child until exit; `status` (including JSON) reports Host health, not browser authentication or SPA readiness. An opener failure returns 2; retry `xtz open` or manually use the authenticated address already printed.

First start installs the default plugins. After the global CLI is upgraded, the next stopped `start` / `restart` synchronizes every default plugin to that product snapshot as one transaction. A running `start` never hot-mutates the profile; it asks for `xtz restart` instead. If synchronization or validation fails, `xtz` restores the previous profile and does not launch Web.

## Available commands

```bash
xtz                      # same as start
xtz start [--port N]     # reconcile defaults if stopped, start in the background, print authenticated URL, open browser
xtz stop                 # stop the process xtz started
xtz restart              # stop then start
xtz open                 # open the current authenticated URL
xtz status               # inspect the remembered port without changing anything
xtz doctor               # inspect runtime, xtz stamp, profile, and port
xtz config path          # print the official web profile patch path
xtz version              # print CLI, Node, and pinned DSH versions
xtz help                 # show help
```

Extra plugins: open Xiaotaozi and use the market. Do not `xtz plugin`.

## Safety boundary

Default listen address is `127.0.0.1:3080`. If that port is occupied by something that is not Xiaotaozi, an interactive `xtz start` can offer `3082+` (never `3081`). Non-interactive runs refuse unless `--port` is set.

`xtz` only manages the process it started (`$DSH_HOME/xiaotaozi-xtz-web.pid`) and never kills a process it did not start. If 3080 already serves Xiaotaozi identity but is not that pid, `xtz` does not start a second instance.

`xtz` accepts a service as healthy only when the loopback-only, versioned Xiaotaozi identity endpoint returns the exact v1 contract.

Official commands never probe or fall back to the repository sandbox at `.dsh-home` / `3081`.

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
