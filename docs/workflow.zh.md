# 工作流

[English](workflow.md) | 中文

硬性规则：[AGENTS.md](../AGENTS.md)。规范：[conventions.zh.md](conventions.zh.md)。这里只写步骤。改规则改 `AGENTS.md`，改规范改 `conventions.zh.md`，改步骤改本文件。

## 开发环境

两套家目录。规范见 [conventions.zh.md](conventions.zh.md)「家目录」。测试走测试，正式走正式。

| | 官网 / 小白桌面端 | 沙箱 |
| --- | --- | --- |
| `DSH_HOME` | `~/.dsh` | `<仓库>/.dsh-home`（gitignore） |
| 命令 | 小桃子DSH.app 或正式 `dsh web`；首版 `xtz` 仅只读检查 | `pnpm dev` / `link-plugin` / debug `tauri dev` |
| 端口 | **3080** | **3081** |

| 要做什么 | 用哪套 |
| --- | --- |
| 改插件源码、设置页、`link-plugin`、debug `pnpm tauri dev` | 沙箱 **3081**。`pnpm dev` 会监视 `plugins/*/src`、重编 `lib/`，Host 代码变了才重启 :3081 |
| pack 落地、公证、已安装的小桃子DSH.app | 正式 `~/.dsh` **3080**。测的是小白拿到的那条产品线 |
| 发出去的 `.dmg` | 正式 `~/.dsh` **3080** |

`pnpm tauri dev` 只在 debug（`.dsh-home` :**3081**）。release 绝不探 3081，也绝不回退到 3080。不要在已安装的小桃子DSH.app 里验证 `link:` 的插件。3080 已被占用就不要抢。

`pnpm dev` 启动前会先停掉 **3081** 上残留的监听，绝不释放 **3080**。`link-plugin` 只写 `.dsh-home`，不要挂进 `~/.dsh`。不要对官网默认跑 `dsh plugin add ./plugins/<slug>`。改源码时让 `pnpm dev` 一直跑：它会重编 `plugins/*/lib`，只有 Host 的 `lib/index.js` 或 `cordis.patch.yml` 内容变了才重启 `dsh web`。Client 的 `lib/client.js` 走 Host HMR（界面没更新就硬刷新）。`pnpm dev -- --once` 是以前那种只编一次。克隆时加 `--recurse-submodules`，然后先 `pnpm install` 再构建或检查。`pnpm check-home`（即 `node scripts/doctor.mjs`）只诊断：列出并拒绝 `~/.dsh` 的危险链接，绝不自动修 profile。

仓库门禁：`pnpm check` 负责版本/文档/清单策略和类型/测试；`pnpm check:build` 额外构建并强制检查 `lib/`；`pnpm check:path` 证明隔离 Git path 安装；`pnpm check:desktop` 跑桌面脚本、前端和 Rust 质量检查；`pnpm check:cli` 检查独立 CLI workspace。它们都不发布。

沙箱要密钥：把 `~/.dsh/.credentials.yaml` 拷进 `.dsh-home/`。不要拷 `sessions/`、`storages/`。

## CLI 开发

`apps/cli/` 是独立 workspace；不要在根 `pnpm install` 中假设它会一起安装。精确使用 Node.js `22.19.0` 和固定的 DSH `0.1.1-rc.2`。修改后运行：

```bash
cd apps/cli
pnpm install
pnpm check
node lib/cli.js --help
node lib/cli.js version --json
```

首版只开放帮助/版本、`status`、`config path`、`plugin list` 和 `doctor`，并且全部保持只读。`plugin list` 直接解析正式 profile 清单，绝不调用 `dsh plugin`。正式检查只允许 `~/.dsh`、`127.0.0.1:3080`；端口被占用或监听者身份未验证时，绝不能改用 3081。

