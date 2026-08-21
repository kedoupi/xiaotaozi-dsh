# dsh-providers

English | [中文](README.zh.md)

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin. Occupies Settings → **Models**: official membership login and API keys on one page. The sidebar lists connected vendors; the right pane signs in or stores a key, then you check which models appear in the conversation picker.

Unconnected vendors live behind **Add provider**. The host Models page is unused on purpose.

![Settings → Models](docs/models.jpg)

![Add provider](docs/add-provider.jpg)

Part of the [`dsh-plugins`](https://github.com/kedoupi/dsh-plugins) monorepo. User-facing copy in the Web UI is Chinese.

Auth flows take after [dsh-plugin-subscriptions](https://github.com/V1ki/dsh-plugin-subscriptions) (MIT).

## Install

```bash
dsh plugin --profile web add github:kedoupi/dsh-plugins#path:plugins/providers
dsh web
```

Do not add the monorepo root. After source changes: rebuild this package and restart `dsh`.

## Subscriptions

| Product | Sign-in |
| --- | --- |
| ChatGPT Codex | OAuth (Plus / Pro) |
| Claude | OAuth (Pro / Max) |
| Grok | OAuth (X Premium) |
| Qwen Code | Device code |
| Kimi Code | Device code (official Kimi Code) |
| Zhipu GLM, Doubao, MiniMax, iFlytek Spark, Hunyuan | Listed under Add provider; official membership login is not wired yet |

Authorization can finish on another device: the page shows this computer, the link, and the device code.

## API keys and custom endpoints

Built-in API vendors use the host credential store. Saved keys are shown as a mask, never as plaintext.

A key that arrives from the **launch environment** is read-only here. The page explains that; it will not replace or unset it. Change it where you start `dsh`.

Custom vendors are OpenAI-compatible endpoints (`name`, `base URL`, `key`). Models are loaded from the endpoint, not typed in by hand.

## Data

Membership tokens: `$DSH_HOME/plugins/providers/auth.json` (mode `0600`). Files left under `plugins/passport/` from the old package name are copied on first load.

API keys go through the host credentials seam (`$DSH_HOME/.credentials.yaml`), unless the process environment already supplies that reference.

## Develop

From the monorepo root:

```bash
pnpm --filter dsh-providers test
pnpm --filter dsh-providers build
node scripts/link-plugin.mjs --profile web providers
pnpm dev
```

That links into the repo `.dsh-home` (port 3081), not the daily `~/.dsh`.

Workflow: [docs/workflow.md](../../docs/workflow.md). Product notes: [PRODUCT.md](PRODUCT.md).
