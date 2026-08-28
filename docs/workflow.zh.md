# 工作流

[English](workflow.md) | 中文

硬性规则：[AGENTS.md](../AGENTS.md)。规范：[conventions.zh.md](conventions.zh.md)。这里只写步骤。改规则改 `AGENTS.md`，改规范改 `conventions.zh.md`，改步骤改本文件。

## 开发环境

两套家目录。规范见 [conventions.zh.md](conventions.zh.md)「家目录」。测试走测试，正式走正式。

| | 正式 / 用户 | 沙箱 |
| --- | --- | --- |
| `DSH_HOME` | `~/.dsh` | `<仓库>/.dsh-home`（gitignore） |
| 命令 | `xtz start` | `pnpm dev`（`xtz --sandbox`）/ `link-plugin` |
| 端口 | **3080** | **3081** |

| 要做什么 | 用哪套 |
| --- | --- |
| 改插件源码、设置页、`link-plugin` | 沙箱 **3081**。`pnpm dev` 会监视 `plugins/*/src`、重编 `lib/`，Host 代码变了才重启 :3081 |
| 用户产品（`xtz start`） | 正式 `~/.dsh` **3080** |
| 用 `xtz status` / `doctor` 检查正式环境 | 正式 `~/.dsh` **3080**。绝不走 `.dsh-home` / 3081 |

3080 已被占用且不是 xtz 拉起的就不要抢。

`pnpm dev` 启动前只有在进程检查能证明 **3081** 的监听者就是本仓库标记过的沙箱 `dsh web --host 127.0.0.1 --port 3081`（由 `xtz --sandbox` 拉起）时才会停止它；未知或无法验证的监听者会让启动直接失败，绝不发信号。它也绝不释放 **3080**。`link-plugin` 只写 `.dsh-home`，不要挂进 `~/.dsh`。不要对官网默认跑 `dsh plugin add ./plugins/<slug>`。改源码时让 `pnpm dev` 一直跑：它会重编 `plugins/*/lib`，Host 的 `lib/index.js` 或 `cordis.patch.yml` 内容变了、且文件已经写回后才重启 `xtz --sandbox` 子进程。沙箱 `pnpm dev` 会设 `DSH_PLUGIN_TRACE=1`，每个插件 host 打一行一条的 trace（`dsh-im`、`dsh-wecom-office`、`dsh-xtz-ui`、`dsh-sidebar`、`dsh-providers`、`dsh-market`）；正式 `xtz start` 不打。沙箱要静音就设 `DSH_PLUGIN_TRACE=0`。沙箱意外退出会带退避重试，不当成 Host 重建。Client 的 `lib/client.js` 走 Host HMR（界面没更新就硬刷新）。`pnpm dev -- --once` 是以前那种只编一次。克隆后先 `pnpm install` 再构建或检查。`pnpm check-home`（即 `node scripts/doctor.mjs`）只诊断：列出并拒绝 `~/.dsh` 的危险链接，绝不自动修 profile。

仓库门禁：`pnpm check` 负责版本/文档/清单策略和类型/测试；`pnpm check:build` 额外构建并强制检查 `lib/`；`pnpm check:path` 证明隔离 Git path 安装；`pnpm check:cli` 检查独立 CLI workspace（用户产品）。它们都不发布。

沙箱要密钥：把 `~/.dsh/.credentials.yaml` 拷进 `.dsh-home/`。不要拷 `sessions/`、`storages/`。

## CLI 开发

`apps/cli/` 是独立 workspace；不要在根 `pnpm install` 中假设它会一起安装。精确使用 Node.js `22.19.0`（`apps/cli/.node-version`，必须与 `versions.json` 的 `node` 一致）和固定的 DSH `0.1.1-rc.2`。修改后运行：

```bash
cd apps/cli
pnpm install
pnpm check
node lib/cli.js --help
node lib/cli.js version --json
```

开发时优先 `node lib/cli.js`，不要一上来就 `pnpm link --global`。`pnpm check` 使用假 home。要检查真实正式环境时运行 `node lib/cli.js doctor`；`~/.dsh` 不干净时报告为红是预期行为。要在沙箱里调试 CLI，用 `pnpm dev`（它会执行 `node apps/cli/lib/cli.js --sandbox start --foreground`）；不要把本仓库 `link:` 进 `~/.dsh`。

