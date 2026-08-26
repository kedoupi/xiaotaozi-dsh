# 小桃子DSH website

Official site for 小桃子DSH, built with VitePress. Placeholder scaffold; content comes later.

```bash
cd apps/website
pnpm install
pnpm dev      # local preview
pnpm build    # static output in .vitepress/dist
```

This package is a standalone pnpm workspace (like `apps/desktop`) and is not part of the root `plugins/*` workspace. Deployment target is decided at publish time; do not upload under the `dsh/packs/` COS prefix, which is reserved for plugin packs.

中文说明见 [README.zh.md](README.zh.md)。
