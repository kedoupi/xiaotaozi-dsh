# 产品流程 CR 执行结果 — 2026-09-08

本轮修复了 6 处已复现问题。自动化验证通过，包括真实模型完成看板任务；外部 IM/办公账号与完整人工操作仍待验收。

执行基线为 `beccf0b`（同步 #211 的启动修复及 #212 的契约文档）。修改不包含版本升级。测试使用 Node `24.18.0`、pnpm `11.22.0`、Harness `0.1.2-rc.1`；Git path 安装探针自身使用 pnpm `12.3.4`。常规测试隔离 HOME、DSH_HOME 与 XDG 目录。真实浏览器使用 Playwright 启动独立 Chrome，未复用个人浏览器配置（Browser plugin not available）。

## 修复与证据

| 问题 | 实现 | 验证 |
| --- | --- | --- |
| 高级设置无法读取/保存搜索 Key | 注入 `remote.credentials`；改用 RC1 位置参数并正确包装结果 | 实际 Cordis/Gateway 契约、读写失败测试、浏览器读取状态；只读环境 Key 保持只读 |
| 插件状态未知且无法恢复 | 注入 `remote.pluginInventory`，添加失败提示、重试及操作后刷新 | 实际 Gateway、交互测试、浏览器刷新 |
| IM 使用失效的旧请求/事件地址 | 九渠道生产装配共享进程内 Host transport；使用 RC1 Gateway、Session inspect、Remote event stream；保留消息归属逻辑 | 健康/项目/会话/prompt/历史契约、完整文本回复、提问及审批回传、错误会话响应拒绝、取消后的订阅释放 |
| 任务板取不到 apiProxy，停止即误报成功 | 使用当前 `sessionController`；根据持久化 turn/end 区分成功、失败与中断，未开跑仍为 pending | 既有生命周期/并发回归、RC1 契约、真实模型任务完成并重读结果 |
| 首次启动关闭引导后主界面不可点击 | 欢迎窗使用原生 modal dialog，避免覆盖 Harness onboarding 保存的 root.inert 状态 | 干净 sandbox/浏览器完成两层引导后，真实点击插件中心；不使用 force click |
| 模型详情覆盖插件中心返回按钮 | 模型容器改为正常文档流布局 | 加载完成后的模型详情、返回点击、375/768/1024/1440 宽度，明暗主题共 8 组 |

## 自动化结果

| 检查 | 结果 |
| --- | --- |
| `pnpm check` | PASS：2,336 项插件测试、100 项脚本测试；类型/清单/UI 约束通过 |
| `pnpm check:runtime` | PASS：8 项使用已安装 Cordis、Gateway 和 RC1 生成描述符的契约测试 |
| `pnpm check:build` | PASS：6 个插件构建与 lib/ 检查 |
| `pnpm check:path` | PASS：6 个插件独立 Git path 安装/构建 |
| `pnpm check:cli` | PASS：177 项测试，假 HOME；未操作正式 ~/.dsh |
| `pnpm --dir apps/website build` | PASS：站点构建、页面渲染、sitemap |
| `DSH_SMOKE_BROWSER=1 pnpm smoke:sandbox` | PASS：冷启动、6 个 Host 插件、doctor、真实客户端装配、四个内置详情、返回与 Esc、状态刷新、高级设置、8 组宽度/主题 |
| 加 `DSH_SMOKE_MODEL=1` 的同一 smoke | PASS：显式临时工作区 → 创建看板任务 → 运行 → 真实模型回复 `CR_SMOKE_OK` → 读取 assistant 记录核对 → 重读看板 succeeded |

合计 **2,621 项自动化测试通过**，另有浏览器与真实模型 smoke。没有把 mock 的渠道投递算作真实机器人验收。CI 新增 `check:runtime` 和无个人凭据的浏览器 smoke，失败时保存截图；真实模型 smoke 为显式选择，CI 不调用付费模型。