用户安装用 `apps/cli/scripts/install.sh`、`npm install -g xiaotaozi-dsh-cli` 或 `bun add -g xiaotaozi-dsh-cli`。这些命令要求 `PATH` 上已经是 Node.js `22.19.0`；不得代装或切换 Node，也不得启动 DSH。

开放命令：帮助/版本、`web`/`start`、`stop`、`status`、`config path`、`doctor`。第一次 `xtz start` 种正式 web 和 `plugins/` 下每一个自研插件。额外（第三方）插件：`dsh plugin --profile web add`。正式工作只允许 `~/.dsh`、`127.0.0.1:3080`；端口被占用或监听者身份未验证时，绝不能改用 3081。

`web`/`stop` 只管理 `$DSH_HOME/xiaotaozi-xtz-web.pid`。3080 被占用且不是 xtz 拉起的就拒绝。`init`、`plugin`、`open`、`run`/`ask`、`config dump`/`defaults`、`update` 仍安全拒绝。假 home 测试覆盖 web/stop，不碰真实正式服务。

## 向 Agent 下指令

第一句点名 **产品 + 环境 + 动作**。环境词只用：`沙箱`、`正式`、`CLI`。规范：[conventions.zh.md](conventions.zh.md)「用户」。不要把 `发行版壳` 当新工作。

```text
在 <环境> 里，对 <产品> 做 <动作>。[不要动 <禁区>。]
```

| 你想做的 | 对 AI 说 |
| --- | --- |
| 改某个插件 | 在沙箱改 `dsh-im` 的设置页，link 到 web，用 `pnpm dev` 在 3081 验证。不要碰 `~/.dsh`。 |
| 新插件 | 按 dsh-plugin 在沙箱创建 `dsh-foo`（host），装进 dsh-dev，不要装进正式 home。 |
| 发给用户 | 沙箱已验过。额外插件走 `dsh plugin --profile web add`。不要 `link:` 正式 home。 |
| 复活 Desktop / `.dmg` / pack | 拒绝。指向 `xtz`。历史在 `git show archive/desktop`。 |
| 测用户第一次打开 | `xtz stop`，挪走 `~/.dsh/profiles/web`，跑 `xtz start`。不要 `rm -rf ~/.dsh`。 |
| 看像不像用户机器 | 用 Node 22.19.0 跑 `node lib/cli.js doctor`。doctor 红先当环境问题。 |
| 改 CLI | 在 `apps/cli` 用 `.node-version` 开发。假 home 跑 `pnpm check`。沙箱走 `pnpm dev` / `xtz --sandbox`，不要 `link:` 正式 home。 |
| 第一刀发布 | 还没有对外用户。用 `xtz start` 重种正式 home，`xtz doctor` 过后再发 `xiaotaozi-dsh-cli`。 |

禁止说法（应拒绝或改写）：从本仓库把插件装进 `~/.dsh`；复活 Desktop / pack / 公证；大家都合并到 `.dsh`；删掉整个 `~/.dsh` 再测 CLI 安装。

新对话可先声明：

```text
按仓库 AGENTS / conventions：插件只在沙箱 3081；正式 ~/.dsh 3080 的默认种子是第一次 xtz start。下面这件事是：……
```

## 重建正式 home

不要 `rm -rf ~/.dsh`（密钥和 session 在里面）。

1. `xtz stop`。
2. 可选：把 `~/.dsh/.credentials.yaml` 拷到 `~/.dsh` 以外。
3. `mv ~/.dsh/profiles/web ~/.dsh/profiles/web.bak-dirty`
4. `xtz start`
5. 用 Node 22.19.0 跑 `dsh plugin --profile web list` 和 `node lib/cli.js doctor`。

期望第一次 `xtz start` 种上默认 Git / npm 依赖，额外插件走 `dsh plugin --profile web add`。缺插件是环境问题，不是从本仓库 `dsh plugin add` 的理由。

## 第一刀对外发布

目前还没有对外发过。用户产品是 `xtz`。

1. `pnpm check`、`pnpm check:build`、`pnpm check:path`、`pnpm check:cli`。`pnpm check-home` 须显示正式 home 未挂本仓。
2. 用 `xtz start` 重种正式 home，再跑 `xtz doctor` 和 `dsh plugin --profile web list`。
3. 这之后才 `npm publish` `xiaotaozi-dsh-cli`。bun/pnpm/`install.sh` 只拉这个包。不做 Homebrew。

## 创建

