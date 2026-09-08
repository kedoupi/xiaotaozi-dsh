# 产品功能跑通：CR 修复与验收执行计划

日期：2026-09-08。状态：计划已整理，尚未实施本计划中的修复。

## 1. 目标与代码基线

完成标准是用户能够完成下表中的操作，并且实际结果、持久化状态、界面反馈一致。代码检查、构建和单元测试是必要证据，不能替代用户流程验收。

- 基线：`a555ed24c7b0fd6c878e50f80f56c2b2c610a290`，包含 #211 的 Providers 启动修复。
- 当前执行工作区：`/Users/codepi/.codex/worktrees/d8bb/dsh-plugins`；计划分支：`codex/product-journey-cr-plan`。已从旧审查基线快进到最新 `origin/main`。
- 截至本次查询，仅 #206 仍为 Draft：企业微信控制器类型清理，涉及 `wecom-controller.ts` 和类型预算检查。它不是本计划的功能依赖；若后续合入，IM 批次须基于新的 main 复核。不得把旧分支存在视为还有代码需要直接合并。
- 版本来源仍为 `versions.json`；本计划不升级 Harness、不改变插件包布局、不在普通修复中加版本号。
- 环境及合并流程遵循 [conventions](../../conventions.md) 和 [workflow](../../workflow.md)。本文件是一次执行计划，不覆盖这些规范。

## 2. 已知问题与证据边界

| ID | 当前结论 | 下一步 |
| --- | --- | --- |
| F1 | #211 后 Web、插件中心、模型页可打开；DeepSeek 已配置状态与模型列表可显示 | 保留修复，补“保存—刷新—实际对话”，不能只验页面能打开 |
| F2 | 共用 HarnessClient 的只读 health 请求在当前沙箱返回 401；生产装配存在同一路径 | 先追踪实际渠道的完整生产调用链，区分内部 executor 与 HTTP 分支，再修复确实失败的路径；不能据此直接断言九渠道全部不可用 |
| F3 | 看板读旧 apiProxy；RC1 契约核对及隔离 BoardService 复现得到 session runner unavailable | 在生产装配下验证实际服务、运行和恢复；不要只重复缺少服务的 mock 测试 |
| F4 | 真实高级设置显示无法读取 Key 状态，输入框禁用，重试仍失败；真实 Gateway 复现注入/参数不匹配 | 修复 remote.credentials 注入、位置参数及返回值适配 |
| F5 | 插件中心第三方状态未知；真实 Gateway 复现 remote.pluginInventory 缺少注入 | 修复依赖、错误反馈、重试和安装后的状态刷新 |

上轮在 `38f9e95` 的 2,610 项测试与全部本地门禁通过，是旧基线证据；不能标成 `a555ed2` 或未来修复版本的通过记录。此前所有被启动故障挡住的页面验收仍待执行。

## 3. 执行顺序与交付批次

顺序：B0 → B1 → B2 → B3 → B4 → B5。每批先复现，再做最小修复，最后验证实际操作。一个批次出现互不相关的问题时分成小 PR；所有批次不要堆成一个大 PR。

### B0：建立当前版本的失败基线

**负责范围：** 验收记录、测试夹具和生产调用链定位；不改功能。

1. 固定执行 SHA，记录 hub SHA、监听进程及源码/构建是否一致；核对未合入 PR 和同时工作的文件。
2. 按下方 J01–J16 填写初始状态。先测已有功能，避免把历史 CR 猜测直接转为修改任务。
3. 为 IM 画出所测渠道的“生产装配 → 会话/控制 executor 或 HTTP → Host 服务 → 回复”调用链；为看板列出实际可取得的 Host 服务。出现反证时修订 F2/F3 结论。
4. 准备专属临时项目，含一个文本文件、一个图片、一个 HTML/CSS/JS 示例和一个小 Git 仓库。测试文件放在仓库外，禁止在产品源码目录执行“首次工作”。
5. 明确可使用的测试模型、测试机器人/收件会话、测试办公对象、可安装移除的测试插件。缺少外部测试资源时先完成契约与本地流程，具体条目标为 BLOCKED，不把外部操作暗中换成 mock 后标 PASS。

