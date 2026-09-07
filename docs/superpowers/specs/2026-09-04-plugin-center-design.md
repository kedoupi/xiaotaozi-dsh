# 单一插件中心设计

## 状态

- 日期：2026-09-04
- 状态：设计已批准，待实现
- 范围：统一 Xiaotaozi DSH 的插件发现、已安装清单、能力配置与第三方插件操作入口
- 交付：独立 spec、独立 topic branch、单个原子 PR
- 前置：PR #86 `xtz` 默认插件 reconciliation 已合并到 `main`
- 后续独立项目：Market 不可变来源、IM 统一信任边界、第一方预构建 npm 分发

## 背景

当前产品把同一“插件”概念拆成两个用户入口：

1. 侧栏“小桃子市场”：搜索精选第三方插件、查看来源、安装和移除；
2. `设置 → 插件`：只读查看 Loader/Fiber 插件清单，并编辑 shell、Agent loop、搜索与 IM 渠道等配置。

两边都提供插件列表和搜索，但各自只掌握一部分能力。市场看不到全部已安装插件与第一方能力；设置里的技术清单不能安装或卸载。用户必须理解 package、Loader、Fiber、Host settings namespace 等实现边界，才能判断“去哪里管理插件”。

本设计把用户入口收敛为一个“插件中心”，同时保持现有主架构：

```text
xtz → DSH Web → independent plugins
```

不 fork DSH，不把独立插件合并成单体，也不复制各插件的业务状态。

## 已批准的产品决定

1. 侧栏只保留一个“插件中心”插件管理入口。
2. 插件中心占用会话主区域，不再使用市场弹窗或右侧抽屉。
3. 插件中心只有两个一级页签：`已安装`（默认）与 `发现插件`。
4. `设置` 不再出现“插件”“模型”“小桃子功能”“侧边工作台”等插件拥有的栏目。
5. 现有独立“IM 机器人”侧栏入口移除；IM 管理完整嵌入插件中心。
6. 第一方能力按用户功能展示，不按六个 package 展示。
7. DSH 内部模块清单从 GUI 移除；故障诊断继续使用 `xtz doctor`。
8. shell timeout、Agent 工具并行度、DeepSeek 搜索等 DSH 运行参数从“插件配置”重分类为 `设置 → 高级`。
9. 第一方配置组件完整嵌入插件中心，不通过跳转或复制一份表单实现。
10. 第三方插件只有在提供插件中心配置贡献时显示“配置”；没有贡献时仍可查看、运行和卸载。

## 信息架构

```text
侧栏
└─ 插件中心
   ├─ 已安装（默认）
   │  ├─ 内置能力
   │  │  ├─ 小桃子功能
   │  │  ├─ 侧边工作台
   │  │  ├─ 模型
   │  │  └─ IM 机器人
   │  └─ 第三方插件
   │     ├─ 精选目录安装
   │     └─ 外部安装
   └─ 发现插件
      └─ 搜索 / 分类 / 详情 / 来源与风险 / 安装

设置
├─ DSH 通用偏好
└─ 高级
   ├─ shell
   ├─ Agent loop
   └─ DeepSeek 搜索
```

以下实现包名不作为用户项目出现：

- `dsh-market`：插件中心自身；
- `dsh-wecom-office`：继续归入“IM 机器人”；
- 其他 `dsh-*` package 名只允许出现在开发文档和诊断中。

## 页面结构与交互

### 打开与关闭

- 点击侧栏“插件中心”后，插件中心接管中间会话列；左侧栏和右侧工作台保持原布局。
- 打开时将焦点移到页面标题；关闭时把焦点还给侧栏入口。
- `Esc` 与标题栏关闭按钮关闭插件中心并恢复之前的会话。
- 与任务看板等其他主区域 surface 复用现有互斥事件；打开任一 surface 会关闭前一个，不允许两个 takeover 同时标记 active。
- 不引入新的 URL router 或浏览器 history；列表到详情使用明确的页面内“返回”按钮，避免干扰 DSH 的会话导航。

### 已安装