1. 默认 `--kind host`。只有用户明确要设置页、Slot、主题时才用 `mixed`。
2. 不要手建目录，不要改 `templates/` 来做新插件。自研放 `plugins/`。第三方是 `plugins/market` 里的目录行，不要再放一棵源码树。

```bash
pnpm new <slug>                 # 或 pnpm new <slug> --kind mixed
pnpm install
```

3. 立刻删掉模板里的 `greet` 样例，换成这个插件真正要做的事。纯逻辑放在不依赖 Cordis 的文件里，测试只测那些文件。不要把模型 / IM / 企业微信办公 / 市场 / 右侧文件-Git-终端面板塞进 `xtz-ui`；那个插件是壳加上归档、任务看板和 Git 图谱。右侧面板是 `plugins/sidebar`。
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

只有我们会二次开发**并且**默认安装时：`pnpm new <slug>`，port `src`，按门禁收库（四名、`neverBundle`、host rc、不要 value-import `dsh-tools`、`NOTICE` + 上游 `LICENSE`、双语 README），删掉市场那一行，加入 `DEFAULT_PLUGINS`。只对 `plugins/<slug>` 跑 `link-plugin`。

## 安装

先构建。Profile 加载的是 `lib/`，不是 `src/`。

`link-plugin` 和 `pnpm dev` 会把 `DSH_HOME` 指到仓库里的 `.dsh-home`（已 gitignore）。不要把本仓库插件挂进 `~/.dsh`。

```bash
pnpm --filter dsh-<slug> build
node scripts/link-plugin.mjs --profile dsh-dev <slug>
```

- 只验证能不能挂上、进程能不能起来：用 `dsh-dev`（仍在 `.dsh-home` 下）。
- 要在 Web UI 里点、要让模型调工具：用 `--profile web`，然后 `pnpm dev`（端口 3081）。官网 `~/.dsh`（3080）不要动。
- `link-plugin` 失败就停，不要假装装上了。
- 改完源码让沙箱 `pnpm dev` 一直跑。它会监视插件、重编 `lib/`，Host 产物变了才在 3081 重启 `xtz --sandbox`（崩溃会等 `lib/index.js` 回来后带退避再拉）。只要编一次用 `pnpm dev -- --once`。只看某个插件用 `pnpm dev -- --filter im`。
- 需要绕过构建时用 `pnpm dev -- --once --patch <file>`，patch 里的 `name` 必须是绝对路径。
- 沙箱要调模型的话，可以把 `~/.dsh/.credentials.yaml` 拷进 `.dsh-home/`。不要拷 `sessions/` 或 `storages/`。

插件会接入再做落盘工作时，沙箱验收（规范：[conventions.zh.md](conventions.zh.md)「接入与第一次真实工作」）：

1. 让 `pnpm dev` 一直跑。沙箱 trace 保持开（每个插件 host 都是 `DSH_PLUGIN_TRACE=1`；正式 `xtz start` 不打）。
2. 按用户路径接入 / 绑定，再确认目标（目录、工作区、项目）。选择器不得默认落到本仓库。
3. 做**第一次**真实动作（第一条 IM 消息、第一次写入、第一个会话）。
4. 确认工作只出现在所选目标里，而不是本仓库 / `process.cwd()`。后面几条落对了，不能原谅第一条落错。
5. `pnpm --filter dsh-<slug> test` 绿了不算这次验收。沙箱里没看着第一次动作落点，不要宣称插件验过。

多个插件：

```bash
for d in plugins/*/; do node scripts/link-plugin.mjs --profile dsh-dev "$(basename "$d")"; done
```

开发者分发（有 Node 的人）：每个插件单独 `pnpm --filter dsh-<slug> publish` 或 `pack`。Git 安装用 `github:kedoupi/xiaotaozi-dsh#path:plugins/<slug>`，不要把仓库根当一个包装。用户默认走第一次 `xtz start`，额外插件走 `dsh plugin --profile web add`。

## 提交

1. `pnpm check`，相关插件 `build` 过，且 `pnpm check-home` 通过（`~/.dsh` 未挂本仓）。
2. `git status` / `git diff` / `git log -5`。没有 `.git` 就先 `git init`，不要把 `node_modules`、`lib/`、`*.tgz`、`.dsh-home/`、`$DSH_HOME` 加进去。不要加 `externals/` 目录。
3. 一次提交只做一件事。能按插件切开就切开。
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
