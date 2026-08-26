# Xiaotaozi CLI (`xtz`)

English | [中文](README.zh.md)

`xtz` is the Xiaotaozi DSH command-line product for users who are comfortable with terminals and configuration. `apps/cli/` is a standalone, publishable pnpm workspace; it is not a Harness plugin or a member of the root `plugins/*` workspace.

This first release is a **read-only safety foundation**. It inspects the official Xiaotaozi environment at `~/.dsh` and `127.0.0.1:3080` without starting DSH, executing a task, opening an unverified service, or changing the official profile. It never probes or falls back to the repository sandbox at `.dsh-home` / `3081`.

The CLI runtime is pinned to exactly Node.js `22.19.0` and `@deepseek-ai/dsh` `0.1.1-rc.2`. Other Node or DSH versions are not treated as compatible.

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

An HTTP response on port 3080 is reported as occupied but unverified; `xtz` does not claim that it is a healthy Xiaotaozi service without a trusted service-identity protocol.

## Intentionally disabled

`start`, `web`, `open`, `run`, `ask`, `config dump`, `config defaults`, `stop`, and `update` fail closed in this release. They stay disabled until Desktop and CLI share all three safety primitives:

1. a trusted cross-process supervisor for engine ownership and lifecycle;
2. a service-identity protocol for the process listening on 3080;
3. a locked, transactional boundary for official-profile preparation and pack updates.

This also means the first release does not promise headless-task parity with the Desktop/Web plugin environment. Even commands that look read-only at the DSH layer can prepare or rewrite generated profile state, so `xtz` does not invoke them against `~/.dsh` yet. Signed plugin updates remain a Desktop transaction.

## Develop in this repository

```bash
cd apps/cli
pnpm install
pnpm check
pnpm link --global
xtz --help
```

## Exit codes

- `0`: the requested read-only operation succeeded.
- `1`: the service is stopped or a readiness check failed.
- `2`: invalid usage, an unverified port occupant, or an operation blocked by the safety policy.
