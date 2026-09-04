# dsh-providers 产研文档

**改范围或交互先改文档，再改代码。** 本文档描述现行已交付行为，不得把未实现能力写成已上线。

| 顺序 | 文档 | 角色 | 用途 |
| :-- | :-- | :-- | :-- |
| 1 | [产品规格 PRD](./prd.zh.md) | 产品 / 研发 / 验收 | **主合同**：背景、范围、流程、需求编号、验收 |
| 2 | [技术方案](./technical.zh.md) | 研发 | 怎么做：模块边界、凭据、RPC、工具、测试；条目对齐 PRD 的 FR/NFR |

智能路由 V1 已交付（设置页全局 opt-in，默认关闭，质量优先，只在已勾选模型中选择）。体验合同（FORGE-003）已交付：`smart` 时隐藏对话模型选择器，空池发送前拦截并引导去设置勾选，开关即时生效。未交付：耐久 `router/decision` Session 事件、辅助模型分类、在线学习、按会话模式、reasoning effort 路由、同 Step 跨模型 failover。完整演进仍见 [智能路由设计](./smart-routing-design.zh.md)。

对外安装说明：插件根目录 [README.md](../README.md) / [README.zh.md](../README.zh.md)。产品语气与约束见 [PRODUCT.md](../PRODUCT.md)。设置页视觉见 [DESIGN.md](../DESIGN.md)。截图 `models.jpg` / `add-provider.jpg` 是界面证据，不是规格。

当前状态：**已交付（现行规格，与 `package.json` 0.2.1 及源码同步）。**
