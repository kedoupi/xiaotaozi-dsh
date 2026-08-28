# 下载

用户产品是 `xtz` CLI。界面是官方 `dsh web`，开在浏览器里。没有桌面安装包（历史在 git 标签 `archive/desktop`）。

需要 Node.js **22.19.0** 已在 `PATH` 上。

| 方式 | 命令 |
| --- | --- |
| npm | `npm install -g xiaotaozi-dsh-cli` |
| bun | `bun add -g xiaotaozi-dsh-cli` |
| 脚本 | 仓库 `apps/cli/scripts/install.sh` |

```bash
xtz --help
xtz start
xtz doctor
```

第一次 `xtz start` 会种上全部自研插件。额外插件走应用内市场，或 `dsh plugin --profile web add`。
