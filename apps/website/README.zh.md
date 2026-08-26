# 小桃子DSH 官网

小桃子DSH 的官方网站，基于 VitePress。当前是占位脚手架，内容后续补充。

```bash
cd apps/website
pnpm install
pnpm dev      # 本地预览
pnpm build    # 静态产物在 .vitepress/dist
```

本包是独立 pnpm workspace（与 `apps/desktop` 同一模式），不属于仓库根的 `plugins/*` workspace。部署位置发布时再定；不要上传到 COS 的 `dsh/packs/` 前缀，那里只放插件包。

English: [README.md](README.md).
