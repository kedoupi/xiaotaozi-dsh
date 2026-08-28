# dsh-xtz-ui documentation

Product and engineering docs for the Xiaotaozi UI plugin (dsh-xtz-ui 0.8.0).

| Document | Language | Audience |
| --- | --- | --- |
| [prd.zh.md](./prd.zh.md) | 中文 | 产品 / 产研 |
| [technical.zh.md](./technical.zh.md) | 中文 | 工程 / 测试 |

User-facing overviews stay in the plugin READMEs: [English](../README.md) · [中文](../README.zh.md).

These docs describe **implemented** Host/Web behavior in this package. Planned or deferred items are marked in the PRD and technical notes. Do not treat screenshots (`welcome.png`, `ip.jpg`) as contracts.

## Upstream references and verification

The Sticky Prompt surface is an adaptation of [oil-oil/dsh-oil-sticky-prompt](https://github.com/oil-oil/dsh-oil-sticky-prompt), reviewed at commit `5c032d0df3ad952a64f6ed3c50e375f5efaeadf7`. We retain the upstream ideas of whitespace flattening, nearest crossed-user-row selection, pin/release hysteresis, and click-to-jump, while keeping the implementation inside `dsh-xtz-ui` with no extra package, Host RPC, or persistence.

When the upstream repository changes, review its README and `src/client` helpers/controller for selector, animation, lifecycle, accessibility, and compatibility improvements. Re-run the xtz-ui unit/type/build checks and the sandbox UI smoke test before porting changes. The user UI smoke test for the current integration passed: the sticky bar display, scrolling, and click interaction showed no observed issue.

This record is a learning and maintenance reference, not a runtime dependency.
