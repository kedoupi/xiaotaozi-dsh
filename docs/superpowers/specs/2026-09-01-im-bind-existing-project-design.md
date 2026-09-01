# IM 只绑定已创建项目

## 状态

- 日期：2026-09-01
- 状态：已批准并实现。产品合同见 `plugins/im/docs/prd.zh.md` FR-13；工程合同见 `plugins/im/docs/technical.zh.md` §9。
- 范围：`dsh-im` 的机器人绑定目标与切换目标
- 不改：官方 `~/.dsh` / 3080；实验功能 AI Office 的 alias 映射

## 背景

> 本节记录实现前的旧行为；当前实现见产品与技术合同。

IM 机器人当时用「选择目录」：逛磁盘、手输绝对路径、必要时掉到系统选文件夹。选中后 `bot.workspace.set` 只校验「绝对路径 + 存在 + 是目录」。第一条消息若路径不在 Host 登记表，还会 `workspace.create`。

这和用户心智不一致。用户在小桃子里**创建项目**；Host 内部把这些项目保存为 Workspace 注册记录。IM 却在让人逛磁盘、直接选任意文件夹，甚至会把未登记的 `process.cwd()`、主目录或子文件夹当成机器人目标。

## 产品决定

1. 用户只选**已经创建好的项目**，即当前 `workspace.list().items` 中的 Host Workspace 注册记录。不直接选文件夹。
2. 绑定和以后换目标是同一件事：**选择项目 / 切换项目**。没有「选择目录」「切换目录」。
3. 没有已创建项目时，IM 空态，引导去 Web 创建。不允许用未登记目录凑合。
4. 取消第一次选择 ≠ 确认默认 cwd / 仓库目录。没选中项目，机器人不干活。
5. IM 不创建项目，也不把任意路径登记成项目。禁止本路径上的 `workspace.create`。
6. 对用户统称**项目**。命令名 `/workspace` `/workspacelist` 可暂时保留，帮助写成列出项目 / 切换项目。
7. 卡片、列表、回执主信息是**项目名**。项目路径不是选项，也不当主文案。

## 实际对象

```text
项目（产品名）= Host Workspace 注册记录
  ├── workspaceId  稳定身份
  ├── title        项目名
  ├── path         项目根路径，仅内部执行与同名消歧使用
  └── sessionIds   项目里的会话
```

| 对象 | Host / Web 中的表现 | IM 能不能选 |
| --- | --- | --- |
| 已创建项目 | `workspace.list().items` / `ctx.workspaces.list.items`；Web 侧栏项目行 | 只能选这个 |
| 项目根路径 | Workspace 记录的 `path` 字段 | 不能绕过项目记录单独选择 |
| 未登记 cwd、主目录、任意文件夹或项目子目录 | 不在 Workspace 注册表 | 不能 |

Host 没有独立的「工作区容器 → 项目」父子层；Web 侧栏项目本身就是 Workspace 记录。候选集以 `workspaceId` 为身份、`title` 为主显示。`path` 仅用于执行、旧数据迁移和必要的同名消歧；某路径即使存在，只要没有对应 Workspace 记录，就不是可选项目。

## 目标

- 新接入的机器人必须选一个已创建项目，才能处理第一条入站。
- 已接入的机器人换目标，只能换到另一个已创建项目。
- 所有入口（卡片、命令、飞书、Telegram 菜单、Follow、失败文案）说的是同一件事。
- 工作只落在所选项目里，不落在仓库根，不在 Host 里偷偷多出一个项目。

## 非目标

- 不在 IM 里新建项目、打开文件夹、手输路径创建。
- 不改入站文件落盘、`dsh_im_return_file`、DSH_HOME、企微配置目录、WhatsApp 登录态（那些本来就是文件系统）。
- 不改实验功能 AI Office 的 `alias=/绝对路径` 映射。
- 不改命令拼写 `/workspace` `/workspacelist`（只改语义和帮助）。
- 不把职责说明里的「项目 AGENTS.md」改成选根；那是项目内规则。

## 共同规则

对绑定、切换、命令、飞书卡片全部生效。

