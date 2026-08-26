# 小桃子DSH（Tauri）

Mac 托盘 + 壳浏览器。家目录是官网默认 `~/.dsh`，端口 **3080**。用户安装包必须内置 Node + dsh，用户机器上不需要任何工具链。

本机 `pnpm tauri dev` 只在 debug：仓库沙箱 `.dsh-home` **3081**（`link:` 的插件）。已安装的小桃子DSH.app 和 `tauri build` 仍走正式 `~/.dsh` **3080**。release 绝不探 3081。不要把仓库 `link:` 进 `~/.dsh`。规范：仓库 [docs/conventions.zh.md](../../docs/conventions.zh.md)「家目录」。

依据：[DESIGN.md](DESIGN.md)。英文：[README.md](README.md)。

## 开发（本机已有 `dsh`）

```bash
cd apps/desktop
pnpm install
pnpm tauri dev
```

没有 `src-tauri/runtime/` 时，debug 用 PATH 上的 `dsh`。Release 没有 runtime 会中文报错，不会让用户去装 Node。

## 打用户运行时

从仓库 [`versions.json`](../../versions.json) 读取 Node、Python、dsh、pnpm、应用版本，把 `hello` / `sidebar` / `providers` / `memory` / `im` 打成 tarball，再写成 hoisted 的 `web` profile。中转目录是 `apps/desktop/.runtime-build/`，不会写 `~/.dsh`。

```bash
cd apps/desktop
pnpm bundle-runtime
pnpm tauri build
pnpm dmg
```

Mac 安装包打开后是小桃子桌面那套「拖进应用程序」窗口（背景、箭头、Applications 快捷方式）。公证完 `.app` 之后跑 `pnpm dmg`，不要裸 `hdiutil`。

`tauri build` 会先跑打包脚本。第一次启动：没有 web profile 就整份拷种子；已有则用安装包里的预构建覆盖官方插件，不跑 pnpm。之后后台静默从 `https://s.xiaotaozi.cc/dsh/packs/` 拉插件包（现有 TCB COS，不去 GitHub，不开 `dsh.xiaotaozi.cc`），失败就当没发生。不要 `link:` 本仓库进 `~/.dsh`。

```bash
pnpm pack-plugins    # 生成 tar.gz + 签名过的 latest.json
pnpm publish-pack    # tcb 上传，并 PurgeUrlsCache 刷新 s.xiaotaozi.cc/dsh/packs/
```

## 签名插件包发布

`latest.json` 是 Ed25519 信封：`keyId`、base64 的 `signed` payload 原始字节，以及对这些字节的签名。客户端先匹配内嵌公钥并验签，再解析并检查 `minApp`、runtime 版本和 target metadata。不会验签信封的旧客户端必须先升级应用，绝不能发布裸 JSON 兼容它。

```bash
pnpm generate-pack-key
```

命令把私钥写到 `~/.config/xiaotaozi-dsh/pack-signing-key.pem`（按用户存放，在所有 checkout 之外，切分支和 worktree 共用同一份——务必做离机备份），把应提交的 DER 公钥写到 `src-tauri/keys/pack-signing-key.der`。私钥不得提交、不得放进产物；发布自动化用 `XIAOTAOZI_PACK_SIGNING_KEY` secret 传 PEM 内容或路径；仓库内旧位置 `.pack-signing/` 仍可读取，但会提示迁移。

每个原生 target 都在对应系统构建。构建机之间完整传递 `plugin-packs/`：metadata 相同且 target 是新增项时，`pack-plugins` 会沿用同一个 `packVersion` 并聚合 target。最终发布机必须收齐聚合索引引用的全部 tarball。

正式客户端只接受 `s.xiaotaozi.cc` 的 HTTPS `/dsh/packs/` URL（仅 debug 可覆盖到 loopback），拒绝凭证、query、fragment 和重定向。下载必须有 `Content-Length`，大小非零且不超过 512 MiB，实际字节数和 SHA-256 必须完全一致；tar 只允许无路径穿越、无链接的普通文件/目录。更新先解到临时目录，覆盖进 `.web-staging` 并校验，再用 `.web-backup` 原子切换；健康检查失败或中断时恢复已知可用版本。

sidecar 是本应用拉起时，应用才会停止、切换、重启并做健康检查。若 3080 属于外部进程，绝不杀进程，只落盘，下一次启动生效。

发布前运行仓库的 `pnpm check`、`pnpm check:build`、`pnpm check:path`、`pnpm check:desktop`。测试首次安装、正常更新、坏签名/URL/hash/size/tar 拒绝、健康检查失败回滚、崩溃恢复，以及 3080 被外部进程占用。日常验证禁止运行 `publish-pack` 或真实安装包/runtime 打包。

规范：仓库 [docs/conventions.zh.md](../../docs/conventions.zh.md)「桌面插件包」和 [DESIGN.md](DESIGN.md)。

图标：`pnpm icons` 重打原版小桃子那种角落特写（怀里抱一颗很小的 DeepSeek 电脑图标）给 Dock；状态栏裁到桃子并留透明边，避免整块橙色铺满 18pt。
