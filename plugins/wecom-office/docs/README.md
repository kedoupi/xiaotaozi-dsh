# dsh-wecom-office 产研文档

**文档先行。** 未按本文实现前，插件不算交付。改范围或交互先改文档，再改代码。

| 顺序 | 文档 | 角色 | 用途 |
| :-- | :-- | :-- | :-- |
| 1 | [产品规格 PRD](./prd.zh.md) **v0.4** | 产品 / 研发 / 验收 | **主合同** |
| 2 | [技术方案](./technical.zh.md) | 研发 | 包结构、凭据、实现顺序 |
| 3 | [腾讯文档智能排版 PRD](./ai-document-delivery-prd.zh.md) | 产品 / 研发 | 对话里做成能看的腾讯文档 |
| 4 | [排版标准](./tencent-doc-layout-standard.zh.md) | 研发 / 验收 | Word markdown 纪律 |
| 5 | [智能排版技术方案](./ai-document-delivery-technical.zh.md) | 研发 | 强制 markdown、纪律检查、guidance |
| 6 | [附录 A CLI](./appendix-cli.zh.md) | 研发 | 第一刀 argv（实测 wecom-cli 1.2.0） |
| 7 | [附录 B RPC](./appendix-rpc.zh.md) | 研发 | 设置页 POST、扫码 poll、imAvailable |
| — | [旧稿入口](./product.zh.md) | — | 已废弃，只指向 PRD |

对外安装说明：插件根目录 [README.md](../README.md) / [README.zh.md](../README.zh.md)。仓库根 README 的插件表和安装路径表必须列出本包；默认插件集合不含它。

当前状态：**第一刀已实现。** 公开 README 写能力边界；真机开通仍按 PRD 验收。
