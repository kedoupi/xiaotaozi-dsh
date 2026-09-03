# 小桃子DSH 官网

小桃子DSH 的官方网站 [dsh.xiaotaozi.cc](https://dsh.xiaotaozi.cc)，基于 VitePress。英文是根语言，中文在 `/zh/` 下。本包是独立 pnpm workspace，不属于仓库根的 `plugins/*` workspace。

## 预览

![小桃子DSH 官网首页](public/site-preview.webp)

## 本地开发

```bash
cd apps/website
pnpm install
pnpm dev      # 本地预览
pnpm build    # 静态产物在 .vitepress/dist
```

## 结构

```text
index.md            英文首页
guide/              快速开始 · 命令参考 · 插件 · 市场 · FAQ
zh/                 中文镜像（首页 + 指南）
public/             Logo、截图（拷贝自 plugins/*/docs）、站点预览图
.vitepress/         配置与蜜桃色主题覆盖
```

## 部署边界

托管：腾讯云 CloudBase 静态网站托管，环境 `xiaotaozi-5g279pi414331d52`（上海）。这个桶按顶层目录分站点；本站是 CloudBase **应用** `dsh`，挂载在 **`/dsh`**。`pnpm deploy` 先本地构建，再 `tcb app deploy`（控制台「网站部署」、带版本）。不要用 `tcb hosting deploy` 发这个站——那只是传文件，不会出现在网站部署列表。需先 `tcb login`。文档工作不触发部署 —— 本地 `pnpm build` 验证即可。

域名 `dsh.xiaotaozi.cc`（HTTP 访问服务，已绑定）：

1. CloudBase HTTP 访问：自定义域名 `dsh.xiaotaozi.cc`，`DIRECT`，证书在腾讯云 SSL。
2. 路由 `/` → 静态托管 `staticstore`，path rewrite 前缀 `/dsh`。
3. DNSPod CNAME `dsh` → `dsh.xiaotaozi.cc.tcbaccess.tencentcloudbase.com.`

对外地址是 `https://dsh.xiaotaozi.cc/zh/`。VitePress `base` 是 `/`。不要用 `*.webapps.tcloudbase.com`（浏览器会下载 HTML），也不要用默认 `tcloudbaseapp.com` 根路径。规范：[conventions.zh.md](../../docs/conventions.zh.md)「对外网站」。步骤：[workflow.zh.md](../../docs/workflow.zh.md)「发官网」。

## 产品文档

产品语气、事实与截图规则见 [PRODUCT.md](PRODUCT.md)；视觉语言见 [DESIGN.md](DESIGN.md)。产品本身的文档在[根 README](../../README.zh.md)。

English: [README.md](README.md)。
