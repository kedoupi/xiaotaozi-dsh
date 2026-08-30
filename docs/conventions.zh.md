# 项目规范

[English](conventions.md) | 中文

本文件是**规范**（事实）。硬性规则：[AGENTS.md](../AGENTS.md)。步骤：[workflow.zh.md](workflow.zh.md)。贡献入口：[CONTRIBUTING.zh.md](../CONTRIBUTING.zh.md)。改哪份文件：[README.zh.md](README.zh.md)。

## 仓库是什么

这是小桃子 DSH（`xiaotaozi-dsh`），面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)：可安装插件，以及一个给用户的产品 `xtz` CLI。仓库里没有桌面客户端（git 标签 `archive/desktop`）。仓库根不是插件，不要对根执行 `dsh plugin add`。

| 路径 | 作用 |
| --- | --- |
| `plugins/<slug>/` | 一个可独立安装的包，包名 `dsh-<slug>` |
| `apps/cli/` | 用户产品：`xtz`。独立、可发布的 pnpm workspace，不是插件 |
| `apps/website/` | 对外网站（VitePress）。独立 workspace，不是插件 |
| `packages/` | 禁止。Git path 安装带不走共享 workspace。辅助代码复制，或单独发 npm |
| `plugins/market` | 自研市场界面。第三方插件是目录里的一行配置，不是第二棵源码树 |
| `templates/` | `pnpm new` 的骨架。不要改模板来做新插件 |
| `scripts/` | `pnpm new`、`link-plugin`、`check-manifest`、`doctor`、沙箱启动 |
| `docs/` | 规范、步骤、文档地图 |
| `CONTRIBUTING.md` | 给人看的贡献入口（克隆、日常循环、门禁） |
| `.dsh-home/` | gitignore 掉的沙箱 Harness 家目录，不是 `~/.dsh` |
| `versions.json` | dsh RC、Node、Python、pnpm 和 CLI 版本的唯一规范源 |

对外文档默认英文 `README.md`，中文是 `README.zh.md`。仓库根和每个插件都要成对。工程文档从 [docs/README.zh.md](README.zh.md) 进。

## Git

