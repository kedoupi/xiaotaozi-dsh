# dsh-plugins

DeepSeek Harness 插件 monorepo。一个小插件是一个可独立安装的 npm 包。许可证 [MIT](LICENSE)。

产品插件是 [`plugins/passport`](plugins/passport)（设置 → 模型）。[`plugins/hello`](plugins/hello) 只是 host 模板金丝雀，不要当功能插件改。

怎么创建、安装、提交、优化：见 [docs/workflow.md](docs/workflow.md)。和我一起开发时走 skill `/dsh-plugin`。硬性规则在 [AGENTS.md](AGENTS.md)。

## 结构

```text
plugins/passport/   # 产品：订阅 + API Key → 勾选对话模型
plugins/hello/      # host-only 脚手架金丝雀
plugins/<slug>/     # 可发布的插件，包名 dsh-<slug>
packages/           # 内部库（没有 dsh.bundle），有复用再加
templates/          # pnpm new 用的 host / mixed 模板
```

根包是 workspace，不要给它声明 `dsh.bundle`。Profile 在 `$DSH_HOME/profiles/`，不要写进这个仓库。

## 最短路径

```bash
pnpm new greet
pnpm install
# 把 greet 样例换成真实逻辑，然后：
pnpm --filter dsh-greet test
pnpm --filter dsh-greet build
node scripts/link-plugin.mjs --profile dsh-dev greet
```

要在 Web UI 里用：`node scripts/link-plugin.mjs --profile web greet`，再 `dsh web`。

仓库打 GitHub topic `dsh-plugin` 才会出现在生态目录里。
