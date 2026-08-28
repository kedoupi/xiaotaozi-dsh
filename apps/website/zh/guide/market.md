# 插件市场

自研插件首次启动自动种上，其余插件都从应用内市场安装：打开侧边栏 **新会话** 下方的 **市场**。列出的插件直接从上游 Git 仓库或 npm 包安装，不做二次托管。

当前 profile 已装的会显示 **已安装**，否则点 **安装** 即可。

## 当前目录

| 插件 | 作用 | 上游 |
| :-- | :-- | :-- |
| Agent Teams | 跑多智能体团队 | [NanmiCoder/dsh-agent-teams](https://github.com/NanmiCoder/dsh-agent-teams) |
| Session Context | 查看模型窗口里有什么 | [bowenliang123/dsh-context](https://github.com/bowenliang123/dsh-context) |
| OpenContext | 长期记忆 / 回忆 | [melandlabs/opencontext](https://github.com/melandlabs/opencontext) |

## 用命令行安装

习惯终端的话，同样的安装可以走官方 `dsh` CLI：

```bash
dsh plugin --profile web add github:NanmiCoder/dsh-agent-teams
dsh plugin --profile web add github:bowenliang123/dsh-context
dsh plugin --profile web add github:melandlabs/opencontext#path:plugins/dsh-opencontext
```

::: warning
用 `dsh plugin --profile web`，不是 `xtz plugin` —— `xtz` 刻意禁用了插件管理，保证官方 home 只有一个写入者。
:::

## 给插件作者

任何能以 `github:user/repo` 或 `github:user/repo#path:plugins/<name>` 安装的 DeepSeek Harness 插件都可以上架。请把 `prepare` 和构建配置放在插件包内部，保证孤立的 Git path 安装也能构建。公开发现用 GitHub topic [`dsh-plugin`](https://github.com/topics/dsh-plugin)；想进目录请[提 issue](https://github.com/kedoupi/xiaotaozi-dsh/issues)。
