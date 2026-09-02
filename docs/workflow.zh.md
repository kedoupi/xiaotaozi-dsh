# 工作流

[English](workflow.md) | 中文

本文件是**步骤**（怎么做）。硬性规则：[AGENTS.md](../AGENTS.md)。规范：[conventions.zh.md](conventions.zh.md)。贡献入口：[CONTRIBUTING.zh.md](../CONTRIBUTING.zh.md)。改哪份文件：[README.zh.md](README.zh.md)。改规则改 `AGENTS.md`，改规范改 `conventions.zh.md`，改步骤改本文件。

## 开发环境

两套家目录。规范见 [conventions.zh.md](conventions.zh.md)「家目录」。测试走测试，正式走正式。

| | 正式 / 用户 | 沙箱 |
| --- | --- | --- |
| `DSH_HOME` | `~/.dsh` | `<仓库>/.dsh-home`（gitignore） |
| 命令 | `xtz start` | `pnpm dev`（`xtz --sandbox`）/ `link-plugin` |
| 端口 | **3080** | **3081** |

| 要做什么 | 用哪套 |
| --- | --- |
| 改插件源码、设置页、`link-plugin` | 独立主题 worktree。常态下在其中跑确定性门禁，不占 **3081** |
| 合并后主干 dogfood | 仓库根 hub 的 `.dsh-home`、`pnpm dev`、**3081** |
| 用户产品（`xtz start`） | 正式 `~/.dsh` **3080** |
| 用 `xtz status` / `doctor` 检查正式环境 | 正式 `~/.dsh` **3080**。绝不走 `.dsh-home` / 3081 |

3080 已被占用且不是 xtz 拉起的就不要抢。

`pnpm dev` 启动前只有在进程检查能证明 **3081** 的监听者就是本仓库标记过的沙箱 `dsh web --host 127.0.0.1 --port 3081`（由 `xtz --sandbox` 拉起）时才会停止它；未知或无法验证的监听者会让启动直接失败，绝不发信号。它也绝不释放 **3080**。`link-plugin` 只写 `.dsh-home`，不要挂进 `~/.dsh`。不要对官网默认跑 `dsh plugin add ./plugins/<slug>`。常态下，改动留在独立主题 worktree，仓库根 hub 的 `pnpm dev` 继续作为合并后主干 dogfood 运行。Topic 仅在显式有界 **3081** 移交期间运行它，验完归还端口。它会重编 `plugins/*/lib`，Host 的 `lib/index.js` 或 `cordis.patch.yml` 内容变了、且文件已经写回后才重启 `xtz --sandbox` 子进程。沙箱 `pnpm dev` 会设 `DSH_PLUGIN_TRACE=1`，每个插件 host 打一行一条的 trace（`dsh-im`、`dsh-wecom-office`、`dsh-xtz-ui`、`dsh-sidebar`、`dsh-providers`、`dsh-market`）；正式 `xtz start` 不打。沙箱要静音就设 `DSH_PLUGIN_TRACE=0`。沙箱意外退出会带退避重试，不当成 Host 重建。Client 的 `lib/client.js` 走 Host HMR（界面没更新就硬刷新）。`pnpm dev -- --once` 是以前那种只编一次。克隆后先 `pnpm install` 再构建或检查。`pnpm check-home`（即 `node scripts/doctor.mjs`）只诊断：列出并拒绝 `~/.dsh` 的危险链接，绝不自动修 profile。

仓库门禁：`pnpm check` 负责版本/文档/清单策略和类型/测试；`pnpm check:build` 额外构建并强制检查 `lib/`；`pnpm check:path` 证明隔离 Git path 安装；`pnpm check:cli` 检查独立 CLI workspace（用户产品）。它们都不发布。

沙箱要密钥：把 `~/.dsh/.credentials.yaml` 拷进 `.dsh-home/`。不要拷 `sessions/`、`storages/`。

### 沙箱持续监控

规范：[conventions.zh.md](conventions.zh.md)「家目录」（沙箱持续监控）。

