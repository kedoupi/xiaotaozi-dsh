# 项目规范

[English](conventions.md) | 中文

硬性规则：[AGENTS.md](../AGENTS.md)。步骤：[workflow.zh.md](workflow.zh.md)。本文件是这两者默认成立的项目约定。

## 仓库是什么

这是小桃子 DSH（`xiaotaozi-dsh`），面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)：可安装插件，以及 Win/Mac Tauri 客户端。仓库根不是插件，不要对根执行 `dsh plugin add`。

| 路径 | 作用 |
| --- | --- |
| `plugins/<slug>/` | 一个可独立安装的包，包名 `dsh-<slug>` |
| `apps/desktop/` | Win/Mac Tauri 客户端（小桃子DSH）。不是 pnpm workspace 成员 |
| `packages/` | 禁止。Git path 安装带不走共享 workspace。辅助代码复制，或单独发 npm |
| `externals/<name>/` | 上游插件的只读 git submodule。只当对照，永远不要安装 |
| `templates/` | `pnpm new` 的骨架。不要改模板来做新插件 |
| `scripts/` | `pnpm new`、`link-plugin`、`check-manifest`、`doctor`、沙箱启动 |
| `.dsh-home/` | gitignore 掉的沙箱 Harness 家目录，不是 `~/.dsh` |
| `versions.json` | dsh RC、Node、Python、pnpm、桌面应用版本的唯一规范源 |

对外文档默认英文 `README.md`，中文是 `README.zh.md`。仓库根和每个插件都要成对。

## Externals

`externals/` 是上游对照。`plugins/` 是我们二次开发后要装的 fork。用户和沙箱**只装** `plugins/<slug>`。步骤见 [workflow.zh.md](workflow.zh.md)「从上游 fork」。

### 何时收

同时满足下面三条，才加 pin **并且** fork：

- 它是（或很容易变成）一个 DeepSeek Harness 插件
- 许可证能跟：Apache-2.0、MIT、BSD 或同等宽松许可
- 我们会二次开发（catalog 布局、钉 host rc、中文文案、加功能）**并且**会安装这个 fork

不要加进 `externals/`：

- 只想收藏、不打算维护 fork 的项目（star 就行，不要 submodule）
- `deepseek-harness` 本身（已经禁止 vendor）
- 不是插件的库、应用、整仓
- 我们已经有同职责的插件、只是实现不同，除非明确要换掉现有的
- 自研插件（`providers`、`memory`、`im`、`hello`）没有上游，不要伪造 submodule

`externals/` 不是观察列表。每个 pin 都必须有对应、真正会装的 `plugins/<slug>`。只有 pin 没有 fork，克隆白白多拖一个仓库。

### Pin 和 fork

- 不进 pnpm workspace。`pnpm install`、`pnpm check`、`pnpm new`、`link-plugin` 都不管它们。
- 不要改 submodule 里的文件。不要在 `externals/` 下 `pnpm new`。不要 `link:` / `dsh plugin add` `externals/` 下的路径。已经有 fork 时，不要让用户去装上游 npm 包。不要把我们的 fork 和上游 npm 装进同一个 profile。
- `externals/` 下的目录沿用上游仓库名（`dsh-context`）。`plugins/` 下是我们的 slug，不要 `dsh-` 前缀（`plugins/context`）。包名是 `dsh-<slug>`。上游已经发布过 `dsh-<slug>` 就保留这个包名，用户卸 npm 再装 fork 时对得上。
- 第一次 fork：`pnpm new <slug>`，把上游 `src` 迁进 `plugins/<slug>`，再按本仓库门禁收（tsdown `neverBundle: true`、host rc 钉死、测试、`NOTICE` + 上游 `LICENSE`、双语 README）。之后只改 fork。
- fork 的 README 写明上游是谁、Git 安装路径，以及不要和作者的 npm 装在一起。插件里如果有指向作者 npm 的升级提示，关掉。
- 根 README 两张表都加：可安装插件表，以及 `externals/…` → `plugins/…` 对照。
- 作者有更新：`git submodule update --remote externals/<name>`，对照 `externals/<name>/src` 和 `plugins/<slug>/src`，把要的改动迁进 fork。不要整棵覆盖我们的二次开发。两次提交：先升 gitlink，再提交插件。
- 克隆用 `git clone --recurse-submodules`；已经裸克隆的话再 `git submodule update --init`。
- Git 安装永远是 `github:kedoupi/xiaotaozi-dsh#path:plugins/<slug>`，不要 `#path:externals/…`。

