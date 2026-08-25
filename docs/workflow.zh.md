# 工作流

[English](workflow.md) | 中文

硬性规则：[AGENTS.md](../AGENTS.md)。规范：[conventions.zh.md](conventions.zh.md)。这里只写步骤。改规则改 `AGENTS.md`，改规范改 `conventions.zh.md`，改步骤改本文件。

## 开发环境

日常 Harness 继续用 `~/.dsh`（`dsh web`，端口 3080）。本仓库另起一套家目录：

| | 日常 | 沙箱 |
| --- | --- | --- |
| `DSH_HOME` | `~/.dsh` | `<仓库>/.dsh-home`（gitignore） |
| 命令 | `dsh web` | `pnpm dev` |
| 端口 | 3080 | 3081 |

`link-plugin` 只写 `.dsh-home`，不要挂进 `~/.dsh`。`build` 之后只重启 `pnpm dev`。克隆时加 `--recurse-submodules`，否则 `externals/` 是空的。

沙箱要密钥：把 `~/.dsh/.credentials.yaml` 拷进 `.dsh-home/`。不要拷 `sessions/`、`storages/`。

## 创建

1. 默认 `--kind host`。只有用户明确要设置页、Slot、主题时才用 `mixed`。
2. 不要手建目录，不要改 `templates/` 来做新插件。不要往 `externals/` 里放新插件——那是只读的上游 pin。fork 放 `plugins/`。

```bash
pnpm new <slug>                 # 或 pnpm new <slug> --kind mixed
pnpm install
```

3. 立刻删掉模板里的 `greet` 样例，换成这个插件真正要做的事。纯逻辑放在不依赖 Cordis 的文件里，测试只测那些文件。
4. 可调参数走导出的 Schemastery `Config`。
5. 写完：

```bash
pnpm --filter dsh-<slug> test
pnpm --filter dsh-<slug> build
pnpm check
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
   - 双语 README：fork 自谁、Git 路径 `github:kedoupi/dsh-plugins#path:plugins/<slug>`、不要和作者 npm 装在一起
   - 关掉指向作者 npm 的升级提示
5. 根 README（中英）两张表都加：可安装插件表，以及 `externals/…` → `plugins/…` 对照。
6. 只对 `plugins/<slug>` 跑 `link-plugin`（见下面「安装」）。不要 `link:` `externals/`。`dump-config` 出现 `# == dsh-<slug>`，才算第一次 fork 完成。
7. 用户要求提交时拆成两次：先 submodule gitlink，再 fork 源码。没说提交就不动 git。

### 以后拉上游

```bash
git submodule update --remote externals/<name>
# 对照 externals/<name>/src 和 plugins/<slug>/src，再迁
```

只 port 要的改动，不要整棵覆盖我们的二次开发。两次提交：先升 gitlink，再提交插件。不要提交 submodule 工作树里的脏文件。

## 安装

先构建。Profile 加载的是 `lib/`，不是 `src/`。

`link-plugin` 和 `pnpm dev` 会把 `DSH_HOME` 指到仓库里的 `.dsh-home`（已 gitignore），和日常的 `~/.dsh` 分开。不要把本仓库插件挂进 `~/.dsh/profiles/web`。

```bash
pnpm --filter dsh-<slug> build
node scripts/link-plugin.mjs --profile dsh-dev <slug>
```

- 只验证能不能挂上、进程能不能起来：用 `dsh-dev`（仍在 `.dsh-home` 下）。
- 要在 Web UI 里点、要让模型调工具：用 `--profile web`，然后 `pnpm dev`（端口 3081）。日常 `dsh web`（3080）不要动。
- `link-plugin` 失败就停，不要假装装上了。
- 改完源码必须再 `build`，然后重启沙箱里的 `pnpm dev`。
- 需要绕过构建时用 `pnpm dev -- --patch <file>`，patch 里的 `name` 必须是绝对路径。
- 沙箱要调模型的话，可以把 `~/.dsh/.credentials.yaml` 拷进 `.dsh-home/`。不要拷 `sessions/` 或 `storages/`。

多个插件：

```bash
for d in plugins/*/; do node scripts/link-plugin.mjs --profile dsh-dev "$(basename "$d")"; done
```

分发给别人：每个插件单独 `pnpm --filter dsh-<slug> publish` 或 `pack`。Git 安装用 `github:kedoupi/dsh-plugins#path:plugins/<slug>`，不要把仓库根当一个包装。

## 提交

1. `pnpm check`，相关插件 `build` 过。
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
