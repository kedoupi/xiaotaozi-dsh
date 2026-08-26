# 小桃子 CLI（`xtz`）

[English](README.md) | 中文

`xtz` 是小桃子 DSH 的命令行主产品，面向熟悉终端和配置的用户。`apps/cli/` 是独立、可发布的 pnpm workspace，不是 Harness 插件，也不加入根目录的 `plugins/*` workspace。

首版定位是**只读安全基础**：它只检查正式环境 `~/.dsh` 和 `127.0.0.1:3080`，不会启动 DSH、执行任务、打开身份未验证的服务，或修改正式 profile；也不会探测或回退到仓库沙箱 `.dsh-home` / `3081`。

CLI 运行时精确固定为 Node.js `22.19.0` 和 `@deepseek-ai/dsh` `0.1.1-rc.2`，其他 Node 或 DSH 版本都不视为兼容。

## 当前开放命令

```bash
xtz --help               # 显示帮助
xtz --version            # 显示 CLI 版本
xtz version              # 显示 CLI、Node 和固定 DSH 版本
xtz status               # 只读检查 3080
xtz config path          # 显示正式 web profile 的补丁路径
xtz plugin list          # 直接读取 package.json 中的插件依赖
xtz doctor               # 只读检查运行时、Desktop 种子、profile 和端口元数据
```

即使 3080 返回了 HTTP，`xtz` 也只报告“端口已占用但身份未验证”；在可信的服务身份协议落地前，不会宣称它是健康的小桃子服务。

## 有意禁用

首版中，`start`、`web`、`open`、`run`、`ask`、`config dump`、`config defaults`、`stop`、`update` 都会安全拒绝。只有 Desktop 与 CLI 共同具备下面三项能力后才会开放：

1. 能证明引擎归属并管理生命周期的可信跨进程 supervisor；
2. 能验证 3080 监听者的服务身份协议；
3. 对正式 profile 准备和插件包更新加锁的事务边界。

因此首版也不承诺与 Desktop/Web 插件环境等价的 headless 任务能力。DSH 层看似只读的命令也可能准备或重写生成态 profile；当前 `xtz` 不会对 `~/.dsh` 调用它们。正式插件更新仍由 Desktop 验签并事务应用。

## 本仓库开发

```bash
cd apps/cli
pnpm install
pnpm check
pnpm link --global
xtz --help
```

## 退出码

- `0`：请求的只读操作成功。
- `1`：服务未运行或就绪检查失败。
- `2`：参数错误、端口监听者身份未验证，或操作被安全策略拒绝。
