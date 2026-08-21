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

`link-plugin` 只写 `.dsh-home`，不要挂进 `~/.dsh`。`build` 之后只重启 `pnpm dev`。

沙箱要密钥：把 `~/.dsh/.credentials.yaml` 拷进 `.dsh-home/`。不要拷 `sessions/`、`storages/`。

## 创建

1. 默认 `--kind host`。只有用户明确要设置页、Slot、主题时才用 `mixed`。
2. 不要手建目录，不要改 `templates/` 来做新插件。

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
2. `git status` / `git diff` / `git log -5`。没有 `.git` 就先 `git init`，不要把 `node_modules`、`lib/`、`*.tgz`、`.dsh-home/`、`$DSH_HOME` 加进去。
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

- 这个能力能不能单独 `dsh plugin add`？不能就并进现有插件，或等第二个调用方再抽 `packages/`。
- 没有 Web UI 就保持 Host-only，删掉空的 `src/client`。
- 模板残留（`greet`、用不到的 `Config` 字段、`inject`、依赖）删掉。
- `lib/index.js` 保持很小，不能出现 `node_modules` 打包痕迹，不能出现 `@deepseek-ai/dsh-tools`。
- 测试继续只覆盖纯函数。不要为了覆盖率去 mock 整个 harness。

做完再跑 `pnpm check`。要提交就走「提交」。
