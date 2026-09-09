# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: a person at their own machine who installs `xtz`, starts a pinned DeepSeek Harness, and works in the browser. Their job is to write or debug code with an AI coding agent, using models they already pay for and tools that stay on that computer.

Secondary: a plugin author who develops in this repository's sandbox. They do not write official `~/.dsh/profiles/web`. Say **user** only for someone who runs `xtz`.

## Product Purpose

Xiaotaozi DSH (`xiaotaozi-dsh`) is one user product — the `xtz` CLI in `apps/cli/` — plus six first-party DeepSeek Harness plugins that the first `xtz start` seeds. There is no desktop client.

Success is: Node.js `^22.19.0 || >=24` already on `PATH`, `npm install -g xiaotaozi-dsh-cli` (or bun/pnpm/`install.sh`), `xtz start`, the browser opens authenticated official `dsh web` on `127.0.0.1:3080` with Xiaotaozi, Side workbench, Models, IM bots, Plugin Center, and WeCom office already present.

## Positioning

A pinned-dsh wrapper, not a second Harness and not a plugin manager. Node matches DeepSeek Harness; the bundled RC is exactly `@deepseek-ai/dsh@0.1.2-rc.1`. `xtz` only manages a process it started and never steals port 3080. Extra plugins come from the in-app market (upstream Git/npm). This repo is never `link:`'d into official web.

## Operating Context

- Official home `~/.dsh`, port **3080**. UI is official `dsh web` in a browser. Launch uses `GET /?token=` from `$DSH_HOME/xiaotaozi-xtz-web.auth`; identity `ready: true` is Host health, not proof the SPA loaded.
- Repository sandbox is `<checkout>/.dsh-home` on machine-wide **3081**, normally owned by the clean-main hub. Plugin authors work in topic worktrees without claiming 3081.
- Plugin Center (below New Session) is the user configuration surface: Installed (Xiaotaozi, Side workbench, Models, IM bots) and Discover plugins. Runtime controls live under Settings → Advanced. `xtz doctor` is diagnosis, not a settings page.
- Public site is VitePress in `apps/website` at `https://dsh.xiaotaozi.cc/zh/`. It has its own `apps/website/PRODUCT.md`. Models has its own `plugins/providers/PRODUCT.md`. This file does not override them.

## Capabilities and Constraints

Confirmed:

- Open `xtz` commands: help/version, `start`/`web`, `stop`, `restart`, `open`, `status`, `doctor`, `config path`.
- Fail closed: `init`, `plugin`, `run`/`ask`, `config dump`/`defaults`, `update`.
- First-party seeded plugins: `xtz-ui`, `sidebar`, `providers`, `im`, `market`, `wecom-office`.
- Third-party plugins are catalog rows in `plugins/market` (`MARKET_PLUGINS`), never vendored trees.
- Product SemVer is `versions.json` `cliApp` (currently 0.5.1); git tag `vX.Y.Z` is the user install unit. Stay on `0.x` until breaking changes will be MAJOR.
- Do not revive Desktop / `.dmg` / pack apply. History is `git show archive/desktop`.
- Do not vendor or edit `deepseek-harness` in this repo.
- Do not mix official and sandbox homes.

Undecided:

- When the public contract leaves `0.x`.

## Brand Commitments

- Names: Xiaotaozi DSH / 小桃子DSH; user binary `xtz`; npm package `xiaotaozi-dsh-cli`.
- One-line: 小桃子 = 住在你电脑里的工作伙伴. Personality: 温暖、圆润、可靠.
- Voice: 伙伴腔 — speak as the person in front of the machine; next action in the main sentence; error codes stay secondary; no exclamation-mark credit.
- Product mark is the xtz-ui 3D peach. Each first-party plugin's visible identity is its own `docs/ip-3d.jpg`. Functional icons stay stroke SVG.
- Binding in-app brand spec: `plugins/xtz-ui/docs/brand.zh.md`. Token/geometry contract for first-party Web UI: `design-system/xiaotaozi-dsh/MASTER.md`.
- Public docs default to English (`README.md`); Chinese is `README.zh.md`. In-app locale follows each plugin (Models copy is Chinese-only).

## Evidence on Hand

- First-party IP portraits: `plugins/<slug>/docs/ip-3d.jpg`.
- Welcome overlay: `plugins/xtz-ui/docs/welcome.webp`.
- Website product shots: `apps/website/public/*.webp` and `*-dark.webp`. Several README shots predate Plugin Center; do not treat them as current navigation.
- No customer quotes, download counts, or third-party testimonials. Do not invent them.

## Product Principles

1. One command is the product: a supported Node, then `xtz start`.
2. Official home and sandbox never mix; fail closed beats a clever fallback.
3. Plugin Center is where users configure capabilities; Advanced and doctor stay runtime/diagnosis.
4. Speak as the partner at the desk, not as the protocol.
5. Prove with the running UI and repo facts; do not fabricate social proof.

## Accessibility & Inclusion

No extra legal or WCAG target. Keep the existing in-app constraints: keyboard operation of dialogs, tabs, cards, and nested actions; visible focus; text contrast at least 4.5:1 for normal text; `prefers-reduced-motion` honored.
