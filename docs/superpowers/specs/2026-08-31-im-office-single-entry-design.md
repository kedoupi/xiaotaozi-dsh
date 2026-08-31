# IM 机器人办公能力单入口设计

## 状态

- 日期：2026-08-31
- 状态：交互设计已批准，待书面规格复核
- 范围：`dsh-im` 与 `dsh-wecom-office`

## 背景

企业微信聊天机器人由 `dsh-im` 管理，企业微信办公工具由 `dsh-wecom-office` 提供。当前用户需要先在 IM 绑定机器人，再到独立的“企业微信办公”设置页选择同一只机器人并开通办公能力。

用户不应理解聊天插件、办公插件、WebSocket 或 CLI 的技术边界。用户心智只有一只机器人，以及这只机器人当前具备哪些能力。

## 产品决定

1. 面向用户只暴露 **IM 机器人管理** 一个入口。
2. 企业微信办公的开通、机器人选择、状态、权限和高级设置都放在对应的企业微信机器人卡片内。
3. 删除独立的“企业微信办公”设置入口。
4. `dsh-im` 与 `dsh-wecom-office` 内部继续保持两个安装包。
5. 只安装 `dsh-wecom-office`、未安装 `dsh-im` 时不再提供办公设置 UI；官方 `xtz` 默认同时 seed 两包。
6. 不为未来飞书或第三方办公功能提前建设通用 integrations shell；真实需求出现后再设计。

## 目标

- 用户完成企业微信机器人绑定后，无需离开 IM 管理界面即可开通办公能力。
- 多机器人场景下，用户直接在目标机器人卡片上选择办公身份。
- 用户能够在当前办公机器人卡片内查看 CLI 状态、重新检查并管理写权限。
- 办公插件故障不影响企业微信聊天连接。
- 已有办公凭据和配置继续使用，不要求重新授权。

## 非目标

- 不物理合并两个插件包。
- 不新增 `packages/`、共享 workspace package 或通用 capability 框架。
- 不实现飞书办公或其他第三方办公功能。
- 不改变企业微信聊天绑定协议、消息运行时或 workspace onboarding。
- 不改动官方 `~/.dsh` 或 3080 服务。

## 架构

### 包边界

`dsh-im` 继续负责：

- 企业微信机器人绑定、删除、聊天连接和机器人卡片。
- 唯一的办公能力用户界面。
- 从浏览器调用办公插件现有 loopback HTTP 路由。

`dsh-wecom-office` 继续负责：

- `wecom-cli` 探测、鉴权和调用。
- `wecom_*` tools 与 system prompt guidance。
- 办公身份、CLI 凭据目录和权限设置的持久化。
- loopback-only、same-origin 的状态与变更接口。

`dsh-wecom-office` 不再注册 `settings.section`，不再提供独立扫码或手动绑定 UI。它保留现有包名、patch id、工具名、状态文件路径和 CLI 凭据目录。

### 跨插件通信

继续使用现有路由：

```text
POST /_dsh/dsh-wecom-office/status
```

IM 客户端只使用最小动作集合：

- `status`：读取 CLI、active bot、错误和权限状态。
- `activate`：用卡片对应的 IM `botId` 开通或切换办公身份。
- `configure`：修改 `allowWrite`，以及保留的办公全局开关。

不新增共享契约包。路由名和有限 payload 作为两个第一方插件之间的稳定内部契约，分别在各自包内定义和校验。

## 用户界面

每张企业微信机器人卡片增加“办公能力”区域。

| 状态 | 卡片显示 | 主操作 |
| --- | --- | --- |
| CLI 未安装 | 未安装 `wecom-cli` | 展示安装命令；重新检查 |
| 未开通 | 办公能力未开通 | 开通办公能力 |
| 当前办公机器人 | 办公能力已开通 | 展开办公设置 / 重新检查 |
| 其他机器人 | 不是当前办公机器人 | 设为办公机器人 |
| 开通失败 | 显示可理解错误 | 重试 |
| Office host 不可用 | 办公能力暂不可用 | 重新检查 |

当前办公机器人卡片的展开区域包含：

- `允许修改企业微信数据` 开关。
- CLI 安装/授权状态。
- CLI 路径和 `configDir` 等高级只读信息。

办公身份同时只有一只。系统不会根据当前 IM 消息来自哪只机器人自动切换；用户只能通过目标机器人卡片显式切换。

## 数据流

### 状态读取

1. IM 企业微信页读取原有聊天机器人快照。
2. IM 客户端请求办公 `status`。
3. 办公 host 从 IM 的 `$DSH_HOME/integrations/dsh-wecom/config.json` 读取合法机器人身份，并从自身设置读取 `activeBotId`、CLI 状态和权限。
4. IM 客户端按 `botId` 将全局办公状态映射到各机器人卡片。

### 开通与切换

1. 用户点击某张卡片的“开通办公能力”或“设为办公机器人”。
2. IM 客户端提交 `activate` 和该卡片的 `botId`。
3. 办公 host 校验该 bot 仍存在于 IM 配置。
4. 办公 host 通过 DSH credential store 读取该 bot 的 Secret。
5. 办公 host 执行 `wecom-cli auth init`，并再次检查授权状态。
6. 成功后写入唯一 `activeBotId`，客户端刷新全部卡片。

