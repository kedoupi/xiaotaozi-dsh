# Agent notes

This repo is Xiaotaozi DSH (`xiaotaozi-dsh`): DeepSeek Harness plugins plus a Win/Mac Tauri client in `apps/desktop/`. One installable plugin is one package under `plugins/`.

Spec: [docs/conventions.md](docs/conventions.md) (Chinese: [docs/conventions.zh.md](docs/conventions.zh.md)).
Procedures: [docs/workflow.md](docs/workflow.md) (Chinese: [docs/workflow.zh.md](docs/workflow.zh.md)).
When creating, forking, installing, simplifying, or committing a plugin, follow [.grok/skills/dsh-plugin/SKILL.md](.grok/skills/dsh-plugin/SKILL.md).
Public docs: English `README.md` is the default; Chinese is `README.zh.md` at the repo root and in each plugin.

## Rules

- Do not add `dsh.bundle` or `dsh.profile` to the workspace root.
- Do not vendor or edit `deepseek-harness` in this repo.
- Do not edit git submodules under `externals/`. They are read-only upstream pins for diffing. Never `link-plugin`, `dsh plugin add`, or `link:` them. The only installable packages are under `plugins/`. Add a submodule only when we will fork it into `plugins/<slug>` and install that fork — `externals/` is not a watch list. When upstream moves: bump the gitlink, then port selected changes into `plugins/<slug>`.
- Do not write `$DSH_HOME/profiles/*/package.json` into git.
- Exactly two homes:
  1. Desktop / official: `~/.dsh`, port **3080**. Bundled Node+dsh. Plugin updates are silent packs from `https://s.xiaotaozi.cc/dsh/packs/` only (existing TCB COS prefix; never GitHub/npm/`link:` / `dsh.xiaotaozi.cc`). Index is an Ed25519 envelope and clients verify it. The signing private key lives per user at `~/.config/xiaotaozi-dsh/pack-signing-key.pem` (`XIAOTAOZI_PACK_SIGNING_KEY` overrides); it is never in git and needs an off-machine backup. COS put is not a publish: `pnpm publish-pack` must `PurgeUrlsCache` and wait for the live index. `pnpm check-home` only diagnoses; it never edits profiles.
  2. Sandbox (required for us): `<repo>/.dsh-home`, port **3081**. `pnpm dev` / `link-plugin` only. Gitignored.
  Do not mix them. Do not probe 3081 from the desktop client. If 3080 is already taken, do not steal the port.
- `versions.json` is the only normative source for dsh RC, Node, Python, pnpm, and desktop app versions. Keep required manifest literals in sync; never make `package.json` dynamically read JSON. Pin every `@deepseek-ai/dsh-*` dependency to `dshRc`.
- New plugins come from `templates/` via `pnpm new`. Directory `plugins/<slug>`, package `dsh-<slug>`. Do not invent a second package layout.
- Host-only is the default. Add `src/client` only when the plugin has Web UI.
- `cordis.patch.yml` `name` must equal `package.json` `name`.
- `prepare` / `tsdown.config.ts` must stay self-contained inside the plugin package so `github:user/repo#path:plugins/<name>` can build.
- `@deepseek-ai/cordis` and other harness APIs are `import type` only, or they belong in `dependencies` if the compiled `lib/` actually imports them.
- Do not value-import `@deepseek-ai/dsh-tools`. Register a plain tool object on `ctx.tools`. That package's peers are provided by the running harness and will not resolve from a `link:` checkout.
- `@deepseek-ai/*` packages must stay external (`deps.neverBundle: true`). Do not bundle them into `lib/`. `pnpm check` covers policy/type/tests; `pnpm check:build` builds and inspects required `lib/`; `pnpm check:path` proves isolated Git path installs; `pnpm check:desktop` covers desktop script/frontend/Rust checks without publishing. A green `pnpm check` alone does not prove a Git path install can build.
- Tunable values go on the exported Schemastery `Config`. Do not hardcode timeouts, flags, or endpoints.
- Keep each plugin self-contained. Git install is `#path:plugins/<slug>`, so a shared `packages/` workspace would not ship. Do not add that tree. Duplicate a small helper, or publish an npm package, if two plugins ever need the same code.
