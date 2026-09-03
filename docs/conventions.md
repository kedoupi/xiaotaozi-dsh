# Conventions

English | [中文](conventions.zh.md)

This file is the **spec** (what is true). Hard rules: [AGENTS.md](../AGENTS.md). Steps: [workflow.md](workflow.md). Contributor entry: [CONTRIBUTING.md](../CONTRIBUTING.md). Which file to edit: [README.md](README.md).

## Repo

This is Xiaotaozi DSH (`xiaotaozi-dsh`) for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): installable plugins and one user product, the `xtz` CLI. There is no desktop client in this tree (git tag `archive/desktop`). The workspace root is not a plugin. Do not `dsh plugin add` it.

| Path | Role |
| --- | --- |
| `plugins/<slug>/` | One installable package, name `dsh-<slug>` |
| `apps/cli/` | User product: `xtz`. Standalone publishable pnpm workspace; not a plugin |
| `apps/website/` | Public site (VitePress). Standalone workspace; not a plugin |
| `packages/` | Forbidden. Path installs would not include a shared workspace. Copy a helper or publish npm |
| `plugins/market` | First-party market UI. Third-party plugins are rows in its catalog, not a second source tree |
| `templates/` | Skeletons for `pnpm new`. Do not edit them to make a plugin |
| `scripts/` | `pnpm new`, `link-plugin`, `check-manifest`, `doctor`, sandbox boot |
| `docs/` | Spec, procedure, and the documentation map |
| `CONTRIBUTING.md` | Human contributor entry (clone, inner loop, gates) |
| `.dsh-home/` | Gitignored sandbox Harness home. Not `~/.dsh` |
| `versions.json` | Sole source for dsh RC, Node, Python, pnpm, and CLI versions |

Public docs are English by default (`README.md`) with Chinese at `README.zh.md`, at the repo root and in each plugin. Engineering docs start at [docs/README.md](README.md).

## Public website

`apps/website` is the public VitePress site. It is not a Harness plugin and not a DSH home.

| Fact | Value |
| --- | --- |
| Package | `apps/website` (standalone pnpm workspace) |
| Public hostname | `dsh.xiaotaozi.cc` (Chinese under `/zh/`) |
| CloudBase env | `xiaotaozi-5g279pi414331d52` (ap-shanghai), alias `xiaotaozi` |
| App | `dsh` (console **网站部署**) |
| Static mount | `/dsh` in the shared hosting bucket |
| Deploy command | `pnpm deploy` in `apps/website` = local `vitepress build` then `tcb app deploy` |
| HTTP domain | `dsh.xiaotaozi.cc` on CloudBase HTTP access (`DIRECT`), route `/` → `STATIC_STORE` `staticstore` with path rewrite prefix `/dsh` |
| DNS | DNSPod CNAME `dsh` → `dsh.xiaotaozi.cc.tcbaccess.tencentcloudbase.com.` |

`tcb hosting deploy` only uploads files. It does **not** create a 网站部署 app. Do not use it for this site.

VitePress `base` is `/`. These are **not** the public site:

- CloudBase default hosting root `*.tcloudbaseapp.com` (no `/dsh` origin path)
- App default `*.webapps.tcloudbase.com` (`Content-Disposition: attachment` — browsers download HTML)

The hosting bucket is shared with other products (`3s/`, `myvibe-assets/`, …). Never `--prune` the bucket root.

Product screenshots in `apps/website/public/` are light `*.webp` plus `*-dark.webp`. The landing uses `ThemeShot` and follows `html.dark`.

Docs-only website work builds locally and does not deploy. Steps: [workflow.md](workflow.md) § Deploy the public site.

## Git

