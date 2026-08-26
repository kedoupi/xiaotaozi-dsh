# Conventions

English | [中文](conventions.zh.md)

Hard rules: [AGENTS.md](../AGENTS.md). Steps: [workflow.md](workflow.md). This file is the project spec those two assume.

## Repo

This is Xiaotaozi DSH (`xiaotaozi-dsh`) for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): installable plugins, a Mac-only Tauri client, and the `xtz` CLI. The workspace root is not a plugin. Do not `dsh plugin add` it.

| Path | Role |
| --- | --- |
| `plugins/<slug>/` | One installable package, name `dsh-<slug>` |
| `apps/desktop/` | Mac-only Tauri client (小桃子DSH). Not a pnpm workspace member |
| `apps/cli/` | Main `xtz` CLI product. Standalone publishable pnpm workspace; not a plugin |
| `packages/` | Forbidden. Path installs would not include a shared workspace. Copy a helper or publish npm |
| `externals/<name>/` | Read-only git submodule of an upstream plugin. Reference only. Never install it |
| `templates/` | Skeletons for `pnpm new`. Do not edit them to make a plugin |
| `scripts/` | `pnpm new`, `link-plugin`, `check-manifest`, `doctor`, sandbox boot |
| `.dsh-home/` | Gitignored sandbox Harness home. Not `~/.dsh` |
| `versions.json` | Sole source for dsh RC, Node, Python, pnpm, desktop app, and CLI versions |

Public docs are English by default (`README.md`) with Chinese at `README.zh.md`, at the repo root and in each plugin.

## Externals

`externals/` is the upstream pin. `plugins/` is the fork we ship. Users and the sandbox install **only** `plugins/<slug>`. Steps: [workflow.md](workflow.md) § Fork.

### When to take one in

Add a pin **and** a fork only when all of these hold:

- It is (or cleanly becomes) a DeepSeek Harness plugin
- The license is Apache-2.0, MIT, BSD, or similarly permissive
- We will second-develop it (catalog layout, host rc pins, Chinese copy, extra behavior) **and** install the fork

Do **not** add to `externals/`:

- A project we only want to bookmark (star it; do not submodule)
- `deepseek-harness` itself (already forbidden to vendor)
- Libraries, apps, or whole repos that are not plugins
- A second implementation of a job we already ship, unless we are replacing the current plugin
- First-party plugins (`providers`, `memory`, `im`, `hello`): they have no upstream; do not invent a submodule

`externals/` is not a watch list. Every pin must have a matching `plugins/<slug>` we install. A pin with no fork is clone cost with no payoff.

### Pin and fork

- Not in the pnpm workspace. `pnpm install`, `pnpm check`, `pnpm new`, and `link-plugin` ignore them.
- Do not edit files inside a submodule. Do not `pnpm new` under `externals/`. Do not `link:` / `dsh plugin add` a path under `externals/`. Do not tell users to install the upstream npm name when we already have a fork. Do not install our fork and the upstream npm in the same profile.
- Directory under `externals/` keeps the upstream repo name (`dsh-context`). Directory under `plugins/` is our slug with no `dsh-` prefix (`plugins/context`). Package name is `dsh-<slug>`. If upstream already published `dsh-<slug>`, keep that package name so replacing the npm install matches.
- Fork once: `pnpm new <slug>`, port the upstream `src` into `plugins/<slug>`, then catalogize (tsdown `neverBundle: true`, host rc pins, tests, `NOTICE` + upstream `LICENSE`, bilingual README). After that, only edit the fork.
- The fork README states the upstream, the Git path, and that users must not install the author's npm next to this package. Turn off any in-plugin upgrade hint that points at that npm.
- Root README lists both the installable plugin and the `externals/…` → `plugins/…` row.
- When the author publishes: `git submodule update --remote externals/<name>`, diff `externals/<name>/src` against `plugins/<slug>/src`, port selected changes. Do not overwrite our second-development with a wholesale tree copy. Two commits: gitlink bump, then the plugin port.
- Clone with `git clone --recurse-submodules`, or after a plain clone: `git submodule update --init`.
- Git install is always `github:kedoupi/xiaotaozi-dsh#path:plugins/<slug>`, never `#path:externals/…`.

