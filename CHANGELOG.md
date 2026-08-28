# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning 2.0.0](https://semver.org/). Product rules: [docs/conventions.md](docs/conventions.md) § Versions.

This file tracks the **product** snapshot (`xiaotaozi-dsh-cli` / git tag `vX.Y.Z`). First-party plugin package versions are independent and are not listed here unless that package is published to npm.

## Unreleased

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
