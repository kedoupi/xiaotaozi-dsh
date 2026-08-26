# 小桃子DSH 桌面客户端（Tauri）

Mac 托盘 + 壳浏览器。不在原生层再做聊天 UI。引擎是官方 `dsh web`，界面就是 DSH Web。

## 两条产品线

| | 桌面版（发给最终用户） | 沙箱（开发） |
| --- | --- | --- |
| 谁用 | 小白；已安装的应用 | 我们改插件、`pnpm tauri dev` |
| 家目录 | 官网默认 `~/.dsh` | 仓库 `.dsh-home` |
| 端口 | **3080** | **3081** |
| Node / Python / pnpm / dsh | **打进安装包**，用户不要自己装 | 开发机 PATH / 仓库脚本 |
| 插件从哪来 | 安装包里的预构建种子；之后静默从 `s.xiaotaozi.cc/dsh/packs/` 拉包 | `link-plugin` 进沙箱 |
| 网络 | 大陆环境，禁止 GitHub / npm | 开发机随意 |

两套不要混。测试走测试，正式走正式。不要把仓库 `link:` 进 `~/.dsh`。不要在已安装的小桃子DSH.app 里验证 `link:` 的插件。

| 要做什么 | 用哪套 |
| --- | --- |
| 改插件源码、设置页、`link-plugin`、debug `pnpm tauri dev` | 沙箱 **3081**。`cfg(debug_assertions)` 才连 3081；不覆盖 sandbox 的 `link:` profile，也不拉 COS pack |
| pack 落地、公证、已安装的小桃子DSH.app | 正式 `~/.dsh` **3080**。测的是小白拿到的那条产品线 |
| 发出去的 `.dmg` | 正式 `~/.dsh` **3080** |

`pnpm tauri dev` 连沙箱 `.dsh-home` :3081。3081 已有 `pnpm dev` 就只开壳，不抢端口。起来失败就提示先跑 `pnpm dev`，**不要回退 3080**。`tauri build` / 安装包只认 `~/.dsh` :3080，release 二进制里不能出现探 3081 的路径。

用户看见的名字是 **小桃子DSH**。仓库包名 `xiaotaozi-dsh-desktop` 只给开发和 cargo 用。

## 给谁用

普通小白：电脑上没有 Node、Python、Homebrew、全局 `dsh`。所以 **Node + Python + 钉死的 dsh 必须打进安装包**。用户只装一个 `.dmg`。模型跑 `python` / `pip` 用包内 CPython，不要本机解释器。

开发插件和 `pnpm tauri dev` 只走沙箱 `.dsh-home`（3081）。

## 家目录和端口

**release / 安装包**用官网默认家目录：

| | 值 |
| --- | --- |
| `DSH_HOME` | `~/.dsh` |
| 端口 | **3080**（官方 `dsh web` 默认） |
| 壳窗口 | `http://127.0.0.1:3080/` |

**debug / `pnpm tauri dev`**（`cfg(debug_assertions)`）：

| | 值 |
| --- | --- |
| `DSH_HOME` | 仓库 `.dsh-home` |
| 端口 | **3081** |
| 壳窗口 | `http://127.0.0.1:3081/` |

release 下 3080 已被占用：不要换端口、不要抢。直接打开壳；若打不开，中文提示「端口被占用」。debug 下同样不抢 3081；失败提示先跑 `pnpm dev`，不要回退 3080。

不要用 `~/Library/Application Support/xiaotaozi-dsh/dsh`。release 不要用仓库 `.dsh-home`。

## 进程

1. 托盘常驻（打开 / 退出）。关窗口 = 藏到托盘，不是退出。
2. 壳窗口：系统 WebView（macOS WKWebView）加载 DSH Web。
3. sidecar：`dsh web --port 3080 --no-open --host 127.0.0.1`，`DSH_HOME=~/.dsh`。包内 Node + Python + dsh 在 `PATH` 最前，后面只接系统目录（`/usr/bin` 等），不继承本机 Homebrew / fnm / grok。`DSH_AGENTS_HOME=~/.dsh/agents`，不要去扫 `~/.agents/skills`。`pip` 默认清华镜像，用户不用翻墙装包。

本机已有 `dsh web :3080` 且听在 loopback：不再 spawn，只开壳（那就是本机那份 dsh，隔离不生效）。