Development is trunk-based with short-lived topic branches, each in a dedicated worktree, merged through a pull request. This is **not** direct editing on `main`: every change still goes through a PR and required CI before it enters the trunk. The only long-lived branch is `main`. This is not Git Flow: do not keep `develop`, `release/*`, or `hotfix/*` as standing lines. A product snapshot is git tag `vX.Y.Z` on the release commit that is on `main`. Version rules: [Versions](#versions).

- The repository-root hub is the stable integration checkout: clean `main` tracking `origin/main`.
- The hub is the normal owner of sandbox `.dsh-home`, port **3081**, and dogfood monitoring.
- Topic worktrees run deterministic gates but do not claim 3081 in the normal path.
- Required CI precedes merge; affected real-journey acceptance follows immediately on merged `main`.
- While hub dogfood monitoring is on, the hub stays within **10 minutes** of `origin/main` by fast-forward only.

A dedicated Git worktree is required for every ordinary topic branch; the repository-root hub is not a task worktree. Each worktree is one checkout of one branch, and Git refuses the same branch in two worktrees. Every pushed topic branch has an open PR; merged topic branches do not remain locally or on the remote. A worktree is still this repository: sandbox home is that checkout's `.dsh-home`; sandbox port and official home follow [Homes](#homes). Do not `link:` any checkout into official web.

Steps: [workflow.md](workflow.md) § Dev environment.

## Market catalog (third-party)

`plugins/` is first-party: we write it, and first `xtz start` seeds **every** package there. Third-party plugins are **rows in `plugins/market`**, not a second tree in the repo. Do not add `externals/`. Do not vendor upstream plugin source. Users install with the spec on that row (`github:owner/repo` or `#path:plugins/…` inside the author's repo, or npm). Never `#path:externals/…`.

### When to list one

Add a row to `MARKET_PLUGINS` in `plugins/market/src/catalog.ts` when all of these hold:

- It is a DeepSeek Harness plugin
- The license is Apache-2.0, MIT, BSD, or similarly permissive
- We will offer it in the market, **not** seed it by default

Do **not** list:

- `deepseek-harness` itself
- Libraries or apps that are not plugins
- A second IM / models implementation that would fight a first-party plugin
- First-party work (`xtz-ui`, `sidebar`, `providers`, `im`, `market`, `wecom-office`)

### How to list one

1. Put `id`, `name`, `version`, `summary`, `packageName`, and `installSpec` on `MARKET_PLUGINS`.
2. `installSpec` must be upstream Git or npm. Refuse `link:`, `file:`, and `#path:externals/`.
3. When upstream ships, bump `version` / `summary` / `installSpec` in the catalog. Do not clone the repo into this tree.

Promote to first-party only when we will second-develop **and** seed it: `pnpm new <slug>`, port `src`, catalogize, delete the market row, add it to `DEFAULT_PLUGINS`.

## Homes

Two homes. Do not mix them. Test work stays on the test home; official work stays on the official home.

| | Official / user | Sandbox |
| --- | --- | --- |
| Who | Users who run `xtz` | Repository development; live **3081** normally belongs to the clean-main hub |
| Home | `~/.dsh` | `<checkout>/.dsh-home` (gitignored) |
| Port | **3080** | **3081** (one machine-wide listener) |
| Boot | `xtz start` (browser UI) | `pnpm dev` (hub or bounded transfer) → `xtz --sandbox start --foreground`; `link-plugin` writes the checkout home |
| Plugins | First `xtz start` seeds defaults; extra via `dsh plugin --profile web` | `link:` into the current checkout |
| Writer | first `xtz start` (seed); extra plugins via `dsh plugin` | `link-plugin` in the current checkout; `pnpm dev` in the hub or bounded transfer |

Which job uses which home:

| Job | Home |
| --- | --- |
| Change plugin source, settings UI, `link-plugin` | Dedicated topic worktree. Run deterministic gates there without claiming **3081** in the normal path |
| Merged-main dogfood | Repository-root hub sandbox `.dsh-home`, `pnpm dev`, **3081** |
| User product (`xtz start`) | Official `~/.dsh` **3080** |
| Inspect official home with `xtz status` / `doctor` | Official `~/.dsh` **3080**. Never `.dsh-home` / 3081 |

- Owner of `~/.dsh` is first `xtz start` for the default seed; extra plugins go through `dsh plugin --profile web`. Users have Node on `PATH`. If 3080 is already taken and `xtz` did not start it, do not steal it. Use the sandbox if you do not want to touch official web.
- Never `link:` or `dsh plugin add ./plugins/<slug>` into `~/.dsh` from this repo. `node scripts/doctor.mjs` only diagnoses and fails if a daily profile points at this repo; it never edits or repairs profiles.
- Sandbox: plugin debugging only. The repository-root hub normally runs `pnpm dev` on merged `main` (pinned DSH, `.dsh-home`, **3081** only). Topic source and deterministic gates stay in the dedicated worktree; topic `pnpm dev` is limited to the explicit bounded transfer below. `link-plugin` writes that checkout's sandbox profile. Official extra plugins come from `dsh plugin --profile web` (Git / npm). Never spawn PATH `dsh` for sandbox web.
- Extra checkouts and worktrees do not get another sandbox port. **3081** is one listener on the machine. A topic uses it only through the bounded transfer and must never steal it from another checkout.

Need keys in the sandbox: copy only `~/.dsh/.credentials.yaml` into `.dsh-home/`. Do not copy `sessions/` or `storages/`.

### Sandbox dogfood

Live use of the repository-root clean-main hub sandbox (`pnpm dev`, **3081**, `.dsh-home`) is how we learn what to change in plugins and architecture. Official **3080** is not this loop.

When monitoring is on, **keep-alive is mandatory**. A journey-break grep with a dead host is not monitoring.

- Keep-alive signal: the repository-root clean-main hub's `pnpm dev` is running **and** **3081** is listening. Process exit, wrapper kill (including a ~10h `max_runtime` even when `timeout: 0`), crash, or `xtz --sandbox` retry-loop (`sandbox web exited`) is a hang. Restart here in the same turn. Confirm **3081** LISTENs. Then retarget the watch to the new log. Watching a dead log is not monitoring. Waiting until the user notices the sandbox is down is a miss.
- Journey signal: stdout `journey event=… break=1` and `.dsh-home/traces/YYYY-MM-DD.jsonl`. A generic error grep is not the signal. Journey grep cannot see process death; it is not a substitute for keep-alive.
- `origin/main` signal: poll at least every **10 minutes**. If the hub is clean on `main` and behind, fast-forward with `git pull --ff-only`. Do not reset or overwrite a dirty tree. Do not chatter when already in sync.
- Monitoring and fixing are different jobs. The hub monitoring session keeps the sandbox up, stays current with `origin/main`, detects, classifies, and opens a GitHub issue on this repository. It does not implement the product fix in the hub checkout. A separate fixing session in a dedicated topic worktree picks up the issue and lands a PR. Keep-alive (restart `pnpm dev` / **3081**, retarget the watch) is monitoring, not a product fix. Watching or summarizing the log is not monitoring.
- Classify each break as: our bug or missing product; a platform limit we can only mitigate; or ops (two homes sharing one WeCom bot). Say which. Do not treat a platform cap as a crash. Do not leave the host dead because the last break was a platform cap.
- Ours: search open issues, then open one (type Bug or Feature). Separate fact / inference / guess. Include repro, commit sha, and plugin. Do not paste secrets or message bodies. Do not implement in the monitoring session.
- Platform limit: say so. Open an issue only when a cheap user-visible mitigation exists that we own. Do not pretend we can lift the cap.
- Ops: tell the user; do not open an issue; do not steal 3080.
- Do not open an issue for a session-wrapper process death with no product evidence, or for a duplicate of an open issue (comment on the existing one).
- Traces must not include message bodies or secrets.

A known post-merge main break is active work for a **fixing** session in a dedicated topic worktree. The hub monitor files the issue; it does not implement in place. The fixing session lands a green PR: fix forward only when the correction is small and known; revert security, data-loss, startup, broad, or unclear regressions through the same reviewed path first. Main must not remain knowingly broken while unrelated work continues.

**Bounded pre-merge 3081 transfer.** A topic worktree may temporarily own 3081 only when pre-merge validation requires rendered UI QA, real-journey verification, an irreversible migration, authentication boundary, external side effect, or another path CI cannot safely cover. The transfer must be explicit: stop the hub sandbox, start the topic sandbox, verify without unrelated development, stop it, then return 3081 to the main hub and confirm monitoring is healthy. Never run two sandbox ports and never let a worktree steal 3081.

Steps: [workflow.md](workflow.md) § Sandbox dogfood monitoring.

Do not vendor or edit `deepseek-harness` here. Types and APIs come from published `@deepseek-ai/*` packages. Official plugin docs and this repo's deltas: [harness-plugin.md](harness-plugin.md).

## Users

Classify by who writes `~/.dsh/profiles/web`, not by which binaries are installed. Say **user** for someone who runs `xtz`; do not use informal labels.

| Who | Installs | Plugin source | Who writes official `web` |
| --- | --- | --- | --- |
| User | `xtz` (Node on `PATH`) | First `xtz start` seeds defaults; extra via `dsh plugin` | first `xtz start` (seed) then `dsh plugin` |
| Plugin author | this repo / Node / git | sandbox `link:` or Git path | does not write official web |

Default seed writer: first `xtz start`. Extra plugins go through `dsh plugin --profile web`. `link:` from this repo into official web is contamination.

Git `#path:plugins/<slug>` is for plugin authors in the sandbox and for users via `dsh plugin --profile web add`. Do not `dsh plugin add ./plugins/<slug>` from this repo into official home.

To make official home look like a user's: `xtz stop`, move `profiles/web` aside, then `xtz start`. Do not `rm -rf ~/.dsh`.

## `xtz` CLI

`apps/cli/` is the user product, not a Harness plugin and not a member of the root `plugins/*` workspace. Its binary is `xtz`. The CLI Node range matches DeepSeek Harness (`^22.19.0 || >=24.0.0`; floor is `versions.json` `node`); its bundled dependency is exactly `@deepseek-ai/dsh` `0.1.1-rc.2`. Official commands use only `~/.dsh`. They never probe or fall back to `.dsh-home` / 3081. Preferred listen port is **3080**; if it is occupied by a non-Xiaotaozi process, an interactive `xtz start` may offer **3082+**. Never listen on 3081. `xtz --sandbox` is not an official command: it is gated to this checkout and is what `pnpm dev` runs. Users install the publishable package `xiaotaozi-dsh-cli` with npm, bun, pnpm, or `apps/cli/scripts/install.sh`; those tools only fetch the package. `xtz` always runs on Node. UI is official `dsh web` in a browser — do not rebuild chat in the terminal or in Tauri.

Open commands: help/version, bare `xtz` / `start` / `stop` / `restart` / `open` / `status` / `doctor` / `config path`. `web` is a start alias. `xtz` is a pinned-dsh wrapper, not a plugin manager. First `xtz start` seeds official web and every first-party plugin under `plugins/`. Extra (third-party) plugins: the in-app market. `status` and `doctor` accept only the exact v1 response from `/.well-known/xiaotaozi-dsh/identity/v1`; any other HTTP response proves only that the port is occupied.

`start`/`stop`/`restart` only manage a process `xtz` started (`$DSH_HOME/xiaotaozi-xtz-web.pid`). Do not steal a port or kill by port. If 3080 already serves Xiaotaozi identity but is not that pid, do not start a second instance. `init`, `plugin`, `run`/`ask`, `config dump`/`defaults`, and `update` stay fail closed. Keep this command list identical in `apps/cli/README.md` and the root README.

## Shipping plugins

Two ship paths. Do not mix them.

| | Developers | Users |
| --- | --- | --- |
| Who | people with Node / git | `xtz` then `dsh` |
| What moves | one `dsh-<slug>` | Git path or npm into official `web` |
| How | `pnpm --filter dsh-<slug> publish` or Git `#path:plugins/<slug>` | first `xtz start` (defaults); extra via the in-app market |
| Host | GitHub / npm | GitHub / npm via `dsh` |

Do not add `apps/desktop/`. History of the abandoned Tauri client is git tag `archive/desktop`. Do not invent a signed-pack / CDN pipeline.

## Versions

Follow [Semantic Versioning 2.0.0](https://semver.org/). Write `MAJOR.MINOR.PATCH`. Bump **only when shipping a user-facing artifact** (git tag and/or npm), not on every commit. One release bumps one digit; the digits to the right reset to 0.

| Digit | When | Examples |
| --- | --- | --- |
| MAJOR | User-facing contract breaks | Remove an open `xtz` command; change the identity URL; a seeded plugin spec that old installs cannot follow |
| MINOR | Compatible new capability | New open command; another default-seeded plugin; a new market row |
| PATCH | Compatible fix or docs | IM stream fix; documentation-only; CI |

`0.y.z` means the public contract is not stable yet. The CLI is published and default seeds pin a product tag. Stay on `0.x` until we will treat breaking changes as MAJOR. The live product number is `versions.json` `cliApp`, not a sentence in this file.

Two version planes. Same **rules**; not the same **number**.

| Plane | What it is | Bump when |
| --- | --- | --- |
| Product (`vX.Y.Z` git tag = `versions.json` `cliApp` = `apps/cli/package.json` version) | The user install unit. One tag freezes every first-party plugin tree at that commit | Shipping `xtz` / the default seed snapshot |
| Plugin package (`plugins/<slug>/package.json` `version`) | Independent SemVer for a future `pnpm --filter dsh-<slug> publish` | Publishing that package to npm (or a market card that shows the number) |

Do not lower an unpublished plugin version to “line up” with the CLI. Git-path users never see plugin `package.json` versions; they install a product tag.

Default seed specs:

```text
github:kedoupi/xiaotaozi-dsh#path:plugins/<slug>                 # floating; development / sandbox only
github:kedoupi/xiaotaozi-dsh#vX.Y.Z&path:plugins/<slug>         # product shelf (pnpm git source)
```

`DEFAULT_PLUGINS` on `main` must pin `#v${cliApp}&path:plugins/<slug>`. The release commit that changes `cliApp` retargets every default spec to that same tag. Record the bump in [CHANGELOG.md](../CHANGELOG.md).

The user-installable npm package is only `xiaotaozi-dsh-cli`. It publishes from GitHub Actions on tag `vX.Y.Z` (npm Trusted Publisher / OIDC). First-party plugins stay Git-path / first `xtz start`.

| `apps/cli/package.json` field | Must be |
| --- | --- |
| `name` | `xiaotaozi-dsh-cli` |
| `version` | `versions.json` `cliApp` |
| `bin.xtz` | `lib/cli.js` (no `./` prefix; npm 11 drops `./lib/cli.js`) |
| `repository.url` | `git+https://github.com/kedoupi/xiaotaozi-dsh.git` |

Trusted Publisher on npmjs.com for that package (npm does **not** verify the form when you save it):

| Field | Value |
| --- | --- |
| Organization or user | `kedoupi` |
| Repository | `xiaotaozi-dsh` |
| Workflow filename | `publish.yml` (filename only, not `.github/workflows/`, not the YAML `name:`) |
| Environment | empty (the job has no `environment:`) |
| Allowed actions | Allow `npm publish` |

## Host version

Pin the global CLI to `@next`, currently `0.1.1-rc.2`:

```bash
pnpm add -g @deepseek-ai/dsh@0.1.1-rc.2
```

Many `@deepseek-ai/dsh-*` packages still have `latest` stuck on empty `0.0.1-rc.1`; always write an explicit version (`0.1.1-rc.2`). Plugin `@deepseek-ai/dsh-*` pins must match the host rc. When `@next` moves, templates and plugin `devDependencies` move with it.

## Package identity

One plugin, four names that must agree:

| Piece | Value |
| --- | --- |
| Directory | `plugins/<slug>/` |
| `package.json` `name` | `dsh-<slug>` |
| `cordis.patch.yml` `name` | `dsh-<slug>` |
| Patch `id` / `export const name` | `<slug>` |

Slug: lowercase `[a-z][a-z0-9-]*`, no `--`, no `dsh-` prefix in the directory (`pnpm new` strips it).

Git install (development / floating):

```text
github:kedoupi/xiaotaozi-dsh#path:plugins/<slug>
```

Git install pinned to a product tag:

```text
github:kedoupi/xiaotaozi-dsh#vX.Y.Z&path:plugins/<slug>
```

That path is one plugin directory. There is no shared `packages/` workspace: it would not be included in a path install. Keep helpers inside the plugin, copy a small snippet, or publish an npm package.

A rename is all of the above, plus `$DSH_HOME/plugins/<slug>/` on disk, plus sandbox `link-plugin` again. Do not leave the old package name in a profile.

User-facing copy in Xiaotaozi plugins is Chinese. The settings page this plugin occupies is named after the job (模型), not the package name.

## Plugin layout

Cordis and Harness plugin APIs: official docs, plus this repo's deltas in [harness-plugin.md](harness-plugin.md). Do not copy those tutorials here.

Default `pnpm new <slug>` is **host** (tools/services, no UI). Use `--kind mixed` only for a settings page, slot, or theme.

- Profile loads `lib/`, not `src/`. Rebuild after source edits.
- Logic that can run without Cordis lives in a separate file. Tests import that file only. Do not mock the whole harness.
- Tunable values go on the exported Schemastery `Config`.
- `@deepseek-ai/cordis` is `import type` unless `lib/` actually imports it at runtime — then it belongs in `dependencies`.
- Do not value-import `@deepseek-ai/dsh-tools`. Register a plain tool object on `ctx.tools`. If the plugin value-imports `@deepseek-ai/dsh-subagent` or `@deepseek-ai/dsh-session`, declare the load-time peers (`dsh-tools` / `dsh-scope`) in `dependencies`.
- `@deepseek-ai/*` stays external (`deps.neverBundle: true`).
- `prepare` / `tsdown.config.ts` stay inside the plugin package so a Git path install can build.
- Each plugin ships `README.md` and `README.zh.md`.

`versions.json` is the only normative version source. Root/CLI package metadata and README badges/install commands remain literal where their formats require it; the gate rejects any mismatch.

| Gate | Guarantee |
| --- | --- |
| `pnpm check` | Version and documentation consistency, installable manifest shape, type checks, plugin tests, and script tests. It does not require fresh `lib/` output |
| `pnpm check:build` | Builds all plugins and reruns the manifest gate with `--require-lib`, including generated-code import/bundling checks |
| `pnpm check:path` | Exercises isolated Git path installs so each plugin can prepare without the monorepo |
| `pnpm check:cli` | Typechecks, builds, and tests the standalone CLI workspace without starting or changing the official service |

`pnpm check-home` is separate and read-only: it reports unsafe links from daily `~/.dsh`; it never fixes them.

## Onboarding and first work

`pnpm dev` runs with `process.cwd()` at this repository (often `xiaotaozi-dsh`). That path is the plugin author's checkout, not a user project.

If a plugin binds, connects, or adds an account and then creates a Harness session, writes files, or otherwise does durable work:

- A plugin may retain `config.workspace ?? process.cwd()` internally to launch its Harness process, but the durable work target stays **unset** until the user confirms one. For `dsh-im`, the bot binding persists `null`, not a provisional cwd. An internal launch cwd is not user-visible and must not be selectable as the target.
- Do not create the first session, first file, or first workspace window in an internal launch cwd while the target is unset, the picker is still open, or the confirm RPC is in flight.
- The first inbound / first user action after bind waits for confirm. **Cancel does not confirm the default cwd / repo root**; the target stays unset and no work starts.
- The picker must never start at the plugin repo cwd. For `dsh-im`, an already-created project is one current `workspace.list().items` record; the picker lists those records only, never an unregistered cwd, home directory, or arbitrary folder.
- After a restart, only a binding whose `workspaceId` still exists is confirmed. A legacy path may migrate once when it uniquely matches a current registered project; an unmatched cwd or arbitrary folder is unset.
- Tests must cover the race: unconfirmed bind + first action does not land in cwd; cancel still does not land in cwd; first action after picking the real target lands only there. A green unit suite that never binds then immediately acts does not prove this.

Current implementation: `dsh-im` `BotWorkspaceStore` persists `workspaceId` identity, reconciles against `workspace.list().items`, and fences first work with `whenWorkspaceReady`. Other plugins follow the rule; they do not import that store. Sandbox steps: [workflow.md](workflow.md) § Install.

## Commands

```bash
pnpm new <slug>                 # or: pnpm new <slug> --kind mixed
pnpm --filter dsh-<slug> test
pnpm --filter dsh-<slug> build
node scripts/link-plugin.mjs --profile dsh-dev <slug>   # load check
node scripts/link-plugin.mjs --profile web <slug>       # UI
pnpm dev                                                # hub merged-main dogfood; topic only during an explicit bounded 3081 transfer
pnpm check:cli                                          # standalone apps/cli workspace (the user product)
pnpm check:build                                        # CI gate: requires and inspects built lib/ (expands to pnpm build + check-manifest --require-lib; check:path proves the install)
pnpm check
pnpm check-home                                         # daily ~/.dsh must stay unlinked
```

Installed means `dump-config` contains `# == dsh-<slug>`. Keep hub `pnpm dev` running as merged-main dogfood while topic work stays in its dedicated worktree. A topic may own **3081** only during an explicit bounded QA transfer and must return it afterward. Do not restart the user's official `xtz` service on 3080.