## 家目录

本仓库的工作用两套 home。已发布的 Tauri 客户端用官网默认家目录。

| | 桌面版（发给用户） | 沙箱（开发必需） |
| --- | --- | --- |
| 谁用 | 小白；本机也可能有官网 `dsh` | 本仓库，改插件 |
| 家目录 | `~/.dsh`（Windows 为 `%USERPROFILE%\.dsh`） | `<仓库>/.dsh-home`（gitignore） |
| 端口 | **3080** | **3081** |
| 启动 | 小桃子DSH.app（内置 Node + dsh）或 `dsh web` | `pnpm dev` / `link-plugin` |
| 插件 | 安装包预构建种子；静默从 `https://s.xiaotaozi.cc/dsh/packs/` 更新；禁止 GitHub/npm/`link:` | `link:` 到本仓库 |

- 桌面端和官网共用 `~/.dsh`。安装包内置 Node，小白不用自己装工具链。3080 已被占用就不要抢。
- 不要 `link:` 或 `dsh plugin add ./plugins/<slug>` 进 `~/.dsh`。`node scripts/doctor.mjs` 只诊断：发现日常 profile 指向本仓就失败并列出，不会编辑或自动修复 profile。
- 沙箱：只给插件调试。`link-plugin` 和 `pnpm dev` 把 `DSH_HOME` 指到 `.dsh-home`。

沙箱要密钥：只拷 `~/.dsh/.credentials.yaml` 进 `.dsh-home/`。不要拷 `sessions/`、`storages/`。

不要把 `deepseek-harness` vendor 进本仓库，也不要改它。类型和 API 走已发布的 `@deepseek-ai/*`。

## 桌面插件包

两条分发路径，不要混。

| | 开发者 | 小白桌面 |
| --- | --- | --- |
| 谁 | 有 Node / git 的人 | 小桃子DSH.app |
| 发出去的是 | 单个 `dsh-<slug>` | 预构建 `web` profile 快照：hello / providers / memory / im |
| 怎么到 | `pnpm --filter dsh-<slug> publish` 或 Git `#path:plugins/<slug>` | 静默覆盖四个官方插件 |
| 宿主 | GitHub / npm | 小桃子现成的 TCB COS，**不开新域名** |

插件包宿主（硬规则）：

| | 值 |
| --- | --- |
| 桶 | CloudBase 环境 `xiaotaozi-5g279pi414331d52`（和小桃子主仓同一个） |
| 公网域名 | `s.xiaotaozi.cc` |
| 前缀 | 只准 `dsh/packs/` |
| 索引 | `https://s.xiaotaozi.cc/dsh/packs/latest.json`（每次覆盖，**签名信封**） |
| 对象 | `https://s.xiaotaozi.cc/dsh/packs/xiaotaozi-plugins-<packVersion>-<target>.tar.gz`（不可变） |
| 凭证 | `~/.config/env/tencent/tcb.env` |
| 命令 | `cd apps/desktop && pnpm pack-plugins && pnpm publish-pack` |

