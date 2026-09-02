# Xiaotaozi DSH website

Official site for Xiaotaozi DSH at [dsh.xiaotaozi.cc](https://dsh.xiaotaozi.cc), built with VitePress. English is the root locale; Chinese lives under `/zh/`. This package is a standalone pnpm workspace and is not part of the root `plugins/*` workspace.

## Preview

![Xiaotaozi DSH homepage](public/site-preview.webp)

## Develop locally

```bash
cd apps/website
pnpm install
pnpm dev      # local preview
pnpm build    # static output in .vitepress/dist
```

## Structure

```text
index.md            English landing page
guide/              getting-started · commands · plugins · market · faq
zh/                 Chinese mirror (home + guide)
public/             logo, screenshots (copied from plugins/*/docs), site preview
.vitepress/         config, peach theme overrides
```

## Deployment boundary

Hosting: Tencent CloudBase static hosting, env `xiaotaozi-5g279pi414331d52` (ap-shanghai). The bucket serves several sites, one per top-level directory; this site deploys to the **`dsh/`** directory (`pnpm deploy` does the build and upload; requires `tcb login` first). Documentation work never deploys — run `pnpm build` locally and stop there.

Domain `dsh.xiaotaozi.cc` (one-time console setup):

1. CloudBase console → 静态网站托管 → 设置 → 自定义域名 → bind `dsh.xiaotaozi.cc`, and add the CNAME record at your DNS provider.
2. CDN console → domain `dsh.xiaotaozi.cc` → origin configuration → set the origin path (回源路径) to `/dsh`, same as the other sites in this bucket.

The site is built with base `/`, so it only renders correctly through the custom domain (or any domain whose origin path is `/dsh`) — not via the default `tcloudbaseapp.com` URL.

## Product documentation

Product voice, claims, and screenshot rules live in [PRODUCT.md](PRODUCT.md); visual language in [DESIGN.md](DESIGN.md). The product itself is documented in the [root README](../../README.md).

中文说明见 [README.zh.md](README.zh.md)。
