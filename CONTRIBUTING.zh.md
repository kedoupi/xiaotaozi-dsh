# 参与贡献

[English](CONTRIBUTING.md) | 中文

本仓库是小桃子 DSH：用户产品是 `xtz`（`apps/cli/`），自研插件在 `plugins/`。没有桌面客户端。

文档地图：[docs/README.zh.md](docs/README.zh.md)。  
规范（事实）：[docs/conventions.zh.md](docs/conventions.zh.md)。  
步骤（怎么做）：[docs/workflow.zh.md](docs/workflow.zh.md)。  
给 Agent 的硬性规则：[AGENTS.md](AGENTS.md)。

## 日常循环

```bash
git clone https://github.com/kedoupi/xiaotaozi-dsh.git
cd xiaotaozi-dsh
pnpm install
```

| 你在改 | 这样做 | 不要 |
| --- | --- | --- |
| 某个插件 | `pnpm dev`（沙箱 `.dsh-home`，端口 **3081**） | 把本仓 `link:` 进 `~/.dsh` |
| `xtz` | `cd apps/cli && pnpm install && pnpm check`（假 home） | 假设根目录 `pnpm install` 已经装好 CLI |
| 正式用户路径 | 对 `~/.dsh` **3080** 跑 `xtz start` | 探测 3081、抢 3080、或 `rm -rf ~/.dsh` |

改插件时让 `pnpm dev` 一直跑。它会重编 `lib/`，Host 产物变了才重启 `xtz --sandbox`。

仓库根 hub 保持干净的 `main`，并独占沙箱 **3081**。开发落在短生命周期主题分支 / worktree，合一个绿 PR，再快进 hub 并在 `main` 上把受影响的真实旅程走一遍。规范：[docs/conventions.zh.md](docs/conventions.zh.md)「Git」。步骤：[docs/workflow.zh.md](docs/workflow.zh.md)「开发环境」。

## 门禁

在仓库根运行。它们都不发布。

| 命令 | 保证什么 |
| --- | --- |
| `pnpm check` | 版本/文档/清单策略、类型、插件测试、脚本测试 |
| `pnpm check:build` | 构建插件并检查必需的 `lib/` |
| `pnpm check:path` | 隔离的 Git `#path:plugins/<slug>` 安装能构建 |
| `pnpm check:cli` | 独立的 `apps/cli` workspace |
| `pnpm check-home` | 诊断 `~/.dsh` 的危险链接；绝不自动修 |

提交前：`pnpm check`，相关插件 `build` 过，`pnpm check-home` 绿（正式 home 未挂本仓）。标题：`<type>(<scope>): <imperative summary>`。`scope` 用插件 slug，仓库级用 `repo`。不要提交 `lib/`、`node_modules`、`.dsh-home/`、`$DSH_HOME`。除发布提交外不要改 `cliApp` 或插件版本（见 [docs/conventions.zh.md](docs/conventions.zh.md)「版本」）。合入 `main` 优先走 PR，让 CI 先跑。发 `xiaotaozi-dsh-cli` 走 git tag + GitHub Actions，不要在笔记本上 `npm publish`（[docs/workflow.zh.md](docs/workflow.zh.md)「发一枪产品快照」）。

## 改动放哪

| 种类 | 路径 |
| --- | --- |
| 自研插件 | `plugins/<slug>/`，用 `pnpm new` |
| 第三方插件 | `plugins/market` 的 `MARKET_PLUGINS` 一行 — 不要 vendor 源码 |
| 用户产品 | `apps/cli/` |
| 对外网站 | `apps/website/` |
| 规范 / 步骤 | `docs/` |

不要加 `apps/desktop/`、`packages/`、`externals/`。Desktop 历史：`git show archive/desktop`。
