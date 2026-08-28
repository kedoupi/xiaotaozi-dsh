# Getting Started

Xiaotaozi DSH ships as a single CLI: **`xtz`**. It wraps a pinned [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) runtime, prepares the official web profile, and seeds six first-party plugins on first start. The UI is the official `dsh web`, opened in your browser — there is no desktop app to install.

## Prerequisites

- **Node.js 22.19.0** on your `PATH`. The runtime is pinned to exactly this version; other versions are not treated as compatible.
- macOS or Linux shell. npm and bun are only used as installers — `xtz` always runs on Node.

::: tip Managing Node versions
If you use a version manager such as `fnm`, `nvm`, or `mise`, install and activate `22.19.0` first, e.g. `fnm install 22.19.0 && fnm use 22.19.0`.
:::

## Install

Pick one of the three:

::: code-group

```bash [script]
curl -fsSL https://raw.githubusercontent.com/kedoupi/xiaotaozi-dsh/main/apps/cli/scripts/install.sh | sh
```

```bash [npm]
npm install -g xiaotaozi-dsh-cli
```

```bash [bun]
bun add -g xiaotaozi-dsh-cli
```

:::

The script prefers `npm` when both npm and bun are present; pass `--bun` or `--pnpm` to choose explicitly:

```bash
curl -fsSL https://raw.githubusercontent.com/kedoupi/xiaotaozi-dsh/main/apps/cli/scripts/install.sh | sh -s -- --bun
```

## First run

```bash
xtz start
```

On first start, `xtz`:

1. Prepares the official Harness home at `~/.dsh/profiles/web` (once).
2. Seeds all six first-party plugins — Models, IM bots, WeCom office, Xiaotaozi UI, Side card, and Market.
3. Starts the official `dsh web` service in the background on `127.0.0.1:3080`.
4. Prints the URL and opens your browser.

![Workbench](/workbench.jpg)

## Verify the installation

```bash
xtz --help     # command overview
xtz status     # inspect the remembered port without changing anything
xtz doctor     # inspect runtime, xtz stamp, profile, and port
```

`xtz doctor` is the health check: it verifies the pinned Node and DSH versions, the profile state, and the port. If something is off, it tells you exactly what.

## Next steps

- Sign in to a model provider: open **Settings → Models**. See [Plugins](/guide/plugins).
- Chat with your agent from an IM app: sidebar → **IM bots**.
- Install extra plugins: sidebar → **Market**. See [Plugin Market](/guide/market).
- Full command list: [CLI Reference](/guide/commands).

## Uninstall

Remove the CLI with the installer you used (`npm rm -g xiaotaozi-dsh-cli` or `bun remove -g xiaotaozi-dsh-cli`). Your Harness home stays at `~/.dsh` until you remove it yourself.
