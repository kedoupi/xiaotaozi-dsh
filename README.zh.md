# dsh-plugins

[English](README.md) | 中文

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件 monorepo。一个小插件是一个可独立安装的 npm 包，许可证 [MIT](LICENSE)。

不要对仓库根目录执行 `dsh plugin add`。根目录是 pnpm workspace，不是插件。按 `plugins/` 下的包路径安装。

## 插件

| 包 | 路径 | 说明文档 | 做什么 |
| --- | --- | --- | --- |
| [`dsh-passport`](plugins/passport) | `plugins/passport` | [EN](plugins/passport/README.md) · [中文](plugins/passport/README.zh.md) | 占用设置 → **模型**：官方订阅登录和 API Key 同一页，对话只显示勾选过的模型。 |
| [`dsh-hello`](plugins/hello) | `plugins/hello` | [EN](plugins/hello/README.md) · [中文](plugins/hello/README.zh.md) | Host-only 脚手架金丝雀，不是产品。用来确认 `pnpm new` 仍能构建、挂上。 |

## 安装

例如把 Passport 装进 web profile：

```bash
dsh plugin --profile web add github:kedoupi/dsh-plugins#path:plugins/passport
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
docs/               维护流程（[EN](docs/workflow.md) · [中文](docs/workflow.zh.md)）
```

根包不要声明 `dsh.bundle` 或 `dsh.profile`。Profile 在 `$DSH_HOME/profiles/`，不要写进这个仓库。

## 开发

硬性规则：[AGENTS.md](AGENTS.md)。步骤：[docs/workflow.zh.md](docs/workflow.zh.md)。和我一起开发时走 `/dsh-plugin`。

```bash
pnpm new greet                 # 或：pnpm new sidebar --kind mixed
pnpm install
# 把 greet 样例换成真实逻辑，然后：
pnpm --filter dsh-greet test
pnpm --filter dsh-greet build
node scripts/link-plugin.mjs --profile dsh-dev greet
```

要在 Web UI 里用：挂到 `web`，再 `dsh web`。
