<h1 align="center">__PACKAGE__</h1>

<p align="center"><b>__DESCRIPTION__</b></p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./README.zh.md">中文</a> ·
  <a href="https://github.com/kedoupi/dsh-plugins">dsh-plugins</a>
</p>

<p align="center">
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT"></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/topic-dsh--plugin-0ea5e9?style=flat-square" alt="dsh-plugin"></a>
</p>

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Host 插件骨架。属于 [`dsh-plugins`](https://github.com/kedoupi/dsh-plugins) monorepo。不要对仓库根目录执行 `dsh plugin add`。

## 安装

```bash
dsh plugin --profile <name> add github:kedoupi/dsh-plugins#path:plugins/__SLUG__
```

## 配置

| 字段 | 默认 | 含义 |
| :-- | :-- | :-- |
| `greeting` | `Hello` | `__ID__` 工具用的前缀 |

## 文档

| 文档 | 什么时候看 |
| :-- | :-- |
| [流程](../../docs/workflow.zh.md) | 创建、安装、优化、提交 |
| [规范](../../docs/conventions.zh.md) | 包身份、两套 home |

## License

[MIT](../../LICENSE)
