# dsh-hello

English | [中文](README.zh.md)

Host-only scaffold canary for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Not a product plugin.

It exists to prove that `pnpm new` still builds, tests, and links a host template into a profile. The sample tool is `hello` (a greeting). Do not add features here; start a new package with `pnpm new <slug>`.

Part of the [`dsh-plugins`](https://github.com/kedoupi/dsh-plugins) monorepo.

## Install

From a clone of this repo:

```bash
dsh plugin --profile <name> add github:kedoupi/dsh-plugins#path:plugins/hello
```

Or, while developing in the workspace:

```bash
node scripts/link-plugin.mjs --profile dsh-dev hello
```

## Config

| Field | Default | Meaning |
| --- | --- | --- |
| `greeting` | `Hello` | Prefix used by the `hello` tool |
