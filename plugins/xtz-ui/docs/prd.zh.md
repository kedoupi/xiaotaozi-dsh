# dsh-xtz-ui 产品需求文档（PRD）

- 产品：dsh-xtz-ui（小桃子 DSH 壳插件）
- 包名：`dsh-xtz-ui`
- 版本：0.8.0
- 状态：已实现（Web 壳插件；Desktop 分发已废弃，用户入口改 `xtz`）
- 文档日期：2026-08-27
- 适用范围：本仓库 `plugins/xtz-ui` 当前源码。只描述已落地行为；规划项单独标注。

## 1. 背景与问题

### 1.0 Sticky Prompt（新增）

在长对话中，用户消息滚出对话视口后，用户容易忘记当前回答对应的任务。xtz-ui 吸收 `oil-oil/dsh-oil-sticky-prompt` 的核心交互：定位最近一条越过滚动容器顶部的用户 Prompt，显示顶部两行提示条，点击可回到原消息。该能力纯客户端、无 Host RPC、无持久化，不修改会话内容；上游项目：[dsh-oil-sticky-prompt](https://github.com/oil-oil/dsh-oil-sticky-prompt)。

DeepSeek Harness 官方 Web 自带品牌、Session log、「打开配置文件」、官方「模型」导航等壳层。小桃子 DSH 需要：

1. 用小桃子品牌替换侧栏与空白会话 hero。
2. 去掉与产品定位冲突的官方入口（Session log、打开配置文件、重复的官方模型导航）。
3. 在不重启 Host 的前提下，开关归档、任务看板、Git 图谱，以及是否把这些能力写进 Agent 系统提示。
4. 给 `xtz doctor` / `xtz status` 提供本机 loopback 身份探测：`/.well-known/xiaotaozi-dsh/identity/v1`。

右侧文件 / Git / 终端工作台不在本插件，而在 `dsh-sidebar`。模型、IM、市场、企业微信办公仍在各自插件。

## 2. 用户与场景

| 角色 | 场景 |
| --- | --- |
| 用户 | 用 `xtz` + 浏览器打开官方 `dsh web` 后看到小桃子品牌、欢迎弹框；在「设置 → 小桃子」开关归档 / 看板 / Git 图谱。 |
| 插件作者 | 沙箱 `.dsh-home` :3081 用 `link-plugin xtz-ui` 调试壳层。 |
| CLI 用户 | `xtz` 是正式 home 写手；`status` / `doctor` 只读探测 identity 路由。 |
| Agent | 「向 Agent 宣告」打开时，系统提示里出现归档 / 看板 / Git 图谱的一句说明。 |

## 3. 目标与非目标

### 目标

- 提供可独立开关的小桃子工作台表面：归档、任务看板、Git 图谱。
- 品牌壳与欢迎弹框始终存在，不受上述开关影响。
- 关掉某表面 = 当作没装：无入口、无路由、无调度。
- 所有 Host HTTP 仅接受 loopback + 可信 Origin。
- 只读写 `$DSH_HOME`（`DSH_HOME` 优先，否则 `~/.dsh`）。

### 非目标

- 不实现右侧文件树 / 编辑器 / Git 面板 / 终端（`dsh-sidebar`）。
- 不实现模型提供方、IM、市场。
- 不遥测、不上报 Git 操作。
- 不在官方 home 用 `link:` / Git / npm 安装本插件。
- 不承诺跨进程 supervisor 或 CLI 写正式 profile。

## 4. 用户故事

1. 作为用户，我第一次打开 Web 时看到欢迎弹框；点确定后同一 id 不再出现。
2. 作为用户，我在设置里看到「小桃子」页，可以开关归档、看板、Git 图谱、向 Agent 宣告。
3. 作为用户，我打开归档后可以按工作区搜索、预览、恢复或彻底删除已归档会话。
4. 作为用户，我从侧栏工具行打开任务看板，创建/移动/运行任务，可选 5 段 cron；关掉浏览器后到点仍会跑，错过的点不补跑。
5. 作为用户，空白会话模式胶囊旁有分支胶囊，可搜索本地分支、看提交图、`git switch`。
6. 作为用户，我关掉某功能后对应入口和后台立刻消失，不必重启。
7. 作为 `xtz`，我 GET identity 路由即可判断产品就绪（不证明实例归属，除非带合法 instanceToken）。

## 5. 功能需求（FR）

**FR-01 品牌壳**  
占用 `sidebar.brand.mark` / `sidebar.brand.name` / `conversation.hero.brand.mark`（priority -1），显示小桃子图标与「小桃子DSH」。

**FR-02 隐藏官方入口**  
用同 id 的 Hidden 组件占住 Session log（`conversation.session.header.utilities` / `session-log-download`）和「打开配置文件」（`settings.action` / `open-document`）。

**FR-03 隐藏重复官方模型导航**  
DOM 扫描 `[class*="navList"] > button`，保留最后一个「模型 / Models」按钮；若存在 `.dshM-wrap`（dsh-providers），隐藏其兄弟节点。

**FR-04 桃子强调色**  
通过主题 `overrideTokens` 把 DeepSeek 蓝替换成桃色。

**FR-05 欢迎队列**  
`src/notices.ts` 队列；当前仅 `xiaotaozi-welcome`。dismissed ids 存在本 origin `localStorage` 键 `dsh-xtz-ui.dismissed`。每个 id 只出现一次。

**FR-06 设置页「小桃子」**  
`settings.section` id `xiaotaozi`。四个布尔开关：`archive`、`board`、`gitGraph`、`announceToAgent`。默认前三项开、宣告关。未 shipped 的开关显示「即将推出」且不可点（当前四项均 shipped）。

**FR-07 设置持久化**  
`$DSH_HOME/plugins/xtz-ui/settings.json`，目录 0700、文件 0600、tmp+rename。未知键丢弃。

**FR-08 热重挂载**  
POST 设置后 Host 立即 dispose 旧路由/调度并按新 config remount，无需重启。

**FR-09 归档列表 / 预览 / 恢复 / 删除**  
仅当 `archive=true`。路由见技术文档。数据来自 `$DSH_HOME/storages/workspace.json`、`session_projcache.json`、`sessions/`。

**FR-10 任务看板**  
仅当 `board=true`。五列：backlog / todo / running / done / failed。最多 200 张卡片。可选 5 段 cron；调度 tick 30s；会话轮询 5s；错过的 tick 跳过不补跑。

**FR-11 看板入口**  
克隆「新会话」按钮样式，放在市场/IM 工具行下方自己的一行，slot=start。

**FR-12 Git 图谱**  
仅当 `gitGraph=true`。空白会话 `conversation.input.dock` 胶囊。本地分支搜索与 `git switch --no-guess`。提交图 SVG（泳道、合并曲线、ref badge）。点外部或 Escape 关闭。无遥测。

**FR-13 向 Agent 宣告**  
仅当 `announceToAgent=true` 且至少还有一个表面打开。写入 systemPrompt section `xtz-ui:xiaotaozi` order 80。

**FR-14 Identity 路由**  
GET `/.well-known/xiaotaozi-dsh/identity/v1`：固定 `product/protocol/profile/ready`；可选 64 位 hex `instanceToken`（来自 `XIAOTAOZI_DSH_INSTANCE_TOKEN`）。非 GET 405。

**FR-15 中英语文案**  
设置 / 归档 / 看板 / Git 图谱走 Host locale。品牌名固定中文「小桃子DSH」。

## 6. 非功能需求（NFR）

**NFR-01 安全**  
全部 HTTP：loopback peer + loopback Host；跨站 `sec-fetch-site=cross-site` 拒绝；写操作必须同源 Origin。403 `loopback-only`。

**NFR-02 安全头**  
JSON 响应：`cache-control: no-store`、`x-content-type-options: nosniff`、`cross-origin-resource-policy: same-origin`、`referrer-policy: no-referrer`。

**NFR-03 体积限制**  
设置 POST 16 KiB；归档/看板 JSON 64 KiB。超限 413。

**NFR-04 路径安全**  
归档 sessionId 拒绝路径段 / 穿越。Git 图谱 sessionId 同样校验。`git switch` 拒绝非法分支名；冲突 / 被其他 worktree 占用 / 会覆盖已跟踪文件 → 409。

**NFR-05 兼容**  
钉 `@deepseek-ai/dsh-*` 0.1.1-rc.2。`@deepseek-ai/*` 不打进 `lib/`。无 runtime 依赖除 `@deepseek-ai/schemastery`。

**NFR-06 可观测**  
无遥测。错误以 HTTP JSON `{ ok:false, error }` 或客户端设置页错误文案返回。看板启动会话失败记入 execution.error。

**NFR-07 两套 home**  
`DSH_HOME` 指向沙箱或正式家目录；空字符串不当路径。

## 7. 流程

### 7.1 欢迎

打开 Web → 读 localStorage dismissed → 若有未关闭 notice → 弹框 → 确定写入 dismissed → 下一条或结束。

### 7.2 开关表面

设置页 GET `/api/dsh-xtz-ui/settings` → 拨动开关 POST patch → Host 写 settings.json → remount 对应路由/调度 → 客户端订阅刷新入口。

### 7.3 归档恢复 / 删除

设置 → 归档 → 列表（ghost id 会被 prune）→ 预览 → POST unarchive 或 delete / delete-all。

### 7.4 看板运行

创建卡片（默认 backlog）→ 移到 todo 或直接 run → Host 调 apiProxy 开会话 → 5s 轮询 session 结局 → done/failed。cron：30s tick，resume 间隔过大则 skipMissed。

### 7.5 Git 切换

空白会话胶囊 → status/branches/log → POST switch。非 git 仓库返回 `repo:false`，不报错。

## 8. 验收标准

1. 装上后侧栏品牌为小桃子；空白会话有 hero 标；桃色 token 生效。
2. Session log 与「打开配置文件」不可见。
3. 存在 dsh-providers 时只保留其「模型」页，官方重复导航隐藏。
4. 欢迎 id 关闭后刷新不再出现；清 localStorage 可再现。
5. 默认 archive/board/gitGraph 开、announce 关。关 archive 后设置无归档页、无 `/api/dsh-xtz-ui/archives`。
6. 归档只动 `$DSH_HOME`，不读硬编码 `~/.dsh`（当 `DSH_HOME` 已设）。
7. 看板五列、200 上限、cron 漏跑不补。
8. Git 图谱只切本地分支；有冲突时 409。
9. identity GET 200 且字段固定；LAN 非 loopback 403。
10. `pnpm --filter dsh-xtz-ui test` 通过。

## 9. 风险与待决

| 项 | 说明 |
| --- | --- |
| DOM 选择器脆弱 | 隐藏官方模型、工具行克隆依赖官方 class / 文案；官方改 DOM 会失效。 |
| 看板会话 API | 依赖 Host `apiProxy` / workspaceRegistry；缺失时创建/运行失败。 |
| Git 工作区级 switch | 切换影响整个工作区，不只当前会话。 |
| Identity 非归属证明 | 无合法 instanceToken 时只证明产品就绪。 |
| 规划：更多 notice | 队列机制已有，当前只有一条欢迎。 |
| 规划：未 shipped 开关 | `FEATURE_SHIPPED` 可关某功能，UI 显示即将推出。当前全 true。 |
| 不做：遥测、云同步、远程 Git 操作、右侧工作台。 |

## 10. 状态 / 版本 / 日期

| 字段 | 值 |
| --- | --- |
| 状态 | 已实现 / 维护中 |
| 插件版本 | 0.8.0 |
| Host | DeepSeek Harness 0.1.1-rc.2 |
| 文档版本 | 1.0 |
| 日期 | 2026-08-27 |