## Homes

Two homes. Do not mix them. Test work stays on the test home; official work stays on the official home.

| | Official / 小白 desktop | Sandbox |
| --- | --- | --- |
| Who | End users; installed app; `tauri build` | This repo: plugin work and `pnpm tauri dev` |
| Home | `~/.dsh` | `<repo>/.dsh-home` (gitignored) |
| Port | **3080** | **3081** |
| Boot | 小桃子DSH.app (bundled Node + dsh) or official `dsh web` | `pnpm dev` / `link-plugin` / debug `tauri dev` |
| Plugins | Bundled prebuilt seed; silent pack overlay from `https://s.xiaotaozi.cc/dsh/packs/`, never GitHub/npm/`link:` | `link:` into this workspace |

Which job uses which home:

| Job | Home |
| --- | --- |
| Change plugin source, settings UI, `link-plugin`, debug `pnpm tauri dev` | Sandbox **3081**. `pnpm dev` watches plugins and restarts host code on :3081; or let debug desktop spawn `dsh web` into `.dsh-home` |
| Pack apply, notarization, installed 小桃子DSH.app | Official `~/.dsh` **3080**. This is the product 小白 get |
| Shipped `.dmg` | Official `~/.dsh` **3080** |

- `pnpm tauri dev` is debug-only: `cfg(debug_assertions)` → `.dsh-home` :**3081**. Release / `tauri build` / the installed app never probe 3081 and never fall back from 3081 to 3080.
- Do not verify `link:` checkouts inside the installed 小桃子DSH.app. That app loads packs and `~/.dsh`, not the workspace.
- Desktop and official Web own `~/.dsh`; the first `xtz` release only inspects that same official target read-only. The app bundles Node so 小白 need no toolchain. If 3080 is already taken, do not steal it. Plugin packs overlay the official `web` profile; use the sandbox if you do not want that.
- Never `link:` or `dsh plugin add ./plugins/<slug>` into `~/.dsh`. `node scripts/doctor.mjs` only diagnoses and fails if a daily profile points at this repo; it never edits or repairs profiles.
- Sandbox: plugin debugging only. `link-plugin` and `pnpm dev` set `DSH_HOME` to `.dsh-home`.

Need keys in the sandbox: copy only `~/.dsh/.credentials.yaml` into `.dsh-home/`. Do not copy `sessions/` or `storages/`.

Do not vendor or edit `deepseek-harness` here. Types and APIs come from published `@deepseek-ai/*` packages.

## `xtz` CLI

`apps/cli/` is a main product beside `apps/desktop/`, not a Harness plugin and not a member of the root `plugins/*` workspace. Its binary is `xtz`. The CLI runtime is exactly Node.js `22.19.0`; its bundled dependency is exactly `@deepseek-ai/dsh` `0.1.1-rc.2`. Official commands use only `~/.dsh` and `127.0.0.1:3080`, with no probe or fallback to `.dsh-home` / 3081.

The first version is a read-only safety foundation. It exposes only help/version, `status`, `config path`, `plugin list`, and `doctor`. `plugin list` reads `package.json` directly; it must not invoke `dsh plugin`, whose pnpm path can rewrite the bundle list. An HTTP response on 3080 proves only that the port is occupied, not that a healthy Xiaotaozi service owns it.

Until Desktop and CLI share a trusted cross-process supervisor, a service-identity protocol, and a locked profile transaction boundary, `start`/`web`, `open`, `run`/`ask`, `config dump`/`defaults`, `stop`, and `update` must fail closed. The CLI must not invoke any DSH command that can prepare or rewrite generated official-profile state, detach an engine, kill by PID/port, or apply a pack concurrently with Desktop. This first release does not promise headless-task parity with the Desktop/Web plugin environment. Signed pack updates remain a Desktop transaction.

## Desktop plugin packs

Two ship paths. Do not mix them.

