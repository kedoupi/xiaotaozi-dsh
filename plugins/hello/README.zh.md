# dsh-hello

[English](README.md) | 中文

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Host-only 脚手架金丝雀，不是产品插件。

用来确认 `pnpm new` 的 host 模板仍能构建、测试、挂上 profile。样例工具是 `hello`（问候）。不要在这里加功能；新产品走 `pnpm new <slug>`。

属于 [`dsh-plugins`](https://github.com/kedoupi/dsh-plugins) monorepo。

## 安装

从本仓库克隆：

```bash
dsh plugin --profile <name> add github:kedoupi/dsh-plugins#path:plugins/hello
```

在 workspace 里开发时：

```bash
node scripts/link-plugin.mjs --profile dsh-dev hello
```

## 配置

| 字段 | 默认 | 含义 |
| --- | --- | --- |
| `greeting` | `Hello` | `hello` 工具用的前缀 |
