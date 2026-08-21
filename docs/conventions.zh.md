# 项目规范

[English](conventions.md) | 中文

硬性规则：[AGENTS.md](../AGENTS.md)。步骤：[workflow.zh.md](workflow.zh.md)。本文件是这两者默认成立的项目约定。

## 仓库是什么

这是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的插件 monorepo。仓库根不是插件，不要对根执行 `dsh plugin add`。

| 路径 | 作用 |
| --- | --- |
| `plugins/<slug>/` | 一个可独立安装的包，包名 `dsh-<slug>` |
| `packages/` | 无 `dsh.bundle` 的内部库。第二个插件真正要用再加 |
| `externals/<name>/` | 上游插件的 git submodule。不是 workspace 包。不要改里面的代码，要升就改 gitlink |
| `templates/` | `pnpm new` 的骨架。不要改模板来做新插件 |
| `.dsh-home/` | gitignore 掉的沙箱 Harness 家目录，不是 `~/.dsh` |

对外文档默认英文 `README.md`，中文是 `README.zh.md`。仓库根和每个插件都要成对。

## Externals

`externals/` 是本目录跟踪、但不拥有的上游插件的 pinned checkout。

- 不进 pnpm workspace。`pnpm install`、`pnpm check`、`pnpm new`、`link-plugin` 都不管它们。
- 不要把 checkout 拷进 `plugins/`。不要在 `externals/` 下 `pnpm new` 做 fork。
- 不要改 submodule 里的文件。跟上游：`git submodule update --remote externals/<name>`，然后只提交 gitlink。
- 克隆用 `git clone --recurse-submodules`；已经裸克隆的话再 `git submodule update --init`。
- 用户从上游的 npm 包名安装，不要用 `github:kedoupi/dsh-plugins#path:externals/…`。

## 两套家目录

本机已经有一份日常 Harness。插件开发不能把它停掉、改它的 profile，也不能共用会话库。

| | 日常 | 本仓库沙箱 |
| --- | --- | --- |
| 家目录 | `~/.dsh` | `<仓库>/.dsh-home` |
| CLI | 全局 `dsh`（`@deepseek-ai/dsh@next`） | 同一份二进制 |
| 启动 | `dsh web` → 3080 | `pnpm dev` → 3081 |
| 插件 | 用户自己的稳定组合 | `link:` 到本仓库 |

`link-plugin` 和 `pnpm dev` 会把 `DSH_HOME` 指到 `.dsh-home`。禁止把本仓库插件挂进 `~/.dsh/profiles/web`。

沙箱要密钥：只拷 `~/.dsh/.credentials.yaml` 进 `.dsh-home/`。不要拷 `sessions/`、`storages/`。

不要把 `deepseek-harness` vendor 进本仓库，也不要改它。类型和 API 走已发布的 `@deepseek-ai/*`。

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

Git 安装：

```text
github:kedoupi/dsh-plugins#path:plugins/<slug>
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
- 不要 value-import `@deepseek-ai/dsh-tools`。在 `ctx.tools` 上注册普通 tool 对象。
- `@deepseek-ai/*` 保持 external（`deps.neverBundle: true`）。
- `prepare` / `tsdown.config.ts` 留在插件包内，Git 路径安装才能自己 build。
- 每个插件带 `README.md` 和 `README.zh.md`。

`pnpm check` 检查可安装形态（包名、patch、`lib/` 未打进 `node_modules`、未引入 `dsh-tools`）。

## 命令

```bash
pnpm new <slug>                 # 或 pnpm new <slug> --kind mixed
pnpm --filter dsh-<slug> test
pnpm --filter dsh-<slug> build
node scripts/link-plugin.mjs --profile dsh-dev <slug>   # 只验证能否挂上
node scripts/link-plugin.mjs --profile web <slug>       # 要 UI
pnpm dev                                                # 沙箱 web，:3081
pnpm check
```

装上的含义是 `dump-config` 里有 `# == dsh-<slug>`。rebuild 之后重启 `pnpm dev`，不要重启日常的 `dsh web`。