- 初始读取未完成时显示 loading，不提前显示空态。
- “内置能力”固定列出四个用户功能。预期 capability 的详情 slot 未注册时，卡片保留并显示“暂不可用”，提供 `xtz doctor` 指引；不能静默消失或伪装成正常。
- 内置能力状态使用“内置 / 暂不可用”等产品语义，不展示 package、Loader entry 或 Fiber phase。
- 内置能力不能卸载。
- “第三方插件”来自当前 Web profile 的顶层 dependencies，排除 DSH 核心包和六个第一方默认包。
- 精选目录中的已安装插件使用目录名称、版本和来源；不在目录中的顶层插件以安全化 package 名显示为“外部安装”。
- 第三方运行状态从现有只读 plugin inventory Remote 投影为用户语义：已运行、加载中、异常、已停用或状态未知。UI 不直接显示 Fiber 名称。
- 点击卡片进入同一主区域的详情；返回列表后保留 active tab、搜索和滚动位置。
- 第三方详情展示版本（可取得时）、来源、兼容/风险说明、运行状态、可选配置贡献和卸载操作。

### 发现插件

- 复用当前 `MARKET_PLUGINS` 目录、搜索、标签筛选、详情、来源/风险说明和安装 mutation。
- 目录卡片只展示名称、用途、来源、安装状态和一个主操作；package/spec/命令不出现在普通卡片上。
- 详情保留精确来源和安装规格用于信任判断，但不把 CLI 安装命令作为主要操作。
- 安装完成后进入该插件的“已安装”详情；失败保留当前上下文和输入，提供重试。
- 当前未实现远程 catalog，因此移除无效的“来源”一级页签。历史 source state 不删除；Market 不可变来源项目以后独立决定是否重新提供入口。

### 配置详情

- `小桃子功能` 渲染现有 `XiaotaoziSettings`，继续管理 archive、board、gitGraph、announceToAgent。
- `侧边工作台` 渲染现有 `SideCardSection`，继续使用原 fenced settings route、revision 和 store。
- `模型` 渲染现有 `ModelsWorkspace`，继续使用原 provider、credential 和 session 模型绑定 API。
- `IM 机器人` 渲染现有 `IMSettingsTab`；企业微信办公仍只在企业微信机器人卡片内出现，不增加单独产品项。
- 组件从旧入口迁移到 detail slot；它们的 Host API、settings namespace、credentials、session、storage 和用户配置路径不变。
- 详情组件渲染失败由 slot error boundary 隔离；插件中心返回该 capability 的“暂不可用”状态，而不是让整个会话壳白屏。

## 插件中心 slot 合同

`dsh-market` 声明一个 root-scoped keyed child slot：

```ts
"xiaotaozi.plugin-center.detail": {
  kind: "keyed";
  scope: "root";
}
```

固定 capability id：

```text
xiaotaozi
side-workbench
models
im
```

职责：

- `dsh-market` 静态拥有四个用户能力的 id、排序、名称、摘要和 icon；产品快照中的默认插件本来就是共同发布的，UI composition metadata 不成为安装版本的第二权威源。
- `dsh-xtz-ui`、`dsh-sidebar`、`dsh-providers`、`dsh-im` 各自只注册自己的详情组件与既有 inject face。
- 各插件通过同一个 slot 字符串协作，不 import sibling source，不新增 `packages/` 或共享 workspace。
- 插件中心 shell 注册到现有 `shell.overlay`，由该父 registration 声明 child slot，并把 detail 渲染到主区域 portal；不注册或替换整个 `conversation` slot。
- 第三方插件未来可使用 package name 作为 keyed detail id；本 PR 不为现有外部插件生成猜测式配置表单。

## 数据模型与状态来源

Market catalog API 增加已安装投影，但不建立新的持久文件：

```ts
interface InstalledPlugin {
  id: string;
  packageName: string;
  name: string;
  installSpec: string;
  source: "catalog" | "external";
  catalogEntryId?: string;
  version?: string;
}

interface CatalogSnapshot {
  sources: MarketSource[];
  entries: CatalogEntry[];
  installedPlugins: InstalledPlugin[];
}
```

数据流：

```text
profile package.json dependencies ──→ 第三方已安装真相
MARKET_PLUGINS                    ──→ 精选名称、版本、来源与发现页
pluginInventory.list()           ──→ 第三方运行状态（只读、懒加载）
plugin-center detail slot        ──→ 内置能力可用性与配置组件
各插件原 Host API/settings scope ──→ 配置、凭证与实时业务状态
```

规则：

