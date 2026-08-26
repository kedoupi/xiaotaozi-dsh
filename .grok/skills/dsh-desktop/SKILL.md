---
name: dsh-desktop
description: >
  Work on the Xiaotaozi Desktop shell, seed, .dmg, notarization, or official
  pack apply. Use when the user wants 改壳, 托盘, sidecar, tauri dev, tauri
  build, dmg, 公证, 种子, 首次安装, 发行版, 3080 write, or runs /dsh-desktop.
---

# dsh-desktop

Read `AGENTS.md`, `docs/conventions.md` § Homes and § Users, and `docs/workflow.md` (Chinese: `docs/conventions.zh.md`, `docs/workflow.zh.md`). Product notes: `apps/desktop/DESIGN.md`. Do not copy those tables here.

## Debug shell (plugin still in flux)

```bash
cd apps/desktop
pnpm tauri dev
```

`cfg(debug_assertions)` → `.dsh-home` **3081**. If 3081 is already `pnpm dev`, only open the shell. Do not fall back to 3080. Do not seed or overlay official `~/.dsh`.

## User path (first launch, pack overlay, port conflict)

Use a **release** 小桃子DSH.app or `tauri build`, official `~/.dsh` **3080**. Rebuild official home: `docs/workflow.md` § Rebuild official home. Never `rm -rf ~/.dsh`. Never `link:` this workspace into official web.

```bash
cd apps/desktop
pnpm bundle-runtime
pnpm tauri build
# notarize, then pnpm dmg
```

`tauri build` packs first. Staging is `apps/desktop/.runtime-build/`, never `~/.dsh`.

## Pack apply for users

Sandbox on 3081 must already be green. Then `docs/workflow.md` § Ship a desktop plugin pack. That is not `pnpm --filter dsh-<slug> publish` and not `xtz plugin add`.

## Done

Say whether you used debug 3081 or release 3080. If official home was rewritten, say that `xtz doctor` is the read-only check (`xtz-cli`), and that you did not Git-install into it.
