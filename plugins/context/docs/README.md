# dsh-context 产研文档

本目录是 `dsh-context` 的产研合同。对外安装说明仍以插件根目录 [README.md](../README.md) / [README.zh.md](../README.zh.md) 为准。上游归属见 [NOTICE](../NOTICE)。截图仍放本目录（`context-*.png` 等）。

| 顺序 | 文档 | 角色 | 用途 |
| :-- | :-- | :-- | :-- |
| 1 | [产品规格 PRD](./prd.zh.md) | 产品 / 研发 / 验收 | **主合同**：背景、范围、流程、需求编号、验收 |
| 2 | [技术方案](./technical.zh.md) | 研发 | 怎么做：投影单元、折叠、Client Tab/`/context`；条目对齐 PRD 的 FR/NFR |

当前状态：**已实现会话「上下文」Tab 与客户端 `/context` 弹层。** Host 通过 session-projection 推送，不再走自定义 RPC。fork 关闭了指向上游 npm 的升级提示。
