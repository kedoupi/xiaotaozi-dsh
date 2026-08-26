# Agent notes

This repo is Xiaotaozi DSH (`xiaotaozi-dsh`): DeepSeek Harness plugins plus two main products, the Win/Mac Tauri client in `apps/desktop/` and the `xtz` CLI in `apps/cli/`. One installable plugin is one package under `plugins/`.

Spec: [docs/conventions.md](docs/conventions.md) (Chinese: [docs/conventions.zh.md](docs/conventions.zh.md)).
Procedures: [docs/workflow.md](docs/workflow.md) (Chinese: [docs/workflow.zh.md](docs/workflow.zh.md)).
When creating, forking, installing, simplifying, or committing a plugin, follow [.grok/skills/dsh-plugin/SKILL.md](.grok/skills/dsh-plugin/SKILL.md).
Public docs: English `README.md` is the default; Chinese is `README.zh.md` at the repo root and in each plugin.

## Rules

- Do not add `dsh.bundle` or `dsh.profile` to the workspace root.
- Do not vendor or edit `deepseek-harness` in this repo.
- Do not edit git submodules under `externals/`. They are read-only upstream pins for diffing. Never `link-plugin`, `dsh plugin add`, or `link:` them. The only installable packages are under `plugins/`. Add a submodule only when we will fork it into `plugins/<slug>` and install that fork — `externals/` is not a watch list. When upstream moves: bump the gitlink, then port selected changes into `plugins/<slug>`.
- Do not write `$DSH_HOME/profiles/*/package.json` into git.
- Exactly two homes. Test stays on test; official stays on official.
  1. Desktop / official: `~/.dsh`, port **3080**. Bundled Node+dsh. Plugin updates are silent packs from `https://s.xiaotaozi.cc/dsh/packs/` only (existing TCB COS prefix; never GitHub/npm/`link:` / `dsh.xiaotaozi.cc`). Index is an Ed25519 envelope and clients verify it. The signing private key lives per user at `~/.config/xiaotaozi-dsh/pack-signing-key.pem` (`XIAOTAOZI_PACK_SIGNING_KEY` overrides); it is never in git and needs an off-machine backup. COS put is not a publish: `pnpm publish-pack` must `PurgeUrlsCache` and wait for the live index. `pnpm check-home` only diagnoses; it never edits profiles. The installed 小桃子DSH.app, `tauri build` / pack apply / notarization, and the shipped installer use this home. Release never probes 3081.
  2. Sandbox (required for us): `<repo>/.dsh-home`, port **3081**. `pnpm dev` / `link-plugin`, and **debug-only** `pnpm tauri dev` (`cfg(debug_assertions)`). Gitignored. Plugin source and settings UI go here.
  Do not mix them. Release / 小桃子DSH.app must not probe 3081. Do not verify `link:` checkouts inside the installed 小桃子DSH.app. If 3080 is already taken, do not steal the port. Debug desktop must not fall back to 3080.
- `versions.json` is the only normative source for dsh RC, Node, Python, pnpm, desktop app, and CLI app versions. Keep required manifest literals in sync; never make `package.json` dynamically read JSON. Pin every `@deepseek-ai/dsh-*` dependency to `dshRc`.
- `apps/cli/` is the standalone, publishable Node workspace for the `xtz` binary. It is an app, not a Harness plugin, and must not join the root `plugins/*` workspace. The CLI runtime is exactly Node `22.19.0` with exactly the pinned DSH RC. Official CLI commands use only `~/.dsh` and `127.0.0.1:3080`; they never probe or fall back to `.dsh-home` / 3081.
- The first CLI release is read-only: only help/version, `status`, `config path`, `plugin list`, and `doctor` are available. Until Desktop and CLI share a trusted cross-process supervisor, a service-identity protocol, and a locked profile transaction boundary, `start`/`web`, `open`, `run`/`ask`, `config dump`/`defaults`, `stop`, and `update` must fail closed. Do not invoke any DSH command against the official profile if it may prepare or rewrite generated state, even when it appears read-only. Do not detach an engine, kill by PID/port, invoke `dsh plugin` against the official profile, or apply a pack concurrently with Desktop.
- New plugins come from `templates/` via `pnpm new`. Directory `plugins/<slug>`, package `dsh-<slug>`. Do not invent a second package layout.
- Host-only is the default. Add `src/client` only when the plugin has Web UI. Shipped DSH chrome (brand, Session log, Open configuration file, duplicate official nav, peach accent tokens) and the Xiaotaozi workbench (Settings → 小桃子 toggles, archive, right panel, task board, git graph) live in `plugins/hello`. Models, memory, IM, context, and agent-teams stay in those plugins.
- `cordis.patch.yml` `name` must equal `package.json` `name`.
- `prepare` / `tsdown.config.ts` must stay self-contained inside the plugin package so `github:user/repo#path:plugins/<name>` can build.
- `@deepseek-ai/cordis` and other harness APIs are `import type` only, or they belong in `dependencies` if the compiled `lib/` actually imports them.
- Do not value-import `@deepseek-ai/dsh-tools`. Register a plain tool object on `ctx.tools`. That package's peers are provided by the running harness and will not resolve from a `link:` checkout.
- `@deepseek-ai/*` packages must stay external (`deps.neverBundle: true`). Do not bundle them into `lib/`. `pnpm check` covers policy/type/tests; `pnpm check:build` builds and inspects required `lib/`; `pnpm check:path` proves isolated Git path installs; `pnpm check:desktop` covers desktop script/frontend/Rust checks without publishing; `pnpm check:cli` covers the standalone CLI workspace. A green `pnpm check` alone does not prove a Git path install can build.
- Tunable values go on the exported Schemastery `Config`. Do not hardcode timeouts, flags, or endpoints.
- Keep each plugin self-contained. Git install is `#path:plugins/<slug>`, so a shared `packages/` workspace would not ship. Do not add that tree. Duplicate a small helper, or publish an npm package, if two plugins ever need the same code.