用户说启动沙箱监控 / 持续监控 / dogfood watch 时：

保活是硬要求。Journey 中断 grep 不能代替保活。Hub 监控不实现产品修复。

1. 先确认这里是仓库根、干净、位于 `main` 的 hub，再把 `pnpm dev` 当后台命令启动（端口 **3081**），`timeout: 0`。3081 规则同上。不要再开一份沙箱。若 hub 标记过的沙箱已经健康，挂上监控即可，不要为了监控去重启它。`timeout: 0` **挡不住**包装器大约 10h 的 `max_runtime` 杀进程——那是 hang，不是「任务做完了」。
2. 会话期间**这几件事都盯**：
   - 死活：`pnpm dev` 退出、`sandbox web exited`、或 **3081** 没在听。Journey grep 看不见这些。
   - Journey：对 hub 的 `pnpm dev` 日志 `grep --line-buffered` `journey event=.*break=1`，以及 `.dsh-home/traces/YYYY-MM-DD.jsonl`。不是泛化 error grep。
   - `origin/main`：至少每 **10 分钟** `git fetch origin main`。只有 fetch 失败或 hub 落后时才唤醒。已经对齐不要刷屏。
3. `pnpm dev` 和这些监控是一套，会话期间保持。写完代码或合完 PR 不等于停监控，除非用户说停。
4. `pnpm dev` 退出了（崩溃、工具超时、父进程被杀、包装器 `max_runtime`）：**同一轮**就在这里重启。不要等用户来问沙箱为什么挂了。3081 上若还是 hub 标记过的沙箱子进程，可以由 `pnpm dev` 收回。未知或另一棵树的 3081 硬停止。绝不碰 **3080**。
5. 重启后：确认 **3081** 在 LISTEN，且 `xtz --sandbox` 还在。然后把 journey 监控改指到**新的** `pnpm dev` 日志。循环退出（`sandbox web exited`）不算沙箱在跑。若启动失败是产品缺陷（Node 钉死不对、坏合入导致 `apps/cli/lib` 陈旧），开 GitHub issue；继续保活；不要在 hub 监控会话里改产品代码。盯着一份已经死掉的日志不算在监控。
6. `origin/main` 超前时：hub 不在 `main` 或工作区脏，停下来说清楚。不要 `checkout`、reset、stash。若在干净的 `main` 上，`git pull --ff-only origin main`。然后保持或恢复 `pnpm dev`，确认 **3081** LISTEN，进程或日志变了就把监控改指过去，并把受影响的真实旅程走一遍。

中断就要动手。不要等用户再说发现问题 / 优化 / 帮我修。不要在这次 hub 会话里实现产品修复：

7. 看到 `journey event=… break=1` 或 JSONL 里 `"break": true`，去 `.dsh-home/traces/YYYY-MM-DD.jsonl` 读这条 msgid/stream 的事件（`inbound` → `stream_start` / `stream_fail` → `first_visible` → `tool` → `finish` / `abandon` / `ws_kick`）。
8. 定性。事实 / 推断 / 猜测分开说。
   - 我们的问题（流正文被藏、浮层被挡、工具接线、缺我们该做的产品）：先搜本仓库未关闭的 issue。没有重复就开一个 GitHub issue（类型 Bug 或 Feature），写清复现、commit sha、插件。让 `pnpm dev` 继续跑。把 issue URL 报出来。另一个修复会话使用独立主题 worktree 和绿 PR。单测绿了不算这次交接。
   - 平台限制（例如企微大约 5 分钟流上限）：说清楚。只有存在我们能做的便宜可见缓解时才开 issue。不要假装能抬上限。
   - 运维（正式 3080 和沙箱 3081 共用同一个企微机器人）：让用户 `xtz stop` 正式环境；不要抢 3080；不要开 issue。
   - 不要为「会话包装器杀了进程、没有产品证据」开 issue。已有未关闭 issue 就去评论，不要再开一条。
