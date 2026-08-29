# Documentation map

English | [中文](README.zh.md)

Open one layer. Do not copy tables from another layer. If two files disagree, the **spec** wins; then fix the other file in the same change.

| Layer | File | Audience | Contains |
| --- | --- | --- | --- |
| Public product | [`README.md`](../README.md) · [`README.zh.md`](../README.zh.md) | Users on GitHub | What it is, install `xtz`, plugin table, screenshots |
| Contribute | [`CONTRIBUTING.md`](../CONTRIBUTING.md) · [`CONTRIBUTING.zh.md`](../CONTRIBUTING.zh.md) | Humans in this repo | Clone, inner loop, gates, where to put a change |
| Spec | [`conventions.md`](conventions.md) · [`conventions.zh.md`](conventions.zh.md) | Everyone | What is true: homes, package identity, CLI contract, versions, market catalog |
| Product changelog | [`CHANGELOG.md`](../CHANGELOG.md) | Users and maintainers | What shipped in each `vX.Y.Z` |
| Procedure | [`workflow.md`](workflow.md) · [`workflow.zh.md`](workflow.zh.md) | Humans and agents | How to do a job: create, install, commit, ship |
| Agent rules | [`AGENTS.md`](../AGENTS.md) | Agents | Hard rules only. No tutorials. |
| Agent skills | [`.grok/skills/`](../.grok/skills) | Agents | Job-specific; they point at spec/procedure, they do not replace them |
| Internal scratch | [`NOTES.md`](../NOTES.md) | Maintainers | Working notes. Not a contract. Not a public doc. |
| CLI product | [`apps/cli/README.md`](../apps/cli/README.md) | Users of `xtz` | Command list and safety boundary |
| Plugin user docs | `plugins/<slug>/README.md` | Users of that plugin | What the plugin occupies and how to use it |
| Plugin PRD / design | `plugins/<slug>/docs/` | Product and engineering | Implemented behavior. Deferred work is marked deferred. |
| UI design system | [`design-system/xiaotaozi-dsh/MASTER.md`](../design-system/xiaotaozi-dsh/MASTER.md) | Product, design, and frontend | Normative visual, interaction, accessibility, and responsive contract |

## Which file to edit

| You changed… | Update |
| --- | --- |
| A hard rule (homes, fail-closed commands, no Desktop, SemVer) | `AGENTS.md` **and** `docs/conventions.md` (both languages) |
| A product release | `CHANGELOG.md`, `versions.json` `cliApp`, git tag; procedure: [workflow.md](workflow.md) § Ship a product snapshot |
| How `xtz` reaches npm | [conventions.md](conventions.md) § Versions (Trusted Publisher identity) **and** [workflow.md](workflow.md) § Ship |
| How to create / install / commit | `docs/workflow.md` (both languages) |
| Install command, plugin table, public narrative | root `README.md` / `README.zh.md` |
| `xtz` flags or disabled commands | `apps/cli/README.md` **and** conventions § `xtz` CLI |
| A plugin's user-facing behavior | that plugin's README pair; PRD if the product contract changed |
| Agent routing (which skill) | `.grok/skills/*/SKILL.md` — keep them short |
| First-party plugin Web UI | `design-system/xiaotaozi-dsh/MASTER.md` and the affected plugin UI |
| Marketing website UI | `apps/website/DESIGN.md` and the affected website UI |

## Project layout (engineering)

```text
README.md           public product
CONTRIBUTING.md     contributor entry
AGENTS.md           agent hard rules
NOTES.md            internal scratch
docs/               spec + procedure + this map
apps/cli/           user product (xtz) — standalone workspace
apps/website/       public site — standalone workspace
plugins/<slug>/     one first-party installable package
plugins/market/     market UI; third-party plugins are catalog rows
templates/          pnpm new skeletons
design-system/      first-party UI contract and visual reference
scripts/            new / link-plugin / sandbox / gates / doctor
.grok/skills/       agent skills
.dsh-home/          gitignored sandbox home (3081)
```

There is no `apps/desktop/`. History is git tag `archive/desktop`. There is no `packages/` and no `externals/`.