**输出：** 初始验收表、可复现的问题列表、夹具位置与清理归属、B1/B2 的实际调用链。**退出条件：** 每项已知问题都有当前证据或明确的待复现标记。

### B1：恢复模型配置、插件状态与高级设置

**负责范围：** `plugins/providers/src/client/host-api.ts` 及相关 UI；`plugins/xtz-ui/src/client/index.ts`、`advanced-runtime.ts`；`plugins/market/src/client/index.ts`、`plugin-inventory.ts`、`PluginCenter.tsx` 及各自测试。

- 保留 #211，核对 RC1 正式生成描述符中的方法名、参数个数、返回值和 Cordis 子服务注入。优先使用实际依赖类型；不得用类型断言把旧 API 包成新 API。
- Providers 完成模型发现、勾选持久化、切换服务商和请求失败恢复；用测试凭据验证保存/删除，不操作现有生产凭据。
- 高级设置修复凭据读取和写入；读取失败可重试，写失败保留草稿，正常保存后重开页面读取一致。只读环境 Key 继续正确禁用。
- Market 修复 inventory 依赖及刷新。状态获取失败应说明失败并可重试；安装/移除后同步列表与运行状态。
- 加真实 Cordis + RC1 Gateway/生成描述符的装配测试；网络可替换为受控 transport，服务权限、方法签名及结果解码必须真实。调用路径须被断言确实进入，防止早期失败造成假阳性。

**针对性检查：** providers、market、xtz-ui 的 typecheck/test/build；相关自包含安装验证。**真实验收：** J02–J05、J12。**退出条件：** 页面加载正常，模型能产生回复，设置读写正确，插件状态与 Host 一致。

### B2：恢复 IM 与看板执行链路

**负责范围：** `plugins/im/src/channels/shared/harness-client.ts`、`src/session-coordinator.ts`、`src/command-executor.ts`、受影响的 `src/host/channels/*/production.ts`；`plugins/xtz-ui/src/board/live.ts`、`runner.ts`、`service.ts` 及测试。

- 基于 B0 证据选择 RC1 支持的内部服务调用或受认证传输。不要关闭认证、添加旁路或启动第二个 Harness。
- 逐一核对健康检查、项目列表、会话创建、prompt、取消、事件订阅、交互答复和附件交付。健康检查通过不等于对话链路通过。
- 看板替换确实失效的旧服务适配，保持已加固的执行归属、迟到回调隔离、幂等结算和 dispose 行为；依据实际终态判断成功/失败，不能仅凭“不在运行”就显示成功。
- IM 首次绑定必须先确认目标目录；未确认/取消时不创建首个会话、不写文件。重连和重复事件不重复执行，跨机器人或跨会话不串消息。
- 外部消息仅发往明确指定的测试会话；若测试目标未指定，完成本地修复与可审查结果后再取得该具体目标。

**针对性检查：** IM、xtz-ui typecheck/test/build；生产装配契约测试与故障注入。**真实验收：** J06–J09。**退出条件：** 所有宣称支持的渠道完成验收或显式列明未验证；核心测试渠道能从接收消息到交付结果跑完，看板能运行、取消、重试及恢复。

### B3：工作台、归档和办公的完整操作

**负责范围：** `plugins/sidebar`、`plugins/wecom-office`、`plugins/xtz-ui/src/archive` / `workbench` / `git-graph` 与受影响 UI。

- 先执行 J10–J13，再按实际失败点修复；不预先安排大规模重构。
- Sidebar 覆盖编辑保存、外部变更、未保存切换、浮动/停靠/拖动、刷新恢复、文件预览与 Git/终端。移动操作可以保留草稿或明确阻止，但不能静默丢失。
- 归档、恢复、任务跳转和 Git 图必须对应当前会话/项目；错误和空状态不能冒充完成。
- WeCom Office 验证账号选择与失效、一个测试文档或待办的完整操作与读取核对；错误时不得清除另一个身份的授权。

