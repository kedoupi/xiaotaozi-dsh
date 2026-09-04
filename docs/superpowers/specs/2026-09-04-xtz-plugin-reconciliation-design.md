# `xtz` 默认插件版本同步设计

## 状态

- 日期：2026-09-04
- 状态：设计已批准，待实现
- 范围：`xtz start` / `restart` / `doctor` 对六个第一方默认插件的版本同步
- 后续独立项目：Market 不可变来源、IM 统一信任边界、第一方预构建 npm 分发

## 背景

`DEFAULT_PLUGINS` 已把六个第一方插件固定到产品 tag，例如：

```text
github:kedoupi/xiaotaozi-dsh#v0.5.0&path:plugins/im
```

但当前 `ensureOfficialProfile()` 只在 `profiles/web/node_modules/<name>` 不存在时安装。用户升级全局 `xiaotaozi-dsh-cli` 后，旧插件目录仍存在，因此新 CLI 不会把 profile 中的旧规格同步到新产品快照。结果可能是“新 CLI + 旧插件”的混合产品。

本设计补齐产品版本 reconciliation，不改变底层架构：

```text
xtz → pinned DSH web profile → first-party plugins
```

## 产品决定

1. 用户升级全局 `xtz` 后，默认插件在下一次**需要启动服务的** `xtz start` 或 `xtz restart` 中自动同步。
2. 已由 `xtz` 启动的服务仍在运行时，`xtz start` 不热改 profile、不重启服务；若发现漂移，只提示运行 `xtz restart`。
3. 六个默认插件必须作为一个产品快照同步。任一安装、移除或验证步骤失败，恢复升级前的完整 profile，不启动新服务。
4. 第三方插件、用户 profile patch、profile 内安全的本地 vendor 制品和 pnpm 配置必须保留。
5. `xtz update` 继续 fail closed。它不负责猜测用户用 npm、bun 还是 pnpm 安装全局 CLI。
6. 本项目不改产品版本、不发布 npm 包、不迁移第一方插件分发方式。

## 权威数据

- 期望产品版本：CLI metadata 中的 `version`，与 `versions.json` `cliApp` 保持现有 gate 一致。
- 期望默认插件规格：`apps/cli/src/plugin-spec.ts` 的 `DEFAULT_PLUGINS`。
- profile 当前规格：`~/.dsh/profiles/web/package.json` 的 `dependencies`。
- 实际安装：`~/.dsh/profiles/web/node_modules/<name>/package.json`。

安装戳不是插件规格的第二份权威数据。`xiaotaozi-xtz.json` 只新增 `productVersion`，继续保留 `writer`、`createdAt`、`plugins` 和 `port`。插件规格始终从 profile manifest 与 `DEFAULT_PLUGINS` 比较。

## 漂移判定

官方 home 中任一条件成立即需要 reconciliation：

- 默认插件 dependency 缺失；
- dependency 字符串不等于对应 `DEFAULT_PLUGINS.spec`；
- `node_modules/<name>` 缺失；
- 已安装 manifest 的 `name` / `version` 无效；
- 已退役第一方插件仍存在。

额外第三方 dependency 和 bundle 不算漂移。Sandbox 使用仓库内 `link:`，继续走现有逻辑，不与产品 tag 比较，也不执行本设计的官方 profile 事务。

## 启动流程

### 服务已运行

`xtz start` 保持现有进程所有权和端口规则。它只读 profile manifest：

- 无漂移：继续现有“已在运行”输出；
- 有漂移：仍返回成功并保持服务不动，同时输出“检测到新的小桃子产品快照，请运行 `xtz restart` 完成同步”；
- profile 无法安全读取：不修改服务，输出诊断建议。

不在运行中的服务上执行 `dsh plugin`，避免 Host HMR、会话和 profile 写入并发。

### 服务未运行

`launchOn()` 在 spawn 之前调用 reconciliation：

1. 用现有 `dsh web --dump-default-config` 确保 profile 基线存在。
2. 恢复任何上次中断的 reconciliation 事务。
3. 检查 profile 路径、manifest 和 dependency 来源安全性；不安全则 fail closed。
4. 无漂移则直接继续启动。
5. 有漂移则创建可回滚候选 profile。
6. 在候选 profile 中一次同步所有默认插件，并移除已退役插件。
7. 运行 profile 结构检查与 `dsh web --dump-config`。
8. 全部通过后提交候选 profile、更新安装戳，再启动 Web。

## Profile 事务

### 目录

事务只使用固定 sibling：

```text
~/.dsh/profiles/web                    当前或候选 profile
~/.dsh/profiles/.web-reconcile-backup 升级前完整 profile
```

不复制整个 DSH home，不接触 credentials、sessions、storages 或其他 profile。

### 创建候选

服务停止且 profile 已通过 containment 检查后：

1. fail closed 地确认 backup 不存在；
2. 原子 `rename(web, backup)`，完整旧 profile 保留在 backup；
3. 创建新的 `web`；
4. 从 backup 复制除 `node_modules` 外的全部内容到新 `web`，包括：
   - `package.json`；
   - `pnpm-lock.yaml`；
   - `pnpm-workspace.yaml`；
   - `cordis.patch.yml`；
   - `vendor/` 和其他 profile-local 用户文件。

排除 `node_modules`，避免复制大型依赖树。新的单次 pnpm 安装根据保留的 manifest/lock 恢复第三方依赖，并把六个默认插件改为期望规格。