当前不要运行或实现 `start`/`web`、`open`、`run`/`ask`、`config dump`/`defaults`、`stop`、`update`。在 Desktop/CLI 共用可信的跨进程 supervisor、服务身份协议和加锁的 profile 事务边界前，这些命令必须安全拒绝。尤其不要对 `~/.dsh` 调用可能准备或重写 profile 生成态的 DSH 命令，即使它表面上像只读命令。日常 CI 只检查帮助/版本和有单测覆盖的只读行为，绝不启动或修改正式服务。

## 创建

1. 默认 `--kind host`。只有用户明确要设置页、Slot、主题时才用 `mixed`。
2. 不要手建目录，不要改 `templates/` 来做新插件。不要往 `externals/` 里放新插件——那是只读的上游 pin。fork 放 `plugins/`。

```bash
pnpm new <slug>                 # 或 pnpm new <slug> --kind mixed
pnpm install
```

3. 立刻删掉模板里的 `greet` 样例，换成这个插件真正要做的事。纯逻辑放在不依赖 Cordis 的文件里，测试只测那些文件。不要把模型 / 记忆 / IM / 上下文 / agent-teams 塞进 `hello`；那个插件是壳加上小桃子工作台。
4. 可调参数走导出的 Schemastery `Config`。
5. 写完：

```bash
pnpm --filter dsh-<slug> test
pnpm --filter dsh-<slug> build
pnpm check
pnpm check:build                # 强制存在并检查 lib/ 产物（等价展开：pnpm build + check-manifest --require-lib；path 安装由 check:path 证明）
```

6. 按下面「安装」挂到沙箱里的 `dsh-dev`，确认 `dump-config` 有这一层再宣布创建完成。

新插件要带英文 `README.md` 和中文 `README.zh.md`，两边一起维护。

## 从上游 fork

规范见 [conventions.zh.md](conventions.zh.md)「Externals」。`externals/` 是对照。`plugins/` 才是要装的。

### 先决定

三条都满足才继续：它是（或很容易变成）DeepSeek Harness 插件；许可证是 Apache-2.0 / MIT / BSD 或同等宽松；我们会二次开发**并且**会安装这个 fork。

不要 `git submodule add` 只想收藏的项目、`deepseek-harness`、非插件，或我们已经有的同职责实现。自研插件没有上游。`externals/` 不是观察列表。

### 第一次 fork

1. 记下上游 URL、许可证、我们对齐的 commit。
2. 还不是 submodule：`git submodule add <url> externals/<upstream-dir>`。目录用上游仓库名（`dsh-context`）。
3. `pnpm new <slug>`（有 UI 再用 `--kind mixed`）。不要手建 `plugins/<slug>`，不要改 `templates/` 来做 fork。
4. 把 `externals/<name>/src` 迁进 `plugins/<slug>`，按本仓库门禁收：
   - 四名对齐（`plugins/<slug>`、`dsh-<slug>`、patch `name`、`export const name` / patch `id` = `<slug>`）
   - tsdown `neverBundle: true`；所有 `@deepseek-ai/dsh-*` 钉到宿主 rc
   - 不要 value-import `@deepseek-ai/dsh-tools`
   - 不依赖 Cordis 的逻辑单独文件，测试只测那些文件
   - `NOTICE` 加上游 `LICENSE`
   - 双语 README：fork 自谁、Git 路径 `github:kedoupi/xiaotaozi-dsh#path:plugins/<slug>`、不要和作者 npm 装在一起
   - 关掉指向作者 npm 的升级提示
5. 根 README（中英）两张表都加：可安装插件表，以及 `externals/…` → `plugins/…` 对照。
6. 只对 `plugins/<slug>` 跑 `link-plugin`（见下面「安装」）。不要 `link:` `externals/`。`dump-config` 出现 `# == dsh-<slug>`，且 `pnpm check-home` 通过，才算第一次 fork 完成。
7. 用户要求提交时拆成两次：先 submodule gitlink，再 fork 源码。没说提交就不动 git。

### 以后拉上游