**针对性检查：** 受影响包的 typecheck/test/build 与行为回归。**退出条件：** 操作结果可再次读取，工作目录和归属正确，失败可恢复，夹具可清理。

### B4：产品展示、导航与可用性验收

**负责范围：** 各插件客户端、设计系统约束、官网及对应用户文档。只修有实际证据的问题。

- 执行 J14–J16；主窗口 1440、1024、768、375 宽度，浅色/深色。先完成桌面主流程，再查窄屏，不用桌面通过代替移动布局结果。
- 检查中心/看板/会话互相切换、保留输入草稿、Esc 层级、焦点恢复、键盘可达、遮挡和滚动。关键按钮不能只存在于 DOM 而不可点击。
- 对比 UI 与实际状态：加载、失败、空、成功、连接中、已连接。不得吞异常后显示正常、把历史数据当实时状态或无限加载。
- 校对中英文标题、功能入口、README/官网截图和当前产品；有意改版按当前契约验收，不机械恢复旧布局。

**退出条件：** 核心按钮可操作，状态可信；无阻断操作的遮挡、溢出、焦点陷阱；截图标记 SHA、窗口尺寸和主题。

### B5：把本次问题变成可持续的回归门禁

**负责范围：** `scripts/`、`.github/workflows/check.yml`、实际需要的测试夹具；各插件继续自包含，不新增共享插件运行包。

- 保留既有 Host smoke，新增明确的客户端装配检查及真实浏览器 smoke：加载首页 → 打开中心 → 打开每个内置详情 → 返回会话；断言无加载失败/相关未捕获错误，不能只检查端口和 Host mount 日志。
- 本机浏览器用已可操作的 Chrome；CI 使用隔离 runner 的浏览器与临时 profile。真实浏览器自动化依赖如缺失，在这一批明确添加和锁定，不在应用运行时引入。
- B1/B2 的 RC1 契约测试纳入对应包门禁；外部服务用可控 transport。真实账号流程保留为明确的发布验收项，不在 CI 保存个人凭据。
- 完成全部工程门禁及 merged-main 的 J01–J16 复测。功能未变化的检查不重复堆跑；新失败、冲突或依赖变更才扩大验证。

**退出条件：** 本次 F1/F4/F5 同类错误能在合并前被拦住；核心场景有连续证据；未完成条目仍明确阻止“整体验收通过”。

## 4. 用户流程验收矩阵

执行时每行记录 PASS / FAIL / BLOCKED / NOT RUN；当前“待验”不表示已有缺陷。首测与最终复测保留两份结果，不覆盖失败历史。