spawn 后的就绪探活要同时盯子进程（`try_wait`）：若子进程已退出而 3080 仍有响应，说明端口在 spawn 与绑定之间被别人抢了——报「端口被占用」、不标记 `started_by_us`、清掉子进程句柄，绝不把外部服务认成自己的引擎，也不杀它。

退出：若是本 app spawn 的 sidecar 就停掉；不是我们起的不要杀。

壳已经在 `http://127.0.0.1:3080/` 时，托盘「打开」只 show/focus，不要 `location.replace` 整页重载。窗口藏到托盘时 WebView 不要后台挂起（`backgroundThrottling: disabled`）。不向 DSH 页注入 `window.__TAURI__`。壳在 DSH 页 load 完后只设 `window.__XIAOTAOZI_DESKTOP__=true`。宿主壳（品牌、Session log、「打开配置文件」、桃色 token）在 `dsh-hello` 的 slots / `overrideTokens` 里改，Chrome 里的 `dsh web` 不藏。主窗口导航只留 `http://127.0.0.1:3080/`（以及 splash）；不要把主窗口里的 https 跳转丢给系统浏览器，否则启动时一条授权子请求会弹出 Chrome。`window.open` / `target=_blank`：`https` 授权页走系统默认浏览器；loopback 只放行 OAuth 回调白名单，由壳自己 GET 给本机回调服务，不要 Safari、也不要离开 3080：`http` + `127.0.0.1`/`localhost`/`::1`（三者同权）+ 显式非特权端口（≥1024 且非 3080）+ 路径恰为 `/callback` 或 `/auth/callback`（query 允许；对应 grok 56121、codex 1455/1457、claude 临时端口）。白名单外的 loopback URL 一律丢弃——被 XSS 的 DSH 页不能借壳探测/触发本机任意端口。包内 Node / Python / `.node` / dylib 要单独 Developer ID + timestamp + hardened runtime（`macos-runtime.entitlements`），再整包公证；只签主程序过不了 notary。

Mac 安装包打开后要像 `xiaotaozi-desktop` 那样：自定义桃色背景、中间箭头、把应用拖进「应用程序」。窗口 660×438，图标 88px，应用在 (168, 186)，Applications 在 (492, 186)。背景在 `src-tauri/dmg/`；公证后的 `.app` 用 `pnpm dmg` 打这个布局，不要裸 `hdiutil -srcfolder`。

图标是**一枚**小桃子 IP：玩具质感的桃子抱着 DeepSeek 的电脑图标（圆角方块 App Icon / 按钮，蓝鲸 `#4D6BFE`）。不要两枚 logo 并排。

- Dock：原版小桃子的角落特写（脸在右下、叶子在左上），怀里抱一颗很小的 DeepSeek 电脑图标。`brand/peach-hug-ds-icon.png` → `app-icon-1024.png` → icns/ico。
- 状态栏：裁到桃子本身，PNG 留透明边，不要把整块橙色 App Icon 塞进 18pt 槽，不要再拼鲸鱼芯片。

## 安装包（小白）

Node、Python、dsh、pnpm、桌面应用版本的唯一规范源是仓库根 [`versions.json`](../../versions.json)。npm/Cargo/Tauri 清单保留各自要求的字面值，由 `pnpm check` 校验一致；`bundle-runtime.mjs` 必须直接读取该文件。

`Contents/Resources/runtime/`：

```
runtime/node/     versions.json 指定的 Node 官方发行（darwin-arm64 / darwin-x64）
runtime/python/   versions.json 指定的 CPython（python-build-standalone install_only_stripped）。`python` / `python3` 是 exec 到 `python3.12` 的包装，避免 Tauri 拷资源时把解释器拆成三份；版本仍是 `versions.json` 的 3.12.14，不跟 latest。
runtime/dsh/      versions.json 指定的 @deepseek-ai/dsh 与 pnpm（npm -g --prefix）
runtime/profile/  预装 web profile（hoisted node_modules + file: vendor/*.tgz）
```

装完后 `bundle-runtime.mjs` 会裁掉运行不需要的部分：Node `include/` / `npm` / `corepack`、Python 头文件和 idle/ensurepip、`*.map` / `*.d.ts`、测试和 README、以及当前 target 以外的 native / pdb / wasm。不删 `LICENSE`、当前平台的 `.node` / dylib、也不删 `profile/vendor/*.tgz`。用户机器上不编译 native addon，所以不要把头文件打进安装包。