- 不要申请 `dsh.xiaotaozi.cc`。小白路径禁止 GitHub Pages、npm、`link:`。
- 不要写进 `wallpaper/`、`uploads/`、`handwriting/`、`xiaotaozi-home/`。
- 客户端只接受 `https://s.xiaotaozi.cc/dsh/packs/`，GitHub URL 直接丢弃。失败当没发生。静默。不开更新弹窗。
- 传到 COS 不算发布。`s.xiaotaozi.cc` 前面是腾讯云 CDN，默认大约缓存 2 分钟，**404 也会被缓存**。`pnpm publish-pack` 必须调 `PurgeUrlsCache`，等到线上索引对得上才算成功。tar 文件名带 `packVersion`；每次必刷的是 `latest.json`。
- 打包中转是 `apps/desktop/.runtime-build/` 和 `apps/desktop/plugin-packs/`（gitignore）。打包脚本禁止写 `~/.dsh` 和 `.dsh-home`。用户机器上不跑 `pnpm install`。
- 在 **目标系统** 上打包。`darwin-arm64` 在 Apple Silicon；Windows 在 Windows。`publish-pack` 把各平台 `targets` 合并进同一份索引。
- 产品说明：[apps/desktop/DESIGN.md](../apps/desktop/DESIGN.md)。步骤：[workflow.zh.md](workflow.zh.md)「发桌面插件包」。

### 索引信封

`latest.json` **不是**裸 payload。打包和上传脚本写出信封，客户端验签后才解析。旧客户端必须先升级应用；不能发布未签名兼容 JSON，改字段必须两边一起改。

```json
{
  "keyId": "<sha256(SPKI DER) 十六进制前 16 位>",
  "signed": "<base64(UTF-8 JSON payload)>",
  "signature": "<base64(对 signed 原始字节的 Ed25519 签名)>"
}
```

解开后的 payload：

```json
{
  "packVersion": "20260825T030144787Z",
  "minApp": "0.1.0",
  "dsh": "0.1.1-rc.2",
  "node": "22.19.0",
  "plugins": {
    "dsh-hello": "0.2.0",
    "dsh-providers": "0.2.0",
    "dsh-memory": "0.1.0",
    "dsh-im": "0.1.0"
  },
  "targets": {
    "darwin-arm64": {
      "url": "https://s.xiaotaozi.cc/dsh/packs/xiaotaozi-plugins-<packVersion>-darwin-arm64.tar.gz",
      "sha256": "<hex>",
      "sizeBytes": 15378629
    }
  }
}
```

| 钥匙 | 路径 | Git |
| --- | --- | --- |
| 私钥 | `~/.config/xiaotaozi-dsh/pack-signing-key.pem` | 在所有 checkout 之外。`pnpm generate-pack-key` |
| 公钥 | `apps/desktop/src-tauri/keys/pack-signing-key.der` | 进库，打进客户端 |

私钥按用户存放、不跟 checkout 走：切分支、worktree、重新 clone 读的都是同一份，不会被 `git clean` 或新 worktree 弄丢。所有脚本统一查找顺序：`XIAOTAOZI_PACK_SIGNING_KEY`（PEM 内容或路径；CI/发布自动化用它）→ 上面的用户目录路径 → 仓库内旧位置 `apps/desktop/.pack-signing/`（兼容读取，提示迁移）。务必做离机备份——私钥丢失只能轮换公钥并随新版应用发布。

客户端必须：用内嵌公钥核对 `keyId`、验签、再解析 payload。未知钥匙、签名坏、JSON 坏、`url` 不在白名单、sha256 对不上 → 忽略这次更新，不要弹窗。只运行一次 `cd apps/desktop && pnpm generate-pack-key`（任一位置已有密钥都会拒绝轮换）；只提交公钥 DER，绝不提交私钥 PEM。

## 宿主版本

全局 CLI 钉在 `@next`，当前是 `0.1.1-rc.2`：

```bash
pnpm add -g @deepseek-ai/dsh@0.1.1-rc.2
```

很多 `@deepseek-ai/dsh-*` 的 `latest` 还停在空壳 `0.0.1-rc.1`，安装必须写死版本（`0.1.1-rc.2`）。插件里的 `@deepseek-ai/dsh-*` pin 必须和宿主 rc 一致。`@next` 前进时，模板和插件的 `devDependencies` 一起改。

## 包身份

一个插件，四个名字必须对齐：