```bash
git submodule update --remote externals/<name>
# 对照 externals/<name>/src 和 plugins/<slug>/src，再迁
```

只 port 要的改动，不要整棵覆盖我们的二次开发。两次提交：先升 gitlink，再提交插件。不要提交 submodule 工作树里的脏文件。

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
- 改完源码让沙箱 `pnpm dev` 一直跑。它会监视插件、重编 `lib/`，Host 产物变了才在 3081 重启 `dsh web`。只要编一次用 `pnpm dev -- --once`。只看某个插件用 `pnpm dev -- --filter im`。
- 需要绕过构建时用 `pnpm dev -- --once --patch <file>`，patch 里的 `name` 必须是绝对路径。
- 沙箱要调模型的话，可以把 `~/.dsh/.credentials.yaml` 拷进 `.dsh-home/`。不要拷 `sessions/` 或 `storages/`。

多个插件：

```bash
for d in plugins/*/; do node scripts/link-plugin.mjs --profile dsh-dev "$(basename "$d")"; done
```

开发者分发（有 Node 的人）：每个插件单独 `pnpm --filter dsh-<slug> publish` 或 `pack`。Git 安装用 `github:kedoupi/xiaotaozi-dsh#path:plugins/<slug>`，不要把仓库根当一个包装。发给小白走下面这条。

## 发桌面插件包

不是 `dsh plugin add`，不是 `link:`，不是 GitHub。规范：[conventions.zh.md](conventions.zh.md)「桌面插件包」。

1. 在沙箱改插件，在 **3081** 上测过。
2. 用户要求提交再提交。
3. 只生成一次 Ed25519 密钥：`pnpm generate-pack-key`。私钥写到 `~/.config/xiaotaozi-dsh/pack-signing-key.pem`（按用户存放，所有 checkout 共用——务必离机备份）。只提交 `src-tauri/keys/pack-signing-key.der` 公钥，私钥 PEM 永不入库；CI/发布环境通过 `XIAOTAOZI_PACK_SIGNING_KEY` secret 传私钥 PEM 或其路径。
4. 在每个 **目标系统** 上打包（原生插件跟打包机走）。构建机之间完整传递 `plugin-packs/` 聚合目录；metadata 相同时，新 target 会合入已有签名 payload 并沿用同一个 `packVersion`。最后发布机必须收齐索引引用的所有 target tarball：

```bash
cd apps/desktop
pnpm pack-plugins      # plugin-packs/*.tar.gz + 签名过的 latest.json
pnpm publish-pack      # tcb 上传，PurgeUrlsCache，等到线上索引对上
```

需要 PATH 上有 `tcb`，以及 `~/.config/env/tencent/tcb.env`。发布前运行 `pnpm check`、`pnpm check:build`、`pnpm check:path`、`pnpm check:desktop`，并测试首次安装、更新、健康检查失败回滚、3080 被外部进程占用。日常验证不要真实发布。

完成的含义是线上 `https://s.xiaotaozi.cc/dsh/packs/latest.json` 信封解开后是新的 `packVersion`。只传到 COS、不刷 CDN 不算发布。不要在 TCB 控制台手传再跳过脚本。不要让小白去 GitHub。只有第一次建前缀才跑 `pnpm publish-pack --init`。

索引是签名信封（规范：conventions「索引信封」）。不会验签信封的旧客户端不能安全消费插件包，必须先升级应用；绝不能为了兼容它把索引降级成裸 JSON。

## 提交

1. `pnpm check`，相关插件 `build` 过，且 `pnpm check-home` 通过（`~/.dsh` 未挂本仓）。
2. `git status` / `git diff` / `git log -5`。没有 `.git` 就先 `git init`，不要把 `node_modules`、`lib/`、`*.tgz`、`.dsh-home/`、`$DSH_HOME` 加进去。不要提交 `externals/` 里 submodule 的脏文件，只升 gitlink。
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