插件：`hello`、`providers`、`memory`、`im`。不打 `agent-teams`。不要 github path，不要 `link:` 本仓库。

记忆用的 Noema（`noema-mcp`）是桌面客户端自己的引擎，跟小白机器无关。对应平台的 `@zseven-w/dsh-noema-<os-arch>` 打进预构建 profile，用户不用装 Noema、Rust 或可选依赖。

打包：在本机目标系统上跑 `pnpm bundle-runtime`（脚本：`scripts/bundle-runtime.mjs`）。中转目录是 `apps/desktop/.runtime-build/`，禁止写 `~/.dsh`。`tauri build` 会先跑这个脚本。已经打过的 runtime 再跑一遍也会裁剪，不必 `--force`。

第一次启动：若 `~/.dsh/profiles/web` 不存在，把模板整份拷过去（含 node_modules）。若已经有 web profile，不要整份覆盖；把安装包里的 `vendor/*.tgz` 和对应 `node_modules` 覆盖进四个官方插件，并写进 bundles。不跑 `pnpm install`，不访问 npm/github，不 `link:` 本仓库。sessions / credentials 留在 `~/.dsh`。sidecar 用包内 `node` 跑 `dsh` 的 `lib/bin.js`。Skill 只认 `$DSH_HOME/skills` 和当前项目的 `.dsh/skills` / `.agents/skills`，不认本机 `~/.agents` / `~/.grok`。

开发机可以暂时没有 `runtime/`，用 PATH 上的 `dsh`（仅 debug）。Release 没有 runtime 则中文报错，不要让用户去装 Node。

## 插件怎么到用户手里

仓库规范：[docs/conventions.md](../../docs/conventions.md) § Desktop plugin packs（中文：[docs/conventions.zh.md](../../docs/conventions.zh.md)）。步骤：[docs/workflow.md](../../docs/workflow.md) § Ship a desktop plugin pack。下面是产品说明，不要另开一套路径。

三条路单独走都不行：远程 npm/github 会卡大陆网络；只打进 dmg 则修插件就要发整包客户端；`link:` 只有开发机有源码。

拆成两层更新：

| 层 | 内容 | 怎么发 |
| --- | --- | --- |
| 应用 | 壳、bundled Node、钉死的 dsh | `.dmg` |
| 插件包 | hello / providers / memory / im 的 **预构建 profile 快照**（含 `node_modules`，baileys 已在打包机编译好） | 传到现有腾讯云 TCB COS：`https://s.xiaotaozi.cc/dsh/packs/`，不经过 GitHub、不新开 `dsh.xiaotaozi.cc` |

插件包和 `runtime/profile/` 同构。发布：沙箱里改完、测完、推进仓库，再：

```bash
cd apps/desktop
pnpm pack-plugins      # 写出 plugin-packs/*.tar.gz + latest.json
pnpm publish-pack      # tcb storage upload → s.xiaotaozi.cc/dsh/packs/
```

走小桃子已经在用的 CloudBase 存储桶（环境 `xiaotaozi-5g279pi414331d52`，自定义域 `s.xiaotaozi.cc`），对象前缀只准 `dsh/packs/`，不要和 `wallpaper/`、`uploads/`、`handwriting/` 混。凭证是 `~/.config/env/tencent/tcb.env`。禁止 GitHub Pages、禁止再申请 `dsh.xiaotaozi.cc`。

`s.xiaotaozi.cc` 前面是腾讯云 CDN。云存储默认大约缓存 2 分钟，而且 **404 也会被缓存**。`latest.json` 每次都覆盖同一个 URL，所以上传到 COS 不等于用户立刻看到新索引。`pnpm publish-pack` 在上传之后必须调 `PurgeUrlsCache`（`apps/desktop/scripts/tencent-cdn.mjs`），再等到 CDN 上的索引信封对得上才算成功。tar 文件名带 `packVersion`，当不可变对象；真正要刷的是索引。

`latest.json` 是 **Ed25519 签名信封**（`keyId` / `signed` / `signature`），不是裸 JSON。`keyId` 是 SPKI DER 的 SHA-256 前 16 位；`signed` 是 payload UTF-8 原始字节的 base64；签名精确覆盖这些原始字节。客户端用内嵌 DER 公钥核对 `keyId`、验签后才解析 payload。不会验签的旧客户端必须先升级应用，不能把索引降级成裸 JSON。