| 位置 | 取值 |
| --- | --- |
| 目录 | `plugins/<slug>/` |
| `package.json` `name` | `dsh-<slug>` |
| `cordis.patch.yml` `name` | `dsh-<slug>` |
| patch `id` / `export const name` | `<slug>` |

slug：小写 `[a-z][a-z0-9-]*`，不能 `--`，目录不要带 `dsh-` 前缀（`pnpm new` 会剥掉）。

Git 安装：

```text
github:kedoupi/xiaotaozi-dsh#path:plugins/<slug>
```

这条路径只包含一个插件目录。仓库里没有共享的 `packages/` workspace，因为它进不了 path 安装。辅助代码放在插件包内；两段插件真要共用，就复制一小段，或单独发 npm 包。

改名等于上面全部一起改，加上磁盘上的 `$DSH_HOME/plugins/<slug>/`，再加上沙箱里重新 `link-plugin`。profile 里不要留旧包名。

小桃子相关插件的界面文案用中文。占用的设置页按职责起名（例如「模型」），不要用包名当页名。

## 插件结构

`pnpm new <slug>` 默认 **host**（工具/服务，无 UI）。只有设置页、Slot、主题才 `--kind mixed`。

- Profile 加载 `lib/`，不是 `src/`。改源码后必须再 build。
- 不依赖 Cordis 的逻辑单独放文件，测试只测那些文件。不要为了覆盖率 mock 整个 harness。
- 可调参数走导出的 Schemastery `Config`。
- `@deepseek-ai/cordis` 默认 `import type`；`lib/` 运行时真 import 了才放进 `dependencies`。
- 不要 value-import `@deepseek-ai/dsh-tools`。在 `ctx.tools` 上注册普通 tool 对象。
- `@deepseek-ai/*` 保持 external（`deps.neverBundle: true`）。
- `prepare` / `tsdown.config.ts` 留在插件包内，Git 路径安装才能自己 build。
- 每个插件带 `README.md` 和 `README.zh.md`。

`versions.json` 是唯一版本规范源。根/桌面 package 清单、Cargo/Tauri、runtime metadata、打包脚本和 README 徽章/安装命令因格式要求仍保留字面值；门禁负责拒绝任何不一致。

| 门禁 | 保证 |
| --- | --- |
| `pnpm check` | 版本和文档一致、插件可安装清单形态、类型检查、插件测试和脚本测试；不要求新鲜的 `lib/` |
| `pnpm check:build` | 构建全部插件，并以 `--require-lib` 重跑清单门禁，检查生成代码的 import/打包问题 |
| `pnpm check:path` | 以隔离 Git path 安装验证每个插件无需 monorepo 也能 prepare |
| `pnpm check:desktop` | 桌面脚本测试、前端构建和 Rust 格式/lint/测试/check；不发布，也不做真实安装包/插件包发布 |

`pnpm check-home` 独立且只读：它报告日常 `~/.dsh` 的危险链接，绝不自动修复。

## 命令

```bash
pnpm new <slug>                 # 或 pnpm new <slug> --kind mixed
pnpm --filter dsh-<slug> test
pnpm --filter dsh-<slug> build
node scripts/link-plugin.mjs --profile dsh-dev <slug>   # 只验证能否挂上
node scripts/link-plugin.mjs --profile web <slug>       # 要 UI
pnpm dev                                                # 沙箱 web，:3081
pnpm build
node scripts/check-manifest.mjs --require-lib             # CI 门禁：强制存在并检查 lib/ 产物（path 安装由 check:path 证明）
pnpm check
pnpm check-home                                         # 日常 ~/.dsh 不能挂本仓
# 小白插件包（apps/desktop，不是 workspace 成员）
cd apps/desktop && pnpm pack-plugins                    # tar + 签名 latest.json
cd apps/desktop && pnpm publish-pack                    # COS + PurgeUrlsCache
```

装上的含义是 `dump-config` 里有 `# == dsh-<slug>`。rebuild 之后重启 `pnpm dev`，不要重启日常的 `dsh web`。