| | Developers | 小白 desktop |
| --- | --- | --- |
| Who | people with Node / git | 小桃子DSH.app |
| What moves | one `dsh-<slug>` | prebuilt `web` profile snapshot: hello / providers / memory / im |
| How | `pnpm --filter dsh-<slug> publish` or Git `#path:plugins/<slug>` | silent overlay from the pack index |
| Host | GitHub / npm | existing Xiaotaozi TCB COS, **not** a new domain |

Pack host (hard):

| | Value |
| --- | --- |
| Bucket | CloudBase env `xiaotaozi-5g279pi414331d52` (same as the xiaotaozi repo) |
| Public host | `s.xiaotaozi.cc` |
| Prefix | `dsh/packs/` only |
| Index | `https://s.xiaotaozi.cc/dsh/packs/latest.json` (overwritten, **signed envelope**) |
| Objects | `https://s.xiaotaozi.cc/dsh/packs/xiaotaozi-plugins-<packVersion>-<target>.tar.gz` (immutable) |
| Creds | `~/.config/env/tencent/tcb.env` |
| Commands | `cd apps/desktop && pnpm pack-plugins && pnpm publish-pack` |

- Do not invent `dsh.xiaotaozi.cc`. Do not use GitHub Pages, npm, or `link:` for 小白.
- Do not put packs under `wallpaper/`, `uploads/`, `handwriting/`, or `xiaotaozi-home/`.
- The client allowlists `https://s.xiaotaozi.cc/dsh/packs/` and drops GitHub URLs. Fail closed. Silent. No update popup.
- COS put is not a publish. `s.xiaotaozi.cc` is Tencent CDN; default cache is about two minutes and **404s are cached**. `pnpm publish-pack` must call `PurgeUrlsCache` and wait until the live index matches. Tar names include `packVersion`; the file that must be purged every time is `latest.json`.
- Packer staging is `apps/desktop/.runtime-build/` and `apps/desktop/plugin-packs/` (gitignored). Never write `~/.dsh` or `.dsh-home` from the packer. Users never run `pnpm install`. After install the packer prunes headers, maps, types, tests, docs, and other-OS natives; it does not ship Node `include/` or `npm`.
- Pack on macOS. Supported targets are `darwin-arm64` and `darwin-x64`; `publish-pack` merges those targets into one index.
- Product notes: [apps/desktop/DESIGN.md](../apps/desktop/DESIGN.md). Steps: [workflow.md](workflow.md) § Ship a desktop plugin pack.

### Index envelope

`latest.json` is **not** a raw payload. Packer and publisher emit this envelope, and the client verifies it before parsing. Old clients must receive an application upgrade first; do not publish unsigned compatibility JSON or change these fields without both sides.

```json
{
  "keyId": "<sha256(SPKI DER) hex, first 16 chars>",
  "signed": "<base64(UTF-8 JSON payload)>",
  "signature": "<base64(Ed25519 signature over the raw signed bytes)>"
}
```

Decoded payload:

```json
{
  "packVersion": "20260825T030144787Z",
  "minApp": "0.1.0",
  "dsh": "0.1.1-rc.2",
  "node": "22.19.0",
  "plugins": {
    "dsh-hello": "0.2.0",
    "dsh-providers": "0.2.0",
    "dsh-memory": "0.1.0",
    "dsh-im": "0.1.0"
  },
  "targets": {
    "darwin-arm64": {
      "url": "https://s.xiaotaozi.cc/dsh/packs/xiaotaozi-plugins-<packVersion>-darwin-arm64.tar.gz",
      "sha256": "<hex>",
      "sizeBytes": 15378629
    }
  }
}
```

| Key | Path | Git |
| --- | --- | --- |
| Private | `~/.config/xiaotaozi-dsh/pack-signing-key.pem` | outside every checkout. `pnpm generate-pack-key` |
| Public | `apps/desktop/src-tauri/keys/pack-signing-key.der` | committed, embedded in the app |

The private key is per user, not per checkout: branches, worktrees, and fresh clones all read the same file, so it cannot be lost to `git clean` or a new worktree. Lookup order everywhere: `XIAOTAOZI_PACK_SIGNING_KEY` (PEM contents or a path; what CI/release automation uses) → the per-user path above → legacy in-repo `apps/desktop/.pack-signing/` (still read, warns to migrate). Keep an off-machine backup — losing the key forces a public-key rotation shipped in a new app release.