9. 汇报：结论、若有则给出 issue URL、哪一步没验。不要从 traces 里贴密钥或消息正文。
10. 没让提交就不要 commit / push。不要从 hub 监控会话里实现、revert 或开修复 PR。不要碰正式 home。不可逆、鉴权、公开 API 的改动仍然先停。

### 并行 checkout / worktree

规范：[conventions.zh.md](conventions.zh.md)「Git」和「家目录」。

一件事、一条短生命周期主题分支、一棵独立 Git worktree。仓库根 hub 只保留干净的 `main`，用于拉代码、审 PR、打 tag 和合并后的主干 dogfood；普通主题工作绝不在这里开发、测试或提交。不要发明 `develop` / `release/*` / `hotfix/*`。

开 `pnpm dev` 或 `pnpm smoke:sandbox` 之前：**3081** 空着，或者就是**本次 checkout** 标记过的沙箱。另一次 checkout 的沙箱是硬停止——先在那棵树里停掉。单元测试、`pnpm check`、CLI 假 home 测试不占 3081，可以并行。

每棵 worktree 自己 `pnpm install`（根目录；改 CLI 还要 `apps/cli`）。任何一棵都不要 `link:` 进 `~/.dsh`。

并行会话之间交接靠 git，不靠聊天记录：worktree 路径、分支（从 `origin/main` 切）、以及提交 / PR 状态。未提交的改动留在那棵树里，不要拷到第二棵再改。

#### 常态 trunk-based main dogfood 循环

这是稳态。Hub 是仓库根 checkout；主题 worktree 是改动合并前的落脚点。

1. 确认仓库根 hub 干净、在 `main`、与 `origin/main` 同步、且 **3081** 健康。
2. 拉 `origin`，从 `origin/main` 为短生命周期主题分支创建一棵独立 worktree。
3. 在任务 worktree 里开发并跑领域门禁，不要启动 `pnpm dev`。
4. 用当前 `main` 更新、重跑必需门禁、开 PR。
5. 必过的 GitHub CI 绿了再合。
6. 确认审过的主题提交头已包含在 `origin/main` 中。
7. 用 `git pull --ff-only` 把 hub 快进；绝不 reset 或覆盖活动工作。
8. 保持或恢复 hub 的 `pnpm dev`，确认 **3081** 在 LISTEN，进程或日志变了就把 journey 监控重新指过去。
9. 在合并后的 `main` 上把受影响的真实旅程走一遍。
10. 合并后发现 `main` 出问题，是独立主题 worktree 中**修复**会话的正在进行的工作，不是 hub 监控在原位实现。Hub 监控开 GitHub issue（规范：沙箱持续监控）。修复会话通过绿 PR：fix-forward 仅限小而确定的修复；安全、数据丢失、启动、范围广或原因不明的回归优先按同一审查路径 revert。`main` 不得在已知坏掉的状态下继续推进不相关的工作。
11. 删掉已合并的本地/远端主题分支，只有干净的 task worktree 才一并删掉。绝不强制清理；脏 worktree 必须保留并报告，直到它的负责人提交或移走工作。

合完 PR 不等于停沙箱监控。Hub 的 `pnpm dev`、journey-break 监控和每 10 分钟的 `origin/main` 检查会一直跑到用户说停；包装器死了或 **3081** 监听者陈旧就在同一轮重启，别留给别人发现。

#### 有界 3081 移交

针对合并前渲染 UI QA、真实旅程验收、不可逆迁移、鉴权、对外副作用或同级高风险：显式停掉 hub 沙箱，把主题沙箱起在 **3081**，只做这次验收、不夹带无关开发，验完再停掉，回到 hub main 沙箱，确认 **3081** 和监控正常，然后继续。绝不开新端口，绝不抢 **3081**。不要把它当成默认插件开发路径。

## CLI 开发

