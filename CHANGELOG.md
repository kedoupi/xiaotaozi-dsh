# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning 2.0.0](https://semver.org/). Product rules: [docs/conventions.md](docs/conventions.md) § Versions.

This file tracks the **product** snapshot (`xiaotaozi-dsh-cli` / git tag `vX.Y.Z`). First-party plugin package versions are independent and are not listed here unless that package is published to npm.

## Unreleased

### Changed

- Pin DeepSeek Harness from `0.1.1-rc.2` to `0.1.2-rc.1` (`versions.json` `dshRc`, CLI, first-party plugins, templates, and workspace catalog). `@deepseek-ai/dsh-client-runtime` is gone on this RC; `ctx.slots` types now come from `@deepseek-ai/dsh-client-ui-renderer/client`, and first-party Client plugins wait on that package. Cordis pins move to `^4.0.2` so renderer augmentations do not land on a second copy. Session log reads use `snapshotEvents()`; Advanced credentials and Models Host API go through `ctx.remote`; Side Chat transcripts use a plugin `sidechat.events` route instead of removed `connection.api.sessions.history`. Agent-loop tests now mount `dsh-session-projection` because the loop injects `sessionProjections` before `setFactory`.

### Fixed

- Providers smart routing: with Smart UX on, Host no longer rejects a raster image turn solely because the hidden picker still points at a previous text-only model. Admission defers to the router (or the existing capability error if no vision candidate exists). Manual mode is unchanged.

## 0.5.1 — 2026-09-06

### Changed

- Default seeds pin `github:…#v0.5.1&path:plugins/<slug>`.
- Providers: hide the chat model picker when authorized smart routing is on.

### Fixed

- Extra / market plugins that install without a loadable Host entry (for example a Git spec with no `lib/`) no longer take down `dsh web` or trap `pnpm dev` in `sandbox web exited` retries. `xtz start` isolates those extras from the plugin tree; the market rolls back an install that has no entry.
- Empty-session composer hint alignment, and a follow-up MutationObserver loop that stuck home on Loading plugins.
- Providers smart routing: a human turn that carries images (or raster files) no longer lands on a text-only model. The capability gate uses advertised `inputModalities`; if no authorized vision candidate exists, the turn fails closed with settings guidance.
- After a CLI upgrade, stopped `start` / `restart` reconciles every default plugin to the exact product specs as one rollback-safe profile transaction.
- Redact upstream error bodies and ignore private-key files.

## 0.5.0 — 2026-09-03

### Added

- Providers: optional authorized smart model routing. Manual selection stays the default.
- First-party 3D plugin portraits in the in-app chrome.

### Changed

- Default seeds pin `github:…#v0.5.0&path:plugins/<slug>`.

### Fixed

- Providers: Codex sandbox defaults and escalation guidance.
- Providers: Kimi tool calls.

## 0.4.0 — 2026-09-02

### Added

- IM: choose and follow an existing project from bot settings.
- Market: discovery-first catalog, clearer cards and detail, and installation lifecycle status.
- First-party 3D Xiaotaozi plugin portraits on the product README.

### Changed

- Providers, IM, Market, Sidebar, and Xiaotaozi settings / archive / board / Git surfaces follow the fruit-orange workbench UI.
- Default seeds pin `github:…#v0.4.0&path:plugins/<slug>`.

### Fixed

- Providers: keep Kimi reasoning visible; classify Grok context overflow; preserve tool-message roles; configuration recovery no longer swallows failures.
- IM: workspace and session binding stay consistent when switching projects and reconnecting.
- Market: destructive remove is confirmed and focused; mutation outcomes are not doubled.
- Sidebar and xtz-ui: git graph, archive, board, and nested dialogs keep truthful state.

## 0.3.0 — 2026-09-01

### Added

- IM: manage WeCom office from each WeCom robot card so users have one integration entry for activation, status, permissions, and advanced settings.
- Xiaotaozi brand tokens, a branded welcome card and task-board empty state, and unified IM channel logo containers.
- A redesigned archive manager with clearer browsing and restore actions.

### Changed

