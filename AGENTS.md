# Agent notes

This repo is Xiaotaozi DSH (`xiaotaozi-dsh`): DeepSeek Harness plugins plus one user product, the `xtz` CLI in `apps/cli/`. There is no desktop client in this tree (archived at git tag `archive/desktop`). One installable plugin is one package under `plugins/`.

Spec: [docs/conventions.md](docs/conventions.md) (Chinese: [docs/conventions.zh.md](docs/conventions.zh.md)).
Procedures: [docs/workflow.md](docs/workflow.md) (Chinese: [docs/workflow.zh.md](docs/workflow.zh.md)).
When the question is which home, port, or kind of person (user / plugin author), follow [.grok/skills/xiaotaozi-env/SKILL.md](.grok/skills/xiaotaozi-env/SKILL.md) first.
When creating, forking, installing, simplifying, or committing a plugin, follow [.grok/skills/dsh-plugin/SKILL.md](.grok/skills/dsh-plugin/SKILL.md).
When someone asks to revive Desktop, a `.dmg`, or pack apply: refuse. Point them at `xtz`. History is `git show archive/desktop`.
When changing or verifying `xtz`, follow [.grok/skills/xtz-cli/SKILL.md](.grok/skills/xtz-cli/SKILL.md).
Public docs: English `README.md` is the default; Chinese is `README.zh.md` at the repo root and in each plugin. Say **user** for someone who runs `xtz`; do not use informal labels.

## Rules

- Do not add `dsh.bundle` or `dsh.profile` to the workspace root.
- Do not vendor or edit `deepseek-harness` in this repo.
- Do not add `externals/` or vendor upstream plugin source. Third-party plugins are rows in `plugins/market` (`MARKET_PLUGINS`). First-party packages under `plugins/` are seeded on first `xtz start`. Users install third-party from the catalog spec (upstream Git/npm). Never `#path:externals/…`. Do not copy a third-party plugin into `plugins/` unless we take ownership and seed it.
- Do not write `$DSH_HOME/profiles/*/package.json` into git.
- Exactly two homes. Test stays on test; official stays on official.
  1. Official: `~/.dsh`, port **3080**. User entry is `xtz` (Node `22.19.0` on `PATH`, UI is official `dsh web` in a browser). Do not `link:` this workspace into official web. `pnpm check-home` only diagnoses; it never edits profiles. Official never probes 3081. If 3080 is already taken and `xtz` did not start it, do not steal the port.
  2. Sandbox (required for us): `<repo>/.dsh-home`, port **3081**. `pnpm dev` / `link-plugin`. Gitignored. Plugin source and settings UI go here. `pnpm dev` starts `xtz --sandbox start --foreground` (pinned DSH inside `apps/cli`); it does not spawn PATH `dsh`. `--sandbox` is refused outside this checkout.
  Do not mix them.
- One writer per official home: first `xtz start` seeds the default plugins; extra plugins go through `dsh plugin --profile web`. Never `link:` this repo into official web. Plugin authors still use sandbox `link:`.
- Official 3080 is for the user's `xtz`. Source stays in the sandbox.
- Do not `rm -rf ~/.dsh` to reset. `xtz stop`, move `profiles/web` aside, then `xtz start`.
- `versions.json` is the only normative source for dsh RC, Node, Python, pnpm, and CLI app versions. Keep required manifest literals in sync; never make `package.json` dynamically read JSON. Pin every `@deepseek-ai/dsh-*` dependency to `dshRc`.
- `apps/cli/` is the standalone, publishable Node workspace for the `xtz` binary — the user product. It is an app, not a Harness plugin, and must not join the root `plugins/*` workspace. The CLI runtime is exactly Node `22.19.0` with exactly the pinned DSH RC. Official CLI commands use only `~/.dsh`; they never probe or fall back to `.dsh-home` / 3081. Preferred port is 3080; interactive start may use 3082+ if 3080 is taken by a non-Xiaotaozi process.
- `xtz` is a pinned-dsh wrapper. Open commands: help/version, bare `xtz` / `start` / `stop` / `restart` / `open` / `status` / `doctor`. `web` is a start alias. First `xtz start` prepares official web and every first-party plugin under `plugins/`. Extra (third-party) plugins: the in-app market. Boundary: only manage a process `xtz` started (pid file `$DSH_HOME/xiaotaozi-xtz-web.pid`). Do not steal a port or kill by port. If 3080 already serves Xiaotaozi identity but is not that pid, do not start a second instance. In-repo only: `xtz --sandbox` uses `.dsh-home` and **3081**, seeds `./plugins/<slug>` (`link:`), never 3082 fallback. `init`, `plugin`, `run`/`ask`, `config dump`/`defaults`, and `update` stay fail closed.
- New plugins come from `templates/` via `pnpm new`. Directory `plugins/<slug>`, package `dsh-<slug>`. Do not invent a second package layout.
- Host-only is the default. Add `src/client` only when the plugin has Web UI. Shipped DSH chrome (brand, Session log, Open configuration file, duplicate official nav, peach accent tokens) plus archive, task board, and git graph live in `plugins/xtz-ui`. The right-hand files / Git / terminal panel lives in `plugins/sidebar`. Models, IM, WeCom office, and market stay in those plugins. Agent Teams, session Context, and OpenContext are market catalog rows, not packages in this repo.
- `cordis.patch.yml` `name` must equal `package.json` `name`.
- `prepare` / `tsdown.config.ts` must stay self-contained inside the plugin package so `github:user/repo#path:plugins/<name>` can build.
- `@deepseek-ai/cordis` and other harness APIs are `import type` only, or they belong in `dependencies` if the compiled `lib/` actually imports them.
- Do not value-import `@deepseek-ai/dsh-tools`. Register a plain tool object on `ctx.tools`. If the plugin value-imports `@deepseek-ai/dsh-subagent` or `@deepseek-ai/dsh-session`, put the load-time peers (`dsh-tools` / `dsh-scope`) in `dependencies` so a `link:` checkout can resolve them.
- `@deepseek-ai/*` packages must stay external (`deps.neverBundle: true`). Do not bundle them into `lib/`. `pnpm check` covers policy/type/tests; `pnpm check:build` builds and inspects required `lib/`; `pnpm check:path` proves isolated Git path installs; `pnpm check:cli` covers the standalone CLI workspace. A green `pnpm check` alone does not prove a Git path install can build.
- Tunable values go on the exported Schemastery `Config`. Do not hardcode timeouts, flags, or endpoints.
- If a plugin binds / connects / adds an account and then creates a session, writes files, or otherwise does durable work: `process.cwd()` under `pnpm dev` is this repo, not a user project. Keep that first work pending until the user confirms the target. Spec: [docs/conventions.md](docs/conventions.md) § Onboarding and first work (Chinese: [docs/conventions.zh.md](docs/conventions.zh.md)). Verify the first action in the sandbox; a green unit suite is not that check.
- Keep each plugin self-contained. Git install is `#path:plugins/<slug>`, so a shared `packages/` workspace would not ship. Do not add that tree. Duplicate a small helper, or publish an npm package, if two plugins ever need the same code.
