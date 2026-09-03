---
name: website-deploy
description: >
  Deploy or bind the Xiaotaozi public VitePress site on CloudBase. Use when the
  user mentions 官网, website, apps/website, VitePress, tcb, CloudBase, 网站部署,
  hosting deploy, dsh.xiaotaozi.cc, 发官网, or runs /website-deploy.
---

# website-deploy

Read `AGENTS.md`, `docs/conventions.md` § Public website, and `docs/workflow.md` § Deploy the public site (Chinese: `docs/conventions.zh.md`, `docs/workflow.zh.md`). Do not copy those tables here.

This is CloudBase ops, not a DSH home. Do not start official **3080**. Do not bounce a healthy hub **3081**.

## Classify

1. Docs / copy / screenshots only → topic worktree, `pnpm --dir apps/website build`, local preview. Do not deploy.
2. Ship to production → user asked to deploy; ship from merged `main` via `pnpm deploy`.
3. Domain missing / bind hostname → one-time HTTP access + DNSPod CNAME. Ask before creating certs or DNS if anything is unclear.

## Deploy

```bash
cd apps/website
pnpm deploy
```

That is local `vitepress build` then `tcb app deploy dsh` with `--deploy-path /dsh`. Never `tcb hosting deploy` for this site (console **网站部署** stays empty).

Confirm:

- `tcb app info dsh -e xiaotaozi-5g279pi414331d52` SUCCESS, `appPath` `/dsh`
- Console: 静态网站托管 → **网站部署** → app `dsh`
- `tcb domains ls` → `dsh.xiaotaozi.cc` SUCCESS, DNS OK
- Optional origin: `…tcloudbaseapp.com/dsh/zh/` 200

Ask the user to open **https://dsh.xiaotaozi.cc/zh/**. Do not give `*.webapps.tcloudbase.com` (browser downloads HTML). Do not treat a proxied DNS lookup of the custom hostname as proof.

## Bind (only if the domain row is missing)

Issued SSL for `dsh.xiaotaozi.cc`, then `tcb domains add` (`DIRECT`) + route `/` → `STATIC_STORE` `staticstore` with `pathRewrite.prefix` `/dsh` + DNSPod CNAME `dsh` → `dsh.xiaotaozi.cc.tcbaccess.tencentcloudbase.com.` Never point `/` at the bucket root without rewrite. Never `--prune` the shared bucket.

## Done

Say app name, version, whether `pnpm deploy` ran, and which URL the user should open. If you did not open the custom hostname yourself, say so.