Client must: match `keyId` to the embedded public key, verify the signature, then parse the payload. Unknown key, bad sig, bad JSON, `url` outside the allowlist, or sha256 mismatch → ignore. No prompt. Generate once with `cd apps/desktop && pnpm generate-pack-key` (refuses to rotate if any copy exists); commit only the public DER, never the private PEM.

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

Git install:

```text
github:kedoupi/xiaotaozi-dsh#path:plugins/<slug>
```

That path is one plugin directory. There is no shared `packages/` workspace: it would not be included in a path install. Keep helpers inside the plugin, copy a small snippet, or publish an npm package.

A rename is all of the above, plus `$DSH_HOME/plugins/<slug>/` on disk, plus sandbox `link-plugin` again. Do not leave the old package name in a profile.

User-facing copy in Xiaotaozi plugins is Chinese. The settings page this plugin occupies is named after the job (模型), not the package name.

## Plugin layout

Default `pnpm new <slug>` is **host** (tools/services, no UI). Use `--kind mixed` only for a settings page, slot, or theme.

- Profile loads `lib/`, not `src/`. Rebuild after source edits.
- Logic that can run without Cordis lives in a separate file. Tests import that file only. Do not mock the whole harness.
- Tunable values go on the exported Schemastery `Config`.
- `@deepseek-ai/cordis` is `import type` unless `lib/` actually imports it at runtime — then it belongs in `dependencies`.
- Do not value-import `@deepseek-ai/dsh-tools`. Register a plain tool object on `ctx.tools`.
- `@deepseek-ai/*` stays external (`deps.neverBundle: true`).
- `prepare` / `tsdown.config.ts` stay inside the plugin package so a Git path install can build.
- Each plugin ships `README.md` and `README.zh.md`.

`versions.json` is the only normative version source. Root/desktop/CLI package metadata, Cargo/Tauri versions, runtime metadata, the bundler, and README badges/install commands remain literal where their formats require it; the gate rejects any mismatch.

| Gate | Guarantee |
| --- | --- |
| `pnpm check` | Version and documentation consistency, installable manifest shape, type checks, plugin tests, and script tests. It does not require fresh `lib/` output |
| `pnpm check:build` | Builds all plugins and reruns the manifest gate with `--require-lib`, including generated-code import/bundling checks |
| `pnpm check:path` | Exercises isolated Git path installs so each plugin can prepare without the monorepo |
| `pnpm check:desktop` | Desktop script tests and frontend/Rust build-quality checks; no publishing and no real installer/pack release |
| `pnpm check:cli` | Typechecks, builds, and tests the standalone CLI workspace without starting or changing the official service |

`pnpm check-home` is separate and read-only: it reports unsafe links from daily `~/.dsh`; it never fixes them.

## Commands

```bash
pnpm new <slug>                 # or: pnpm new <slug> --kind mixed
pnpm --filter dsh-<slug> test
pnpm --filter dsh-<slug> build
node scripts/link-plugin.mjs --profile dsh-dev <slug>   # load check
node scripts/link-plugin.mjs --profile web <slug>       # UI
pnpm dev                                                # watch plugins, sandbox web :3081 --no-open (`-- --once` to build once)
cd apps/desktop && pnpm tauri dev                       # debug: sandbox .dsh-home :3081
pnpm check:cli                                          # standalone apps/cli workspace
pnpm check:build                                        # CI gate: requires and inspects built lib/ (expands to pnpm build + check-manifest --require-lib; check:path proves the install)
pnpm check
pnpm check-home                                         # daily ~/.dsh must stay unlinked
# 小白 pack (apps/desktop; not a workspace member)
cd apps/desktop && pnpm pack-plugins                    # tar + signed latest.json
cd apps/desktop && pnpm publish-pack                    # COS + PurgeUrlsCache
```

Installed means `dump-config` contains `# == dsh-<slug>`. Leave `pnpm dev` running while you edit (it rebuilds `lib/` and restarts host output). Do not restart the daily `dsh web`.