### 同步与验证

通过 pinned DSH 执行一次等价于以下操作的调用：

```text
dsh plugin --profile web add <default-spec-1> ... <default-spec-6>
```

DSH 会把参数交给同一个 pnpm invocation，并按最终 installed state reconciliation bundle 列表。若 pnpm 11 报受阻的 Git `prepare` key，沿用现有 `allowBuilds` 解析、写入和一次重试逻辑；允许项只写入候选 profile。

之后在候选 profile 中移除 `RETIRED_OFFICIAL_PLUGINS`，再验证：

- 六个 dependency 与 `DEFAULT_PLUGINS` 精确相等；
- 六个安装目录和 manifest 有效且未逃逸 profile；
- required bundles 完整；
- 第三方 dependencies 和用户 patch 仍存在；
- `dsh web --dump-config` 成功并包含每个第一方 bundle 层。

### 提交、回滚与崩溃恢复

- 成功：删除 backup，写入 `productVersion`，然后才允许 spawn Web。
- 任一步失败：删除候选 `web`，把 backup 原子 rename 回 `web`，返回非零，不 spawn Web。
- 回滚本身失败：保留 backup，不尝试启动，并给出明确恢复路径；绝不删除最后一份完整 profile。
- 下次 `start` / `restart` 看到 backup：无条件把它视为上次未提交事务。删除不可信候选 `web`，恢复 backup，再重新进行漂移检查。
- `doctor` 看到 backup：`profile-transaction` 为 error，并说明 `start/restart` 会先恢复；`doctor` 自身只读，不修复。

旧 Desktop 残留目录继续按现有规则报告；新的 backup 名称不复用 `.web-backup`，避免混淆历史语义。

## Doctor

`xtz doctor` 增加或扩展以下检查：

- `xtz-seed`：旧安装戳仍可解析；缺少 `productVersion` 或版本不同则报告需要 `xtz restart`；
- `profile-bundles` / `profile-install`：保留现有完整性检查；
- `profile-default-specs`：逐个比较六个 dependency 与 `DEFAULT_PLUGINS.spec`；漂移为 error；
- `profile-transaction`：识别 `.web-reconcile-backup`，只报告不修改。

JSON 输出继续使用现有 `{ ok, ready, home, checks }` 结构，不新增公开命令或新的顶层字段。

## 错误与安全边界

- 只操作 `officialProfileDir(home)` 及其固定 sibling；所有 destructive 操作前验证 realpath containment。
- 不跟随或删除指向 profile 外部的 symlink target。
- 事务开始前服务必须确认停止；不因升级需要而结束非 `xtz` 所有的进程。
- 不触碰 `~/.dsh/.credentials.yaml`、sessions、storages、其他 profiles 或 3081。
- 候选安装继续使用 pinned `@deepseek-ai/dsh`，不用 PATH 上的其他 DSH。
- 安装失败、验证失败、未知事务状态全部 fail closed。

## 文件职责

实现预计只改 CLI 与对应合同文档：

- `apps/cli/src/app.ts`：漂移检测、事务、启动提示、doctor、安装戳；
- `apps/cli/tests/cli.test.mjs`：fake-home TDD 覆盖；
- `apps/cli/README.md` / `README.zh.md`：用户可见的自动同步与 restart 语义；
- `docs/conventions.md` / `conventions.zh.md`：`xtz` 产品合同；
- `AGENTS.md`：若自动同步成为 hard rule，与 conventions 同步。

不新增依赖，不新增共享 package，不拆分 `app.ts`；只有当实现导致无法清楚测试时才提取一个同目录纯函数文件。

## 测试与验收

实现按 TDD 进行，至少覆盖：

1. 当前规格完整时不调用 plugin mutation，直接启动。
2. 服务已运行且规格漂移时不修改 profile、不停止服务，提示 `xtz restart`。
3. 服务停止且旧规格存在时，在 spawn 前把全部默认插件同步到期望规格。
4. 缺失插件与旧规格在同一次事务中修复。
5. 第三方 dependency、bundle、用户 patch、pnpm 配置和 vendor 文件在成功后保留。
6. plugin add 失败时恢复旧 profile，未启动 Web。
7. `dump-config` 验证失败时恢复旧 profile，未启动 Web。
8. 回滚失败时保留 backup 并 fail closed。
9. 启动前发现 backup 时先恢复旧 profile，再重新 reconciliation。
10. `doctor` 报告默认规格漂移和未完成事务，但不修改 fake home。
11. 旧安装戳可读；成功同步后写入当前 `productVersion`。
12. Sandbox 仍安装本地 `link:`，不执行官方 profile 事务。

必跑检查：

```bash
cd apps/cli
fnm use
corepack pnpm check
node lib/cli.js --help
node lib/cli.js version --json
```

测试只使用 fake home，不启动或修改官方 `~/.dsh` / 3080，也不占用 sandbox 3081。

## 非目标

- 不实现 `xtz update` 或全局 CLI 自更新。
- 不发布第一方插件到 npm；这是后续独立设计。
- 不修改 Market install specs；这是后续独立设计。
- 不修改 IM sender authorization；这是后续独立设计。
- 不升级 DSH RC、Node、pnpm 或产品版本。
- 不重建 Desktop、不添加 daemon、微服务、远程 registry 或数据库。