- 不能根据 DOM 或目录卡片本地状态猜测“已安装”。
- `installedPlugins` 每次从 profile 顶层 dependency 重新投影；不写第二份 installed state。
- 外部插件 synthetic id 由 package name 确定，客户端不能提交任意 spec。
- 卸载时 Host 根据当前 profile 和 synthetic id 重新解析 package name；只把 Host 已知的 package name 交给 pinned DSH mutation。
- `pluginInventory.list()` 失败只使运行状态变为“未知”，不能把已安装插件误报为未安装，也不能阻塞配置或卸载。
- 现有 intent 串行化、失败 settlement 和 same-origin/loopback guard 保持不变。

## 设置迁移

### 第一方栏目

- `dsh-xtz-ui` 停止注册 `settings.section` id `xiaotaozi`。
- `dsh-sidebar` 停止注册 `settings.section` id `better-sidebar` 及其 settings nav icon DOM adapter。
- `dsh-providers` 停止注册 `settings.section` id `models`。
- `dsh-im` 的 channel packages 停止注册 `settings.plugins.tab`。
- `dsh-im` 停止注册独立 `shell.overlay` Hub 与 sidebar entry，但保留 `IMSettingsTab` 作为 plugin-center detail。

### 上游 DSH 栏目

不能编辑或 fork `deepseek-harness`。`dsh-xtz-ui` 使用一个有测试的 DSH `0.1.x` compatibility adapter：

1. 隐藏上游只读 plugin inventory 与官方 Models 栏目；
2. 将现有插件配置栏目替换为自有 `设置 → 高级`；
3. `AdvancedRuntimeSettings` 继续绑定原 `shell`、`agent-loop`、`web-search-deepseek` settings namespace，并使用原 credentials domain；
4. 只迁移 UI，不迁移或复制配置值。

compatibility adapter 只解决上游缺少 section suppression API 的当前限制，必须带清晰升级注释；若未来 DSH 提供正式 slot-level hide/replace 合同，再删除 DOM 兼容层。

## 视觉与可访问性

以 `design-system/xiaotaozi-dsh/MASTER.md` 为唯一视觉规范，不采用外部生成的新 palette/font：

- DSH neutral surface 与 host font；水果橙只用于品牌和主操作；
- 页面最大内容宽度服从主区域，不制造浮层中的嵌套卡片；
- desktop 使用紧凑列表/卡片与详情；`<= 768px` 切为列表→详情单列；
- 375px 无页面级横向滚动；coarse pointer 目标至少 44×44px；
- tab 使用 `tablist/tab/tabpanel`、roving `tabIndex` 与方向键；
- 所有 icon 使用现有 DSH SVG primitive 或同一 outline family，不用 emoji/文本 glyph；
- focus ring 可见，至少 2px；sticky/header 不遮挡焦点；
- loading、empty、busy、success、warning、error 以文字和语义区分，不只依赖颜色；
- 一个上下文只使用一个原子 `aria-live` status，避免并发播报；
- motion 只使用 120–160ms opacity/color/small transform，并遵守 `prefers-reduced-motion`。

## 错误与安全边界

- profile 读取失败：已安装页显示可操作错误；不降级为空列表。
- catalog 读取失败：发现页显示错误和重试；内置 capability 详情仍可打开。
- inventory 读取失败：只降级运行状态；不影响安装真相。
- detail slot 缺失或崩溃：显示 capability 级错误；其他 capability 保持可用。
- 安装/卸载 mutation 失败：沿用当前 profile safety、pinned DSH、串行化和状态文件错误合同。
- 卸载确认必须显示插件用户名称；危险操作不能由 backdrop 或 `Esc` 直接确认。
- 不读取、显示或复制 credentials 值。
- 不触碰 `~/.dsh`、3080、sessions、storages 或其他 profiles；行为测试只使用 fake/temporary home。

## 文件职责

预计变更：

