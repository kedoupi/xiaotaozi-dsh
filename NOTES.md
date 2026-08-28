# 项目工作笔记（内部）

内部草稿，不是合同，不是对外文档。规范在 `docs/conventions.md`，步骤在 `docs/workflow.md`，文档地图在 `docs/README.md`。

## 产品方向（已定）

- 用户产品是 `xtz` + 插件；界面是官方 `dsh web` 开在浏览器里。
- 没有桌面客户端。历史在 git 标签 `archive/desktop`。
- `xtz` 是钉死版本的 dsh 外壳：第一次 `xtz start` 种全部自研插件（`xtz-ui`、`sidebar`、`providers`、`im`、`market`、`wecom-office`）。
- 第三方（Agent Teams、会话 Context、OpenContext）只在市场目录，点安装；不要 vendor 进本仓库。
- 壳插件目录是 `plugins/xtz-ui`（包名 `dsh-xtz-ui`），不是 `hello`。

## 成功标准（0.1.x 阶段）

达不到不算失败，但持续偏离说明该停下修问题了。

### 质量门禁（每次合入 main 前）

- 用户路径门禁全绿：`pnpm check` / `check:build` / `check:path` / `check:cli`。
- 改过的插件跑过 `pnpm --filter dsh-<slug> test`。

### IM 渠道（dsh-im）

- 常用渠道（微信 / 飞书 / 企微 / 钉钉）连续使用不丢最终回复。
- 收到消息后尽快有首个反馈（回执、占位或首段回复）。
- 长任务（单 turn > 5 分钟）不断流、不丢最终回复。

### CLI（xtz）

- 只读命令（status / doctor）对 `~/.dsh` 零写入。
- fail-closed 命令永远明确报错退出，不静默降级。
- `start` / `stop` 只管理 `xtz` 自己拉起的进程；占用且不是自己的进程就拒绝。

### 测试覆盖（阶段目标）

- 每个插件的核心路径至少有测试。
- 新增渠道或新增命令必须带测试合入。

### 修复时效（自用阶段）

- P0（产品不可用、消息丢失）：24 小时内修复或回滚。
- P1（某功能不可用但有绕行办法）：一周内。
- P2（体验问题）：进下面的问题清单，攒着排期。

## 待修问题

- [ ] 飞书这条要沙箱实打：卡片 / bridge / i18n 刚大改，单测绿不等于渠道验过。
- [ ] 市场安装走 PATH `dsh`，应改成和 `xtz` 同一条 pinned runtime。
- [ ] 脏 home：`dsh-hello` → `dsh-xtz-ui` 的数据迁移要在真实 `~/.dsh` 走一遍。
- [x] 冷启动正式 home 绿了再打 `v0.2.0`；种子改 `#v0.2.0&path:plugins/<slug>`。

## 怪现象（怀疑但未确认）

（遇到"怪怪的但先不管"的现象，追加一行：日期 + 现象 + 复现条件）

## 想法 / 以后再说

- QQ / WhatsApp / AI Office 三个渠道处于 DEFERRED 状态，待启用。
- 不要发明签名 pack / CDN 管道。