首次浏览器运行确实失败：先发现引导遮挡，进一步复现 inert 残留；随后发现模型详情覆盖返回。修复后重跑通过。最初截图停留在加载阶段，已加强为等待真实模型列表后重新生成截图。真实模型校验还纠正了测试读取历史时超出持久化游标的问题，最终只检查 assistant 记录中的回复，避免把用户提示词误当成模型输出。

## 人工验收清单

| 计划项 | 已完成的自动/真实验证 | 仍需人工确认 |
| --- | --- | --- |
| J01 启动 | 隔离冷启动、认证、首次引导、主界面可点、停止清理 | 日常数据下重启、刷新恢复 |
| J02 模型配置 | 配置列表、环境 Key 只读、发现/勾选/凭据读写回归 | 自有测试 Key 保存、删除、重开一致性 |
| J03 会话回复 | 看板创建的真实会话与模型回复已核对 | 手动选模型、智能选模型、停止后再发 |
| J04 插件中心 | 四个内置详情、模型数据就绪、返回与 Esc | 有输入草稿时切换中心/会话 |
| J05 安装移除 | 状态读取/重试、安装回滚与重试自动回归 | 指定第三方测试插件实际安装、移除 |
| J06–J07 IM | 生产装配、协议、归属、首工作确认与附件相关自动回归 | 真实绑定 → 选目录 → 消息/图片/文件 → 正确交付 |
| J08 九渠道 | 共用 transport 装配与既有渠道回归通过 | 飞书、微信、钉钉、企微、QQ、Slack、Telegram、Discord、WhatsApp 均未真实收发；逐渠道待验 |
| J09 看板 | 真实任务成功；取消/失败/重试/旧回调/持久化自动回归 | 页面取消、再次运行、定时任务及宿主重启后的恢复 |
| J10–J11 工作台 | 127 项 sidebar 测试，含文件边界、草稿移动保护、PTY 和 Git 子进程 | 编辑保存/重读、浮动停靠/拖动、终端 pwd、预览本地资源、Git 图 |
| J12 高级设置 | 真实元数据读取、错误恢复与保存/草稿回归 | 用测试值保存、重置、重开核对；只读 Key 无需修改 |
| J13 归档与办公 | 归档回归及 104 项办公测试 | 日常会话归档/恢复；测试办公对象创建、读取、切换身份 |
| J14–J16 展示 | 浏览器点击、焦点返回/Esc、4 宽度×2主题截图；中英文文案回归；官网构建 | 连续操作与拖拽体感、中英文完整页面、实际发布站点与截图对照 |

外部机器人、办公对象和第三方插件没有指定测试资源，所以未对外发消息、创建办公对象或安装额外插件。上述人工项仍是发布验收项。

## 证据与复测

本地证据目录：`/Users/codepi/.codex/visualizations/2026/09/08/01a07eba-a804-7fa3-9420-cc20315edcb5/cr-execution/`。其中 `check-final.log`、`path-final.log`、`runtime-final.log`、`cli.log`、`website.log` 和 `browser-smoke.log` 为对应结果；`screenshots/` 含 16 张加载完成的列表/模型详情截图。日志中的 launch token 已脱敏。

同目录 `manual-project/` 是专属人工测试项目：文本文件、一个待查看的 Git diff、HTML/CSS/JS 预览；可添加为工作区，避免让首次工作落到产品源码目录。

常规复测：安装 root 与 apps/cli 依赖后运行 `pnpm check`、`pnpm check:runtime`。真实浏览器 smoke 必须先按 `docs/workflow.md` 的 bounded 3081 transfer 停止 main hub，确保本 checkout 没有 `.dsh-home` 且 3081 空闲，再运行 `DSH_SMOKE_BROWSER=1 pnpm smoke:sandbox`（macOS 可加 `DSH_SMOKE_BROWSER_CHANNEL=chrome`）。真实模型检查另加 `DSH_SMOKE_MODEL=1`，只在已配置可用测试模型时运行。每次结束立即恢复 main hub。

本轮 topic smoke 的临时 `.dsh-home` 与模型项目均已清理，每次切换后均恢复 main 的 3081 和原日志上的 journey watch。正式 `~/.dsh` 与 3080 未被启动、停止或修改。
