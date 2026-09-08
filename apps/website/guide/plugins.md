# Plugins

Six first-party plugins are seeded automatically on your first `xtz start`. Each one does exactly one job and occupies exactly one place in the UI.

Open **Plugin Center** below **New Session**. It occupies the conversation area; the sidebar and right workbench remain available. **Installed** is the default. Runtime controls live under **Settings → Advanced**.

| Plugin | Where it lives | What it does |
| :-- | :-- | :-- |
| `dsh-providers` | Plugin Center → Installed → **Models** | Membership sign-in and API keys on one page; chat only lists the models you checked. Optional smart routing; manual is the default |
| `dsh-im` | Plugin Center → Installed → **IM bots** | Nine chat channels plus an experimental AI Office connector |
| `dsh-wecom-office` | Plugin Center → Installed → **IM bots** → WeCom robot card | WeCom calendar, docs, meetings, contacts, sheets, todos, and disk |
| `dsh-xtz-ui` | Plugin Center → Installed → **Xiaotaozi**; Settings → Advanced | Brand chrome, archive, task board, git graph, and feature toggles |
| `dsh-sidebar` | Plugin Center → Installed → **Side workbench** | Right-hand files / editor / Git / terminal panel |
| `dsh-market` | **Plugin Center** | Installed capabilities and **Discover plugins**; click **Install** to add a third-party plugin |

## Models — `dsh-providers`

Sign in to Codex, Claude, Grok, Qwen, or Kimi with an official membership, or store API keys — all on **Plugin Center → Installed → Models**. The chat model picker only lists what you have enabled, so it stays short and relevant. **Smart routing** is off by default; turn it on only if you want each human turn to pick among the models you already checked.

**Pre-center examples:** these screenshots predate Plugin Center and do not show its current entry or layout. Replacement captures are pending rendered acceptance.

<ThemeShot light="/models.webp" dark="/models-dark.webp" alt="Pre-center Models page" />

Vendors that are not connected yet live behind **Add provider**.

## IM bots — `dsh-im`

Connect the local Harness to the chat apps you already use: WeChat, WeCom, Feishu, DingTalk, Slack, and more — nine channels in total. Send a message from your phone; the agent works on your machine and replies in the same chat.

<ThemeShot light="/imbot.webp" dark="/imbot-dark.webp" alt="Pre-center IM bots: WeCom empty credential form" />

Scan a QR code, paste an App Manifest, or enter bot credentials — each channel documents its own onboarding.

::: info WeCom chat vs. WeCom office
WeCom **chat** lives in `dsh-im`. WeCom **office** capabilities (calendar, docs, meetings…) are a separate plugin, `dsh-wecom-office`, and require the official `wecom-cli` on `PATH`.
:::

## WeCom office — `dsh-wecom-office`

Give the model access to WeCom calendars, online docs, meetings, contacts, sheets, todos, and the drive — through the official `wecom-cli`. Configure it on the WeCom robot card under **Plugin Center → Installed → IM bots**.

## Xiaotaozi UI — `dsh-xtz-ui`

The brand layer: welcome screen, peach accent, session archive, task board, git graph, and per-feature toggles under **Plugin Center → Installed → Xiaotaozi**. Turn off what you do not need. Runtime parameters stay under **Settings → Advanced**.

<ThemeShot light="/xiaotaozi-settings.webp" dark="/xiaotaozi-settings-dark.webp" alt="Pre-center Xiaotaozi feature switches" />

The first launch shows a welcome card. Brand chrome stays on even if you switch the other surfaces off.

<ThemeShot light="/welcome.webp" dark="/welcome-dark.webp" alt="Welcome" />

## Side workbench — `dsh-sidebar`

A right-hand panel with files, an editor, Git status, and a terminal — so you can inspect what the agent did without leaving the chat. **Plugin Center → Installed → Side workbench** chooses which tabs mount.

<ThemeShot light="/workbench.webp" dark="/workbench-dark.webp" alt="Files beside the composer" />

## Plugin Center — `dsh-market`

Built-in configuration, installed plugins, and curated **Discover plugins**. See [Plugin Market](/guide/market).

<ThemeShot light="/market.webp" dark="/market-dark.webp" alt="Pre-center market catalog" />