| ID | 用户操作与预期结果 | 必测异常/恢复 | 当前状态 |
| --- | --- | --- | --- |
| J01 | 启动 → 认证页面 → 会话列表/输入框 → 刷新后可进入 | 冷启动、重启；无插件加载错误；正式/沙箱归属不混用 | 页面已复查通过；完整启动生命周期待验 |
| J02 | 添加测试服务商/Key → 发现并选择模型 → 保存 → 重开读取一致 | 只读 Key、错误 Key、发现失败、切换服务商不串草稿 | 列表展示通过；写入待验 |
| J03 | 新建会话 → 手动选模型 → 回复 → 停止 → 再发；智能选择分别验证 | 空候选、请求失败、重试；显示模型与实际路由一致 | 待验 |
| J04 | 插件中心 → 四个内置详情 → 返回列表/会话 | 详情缺失或失败不拖垮中心；会话草稿不丢 | 中心与模型详情通过；其余待验 |
| J05 | 测试插件安装 → 列表/详情/状态一致 → 移除 → 刷新核对 | 安装失败回滚；重试不重复提交；取消移除保留插件 | 状态未知已复现；其余待验 |
| J06 | 机器人接入 → 确认项目 → 第一条消息 → 正确项目会话 → 回复 | 未确认不工作；错误项目不可写；新/已有绑定分别验证 | 待生产链路复核 |
| J07 | IM 图片/文件输入 → 处理 → 文件或链接交付 | 断线重连、超时、重复消息、取消；无重复回复和串会话 | 待验 |
| J08 | 九渠道逐项：飞书、微信、钉钉、企微、QQ、Slack、Telegram、Discord、WhatsApp | 每渠道记录账号/会话、收发、重连状态；无测试账号逐项 BLOCKED | 待验，不由单渠道代替 |
| J09 | 看板新建 → 运行 → 打开会话 → 终态；取消后再运行；测试定时触发 | 旧回调不覆盖新执行；宿主重启；运行中改无关设置 | 旧服务路径失败；真实页面待验 |
| J10 | 浏览文件 → 编辑保存 → 重读；切标签/浮动/停靠/拖动 | 未保存保护、外部修改、只读、大文件与错误提示 | 待验 |
| J11 | 当前项目 Git diff/图谱与磁盘一致；终端执行 pwd 并关闭；HTML 资源正常 | 跨会话目录隔离、终端释放、预览失败不影响主界面 | 待验 |
| J12 | 高级设置保存/重置 → 重开值一致；测试搜索 Key 更新 | 保存失败保留草稿；只读状态；重试恢复 | 凭据读取失败已复现 |
| J13 | 归档/恢复测试会话；企微办公创建测试对象 → 读取核对 | 取消/授权失效/切换身份；对象归属正确 | 待验 |
| J14 | 新会话、中心、看板、设置间导航；键盘 Tab/Enter/Esc 完成关键操作 | 嵌套弹窗、焦点恢复、草稿保护 | 待验 |
| J15 | 1440/1024/768/375 + 浅/深主题；中英文关键页面 | 无关键内容裁切、控件遮挡、横向溢出、无限 loading | 待验 |
| J16 | 候选 CLI 安装/升级/停止/重启；官网安装说明和入口可用 | 保留额外插件；升级失败回滚；跨系统 CLI CI；文档链接 | 旧基线门禁通过，新候选待验 |

实验性 AI Office 仅在配置启用时另加完整流程；未启用要保持入口和文案一致。不得将实验功能通过视为九渠道通过。

每条证据至少包含：SHA、环境/运行进程、夹具标识、操作步骤、预期与实际结果、日志或截图、是否恢复/清理。外部账号只记录脱敏标识，不记录密钥或无关消息内容。

## 5. 可执行验证与环境

确定性测试在专用 worktree。沿用仓库的 Node/pnpm 版本和独立工作区安装方式；测试使用临时 HOME/DSH/XDG 及包管理配置。Git 夹具必须在仓库外，防止继承父仓库。

以下包装示例适用于本机已有依赖后的检查；保存为临时 `run-isolated.py`，不要将临时 home 入库。保留 PATH，但不复制用户配置或凭据。

```python
import os, sys, tempfile, subprocess, shutil
from pathlib import Path
root = Path(tempfile.mkdtemp(prefix="dsh-journey-check-", dir="/private/tmp"))
try:
    env = os.environ.copy()
    for key, folder in {
        "HOME": "home", "DSH_HOME": "dsh", "XDG_CONFIG_HOME": "config",
        "XDG_CACHE_HOME": "cache", "XDG_DATA_HOME": "data",
        "XDG_STATE_HOME": "state", "XDG_RUNTIME_DIR": "runtime",
        "TMPDIR": "tmp", "TMP": "tmp", "TEMP": "tmp",
    }.items():
        target = root / folder
        target.mkdir(mode=0o700, exist_ok=True)
        env[key] = str(target)
    env["npm_config_userconfig"] = str(root / "npmrc")
    env["npm_config_globalconfig"] = str(root / "global-npmrc")
    code = subprocess.call(sys.argv[1:], env=env)
finally:
    shutil.rmtree(root)
sys.exit(code)
```

