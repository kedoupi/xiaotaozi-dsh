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

Hosting: Tencent CloudBase static hosting, env `xiaotaozi-5g279pi414331d52` (ap-shanghai). The bucket serves several sites, one per top-level directory; this site is CloudBase **app** `dsh` mounted at **`/dsh`**. `pnpm deploy` builds locally, then `tcb app deploy` (网站部署 / versioned app). Do not use `tcb hosting deploy` for this site — that only uploads files and does not appear under 网站部署. Requires `tcb login`. Documentation work never deploys — run `pnpm build` locally and stop there.

Domain `dsh.xiaotaozi.cc` (HTTP access, already bound):

1. CloudBase HTTP access: custom domain `dsh.xiaotaozi.cc`, `DIRECT`, cert in Tencent SSL.
2. Route `/` → static hosting `staticstore` with path rewrite prefix `/dsh`.
3. DNSPod CNAME `dsh` → `dsh.xiaotaozi.cc.tcbaccess.tencentcloudbase.com.`

The public URL is `https://dsh.xiaotaozi.cc/zh/`. VitePress `base` is `/`. Do not use `*.webapps.tcloudbase.com` (the browser downloads HTML) or the default `tcloudbaseapp.com` root. Spec: [conventions.md](../../docs/conventions.md) § Public website. Steps: [workflow.md](../../docs/workflow.md) § Deploy the public site.

## Product documentation

Product voice, claims, and screenshot rules live in [PRODUCT.md](PRODUCT.md); visual language in [DESIGN.md](DESIGN.md). The product itself is documented in the [root README](../../README.md).

中文说明见 [README.zh.md](README.zh.md)。