1. 候选 = 当前 `workspace.list().items` 中的 Workspace 记录；当前绑定以 `workspaceId` 是否仍在该列表中判定有效。
2. 一个机器人一次只绑一个项目。切走后清掉该机器人的旧会话映射（现有行为保留）。
3. 不在列表里就不能切。手输路径、过期卡片、未登记目录一律失败，并告知去 Web 创建项目。
4. 切的是机器人，不是某一条 IM 聊天。该机器人名下所有对话窗口一起换项目。
5. 无项目 / 当前 `workspaceId` 已失效：机器人回到「未选择项目」，入站不干活。不回退到默认 cwd。
6. 旧数据只有 path 时：若它规范化后精确匹配当前列表中唯一项目，则一次性迁移到该 `workspaceId`；否则视为无效并要求重选。迁移完成后不得再用 path 自动复活绑定。
7. 项目同名：主信息仍是项目名；列表使用序号，必要时以弱化的父目录提示消歧。飞书按钮内部传 `workspaceId`，不要靠用户记完整路径。

切换时：新消息进新项目；旧项目和旧会话还在，只是这只机器人不再接着聊，除非再切回去再 `/session`。

## 用户界面

### 卡片（所有渠道共用 `WorkspaceEditor`）

| 现在 | 改成 |
| --- | --- |
| 「选择目录」 | 未选：「选择项目」；已选：「切换项目」 |
| 主文案是绝对路径 | 主文案是项目名 |
| pending 时可能露出暂定 cwd | 「未选择项目」 |
| 目录树 + 手输路径 + 系统选文件夹 | 已创建项目列表；禁止系统选文件夹 |

空列表文案方向：还没有项目。请先在小桃子里创建一个项目，再回来给这个机器人选择。只有 `ctx.workspaces.list` 的 baseline ready 后 `items` 仍为空才算真空态；`state=loading`、`phase=pending` 或 `baselinesReady=false` 时显示加载，不得误报没有项目。

绑定后的强制弹层，和以后点「切换项目」，是同一个选择器。继续沿用 Host-authoritative `workspacePending` 恢复：初始状态、页面重载、渠道仍 connecting、丢失一次 provisioning poll 后都能打开，不等 status=connected。多个 pending bot 一次只打开页面协调器选中的一个。第一次取消 = 仍未选择；本次本地弹层可关闭，但重载或后续状态恢复仍可再次提示。已有绑定后取消 = 保持原项目。

### 聊天命令

```text
/workspacelist          列出已创建项目（编号、名称、是否当前）
/workspace              用法：先 list，再按序号或名称
/workspace 3            切到列表第 3 项
/workspace 办公助手      按名称精确匹配；重名请用序号
/sessionlist            列出当前项目的会话
/sessionlist 3          按项目列表序号列会话
```

不再支持 `/workspace /任意/路径`、`/sessionlist /任意/路径`。

成功回执以项目名为主，例如：已切换到项目「办公助手」。

### 飞书

- 菜单下拉：「切换项目」，选项是项目名。
- 列表卡：按钮是「1. 办公助手（当前）」，不是整段 path。
- `/status`：当前项目名；未选写未选择项目。
- 帮助去掉「`/workspace 路径`」。
- 过期按钮点到已删项目：失败并刷新，不按 path 强切。

### Telegram 等纯文字渠道

- 命令菜单：`workspace` = 切换项目；`workspacelist` = 列出项目。
- 各渠道 `/help`、欢迎语与命令表对齐。

### Web Follow

- 只列出已经绑在**这个项目**上的机器人。
- 空态：把机器人切换到这个项目。不要说「切到这个目录」。
- 未选择项目的机器人显示「未选择项目」。

## Host / 数据

### 新接入

各渠道现在 `ensure(..., { confirmWorkspace: false })` 且默认 `config.workspace ?? process.cwd()`。

改成：新机器人没有当前项目。不要先塞仓库根。`workspacePending` 仍表示必须选项目；未选择期间第一条入站继续等到确认。

取消第一次选择不得调用「确认当前默认路径」。确认 RPC 只接受列表里的项目。

### 校验

`bot.workspace.set` / `validateWorkspacePath` / `validWorkspacePayload`：

- 新绑定和切换必须提交并校验 `workspaceId`；该 id 必须仍存在于当前 `workspace.list().items`。
- 任意 path、未登记目录、已删除项目 id → 失败。canonical path 只允许用于上面的旧数据迁移，不作为新请求身份。
- 公开错误增加「不是已有项目」。旧的 `workspace-not-absolute` / `workspace-not-directory` 不再作为用户主路径。

### 禁止创建

会话创建、绑定、切换都不得在 `workspaceId` 缺失或失效时调用 `workspace.create`。对不上当前 `workspace.list().items` 就失败，保持未选择。`session.create` 必须显式、直接使用已验证的 `workspaceId`；不得传或回退 `cwd`，也不得省略目标让 Host 采用自身 cwd。

