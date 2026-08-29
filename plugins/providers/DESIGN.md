---
name: 模型
description: Harness 设置里的本机抽屉：已接上的服务商在左侧，授权和勾选在右侧。
colors:
  action: "#a84c2c"
  action-hover: "#8f3f27"
  ok: "#22a06b"
  danger: "#dc2626"
  text: "#111827"
  muted: "#475569"
  dim: "#475569"
  line: "rgba(15, 23, 42, 0.10)"
  panel: "#f4f6f8"
  surface: "#ffffff"
  hover: "rgba(38, 49, 72, 0.06)"
  selected: "rgba(38, 49, 72, 0.08)"
  on-action: "#ffffff"
  logo-plate: "#111111"
typography:
  title:
    fontFamily: "inherit"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.3
  empty:
    fontFamily: "inherit"
    fontSize: "15px"
    fontWeight: 650
    lineHeight: 1.3
  body:
    fontFamily: "inherit"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.55
  hint:
    fontFamily: "inherit"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.55
  button:
    fontFamily: "inherit"
    fontSize: "12px"
    fontWeight: 650
    lineHeight: 1
  label:
    fontFamily: "inherit"
    fontSize: "11px"
    fontWeight: 650
    lineHeight: 1.2
  code:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "20px"
    fontWeight: 700
    letterSpacing: "0.12em"
    lineHeight: 1.2
  close:
    fontFamily: "inherit"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1
rounded:
  md: "8px"
  xl: "12px"
  dialog: "16px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.on-action}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  button-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  button-danger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.danger}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "8px 10px"
    height: "36px"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "4px 6px"
    height: "40px"
  nav-item-on:
    backgroundColor: "{colors.selected}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "4px 6px"
    height: "40px"
  card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
    padding: "10px 12px"
  secret:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: "36px"
---

# Design System: 模型

## Overview

**Creative North Star: "本机抽屉"**

这页住在 DeepSeek Harness 的设置 overlay 里，不是独立站点。视觉必须像宿主自己的一格抽屉：冷灰底、小桃子深桃色做主行动色、已接上的服务商像插在左侧的卡。打开一张卡，右侧摊开授权或密钥，再勾模型。

气质是短、操作、本机。密度偏工具，但不堆表单。设备码是抽屉里唯一可以抬高音量的物件。小桃子深桃色只负责品牌行动，不做大面积底色；也不要把官方模型页的表单堆当参考。

本页遵循全局规范 [`design-system/xiaotaozi-dsh/MASTER.md`](../../design-system/xiaotaozi-dsh/MASTER.md)。本文件只补充 Providers 的信息结构和业务细节；冲突时以全局规范为准。

**Key Characteristics:**

- 宿主 token 优先（`--dsw-alias-*`），本页变量只是回退
- 左侧 248px 抽屉 + 右侧详情，不是卡片墙当主结构
- 深桃行动色只出现在主按钮、等待点、选择控件和虚线添加的悬停；焦点环沿宿主语义 token
- 密钥保存后是不可选中的星号，不是 password 框里的真值
- 圆角只用 8px 控件、12px 卡片、16px 弹层三个主层级；logo 内部形状可保留厂牌几何

## Colors

色板是宿主冷灰中性 + 一条小桃子深桃行动色。深色模式跟宿主 token 走，不要另做一套。

### Action

- **小桃子深桃** (`#a84c2c`，hover `#8f3f27`；语义入口为宿主 `--dsw-alias-button-info-fill` / `--dsw-alias-button-info-hover`): 主按钮、等待状态点、选择控件和添加虚线的悬停。不是装饰色。焦点环使用宿主 `--dsw-alias-state-business-primary`，信息、成功、警告和危险继续使用各自语义色。

### Neutral

- **墨字** (`#111827`): 主文案和焦点描边
- **次字** (`#475569`): 说明、返回、虚线添加的默认字
- **淡字** (`#64748b`): 分组标签、元信息、空状态说明
- **纸面** (`#ffffff`): 详情底、输入底、默认按钮
- **抽屜灰** (`#f4f6f8`): 左侧栏、密钥罩、设备块、代码盒
- **细线** (`rgba(15, 23, 42, 0.10)`): 分割和描边
- **掠过** (`rgba(38, 49, 72, 0.06)`): 行悬停
- **当前** (`rgba(38, 49, 72, 0.08)`): 侧栏选中底

### Semantic

- **已接上** (`#22a06b`): 状态点和保存成功按钮；12px 状态字使用它与 `label-primary` 混合后的可访问 ink
- **危险** (`#dc2626`): 错误状态点和断开/移除描边；12px 错误字使用它与 `label-primary` 混合后的可访问 ink
- **厂牌底板** (`#111111`): 仅 Kimi 一类深底 logo

**The Host Token Rule.** 颜色先绑 `--dsw-alias-*`。Hex 只是宿主缺席时的回退，不要在组件里再写一套独立品牌色。