切换前保存原 active identity。目标 bot 的 `auth init` 失败时，办公 host 使用原 identity 的 credential store Secret 重新执行 `auth init` 回滚 CLI 身份；只有目标鉴权成功后才写入新 `activeBotId`。回滚成功时原办公机器人继续可用，错误显示在用户尝试切换的目标卡片上；回滚也失败时明确报告办公鉴权不可用，不伪称原身份仍正常。

### 删除机器人

删除当前办公机器人后，办公插件在下一次 `status` 时发现 `activeBotId` 已不在 IM 列表，清除其办公激活状态和 CLI 凭据。剩余机器人只预备显示，不自动接管办公身份。

## 错误处理

- Office route 不可达：卡片显示“办公能力暂不可用”，IM 聊天状态和操作保持可用。
- `wecom-cli` 缺失：显示 `npm install -g @wecom/cli`，禁用开通，允许重新检查。
- IM Secret 缺失：提示用户在当前 IM 卡片移除后重新绑定，不在浏览器暴露 Secret 或 secretRef。
- CLI 鉴权失败：保留原 active 身份；展示安全清洗后的错误。
- active bot 被删除：清除 active 状态，不自动选择其他机器人。
- 所有 route 继续要求 loopback、same-origin 和 JSON body；Secret 不进入响应、日志或设置 JSON。

## 兼容与迁移

- 保持 `$DSH_HOME/plugins/wecom-office` 作为 CLI 配置和凭据目录。
- 保持现有 `settings.json` overlay 的读取；现有 `activeBotId`、`activeIdentity`、`allowWrite` 和 `guidance` 不迁移路径。
- 已通过 IM 身份开通的用户升级后直接在对应卡片看到“已开通”。
- 旧 standalone 身份和凭据保留兼容读取，避免数据丢失，但不再提供新增、扫码、手动绑定或清理 standalone 身份的 UI。
- 删除独立设置入口后，不允许同一 profile 同时出现旧页面和新卡片操作。

## 删除与保留

删除：

- `dsh-wecom-office` 的 `settings.section` 注册和独立设置页样式。
- 独立 UI 的 QR polling、手动凭据表单和 bot 下拉选择。
- 仅为独立新增流程服务的 QR host 动作、QR 生成代码、手动绑定动作和 `qrcode` 依赖；删除前用调用者搜索确认它们只被同步删除的办公客户端使用。

保留：

- Office host、tools、guidance、CLI runner、权限策略和 loopback 安全校验。
- 现有数据路径、包身份、patch id 和工具名。
- 旧设置数据的兼容读取。

旧 standalone 数据只读兼容不依赖这些新增动作；升级后不能继续新增 standalone 身份。

## 测试

### 自动验证

- IM 客户端：未开通、已开通、其他 bot、CLI 缺失、host 不可用和失败重试状态。
- IM 客户端：点击开通/切换提交当前卡片 `botId`，成功后刷新卡片。
- Office controller：开通成功；切换失败保留原 active 身份；Secret 缺失；删除 active bot 后清理且不自动接管。
- Office route：动作校验、loopback、same-origin、JSON body 和错误清洗。
- 权限：`allowWrite` 开关从 active 卡片修改，并继续让写工具 fail closed。
- Manifest：Office 不再注册独立 client 设置入口；插件仍能独立 build 和 Git path prepare。

运行：

```bash
pnpm --filter dsh-im test
pnpm --filter dsh-im build
pnpm --filter dsh-wecom-office test
pnpm --filter dsh-wecom-office build
pnpm check
pnpm check:build
```

### 人工验证

用户明确要求本次实现不执行 sandbox 3081 / 真企业微信首次人工验证，由用户统一验收。实现报告必须把以下项目列为“未验证”，不能把自动门禁等同于真机验收：

- 设置导航中不再出现“企业微信办公”。
- 企业微信机器人卡片可开通、切换和管理权限。
- 真 `wecom-cli auth init` 与真实企业微信账号成功。
- 切换失败时原办公机器人在真实环境中继续工作。

## 文档

同步更新：

- `plugins/wecom-office/docs/prd.zh.md`
- `plugins/wecom-office/docs/technical.zh.md`
- `plugins/im/README.md` / `README.zh.md`
- `plugins/wecom-office/README.md` / `README.zh.md`
- 根 `README.md` / `README.zh.md`

文档统一描述：内部两个插件包，用户只有 IM 机器人管理一个入口。

## 成功标准

1. 默认 `xtz` profile 中没有独立“企业微信办公”设置入口。
2. 用户能在企业微信机器人卡片完成办公开通、显式切换和权限管理。
3. 同时只有一个 active 办公机器人，且不随消息来源自动变化。
4. Office host 或 CLI 故障不影响 IM 聊天。
5. 已有 IM-backed 办公用户不需要重新授权。
6. 自动测试和构建门禁通过；人工 sandbox / 真机验证明确留给用户。
