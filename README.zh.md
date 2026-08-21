# dsh-plugins

[English](README.md) | 中文

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件 monorepo。一个小插件是一个可独立安装的 npm 包，许可证 [MIT](LICENSE)。

不要对仓库根目录执行 `dsh plugin add`。根目录是 pnpm workspace，不是插件。按 `plugins/` 下的包路径安装。

## 插件

| 包 | 路径 | 说明文档 | 做什么 |
| --- | --- | --- | --- |
| [`dsh-providers`](plugins/providers) | `plugins/providers` | [EN](plugins/providers/README.md) · [中文](plugins/providers/README.zh.md) | 占用设置 → **模型**：官方订阅登录和 API Key 同一页，对话只显示勾选过的模型。 |
| [`dsh-hello`](plugins/hello) | `plugins/hello` | [EN](plugins/hello/README.md) · [中文](plugins/hello/README.zh.md) | 小桃子 DSH 欢迎弹框：打开 Web 应用时出现。 |

## 安装

例如把 Providers 装进 web profile：

```bash
dsh plugin --profile web add github:kedoupi/dsh-plugins#path:plugins/providers
dsh web
```

然后打开 **设置 → 模型**。改完源码要重新 `build`，并重启正在跑的 `dsh`。

Git 安装对每个包都是这种写法：

```text
github:kedoupi/dsh-plugins#path:plugins/<slug>
```

公开仓库请带 GitHub topic [`dsh-plugin`](https://github.com/topics/dsh-plugin)，生态目录靠这个发现插件。

## 结构

```text
plugins/<slug>/     可发布的插件，包名 dsh-<slug>
packages/           内部库（没有 dsh.bundle），有第二个调用方再加
templates/          `pnpm new` 用的 host / mixed 模板
docs/               规范 + 流程（[中文](docs/conventions.zh.md) · [EN](docs/conventions.md)）
```

根包不要声明 `dsh.bundle` 或 `dsh.profile`。日常 profile 在 `~/.dsh`。本地开发用 gitignore 掉的 `.dsh-home/`，不碰日常 home。

## 开发

规范：[docs/conventions.zh.md](docs/conventions.zh.md)。步骤：[docs/workflow.zh.md](docs/workflow.zh.md)。硬性规则：[AGENTS.md](AGENTS.md)。和我一起开发时走 `/dsh-plugin`。

```bash
pnpm new greet                 # 或：pnpm new sidebar --kind mixed
pnpm install
# 把 greet 样例换成真实逻辑，然后：
pnpm --filter dsh-greet test
pnpm --filter dsh-greet build
node scripts/link-plugin.mjs --profile dsh-dev greet
```

要在 Web UI 里用：挂到沙箱的 `web`，再 `pnpm dev`（端口 3081）。迭代时不要对 `~/.dsh` 跑 `dsh web`。
