# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People who run AI coding agents locally and want a browser workbench, not a desktop shell. Primary job: install one CLI, start a pinned DeepSeek Harness, and work from official `dsh web`. Secondary audience: plugin authors who install extra packages from the in-app market.

## Product Purpose

Xiaotaozi DSH is the `xtz` CLI plus six first-party Harness plugins. Success is: Node 22.19.0 on PATH, `xtz start`, browser opens `127.0.0.1:3080` with plugins already seeded.

## Positioning

A pinned-dsh wrapper. Runtime is exactly Node `22.19.0` and DeepSeek Harness `0.1.1-rc.2`. `xtz` only manages a process it started; it never steals a port. There is no desktop app.

## Operating Context

Official home `~/.dsh` on port 3080. Extra plugins via in-app market or `dsh plugin --profile web add`. Website is VitePress in `apps/website`, deployed to Tencent CloudBase static hosting under `dsh/`, domain `dsh.xiaotaozi.cc`.

## Capabilities and Constraints

- Commands: start / stop / restart / open / status / doctor / config path / version / help.
- Disabled: init, plugin, run, ask, config dump/defaults, update.
- First-party plugins: providers, im, wecom-office, xtz-ui, sidebar, market.
- Do not claim desktop installers, cloud sync, or third-party testimonials.

## Brand Commitments

- Names: Xiaotaozi DSH / 小桃子DSH; user product `xtz`.
- Binding visual reference from the owner: craft level of https://grok-app.com/ (cinematic product-site, not a docs-theme homepage).
- Peach identity from the product (logo, xtz-ui chrome). English default; Chinese at `/zh/`.

## Evidence on Hand

Real screenshots in `public/`: welcome.png, models.jpg, add-provider.jpg, imbot.png, plugin IP marks. No reviews, download counts, or customer quotes — do not invent them.

## Product Principles

1. One command is the product.
2. Prove with the real UI, not adjectives.
3. Safety is a feature: fail closed, loopback only.
4. Facts stay repo-true; no fabricated social proof.
