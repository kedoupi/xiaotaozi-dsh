# 小桃子DSH website

Official site for 小桃子DSH at [dsh.xiaotaozi.cc](https://dsh.xiaotaozi.cc), built with VitePress. English is the root locale; Chinese lives under `/zh/`.

```bash
cd apps/website
pnpm install
pnpm dev      # local preview
pnpm build    # static output in .vitepress/dist
pnpm deploy   # build + upload to Tencent CloudBase static hosting
```

This package is a standalone pnpm workspace and is not part of the root `plugins/*` workspace.

## Structure

```text
index.md            English landing page
guide/              getting-started · commands · plugins · market · faq
zh/                 Chinese mirror (home + guide)
public/             logo, screenshots (copied from plugins/*/docs)
.vitepress/         config, peach theme overrides
```

## Deployment (Tencent CloudBase)

Hosting: CloudBase static hosting, env `xiaotaozi-5g279pi414331d52` (ap-shanghai). The bucket serves several sites, one per top-level directory; this site deploys to the **`dsh/`** directory (`pnpm deploy` does the build and upload; requires `tcb login` first).

Domain `dsh.xiaotaozi.cc` (one-time console setup):

1. CloudBase console → 静态网站托管 → 设置 → 自定义域名 → bind `dsh.xiaotaozi.cc`, and add the CNAME record at your DNS provider.
2. CDN console → domain `dsh.xiaotaozi.cc` → origin configuration → set the origin path (回源路径) to `/dsh`, same as the other sites in this bucket.

The site is built with base `/`, so it only renders correctly through the custom domain (or any domain whose origin path is `/dsh`) — not via the default `tcloudbaseapp.com` URL.

中文说明见 [README.zh.md](README.zh.md)。
