# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning 2.0.0](https://semver.org/). Product rules: [docs/conventions.md](docs/conventions.md) § Versions.

This file tracks the **product** snapshot (`xiaotaozi-dsh-cli` / git tag `vX.Y.Z`). First-party plugin package versions are independent and are not listed here unless that package is published to npm.

## Unreleased

### Fixed

- IM: workspace onboarding stays available while a bot is connecting; WeCom workspace is not tied to authentication; Feishu and Weixin can open a workspace during connect; Feishu provisioning failures stay terminal; retry notices are translated.

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