### 失效

项目被 Web 删掉或从工作区拿掉：当前绑定失效，pending。`/sessionlist` 不按残留根路径列。Follow 不用这条路径匹配。不自动把项目救活。

## 文案对照（必须改）

用户可见的「目录 / 根 / 绝对路径」改为「项目」的入口：

- 卡片按钮与选择器全文
- `usage-guide.ts`、设置页使用说明
- 各渠道 `/help`、飞书帮助卡、Telegram 命令菜单
- 接入成功：「请选择这个机器人要使用的项目」
- Follow 空态与「未设置工作区」
- `WORKSPACE_UNAVAILABLE`：请选择一个已有项目
- 各渠道 RPC「请输入工作区绝对路径」

可以留下的「目录 / 路径」（不是绑定目标）：

- 项目内入站文件路径、出站附件路径
- DSH_HOME、企微配置目录、WhatsApp 登录态
- 微信「检查 DSH_HOME 目录权限」

## 规范冲突

`docs/conventions.md` / `docs/conventions.zh.md`「接入与第一次真实工作」现写：取消等于有意确认默认值；选择器从主目录打开。

本设计改掉这两句：

- 取消第一次选择 = 仍未选择，不确认 cwd。
- 选择器列已创建项目，不以主目录或仓库 cwd 为起点。
- 默认写入的 cwd 对用户不可见；它只有本来就在 Workspace 注册表中且用户显式选择后，才能成为项目绑定。

规范、PRD FR-13、技术文档 §9 与用户 README 已按本设计同步。

## 实现约束（给执行用）

- 不新增 `packages/`，不在 IM 与 Web 之间加共享包。客户端项目列表直接读取现有 `ctx.workspaces.list.items`；Host 与文字渠道用现有 `workspace.list().items` 校验。空列表就空态，不降级成选目录。
- 客户端去掉对 `ctx.workspaces.listDirectory` / `pickDirectory` 作为绑定目标的依赖。
- `WorkspaceDirectoryPicker` 不再用于机器人绑定；不要留一条「读不了目录就系统选文件夹」的后路。
- 渠道卡片继续共用同一编辑器，禁止只改某一个渠道。
- 测试必须覆盖：空项目列表、选已有项目、拒绝任意 path / 未登记文件夹、取消不确认 cwd、禁止 `workspace.create`、`/workspace` 路径失败、飞书选项显示项目名且 payload 是 id、Follow 按 id 匹配。
- 旧用例（逛子文件夹、手输 UNC、native picker、取消即确认 cwd）作废，不要为了保绿而留目录模型。

## 验收

1. `workspace.list().items` 有 2 个项目时，IM 弹层只出现这 2 条，不能点进子文件夹，不能手输路径保存。
2. 列表为空时，弹层是空状态，没有目录树，也不能选未登记 cwd。
3. 选中项目 A 后，第一条 IM 消息的会话只出现在项目 A，不出现在未选择前的默认 cwd，也不新建项目。
4. `/workspace /未登记/路径` 失败；磁盘上文件夹在、但不是已创建项目，同样失败。
5. 取消第一次项目选择后，机器人仍未选择，入站不在默认 cwd 建会话。
6. 卡片「切换项目」、`/workspace 2`、飞书下拉，切到的是同一个已创建项目。
7. 从项目 A 切到 B 后，该机器人新消息只进 B；A 的旧会话还在。
8. 项目被删后，列表不再列出它；若它是当前绑定，机器人回到未选择。
9. 帮助、Telegram 菜单、飞书文案不再出现「选择目录 / 绝对路径 / 切换工作区目录」。
10. Follow 空态说切换到这个项目，不说切到这个目录。

## 实现文档

| 文档 | 作用 |
| --- | --- |
| 本文件 | 已批准设计与实现边界 |
| `plugins/im/docs/prd.zh.md` | 已落地产品合同（FR-13） |
| `plugins/im/docs/technical.zh.md` §9 | 已落地工程合同、禁止项与测试 |
| `docs/conventions.md` · `conventions.zh.md` | 取消 ≠ 确认默认 |
| `plugins/im/README.md` · `README.zh.md` | 用户说明 |
| `docs/superpowers/plans/2026-09-01-im-bind-existing-project-plan.md` | 分任务实现与验收步骤 |