- `plugins/market/src/catalog.ts`：第三方 installed projection 与 catalog/external 分类。
- `plugins/market/src/routes.ts`：catalog payload、Host-authoritative external removal。
- `plugins/market/src/client/api.ts`：新的 `installedPlugins` snapshot。
- `plugins/market/src/client/PluginCenter.tsx`：已安装/发现/详情状态机与 accessibility。
- `plugins/market/src/client/PluginCenterHost.tsx`：`shell.overlay` portal、主区域 takeover、focus restore。
- `plugins/market/src/client/plugin-center-open.ts`：最小内存 open/location store。
- `plugins/market/src/client/market-css.ts`：完整主区域与响应式样式。
- `plugins/market/src/client/index.ts`：slot 声明、shell registration、sidebar entry。
- `plugins/xtz-ui/src/client/index.ts`：`xiaotaozi` detail 和 `advanced-runtime` settings section。
- `plugins/xtz-ui/src/client/AdvancedRuntimeSettings.tsx`：DSH 高级运行参数 UI。
- `plugins/xtz-ui/src/client/hide-official.ts`：隐藏上游重复 Plugins/Models 表层。
- `plugins/sidebar/src/client/index.tsx`：把 `SideCardSection` 改注册到 `side-workbench` detail。
- `plugins/providers/src/client/index.ts`：把 `ModelsWorkspace` 改注册到 `models` detail。
- `plugins/im/src/client/index.ts`：把 `IMSettingsTab` 改注册到 `im` detail，移除 overlay/sidebar entry。
- `plugins/im/src/client/channels/*/index.ts`：移除旧 `settings.plugins.tab` registrations。
- 对应 package tests、README 中英文、技术/产品文档与根合同文档。

不新增依赖，不新建共享 package，不从 sibling plugin import source。

## 测试与验收

### 自动化

至少覆盖：

1. catalog payload 正确分离 discovery entries 与 installed third-party；
2. 六个第一方默认包和 `@deepseek-ai/*` 不进入第三方列表；
3. 外部安装插件可通过 Host 解析后的 package name 卸载，客户端任意 spec 被忽略/拒绝；
4. 插件中心默认打开已安装，页签键盘语义正确；
5. 四个内置 capability 固定显示，缺失 detail slot 为“暂不可用”；
6. 第三方 inventory 状态投影失败时显示未知但仍保持 installed；
7. 安装成功进入 installed detail；失败和 retry 保留上下文；
8. 关闭恢复焦点，主区域 takeover 与任务看板互斥；
9. providers/sidebar/xtz-ui/im 注册新 keyed detail，不再注册旧入口；
10. IM 各 channel 不再注册 `settings.plugins.tab`，全部仍由 `IMSettingsTab` 可达；
11. `设置 → 高级` 读写原 namespace，保存失败、revision 冲突和 credentials 失败不丢草稿；
12. 官方 Models/Plugins 与技术 inventory 不出现在最终 Settings 导航；
13. 375px/coarse pointer、visible focus、reduced motion、无 nested interactive 控件通过 CSS/markup contract。

### 必跑 gate

在 Node `22.19.0` / pnpm `11.22.0` 下：

```bash
corepack pnpm --filter dsh-market typecheck
corepack pnpm --filter dsh-market test
corepack pnpm --filter dsh-xtz-ui typecheck
corepack pnpm --filter dsh-xtz-ui test
corepack pnpm --filter dsh-sidebar typecheck
corepack pnpm --filter dsh-sidebar test
corepack pnpm --filter dsh-providers typecheck
corepack pnpm --filter dsh-providers test
corepack pnpm --filter dsh-im typecheck
corepack pnpm --filter dsh-im test
corepack pnpm check
corepack pnpm check:build
corepack pnpm check:path
corepack pnpm check:cli
git diff --check
```

非交互环境嵌套脚本找不到 `pnpm` 时，只使用临时 `/tmp` `corepack pnpm` shim，不修改仓库。

### Sandbox 浏览器验收

实现和自动 gate 完成后，按 `docs/workflow.md` 的 bounded 3081 transfer：

- 只在 topic worktree 短时接管 3081；结束后归还 clean-main hub；
- 1440、1024、768、375；light/dark；
- 打开/关闭/focus restore；已安装/发现/详情/返回；
- 四个内置配置保存；IM 全渠道页签；外部安装项；
- 安装、卸载确认、失败、重试、运行状态未知；
- Settings 只显示 Advanced，不显示技术插件清单或第一方重复栏目；
- browser console 无新增错误。

## 非目标

- 不实现远程 Market source、签名、缓存或不可变版本 pin。
- 不改变 catalog 的三条精选记录或安装来源。
- 不修改 `xtz` reconciliation、产品版本或默认插件规格。
- 不实现 IM sender authentication/approval policy。
- 不迁移第一方插件到 npm 预构建分发。
- 不新增全局 router、数据库、daemon、Desktop 或微服务。
- 不允许从插件中心启停/卸载四个第一方内置能力；它们的功能开关仍由各 capability 自己拥有。