`apps/cli/` 是独立 workspace；不要在根 `pnpm install` 中假设它会一起安装。使用与 DeepSeek Harness 一致的 Node（`^22.19.0 || >=24.0.0`，下限是 `apps/cli/.node-version` / `versions.json` 的 `node`）和固定的 DSH `0.1.1-rc.2`。修改后运行：

```bash
cd apps/cli
pnpm install
pnpm check
node lib/cli.js --help
node lib/cli.js version --json
```

开发时优先 `node lib/cli.js`，不要一上来就 `pnpm link --global`。`pnpm check` 使用假 home。要检查真实正式环境时运行 `node lib/cli.js doctor`；`~/.dsh` 不干净时报告为红是预期行为。沙箱 CLI 调试属于渲染 / 真实环境验收：执行显式有界 **3081** 移交，在主题 worktree 中运行 `pnpm dev`（它会执行 `node apps/cli/lib/cli.js --sandbox start --foreground`），验完恢复干净主干 hub 沙箱；不要把本仓库 `link:` 进 `~/.dsh`。

用户安装用 `apps/cli/scripts/install.sh`、`npm install -g xiaotaozi-dsh-cli` 或 `bun add -g xiaotaozi-dsh-cli`。这些命令要求 `PATH` 上已经是 Node.js `^22.19.0 || >=24`；不得代装或切换 Node，也不得启动 DSH。

开放命令与 [conventions.zh.md](conventions.zh.md)「`xtz` CLI」一致：帮助/版本、`start`/`web`、`stop`、`restart`、`open`、`status`、`config path`、`doctor`。第一次 `xtz start` 种正式 web 和 `plugins/` 下每一个自研插件。额外（第三方）插件走应用内市场（或对上游规格跑 `dsh plugin --profile web add`）。正式工作只允许 `~/.dsh`；默认端口 **3080**。端口被占用或监听者身份未验证时，绝不能改用 3081。

`start`/`stop`/`restart` 只管理 `$DSH_HOME/xiaotaozi-xtz-web.pid`。3080 被占用且不是 xtz 拉起的就拒绝。`init`、`plugin`、`run`/`ask`、`config dump`/`defaults`、`update` 仍安全拒绝。假 home 测试覆盖 start/stop，不碰真实正式服务。

## 向 Agent 下指令

第一句点名 **产品 + 环境 + 动作**。环境词只用：`沙箱`、`正式`、`CLI`。规范：[conventions.zh.md](conventions.zh.md)「用户」。不要把 `发行版壳` 当新工作。

```text
在 <环境> 里，对 <产品> 做 <动作>。[不要动 <禁区>。]
```

