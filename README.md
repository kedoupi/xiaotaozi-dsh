# dsh-plugins

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件 monorepo。一个小插件是一个可独立安装的 npm 包，许可证 [MIT](LICENSE)。

当前产品是 [`plugins/passport`](plugins/passport)：占用设置 → **模型**，把官方订阅登录和 API Key 放在同一页，对话只显示勾选过的模型。

## 安装

不要对仓库根目录执行 `dsh plugin add`。按插件路径装：

```bash
dsh plugin --profile web add github:kedoupi/dsh-plugins#path:plugins/passport
dsh web
```

打开 **设置 → 模型**。改完源码要重新 `build`，并重启正在跑的 `dsh`。

GitHub 仓库请带 topic [`dsh-plugin`](https://github.com/topics/dsh-plugin)，生态目录靠这个发现插件。

## 结构

```text
plugins/passport/   # 产品：订阅 + API Key → 勾选对话模型
plugins/hello/      # host-only 脚手架金丝雀，不要当功能插件改
plugins/<slug>/     # 可发布的插件，包名 dsh-<slug>
packages/           # 内部库（没有 dsh.bundle），有复用再加
templates/          # pnpm new 用的 host / mixed 模板
```

根包是 workspace，不要给它声明 `dsh.bundle`。Profile 在 `$DSH_HOME/profiles/`，不要写进这个仓库。

## 开发

怎么创建、安装、提交、优化：见 [docs/workflow.md](docs/workflow.md)。和我一起开发时走 skill `/dsh-plugin`。硬性规则在 [AGENTS.md](AGENTS.md)。

```bash
pnpm new greet
pnpm install
# 把 greet 样例换成真实逻辑，然后：
pnpm --filter dsh-greet test
pnpm --filter dsh-greet build
node scripts/link-plugin.mjs --profile dsh-dev greet
```

要在 Web UI 里用：`node scripts/link-plugin.mjs --profile web greet`，再 `dsh web`。
