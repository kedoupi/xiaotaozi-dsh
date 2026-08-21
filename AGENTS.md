# Agent notes

This repo is a DeepSeek Harness plugin monorepo. One installable plugin is one package under `plugins/`.

Procedures (create / install / commit / optimize) live in `docs/workflow.md` (English) and `docs/workflow.zh.md` (Chinese). Follow `.grok/skills/dsh-plugin/SKILL.md` when doing those jobs. Public docs: English `README.md` is the default; Chinese is `README.zh.md` at the repo root and in each plugin.

## Rules

- Do not add `dsh.bundle` or `dsh.profile` to the workspace root.
- Do not vendor or edit `deepseek-harness` in this repo.
- Do not write `$DSH_HOME/profiles/*/package.json` into git.
- New plugins come from `templates/` via `pnpm new`. Do not invent a second package layout.
- Host-only is the default. Add `src/client` only when the plugin has Web UI.
- `cordis.patch.yml` `name` must equal `package.json` `name`.
- `prepare` / `tsdown.config.ts` must stay self-contained inside the plugin package so `github:user/repo#path:plugins/<name>` can build.
- `@deepseek-ai/cordis` and other harness APIs are `import type` only, or they belong in `dependencies` if the compiled `lib/` actually imports them.
- Do not value-import `@deepseek-ai/dsh-tools`. Register a plain tool object on `ctx.tools`. That package's peers are provided by the running harness and will not resolve from a `link:` checkout.
- `@deepseek-ai/*` packages must stay external (`deps.neverBundle: true`). Do not bundle them into `lib/`.
- Tunable values go on the exported Schemastery `Config`. Do not hardcode timeouts, flags, or endpoints.
- Shared code waits until a second plugin actually needs it, then goes in `packages/` without `dsh.bundle`.