| 你想做的 | 对 AI 说 |
| --- | --- |
| 改某个插件 | 在独立主题 worktree 改 `dsh-im` 设置页并跑门禁。合并后在 hub 验；必须合并前 QA 时走显式有界 3081 移交。不要碰 `~/.dsh`。 |
| 新插件 | 按 dsh-plugin 在沙箱创建 `dsh-foo`（host），装进 dsh-dev，不要装进正式 home。 |
| 发给用户 | 沙箱已验过。额外插件走 `dsh plugin --profile web add`。不要 `link:` 正式 home。 |
| 复活 Desktop / `.dmg` / pack | 拒绝。指向 `xtz`。历史在 `git show archive/desktop`。 |
| 测用户第一次打开 | `xtz stop`，挪走 `~/.dsh/profiles/web`，跑 `xtz start`。不要 `rm -rf ~/.dsh`。 |
| 看像不像用户机器 | 用支持的 Node（`^22.19.0 || >=24`）跑 `node lib/cli.js doctor`。doctor 红先当环境问题。 |
| 改 CLI | 在独立主题 worktree 的 `apps/cli` 使用 `.node-version`，假 home 跑 `pnpm check`。需要沙箱时只走显式有界 3081 移交，不要 `link:` 正式 home。 |
| 发 `xtz` | 按 [发一枪产品快照](#发一枪产品快照)。打 tag `vX.Y.Z`，GitHub Actions 发 `xiaotaozi-dsh-cli`。不要在笔记本上 `npm publish`。 |
| 并行 checkout | 一件事、一条主题分支、一棵独立 worktree。3081 已是另一棵树的沙箱就不要再开 `pnpm dev`。 |
| 启动沙箱监控 | 在仓库根干净 `main` hub 保活 `pnpm dev`（**3081** 在听）、盯 journey 中断、每 10 分钟看 `origin/main`。进程死了（含包装器约 10h 杀掉）是 hang：同一轮重启并确认 **3081** LISTEN。产品 / 旅程问题：开 GitHub issue，不要在 hub 里实现。Journey grep 不能代替保活。不要碰 `~/.dsh`。 |

禁止说法（应拒绝或改写）：从本仓库把插件装进 `~/.dsh`；复活 Desktop / pack / 公证；大家都合并到 `.dsh`；删掉整个 `~/.dsh` 再测 CLI 安装；加 Git Flow 常驻分支（`develop` / `release/*` / `hotfix/*`）；在 3081 上再开一份沙箱。

新对话可先声明：

```text
按仓库 AGENTS / conventions：普通主题工作在独立 worktree 中完成且不占 3081；合并后主干 dogfood 拥有沙箱 3081；正式 ~/.dsh 3080 的默认种子是第一次 xtz start。下面这件事是：……
```

## 重建正式 home

不要 `rm -rf ~/.dsh`（密钥和 session 在里面）。

1. `xtz stop`。
2. 可选：把 `~/.dsh/.credentials.yaml` 拷到 `~/.dsh` 以外。
3. `mv ~/.dsh/profiles/web ~/.dsh/profiles/web.bak-dirty`
4. `xtz start`
5. 用支持的 Node（`^22.19.0 || >=24`）跑 `dsh plugin --profile web list` 和 `node lib/cli.js doctor`。

期望第一次 `xtz start` 种上默认 Git / npm 依赖，额外插件走 `dsh plugin --profile web add`。缺插件是环境问题，不是从本仓库 `dsh plugin add` 的理由。

## 发一枪产品快照

用户产品是 `xtz`（`xiaotaozi-dsh-cli`）。版本规则：[conventions.zh.md](conventions.zh.md)「版本」。活号是 `versions.json` 的 `cliApp`。bun/pnpm/`install.sh` 只拉这个包。不做 Homebrew。自研插件仍走 Git path / 第一次 `xtz start`，不要在同一步发到 npm。不要等 `.dmg` 或签名 pack。

`.github/workflows/publish.yml` 在推送 tag `vX.Y.Z` 时用 npm Trusted Publisher（OIDC）发包。不要在笔记本上 `npm publish`。不要设置 `NODE_AUTH_TOKEN`。

### 发布提交

1. `pnpm check`、`pnpm check:build`、`pnpm check:path`、`pnpm check:cli`。`pnpm check-home` 须显示正式 home 未挂本仓。
2. 用 `node lib/cli.js doctor` 看正式 `~/.dsh`。home 没跑或没种时 `doctor` 红是环境脏，不要因此放宽 CLI 检查。tag 还没出现在 GitHub 上时，不要按 `#vNEW` 去重种。
3. 一次发布提交：把 `cliApp` 和 `apps/cli/package.json` 的 `version` 改成新号；每条 `DEFAULT_PLUGINS` 钉到 `#vX.Y.Z&path:plugins/<slug>`；写 `CHANGELOG.md`。`bin.xtz` 保持 `lib/cli.js`，`repository.url` 保持本 GitHub 仓库。
4. 合进 `main`，在该提交上打 tag `vX.Y.Z`，推 tag。npm 认的是这个 tag 提交上的工作流**文件名** `publish.yml`。
5. tag 任务把包发到 npm 之后，给**同一个 tag**建 GitHub Release，并标成 Latest。`publish.yml` 只跑 `npm publish`（`contents: read`），**不会**建 Release。漏了这一步，仓库 Releases 页会停在旧 tag（v0.2.1、v0.2.2 已发 npm 但没有 Release 页，GitHub 仍显示 v0.2.0 为 Latest）。例如：`gh release create vX.Y.Z --latest --title vX.Y.Z`，说明从该版本的 `CHANGELOG.md` 小节来。不要把笔记本打的 `.tgz` 当成用户安装物；用户装的是 npm。

### Trusted Publisher 表单

规范：[conventions.zh.md](conventions.zh.md)「版本」。文件名只要 `publish.yml`。Environment 留空。勾选允许 `npm publish`。保存时 npm 不校验对错。

### 验证和真发

- `workflow_dispatch` 且 `dry_run=true` 只打包，**不能**证明 OIDC（没有 token 交换）。
- 该版本**已经在 npm 上**：不要覆盖发。升 PATCH 或 MINOR，再打 tag。
- tag 任务在版本出现在 npm **之前**失败：重跑这次 tag 的 workflow，不要再升版本。
- Trusted Publisher 配了但仍 `ENEEDAUTH`：通常是假的 `NODE_AUTH_TOKEN` 或 npm 10。OIDC 交换 **404** `package not found` 表示表单和这次运行对不上（文件名错、多填了 environment、没勾允许 `npm publish`）。
- OIDC 发成功时 `_npmUser` 是 `GitHub Actions <npm-oidc-no-reply@github.com>`，并带 provenance。

### 发布 job（不要回退）

- 工作流 **和** job 都要 `permissions: id-token: write`。
- 不要给 `actions/setup-node` 传 `registry-url`（它会写入 `_authToken=${NODE_AUTH_TOKEN}`，npm 就跳过 OIDC）。
- `npm publish` 前 `unset NODE_AUTH_TOKEN`。空字符串不等于 unset。
- Node `22.19.0` 之后执行 `npm install -g 'npm@^11.5.1'`。不要 `npm@latest`（npm 12 要求的 Node 比我们钉的高）。

## 创建

官方「第一个插件」/ Cordis 教程默认在 harness checkout 里干活。这里不要走那条路。差异：[harness-plugin.zh.md](harness-plugin.zh.md)。

1. 默认 `--kind host`。只有用户明确要设置页、Slot、主题时才用 `mixed`。
2. 不要手建目录，不要改 `templates/` 来做新插件。自研放 `plugins/`。第三方是 `plugins/market` 里的目录行，不要再放一棵源码树。

```bash
pnpm new <slug>                 # 或 pnpm new <slug> --kind mixed
pnpm install
```

3. 立刻删掉模板里的 `greet` 样例，换成这个插件真正要做的事。纯逻辑放在不依赖 Cordis 的文件里，测试只测那些文件。不要把模型 / IM / 企业微信办公 / 市场 / 右侧文件-Git-终端面板塞进 `xtz-ui`；那个插件是壳加上归档、任务看板和 Git 图谱。右侧面板是 `plugins/sidebar`。DSH `Button` 默认是 `ghost`；危险按钮的 hover 必须压过 `.ghost:hover`（把 class 写两遍）。`Input` 的焦点在外壳的 `:focus-within`，不在内部控件上。
4. 可调参数走导出的 Schemastery `Config`。
5. 插件如果会接入 / 绑定 / 添加账号，然后创建会话、写文件或做其他落盘工作：遵守 [conventions.zh.md](conventions.zh.md)「接入与第一次真实工作」。`pnpm dev` 下的 `process.cwd()` 是本仓库。第一次真实工作要等用户确认目标；绑定后的选择器不能从插件仓库 cwd 打开；测试必须覆盖这场第一次动作的竞态。
6. 写完：

```bash
pnpm --filter dsh-<slug> test
pnpm --filter dsh-<slug> build
pnpm check
pnpm check:build                # 强制存在并检查 lib/ 产物（等价展开：pnpm build + check-manifest --require-lib；path 安装由 check:path 证明）
```

7. 按下面「安装」挂到沙箱里的 `dsh-dev`，确认 `dump-config` 有这一层再宣布创建完成。

新插件要带英文 `README.md` 和中文 `README.zh.md`，两边一起维护。

8. 自研 README 头图。规范：[plugins/xtz-ui/docs/brand.zh.md](../plugins/xtz-ui/docs/brand.zh.md) §7。一只 3D 小桃子加一件能说明职责的道具，和现有六张同一套。不要用产品主标 APP_ICON，不要用旧扁平符号，不要把 `/ip-as-logo` 的 32×32 探头规格套过来。只给 `plugins/` 里我们拥有的包画；市场目录行不要画小桃子。

   这些文件都要写：

   | 文件 | 内容 |
   | --- | --- |
   | `plugins/<slug>/docs/ip-3d.jpg` | 正方形 JPEG 原图 |
   | `plugins/<slug>/README.md` 和 `README.zh.md` | 标题下 160×160：`<img src="docs/ip-3d.jpg" …>` |
   | 根目录 `README.md` 和 `README.zh.md` | 头图行 72×72：`<a href="plugins/<slug>"><img src="plugins/<slug>/docs/ip-3d.jpg" …></a>` |
   | `apps/website/public/ip-<slug>.png` | 同一张原图转 PNG（`sips -s format png`） |

   原地覆盖已有 `ip-3d.jpg` 时，GitHub README 可能仍显示旧图（按路径缓存）。要立刻刷新就换文件名。新插件路径本身是新的，没有这个问题。

## 上架第三方

规范见 [conventions.zh.md](conventions.zh.md)「市场目录」。第三方插件是 `plugins/market` 里的一行。`plugins/` 是自研，进默认种子。不要加 `externals/`。

### 先决定

它是 DeepSeek Harness 插件、许可证宽松、我们会在市场里**可选安装**，才上架。不要拷进 `plugins/`，除非我们要接管并默认安装。

不要 vendor `deepseek-harness`、非插件，或和自研抢职责的第二套实现。

### 第一次上架

1. 记下上游 URL、许可证、包名、安装规格。
2. 在 `plugins/market/src/catalog.ts` 的 `MARKET_PLUGINS` 加一行（`id`、`name`、`version`、`summary`、`packageName`、`installSpec`）。
3. `installSpec` 是上游 Git 或 npm。不要 `link:`、`file:`、`#path:externals/`。
4. 不要把作者的仓库克隆进本仓。

### 以后更新

上游发版后改目录里的 `version` / `summary` / `installSpec`。

### 收成自研（少见）

只有我们会二次开发**并且**默认安装时：`pnpm new <slug>`，port `src`，按门禁收库（四名、`neverBundle`、host rc、不要 value-import `dsh-tools`、`NOTICE` + 上游 `LICENSE`、双语 README），删掉市场那一行，加入 `DEFAULT_PLUGINS`，并补自研 README 头图（创建第 8 步）。只对 `plugins/<slug>` 跑 `link-plugin`。

## 安装

先构建。Profile 加载的是 `lib/`，不是 `src/`。

`link-plugin` 写当前 checkout 中已 gitignore 的 `.dsh-home`，不占端口。`pnpm dev` 只在干净主干 hub 或显式有界 **3081** 移交期间使用这套沙箱 home。不要把本仓库插件挂进 `~/.dsh`。

```bash
pnpm --filter dsh-<slug> build
node scripts/link-plugin.mjs --profile dsh-dev <slug>
```

- 只验证能不能挂上、进程能不能起来：用 `dsh-dev`（仍在 `.dsh-home` 下）。
- 要在 Web UI 里点、要让模型调工具：合并后在 hub 沙箱验。必须合并前验时，按上面的有界 **3081** 移交，用 `--profile web`；官网 `~/.dsh`（3080）不要动。
- `link-plugin` 失败就停，不要假装装上了。
- 改完源码在主题 worktree 构建并跑确定性门禁，hub 的 `pnpm dev` 继续作为合并后主干 dogfood。执行有界移交时，topic 的 `pnpm dev` 监视插件、重编 `lib`，Host 产物变了才在 3081 重启 `xtz --sandbox`；验完停掉并归还 **3081**。只要编一次用 `pnpm dev -- --once`。只看某个插件用 `pnpm dev -- --filter im`。
- 需要绕过构建时用 `pnpm dev -- --once --patch <file>`，patch 里的 `name` 必须是绝对路径。
- 沙箱要调模型的话，可以把 `~/.dsh/.credentials.yaml` 拷进 `.dsh-home/`。不要拷 `sessions/` 或 `storages/`。

插件会接入再做落盘工作时，沙箱验收（规范：[conventions.zh.md](conventions.zh.md)「接入与第一次真实工作」）：

1. 先执行有界 **3081** 移交，再让 topic 的 `pnpm dev` 只在本次验收期间运行。沙箱 trace 保持开（每个插件 host 都是 `DSH_PLUGIN_TRACE=1`；正式 `xtz start` 不打）。
2. 按用户路径接入 / 绑定，再确认目标。验收 `dsh-im` 时，只能选择已在 `workspace.list` 中的项目，不得浏览目录。选择器不得默认落到本仓库，取消不得确认 cwd。
3. 做**第一次**真实动作（第一条 IM 消息、第一次写入、第一个会话）。
4. 确认工作只出现在所选目标里，而不是本仓库 / `process.cwd()`。后面几条落对了，不能原谅第一条落错。
5. `pnpm --filter dsh-<slug> test` 绿了不算这次验收。沙箱里没看着第一次动作落点，不要宣称插件验过。

多个插件：

```bash
for d in plugins/*/; do node scripts/link-plugin.mjs --profile dsh-dev "$(basename "$d")"; done
```

开发者分发（有 Node 的人）：每个插件单独 `pnpm --filter dsh-<slug> publish` 或 `pack`。Git 安装用 `github:kedoupi/xiaotaozi-dsh#path:plugins/<slug>`（漂浮）或 `#vX.Y.Z&path:plugins/<slug>`（产品 tag）。不要把仓库根当一个包装。用户默认走第一次 `xtz start`，额外插件走应用内市场。

## 提交

1. `pnpm check`，相关插件 `build` 过，且 `pnpm check-home` 通过（`~/.dsh` 未挂本仓）。
2. `git status` / `git diff` / `git log -5`。没有 `.git` 就先 `git init`，不要把 `node_modules`、`lib/`、`*.tgz`、`.dsh-home/`、`$DSH_HOME` 加进去。不要加 `externals/` 目录。
3. 一次提交只做一件事。能按插件切开就切开。普通提交不要改 `cliApp` 或插件 `package.json` 的 version。日常改动落在主题分支自己的独立 worktree。向 `main` 开 PR，必跑 CI 通过后才合并。不要加 Git Flow 常驻分支。
4. 标题：

```text
<type>(<scope>): <imperative summary>
```

`type`：`feat` `fix` `refactor` `docs` `chore` `test`。`scope` 用插件 slug，仓库级改动用 `repo`。
5. 用 HEREDOC 写 message。不要 `git commit --no-verify`，不要 `git push`，除非用户明确要求。
6. 提交后 `git status` 确认干净或只剩有意留下的文件。

## 优化

功能跑通后再做。不要一边加功能一边抽公共层。

- 这个能力能不能单独 `dsh plugin add`？不能就并进现有插件。不要抽共享的 `packages/` workspace，path 安装带不走。
- 没有 Web UI 就保持 Host-only，删掉空的 `src/client`。
- 模板残留（`greet`、用不到的 `Config` 字段、`inject`、依赖）删掉。
- `lib/index.js` 保持很小，不能出现 `node_modules` 打包痕迹，不能出现 `@deepseek-ai/dsh-tools`。
- 测试继续只覆盖纯函数。不要为了覆盖率去 mock 整个 harness。

做完再跑 `pnpm check`。要提交就走「提交」。
