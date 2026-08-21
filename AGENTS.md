# Agent notes

This repo is a DeepSeek Harness plugin monorepo. One installable plugin is one package under `plugins/`.

Spec: [docs/conventions.md](docs/conventions.md) (Chinese: [docs/conventions.zh.md](docs/conventions.zh.md)).
Procedures: [docs/workflow.md](docs/workflow.md) (Chinese: [docs/workflow.zh.md](docs/workflow.zh.md)).
When creating, installing, simplifying, or committing a plugin, follow [.grok/skills/dsh-plugin/SKILL.md](.grok/skills/dsh-plugin/SKILL.md).
Public docs: English `README.md` is the default; Chinese is `README.zh.md` at the repo root and in each plugin.

## Rules

- Do not add `dsh.bundle` or `dsh.profile` to the workspace root.
- Do not vendor or edit `deepseek-harness` in this repo.
- Do not edit git submodules under `externals/`. They are pinned upstream checkouts, not `plugins/<slug>` packages.
- Do not write `$DSH_HOME/profiles/*/package.json` into git.
- Development boots use the repo `.dsh-home` (`pnpm dev`, `link-plugin`). Do not link workspace plugins into the user's default `~/.dsh` profiles, especially `web`.
- Global `dsh` tracks `@next` (`@deepseek-ai/dsh@0.1.1-rc.2` today). Pin every `@deepseek-ai/dsh-*` dependency to that same rc. Bare `@latest` on those packages often resolves to an empty `0.0.1-rc.1`. When `@next` moves, templates and plugin pins move with it.
- New plugins come from `templates/` via `pnpm new`. Directory `plugins/<slug>`, package `dsh-<slug>`. Do not invent a second package layout.
- Host-only is the default. Add `src/client` only when the plugin has Web UI.
- `cordis.patch.yml` `name` must equal `package.json` `name`.
- `prepare` / `tsdown.config.ts` must stay self-contained inside the plugin package so `github:user/repo#path:plugins/<name>` can build.
- `@deepseek-ai/cordis` and other harness APIs are `import type` only, or they belong in `dependencies` if the compiled `lib/` actually imports them.
- Do not value-import `@deepseek-ai/dsh-tools`. Register a plain tool object on `ctx.tools`. That package's peers are provided by the running harness and will not resolve from a `link:` checkout.
- `@deepseek-ai/*` packages must stay external (`deps.neverBundle: true`). Do not bundle them into `lib/`.
- Tunable values go on the exported Schemastery `Config`. Do not hardcode timeouts, flags, or endpoints.
- Keep each plugin self-contained. Git install is `#path:plugins/<slug>`, so a shared `packages/` workspace would not ship. Do not add that tree. Duplicate a small helper, or publish an npm package, if two plugins ever need the same code.