**The One Accent Rule.** 深桃行动色出现在一屏上必须能数清。大面积铺桃色或拿桃色当背景，就是做错了。服务商自身品牌色只留在 logo 等身份识别内容里。

## Typography

**Display Font:** 继承宿主（`inherit`）
**Body Font:** 继承宿主
**Label/Mono Font:** `ui-monospace, SFMono-Regular, Menlo, monospace` — 只给设备码、授权链接、密钥输入、模型 id

**Character:** 不另载字体。层级靠字号和 650/700，不靠装饰字族。中文分组标签不要再做成 10px 全大写英文字轨。

### Hierarchy

- **Title** (700, 16px, 1.3): 详情页服务商名、弹层标题
- **Empty** (650, 15px): 空状态主句
- **Body** (400, 13px, 1.55): 侧栏名、设备名、表单字
- **Hint** (400, 12.5px, 1.55): 说明句
- **Button** (650, 12px): 所有按钮
- **Label** (650, 11px): 侧栏分组、设备小标签、元信息
- **Code** (700, 20px, 0.12em): 设备码，一屏里最大的字

**The Inherited Face Rule.** 不要为这页引入独立展示字体。Monospace 只用于码、链、密钥、id。

## Layout

主结构是绝对铺满宿主 `settings.section` 内容区的双栏：左抽屉 248px + 右边详情。左栏分组间距 16px，行高至少 40px。详情内边距 22×24×28。窄于 720px 时改为上下叠，左栏限高 220px，触控目标至少 44px。

添加服务商是遮罩弹层（最大 760×720），不是第三栏。默认常用四张：通义灵码、Kimi 编程、Claude、DeepSeek 密钥。其余服务商直接列在下面，用紧凑行，不折叠。自定义是网格下的文字按钮。Claude 一张卡两种接法，对话里只勾一份模型。自定义页是主栏整页切换，左上返回。

**The Connected-Only Rail Rule.** 左侧只放已接上或正在添加的服务商。目录在「添加服务商」里：上面四张常用卡，下面紧凑列出其余，可用搜索。

## Elevation & Depth

默认平面。深度靠底色分层（纸面 / 抽屉灰）和 1px 细线，不用投影抬卡片。

唯一抬起：添加弹层和确认框使用宿主 `--dsw-shadow-lv3`。输入焦点是宿主 focus token 的可见环，不是投影。

**The Flat-By-Default Rule.** 静止的行、卡、输入没有影子。影子只给打断性的层。

## Shapes

默认圆角 8px（行、按钮、输入、密钥罩、模型列表），内容卡片与设备信息块 12px，确认框与添加弹层 16px。厂牌深底和字母回退标可以保留 logo 自身的小圆角，不扩散到产品 chrome。

描边用细线，不要彩色左边条当选中。选中只换底色。虚线边框只给「添加服务商」这一处邀请。

**The One Dashed Invitation Rule.** 虚线只出现在左栏底部的添加控件。别处用实线或无边。

## Components

### Buttons

短、实、8px。默认：纸面 + 细线。主按钮：深桃底白字，hover 使用更深的桃色。危险：可访问错误 ink + 淡红描边，不是红底。成功一瞬：已接上绿。禁用 45% 透明。焦点：宿主 focus token 的 2px 描边，外扩 2px。

### Cards / Containers

添加弹层里的服务商卡：抽屉灰底、12px 角、10×12 内边、56px 最小高。悬停才把边和底换成信号蓝淡罩。详情里的设备块和代码盒不是「卡片墙」，是抽屉灰的信息块。

### Inputs / Fields

36px 高，8px 角，细线。密钥和授权相关输入用等宽。焦点：边变信号蓝 + 3px 软环。已保存密钥不是输入框，是不可选中的星号条。

### Navigation

左抽屉。分组 11px 淡字。行 40px、8px 角。当前行用「当前」底，加粗名字，不加彩条。等待中的元信息改用墨字。底部一条实线，下面是虚线添加。

### Device code (signature)

20px/700 等宽、字距 0.12em。这是抽屉打开后唯一允许「大」的物件。旁边是复制；链接是次要的一行省略号。

## Do's and Don'ts

### Do:

- **Do** 把颜色绑在 `--dsw-alias-*` / `--dshM-*` 上回退，让深色模式跟宿主走。
- **Do** 把设备码做成一屏里最大的字，链接做成可复制的次要行。
- **Do** 已保存密钥只画星号，`user-select: none`。
- **Do** 左侧只列已接上的；添加面板上面四张常用，其余直接用紧凑行列出。

### Don't:

- **Don't** 使用小桃子橙 `#ea580c` 或任何独立暖品牌色。
- **Don't** 把官方模型页的多段表单、原始 provider id、小写带斜杠的名字当视觉或文案参考。
- **Don't** 给侧栏选中加彩色左边条。
- **Don't** 在静止卡片上加投影或玻璃模糊。
- **Don't** 把 28 张同权服务商卡铺成主界面。