只在初次建钥时运行 `pnpm generate-pack-key`。提交 `src-tauri/keys/pack-signing-key.der`；私钥存放在 `~/.config/xiaotaozi-dsh/pack-signing-key.pem`（按用户、在仓库之外，worktree/分支共用，需离机备份），绝不入库。查找顺序：`XIAOTAOZI_PACK_SIGNING_KEY` secret（PEM 内容或文件路径）→ 用户目录默认位置 → 仓库内旧位置 `.pack-signing/`（兼容读取并提示迁移）。轮换必须同时发布新公钥应用，不能静默覆盖现有密钥。

多平台同一版本：先在一个目标系统跑 `pnpm pack-plugins`，然后把完整 `plugin-packs/`（已签名索引和已有 tarball）传给下一目标构建机。metadata 相同、target 尚不存在时，打包器沿用同一个 `packVersion` 并追加 target；最后发布机必须拥有索引引用的每个 tarball。不要分别生成多个时间戳再手工拼 JSON。

### 用户侧：静默更新，不开弹窗

小白看不懂「是否更新插件」。要保持更新，就 **自动来**：

1. 第一次：用安装包里的种子，**完全离线**，不跑 pnpm，不访问任何网站。
2. 之后启动：后台请求 `https://s.xiaotaozi.cc/dsh/packs/latest.json`（连接 5 秒、总超时 180 秒，索引最多读 1 MiB，不跟随重定向）。只接受正式域名的 HTTPS `/dsh/packs/`；URL 带凭证、query、fragment，或指向其他 host/path 都拒绝。仅 debug + 显式环境变量允许 loopback HTTP。
3. 信封验签通过后，检查 `packVersion`、`minApp`、`dsh`、`node` 和当前 target。包必须声明 `Content-Length`，非零且不超过 512 MiB；流式下载实际字节数必须等于声明，SHA-256 必须一致。失败、证书不行、验签/hash/size 不符 → 当没发生并删除半包。
4. tar.gz 只解普通文件/目录；拒绝绝对路径、`..` 穿越、symlink/hardlink 和其他 entry type。先解临时目录，再复制当前 profile 到 `.web-staging`、覆盖官方插件并验证 package/node_modules 完整性。
5. 用 `.web-backup` 做原子切换。若上次崩溃留下 backup，下次先恢复；若换目录、启动或 90 秒健康检查失败，恢复 backup 并重新拉起旧版本；成功后才清理 retired/backup。
6. sidecar 是本应用拉起时才停止、切换、重启并健康检查。若 3080 是用户自己的官网 `dsh web`，只更新磁盘、不杀外部进程，stamp 标记 `cdn-next-launch`，下次启动生效。
7. 全程静默，不开更新弹窗，不让用户打开 GitHub、终端或浏览器下载。

### 发布前测试

- 仓库根：`pnpm check`、`pnpm check:build`、`pnpm check:path`、`pnpm check:desktop`
- 首次安装/已有 profile 覆盖；每个支持 target 的包内 Node/dsh/pnpm 和 `versions.json` 一致
- Node 生成信封与 Rust 验签 golden；未知 key、坏签名、坏 JSON、过高 `minApp`
- 非 HTTPS/错 host/错 path/重定向，以及错 Content-Length、超限、截断、错 SHA-256
- tar 路径穿越/链接拒绝；staging 校验失败不切换；健康检查失败和崩溃残留均回滚
- 本应用 sidecar 更新后重启；外部 3080 不被杀且下次启动生效
- 多平台聚合后所有 targets 共用一个 `packVersion`，最终发布机有每个索引引用文件

日常门禁不得运行真实 `publish-pack`、CDN purge 或正式 runtime/安装包打包。

禁止：npm registry、`github:` path、`link:`、在用户机器上编译 baileys。

设置里以后可以加只读的「插件包版本」；第一期不需要「检查更新」按钮。

## 不做

- 内嵌 Chromium（除非 WKWebView 跑 DSH 登录失败，再评估）
- 在壳里重做模型/会话 UI
- 把本仓库插件 `link:` 进 `~/.dsh`
- Windows 和 Linux 客户端（以后再说）
