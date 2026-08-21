# __PACKAGE__

[English](README.md) | 中文

__DESCRIPTION__

Host + Web Client 骨架。即使工作主要在 `src/client`，也要保留 `src/index.ts` 作为 Cordis Host 入口。

属于 [dsh-plugins](https://github.com/kedoupi/dsh-plugins) monorepo。

## 安装

```bash
dsh plugin --profile <name> add github:kedoupi/dsh-plugins#path:plugins/__SLUG__
```

改了 Slot / 主题 / 文案之后，让 `dsh.client.inject` 和 Client 的 `export const inject` 与实际用到的服务一致。