本机示例显式使用 `/private/tmp`；其他系统选用对应的仓库外临时目录。本包装仅删除自身创建的目录；日志重定向到持久证据目录。

按批次替换 `dsh-providers` 为受影响包，避免不必要地全仓重复运行：

```sh
python3 /absolute/path/run-isolated.py pnpm --filter dsh-providers typecheck
python3 /absolute/path/run-isolated.py pnpm --filter dsh-providers test
python3 /absolute/path/run-isolated.py pnpm --filter dsh-providers build
```

最终候选的必要门禁：

```sh
python3 /absolute/path/run-isolated.py pnpm check
python3 /absolute/path/run-isolated.py pnpm check:build
python3 /absolute/path/run-isolated.py pnpm check:path
python3 /absolute/path/run-isolated.py pnpm check:cli
python3 /absolute/path/run-isolated.py pnpm --dir apps/website build
```

若当前 worktree 未安装依赖，先按同样隔离方式分别对根、`apps/cli`、`apps/website` 执行 `pnpm install --frozen-lockfile`。记录嵌套工具实际版本；不能把安装命令成功当成发布产物成功。

真实页面在 main hub 的现有 3081 验证；修复代码的预合并验收需按 workflow 明确交接 3081，再恢复 hub，不能直接在 hub 改代码。`smoke:sandbox` 只在符合其前置条件的独占环境/CI 执行，不在其他 checkout 已占用 3081 时运行。

## 6. 合并、发布与完成判据

- 每个修复在独立短期 topic worktree 中完成，PR 说明对应的 J/F 编号、复现、修复结果和剩余未验证项。合并前完成对应 required CI。
- 合并后按 workflow 完成包含关系检查、hub 快进与重启、受影响真实流程验收，再清理已合并且干净的分支/worktree。不要以“PR 已合并”关闭尚未通过的用户流程。
- 新增 P1 立即阻断该阶段；依项目规则选择小而明确的修复或回退。不得为赶进度关闭校验、放宽权限或静默隐藏功能。
- **核心流程恢复：** J01–J07、J09–J12 的适用测试完成，无阻断缺陷；没有测试资源的项目显式 BLOCKED，不能笼统宣布 IM 全部恢复。
- **整体验收通过：** J01–J16 均有适用证据，支持范围内不留未说明的 FAIL/BLOCKED/NOT RUN；无 P0/P1，无阻断主要操作的展示/交互问题。非阻断 P2 列问题、影响和后续处理。
- **用户获得修复：** 候选源码通过不等于已发布的 `xtz` 含有修复。若要交付正式用户，另按 tag/OIDC 发布流程形成新产品快照并验证安装/升级；本计划准备阶段不发布，也不把 sandbox 的 link 安装当作正式 Git tag 插件安装证明。

## 7. 开工入口

下一步执行 B0：在当前最新基线上建立 J01–J16 的首测记录，先补 F2/F3 的生产链路证据；B0 完成后，在 B1 专用工作树修复已现场确认的 F4/F5，并验证 #211 后的模型读写与实际对话。每批更新验收表后再进入下一批；未完成的真实流程不得被测试数量覆盖。


## 8. 本轮执行记录（2026-09-08）

执行期间已同步最新 `main` 的 `beccf0b`（#212）。B0–B5 的本地修复、工程门禁、RC1 契约测试、真实浏览器 smoke 和真实模型看板执行已完成；详细证据、限制和人工验收项见 [执行报告](2026-09-08-product-journey-cr-results.md)。真实外部账号、九渠道消息投递和完整工作台人工交互尚未验收，不能把本轮结果称为整体验收通过。

新增实测回归：首次启动两个模态窗口的 `inert` 冲突，以及模型详情绝对定位遮挡返回按钮。两项均已修复，并由真实浏览器的点击检查覆盖。落地分为 Host/Client RC1 契约修复与界面/浏览器门禁两个 PR，不改版本号。