唯一长期分支是 `main`。主题分支通过 pull request 合入。这不是 Git Flow：不要把 `develop`、`release/*`、`hotfix/*` 当成常驻线。产品快照是 `main` 上那次发布提交的 git 标签 `vX.Y.Z`。版本规则见 [版本](#版本)。

允许 git worktree。一棵 worktree 是一条分支的一次 checkout。Git 不允许同一分支同时出现在两棵 worktree 里。Worktree 仍是本仓库：沙箱 home 是那次 checkout 自己的 `.dsh-home`；沙箱端口和正式 home 见 [家目录](#家目录)。任何一次 checkout 都不要 `link:` 进正式 web。

步骤：[workflow.zh.md](workflow.zh.md)「开发环境」。

## 市场目录（第三方）

`plugins/` 是自研：我们写代码，第一次 `xtz start` 把这里的**每一个**包装进默认种子。第三方插件是 **`plugins/market` 里的一行配置**，不要在仓库里再放一棵源码树。不要加 `externals/`。不要 vendor 上游插件。用户按那一行的规格安装（`github:owner/repo`、作者仓里的 `#path:plugins/…`，或 npm）。永远不要 `#path:externals/…`。

### 何时上架

同时满足下面三条，才在 `plugins/market/src/catalog.ts` 的 `MARKET_PLUGINS` 加一行：

- 它是 DeepSeek Harness 插件
- 许可证能跟：Apache-2.0、MIT、BSD 或同等宽松许可
- 我们会在市场里**可选安装**，而不是默认种子

不要上架：

- `deepseek-harness` 本身
- 不是插件的库或应用
- 会和自研 IM / 模型抢职责的第二套实现
- 自研（`xtz-ui`、`sidebar`、`providers`、`im`、`market`、`wecom-office`）

### 怎么上架

1. 在 `MARKET_PLUGINS` 写 `id`、`name`、`version`、`summary`、`packageName`、`installSpec`。
2. `installSpec` 必须是上游 Git 或 npm。拒绝 `link:`、`file:`、`#path:externals/`。
3. 上游发版后，改目录里的版本 / 摘要 / 安装规格。不要把那个仓库克隆进本仓。

只有我们会二次开发**并且**默认安装时，才收成自研：`pnpm new <slug>`，port `src`，按门禁收库，删掉市场那一行，加入 `DEFAULT_PLUGINS`。

## 家目录

两套 home。不要混。测试走测试家目录，正式走正式家目录。

| | 正式 / 用户 | 沙箱 |
| --- | --- | --- |
| 谁用 | 跑 `xtz` 的用户 | 本仓库：改插件 |
| 家目录 | `~/.dsh` | `<仓库>/.dsh-home`（gitignore） |
| 端口 | **3080** | **3081** |
| 启动 | `xtz start`（浏览器界面） | `pnpm dev` → `xtz --sandbox start --foreground` / `link-plugin` |
| 插件 | 第一次 `xtz start` 种默认；额外走 `dsh plugin --profile web` | `link:` 到本仓库 |
| 写手 | 第一次 `xtz start`（种子）；额外插件走 `dsh plugin` | 本仓库（`link-plugin`、`pnpm dev`） |

哪件事走哪套：

| 要做什么 | 用哪套 |
| --- | --- |
| 改插件源码、设置页、`link-plugin` | 沙箱 **3081**。`pnpm dev` 监视插件并在 Host 代码变了时重启 :3081 |
| 用户产品（`xtz start`） | 正式 `~/.dsh` **3080** |
| 用 `xtz status` / `doctor` 检查正式环境 | 正式 `~/.dsh` **3080**。绝不走 `.dsh-home` / 3081 |

- `~/.dsh` 的默认种子由第一次 `xtz start` 写；额外插件走 `dsh plugin --profile web`。用户机器上有 Node。3080 已被占用且不是 xtz 拉起的就不要抢。不想动正式环境就用沙箱。
- 不要从本仓库 `link:` 或 `dsh plugin add ./plugins/<slug>` 进 `~/.dsh`。`node scripts/doctor.mjs` 只诊断：发现日常 profile 指向本仓就失败并列出，不会编辑或自动修复 profile。
- 沙箱：只给插件调试。`pnpm dev` 监视插件并启动 `xtz --sandbox`（钉死的 DSH、`.dsh-home`、只占 **3081**）。`link-plugin` 仍写沙箱 profile。源码留在沙箱。正式额外插件走 `dsh plugin --profile web`（Git / npm）。不要用 PATH 上的 `dsh` 拉沙箱 web。
- 额外的 checkout 和 worktree 不会再分到一个沙箱端口。**3081** 整机只有一个监听者。`pnpm dev` 不得抢属于另一次 checkout 的 3081。

沙箱要密钥：只拷 `~/.dsh/.credentials.yaml` 进 `.dsh-home/`。不要拷 `sessions/`、`storages/`。

### 沙箱持续监控

本 checkout 沙箱的真实使用（`pnpm dev`、**3081**、`.dsh-home`）是改插件和架构的来源。正式 **3080** 不是这条回路。

监控开着时：

- 信号是 journey 中断：stdout `journey event=… break=1` 和 `.dsh-home/traces/YYYY-MM-DD.jsonl`。泛化 error grep 不是信号。
- 工作是闭环：发现 → 分类 → 在沙箱修好 → 验收。只盯日志不算监控。
- 每条中断要定性：我们的缺陷或缺产品；只能缓解的平台限制；或运维（两套 home 共用一个企微机器人）。说清楚是哪一类。不要把平台上限当成崩溃。
- 痕迹不得包含消息正文或密钥。

步骤：[workflow.zh.md](workflow.zh.md)「沙箱持续监控」。

不要把 `deepseek-harness` vendor 进本仓库，也不要改它。类型和 API 走已发布的 `@deepseek-ai/*`。

## 用户

按谁写 `~/.dsh/profiles/web` 分类，不要按装了哪些程序。跑 `xtz` 的人就叫 **用户**。

| 谁 | 装什么 | 插件从哪来 | 谁写正式 `web` |
| --- | --- | --- | --- |
| 用户 | `xtz`（`PATH` 上有 Node） | 第一次 `xtz start` 种默认；额外走 `dsh plugin` | 第一次 `xtz start`（种子），然后 `dsh plugin` |
| 插件作者 | 本仓库 / Node / git | 沙箱 `link:` 或 Git path | 不写正式 web |

默认种子写手：第一次 `xtz start`。额外插件走 `dsh plugin --profile web`。从本仓库 `link:` 进正式 web 是污染。插件作者仍用沙箱 `link:`。

Git `#path:plugins/<slug>` 给插件作者（沙箱）和用户（`dsh plugin --profile web add`）。不要从本仓库对正式 home 跑 `dsh plugin add ./plugins/<slug>`。

要让正式 home 像用户机器：`xtz stop`，挪走 `profiles/web`，再 `xtz start`。不要 `rm -rf ~/.dsh`。

## `xtz` CLI

`apps/cli/` 是给用户的产品，不是 Harness 插件，也不加入根目录仅含 `plugins/*` 的 workspace。二进制名固定为 `xtz`；CLI 运行时精确固定为 Node.js `22.19.0`，依赖精确固定为 `@deepseek-ai/dsh` `0.1.1-rc.2`。正式命令只使用 `~/.dsh`，不得探测或回退到 `.dsh-home` / 3081。默认监听 **3080**；若被非小桃子占用，交互式 `xtz start` 可以改用 **3082+**。永远不用 3081。`xtz --sandbox` 不是正式命令：只允许在本仓库里跑，由 `pnpm dev` 调用。用户用 npm、bun、pnpm 或 `apps/cli/scripts/install.sh` 安装可发布包 `xiaotaozi-dsh-cli`；这些工具只负责拉包，`xtz` 始终用 Node 运行。界面就是官方 `dsh web` 开在浏览器里——不要在终端或 Tauri 里重做聊天壳。

开放命令：帮助/版本、直接运行 `xtz` / `start` / `stop` / `restart` / `open` / `status` / `doctor` / `config path`。`web` 是 start 的别名。`xtz` 是钉死版本的 dsh 外壳，不是插件管理器。第一次 `xtz start` 种正式 web 和 `plugins/` 下每一个自研插件。额外（第三方）插件走应用内市场。`status` 和 `doctor` 只接受 `/.well-known/xiaotaozi-dsh/identity/v1` 的精确 v1 响应；其他 HTTP 响应只能证明端口被占用。

`start`/`stop`/`restart` 只管理 `xtz` 自己拉起的进程（`$DSH_HOME/xiaotaozi-xtz-web.pid`）。不抢端口、不按端口杀进程。若 3080 已经是小桃子身份但不是这份 pid，不要再起第二份。`init`、`plugin`、`run`/`ask`、`config dump`/`defaults`、`update` 仍安全拒绝。这张命令表必须和 `apps/cli/README.zh.md`、根 README 一致。

## 插件怎么发出去

两条分发路径，不要混。

| | 开发者 | 用户 |
| --- | --- | --- |
| 谁 | 有 Node / git 的人 | `xtz` 然后 `dsh` |
| 发出去的是 | 单个 `dsh-<slug>` | Git path 或 npm 进正式 `web` |
| 怎么到 | `pnpm --filter dsh-<slug> publish` 或 Git `#path:plugins/<slug>` | 第一次 `xtz start`（默认）；额外走市场 |
| 宿主 | GitHub / npm | GitHub / npm，经 `dsh` |

不要再加 `apps/desktop/`。废弃 Tauri 客户端的历史在 git 标签 `archive/desktop`。不要发明签名 pack / CDN 管道。

## 版本

遵循 [Semantic Versioning 2.0.0](https://semver.org/lang/zh-CN/)。写成 `主.次.补`。只在**发给用户的制品**（git tag 和/或 npm）时升版本，不要每个 commit 都升。一次发布只升一位，右边清零。

| 升哪一位 | 何时 | 例子 |
| --- | --- | --- |
| 主版本 | 对外合同破了 | 砍掉已开放的 `xtz` 命令；身份地址变了；默认种子规格旧安装跟不上 |
| 次版本 | 兼容的新能力 | 新开放命令；多种一个默认插件；市场多一行 |
| 补丁 | 兼容的修复或文档 | IM 不断流修复；只改文档；CI |

`0.y.z` 表示公开合同还不稳。CLI 已经发布，默认种子钉在产品 tag 上。在我们愿意把破坏性变更当主版本之前，继续留在 `0.x`。活的产品号是 `versions.json` 的 `cliApp`，不是这段文字里的数字。

两套版本平面。**规则相同，数字不必相同。**

| 平面 | 是什么 | 何时升 |
| --- | --- | --- |
| 产品（git tag `vX.Y.Z` = `versions.json` 的 `cliApp` = `apps/cli/package.json` 的 version） | 用户安装单位。一个 tag 钉死当时全部自研插件源码 | 发 `xtz` / 默认种子快照 |
| 插件包（`plugins/<slug>/package.json` 的 `version`） | 将来单独 `pnpm --filter dsh-<slug> publish` 用的 SemVer | 该包装到 npm（或市场卡片要展示这个号）时 |

不要为了对齐好看，把未发布的插件版本往下调。Git path 用户看不见插件 `package.json` 的版本；他们装的是产品 tag。

默认种子规格：

```text
github:kedoupi/xiaotaozi-dsh#path:plugins/<slug>                 # 漂浮；仅开发 / 沙箱
github:kedoupi/xiaotaozi-dsh#vX.Y.Z&path:plugins/<slug>         # 货架（pnpm git 源）
```

`main` 上的 `DEFAULT_PLUGINS` 必须钉 `#v${cliApp}&path:plugins/<slug>`。改 `cliApp` 的那次发布提交，要把每一条默认规格改到同一个 tag。升版本写进 [CHANGELOG.md](../CHANGELOG.md)。

用户可安装的 npm 包只有 `xiaotaozi-dsh-cli`。它从 git tag `vX.Y.Z` 由 GitHub Actions 发布（npm Trusted Publisher / OIDC）。自研插件仍走 Git path / 第一次 `xtz start`。

| `apps/cli/package.json` 字段 | 必须是 |
| --- | --- |
| `name` | `xiaotaozi-dsh-cli` |
| `version` | `versions.json` 的 `cliApp` |
| `bin.xtz` | `lib/cli.js`（不要 `./` 前缀；npm 11 会丢掉 `./lib/cli.js`） |
| `repository.url` | `git+https://github.com/kedoupi/xiaotaozi-dsh.git` |

该包在 npmjs.com 上的 Trusted Publisher（保存表单时 npm **不会**校验对错）：

| 字段 | 值 |
| --- | --- |
| Organization or user | `kedoupi` |
| Repository | `xiaotaozi-dsh` |
| Workflow filename | `publish.yml`（只要文件名，不要 `.github/workflows/`，也不要填 YAML 的 `name:`） |
| Environment | 空（job 没有 `environment:`） |
| Allowed actions | 允许 `npm publish` |

## 宿主版本

全局 CLI 钉在 `@next`，当前是 `0.1.1-rc.2`：

```bash
pnpm add -g @deepseek-ai/dsh@0.1.1-rc.2
```

很多 `@deepseek-ai/dsh-*` 的 `latest` 还停在空壳 `0.0.1-rc.1`，安装必须写死版本（`0.1.1-rc.2`）。插件里的 `@deepseek-ai/dsh-*` pin 必须和宿主 rc 一致。`@next` 前进时，模板和插件的 `devDependencies` 一起改。

## 包身份

一个插件，四个名字必须对齐：

| 位置 | 取值 |
| --- | --- |
| 目录 | `plugins/<slug>/` |
| `package.json` `name` | `dsh-<slug>` |
| `cordis.patch.yml` `name` | `dsh-<slug>` |
| patch `id` / `export const name` | `<slug>` |

slug：小写 `[a-z][a-z0-9-]*`，不能 `--`，目录不要带 `dsh-` 前缀（`pnpm new` 会剥掉）。

Git 安装（开发 / 漂浮）：

```text
github:kedoupi/xiaotaozi-dsh#path:plugins/<slug>
```

钉到产品 tag：

```text
github:kedoupi/xiaotaozi-dsh#vX.Y.Z&path:plugins/<slug>
```

这条路径只包含一个插件目录。仓库里没有共享的 `packages/` workspace，因为它进不了 path 安装。辅助代码放在插件包内；两段插件真要共用，就复制一小段，或单独发 npm 包。

改名等于上面全部一起改，加上磁盘上的 `$DSH_HOME/plugins/<slug>/`，再加上沙箱里重新 `link-plugin`。profile 里不要留旧包名。

小桃子相关插件的界面文案用中文。占用的设置页按职责起名（例如「模型」），不要用包名当页名。

## 插件结构

`pnpm new <slug>` 默认 **host**（工具/服务，无 UI）。只有设置页、Slot、主题才 `--kind mixed`。

- Profile 加载 `lib/`，不是 `src/`。改源码后必须再 build。
- 不依赖 Cordis 的逻辑单独放文件，测试只测那些文件。不要为了覆盖率 mock 整个 harness。
- 可调参数走导出的 Schemastery `Config`。
- `@deepseek-ai/cordis` 默认 `import type`；`lib/` 运行时真 import 了才放进 `dependencies`。
- 不要 value-import `@deepseek-ai/dsh-tools`。在 `ctx.tools` 上注册普通 tool 对象。插件若 value-import `@deepseek-ai/dsh-subagent` 或 `@deepseek-ai/dsh-session`，要把加载期 peer（`dsh-tools` / `dsh-scope`）写进 `dependencies`。
- `@deepseek-ai/*` 保持 external（`deps.neverBundle: true`）。
- `prepare` / `tsdown.config.ts` 留在插件包内，Git 路径安装才能自己 build。
- 每个插件带 `README.md` 和 `README.zh.md`。

`versions.json` 是唯一版本规范源。根/CLI package 清单和 README 徽章/安装命令因格式要求仍保留字面值；门禁负责拒绝任何不一致。

| 门禁 | 保证 |
| --- | --- |
| `pnpm check` | 版本和文档一致、插件可安装清单形态、类型检查、插件测试和脚本测试；不要求新鲜的 `lib/` |
| `pnpm check:build` | 构建全部插件，并以 `--require-lib` 重跑清单门禁，检查生成代码的 import/打包问题 |
| `pnpm check:path` | 以隔离 Git path 安装验证每个插件无需 monorepo 也能 prepare |
| `pnpm check:cli` | 安装在独立 workspace 中的 CLI 类型、构建和测试门禁；不启动或修改正式服务 |

`pnpm check-home` 独立且只读：它报告日常 `~/.dsh` 的危险链接，绝不自动修复。

## 接入与第一次真实工作

`pnpm dev` 的 `process.cwd()` 是本仓库（常见就是 `xiaotaozi-dsh`）。那是插件作者的 checkout，不是用户的项目。

插件如果会接入 / 绑定 / 添加账号，然后创建 Harness 会话、写文件，或做其他落盘工作，必须满足：

- 绑定当时写入的默认路径（`config.workspace ?? process.cwd()` 或同类）在用户于设置里确认目标之前只是 **暂定**。
- 选目录器还开着、或确认 RPC 还在飞时，不要用这个默认值创建第一条会话、第一份文件、第一个工作区窗口。
- 绑定后的第一条入站 / 第一次真实用户动作要等确认。用户取消，等于有意确认默认值。
- 新绑定后的目录选择器从用户主目录或「未设置」打开，绝不以插件仓库 cwd 为起点。
- 重启后从磁盘读回来的绑定已经是确认态。
- 测试必须覆盖这场竞态：未确认绑定 + 第一次动作不得落到 cwd；选完目录后的第一次动作只落在所选路径。一套从不「先绑定再立刻干活」的绿单测，证明不了这件事。

当前实现：`dsh-im` 的 `BotWorkspaceStore`（`confirmWorkspace: false`、`whenWorkspaceReady`）。别的插件遵守这条规则，不要去 import 那个 store。沙箱步骤见 [workflow.zh.md](workflow.zh.md)「安装」。

## 命令

```bash
pnpm new <slug>                 # 或 pnpm new <slug> --kind mixed
pnpm --filter dsh-<slug> test
pnpm --filter dsh-<slug> build
node scripts/link-plugin.mjs --profile dsh-dev <slug>   # 只验证能否挂上
node scripts/link-plugin.mjs --profile web <slug>       # 要 UI
pnpm dev                                                # 监视插件，xtz --sandbox 开 :3081 --no-open（只要编一次用 `-- --once`）
pnpm check:cli                                          # 独立 apps/cli workspace（用户产品）
pnpm check:build                                        # CI 门禁：强制存在并检查 lib/ 产物（等价展开：pnpm build + check-manifest --require-lib；path 安装由 check:path 证明）
pnpm check
pnpm check-home                                         # 日常 ~/.dsh 不能挂本仓
```

装上的含义是 `dump-config` 里有 `# == dsh-<slug>`。改源码时让 `pnpm dev` 一直跑（它会重编 `lib/`，Host 产物变了才重启）。不要重启用户正式 3080 上的 `xtz` 服务。