- IM Session badges reuse the workspace session status slot, preserve running-state feedback, and provide larger accessible hit targets.
- Default seeds pin `github:…#v0.3.0&path:plugins/<slug>`.

### Fixed

- IM: workspace onboarding stays available while a bot is connecting; WeCom workspace is not tied to authentication; Feishu and Weixin can open a workspace during connect; Feishu provisioning failures stay terminal; retry notices are translated.
- IM: Session lookup, binding, state deletion, provisioning, and Feishu/WeCom delivery remain consistent across reconnects and concurrent updates.
- IM: still-valid inbound conversation bindings keep their workspace channel badges, while an explicit Follow shows only its current Session.
- Sidebar: produced folders and workspace paths in chat prose render as usable file links.
- Mobile settings use the available width and keep archive controls usable on narrow screens.

## 0.2.3 — 2026-08-31

### Added

- IM/Feishu: present replies as lifecycle cards.

### Changed

- `xtz` accepts the same Node range as DeepSeek Harness (`^22.19.0 || >=24.0.0`) instead of requiring exactly `22.19.0`.
- Default seeds pin `github:…#v0.2.3&path:plugins/<slug>`.

### Fixed

- `xtz start`: after the first git plugin needs `allowBuilds`, allow the other default plugins on the same tarball so each package does not fail-then-retry; log which plugin is installing.
- IM: incomplete `tool_calls` history tells the user to `/stop` and start a new session instead of a generic unknown error.
- `xtz start`: if Git seeding materializes a second `@deepseek-ai/dsh-tools` in the web profile, replace it with a symlink to the DSH install tree so the tool scheduler Symbol stays a singleton. Version mismatch and symlink failure do not abort start; `xtz doctor` reports a remaining duplicate or the version gap.
- IM/WeCom: after an approval or follow-up question, send the final answer as a new message instead of updating the original thinking stream (WeCom does not show that update).
- IM: inbound chat files show as a short “uploaded file” line plus a workspace path chip instead of a raw XML/JSON dump in the session bubble.

## 0.2.2 — 2026-08-30

### Added

- WeCom thinking stays visible during generation.
- wecom-office: Word markdown layout and layout checks.
- Xiaotaozi design system across first-party plugin UI.
- Product site screenshots and desire-led copy.

### Changed

- Default seeds pin `github:…#v0.2.2&path:plugins/<slug>`.

### Fixed

- Plugin overlays stay above the files sidebar.
- WeCom follow switch no longer leaves the previous session badge.
- Recovered WeCom WS 1006 is not a journey break.
- Plugin lifecycle and persistence harden (onboarding first-work, installable layers).

## 0.2.1 — 2026-08-28

### Changed

- Publish `xiaotaozi-dsh-cli` from GitHub Actions with npm Trusted Publisher (OIDC), no long-lived npm token.
- Default seeds pin `github:…#v0.2.1&path:plugins/<slug>`.

### Fixed

- Windows: wait for PowerShell process identity instead of treating a late PID as missing.
- Sidebar dialogs and confirm buttons use in-app Modal / danger hover that wins over ghost Button.
- wecom-office: drop unused exports and the `httpServer` fallback.

## 0.2.0 — 2026-08-28

### Added

- Documentation map (`docs/README.md`) and contributor entry (`CONTRIBUTING.md`).
- SemVer / product-tag rules; default seeds pin `github:…#v0.2.0&path:plugins/<slug>`.
- Official `xtz start` allows pnpm 11 git `prepare` and native builds (`node-pty`, `protobufjs`, `sharp`, Baileys) so the first seed can compile.

### Changed

- User product is `xtz`; Desktop is archived at `archive/desktop`.
- Chrome plugin renamed `dsh-hello` → `dsh-xtz-ui`.
- Third-party Agent Teams, session Context, and OpenContext are market catalog rows, not packages in this repo.
- `xtz` starts, stops, and seeds official web; sandbox `pnpm dev` runs `xtz --sandbox`.

## 0.1.0 — 2026-08-27

Baseline while the tree still mixed Desktop and `xtz`. Not tagged. Do not install this number as a product shelf.
