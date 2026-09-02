# Product README and Screenshot Gallery Design

Date: 2026-09-02
Status: approved for planning
Branch: `docs/readme-product-gallery`

## Goal

Make Xiaotaozi DSH understandable to a new user before asking them to read repository internals. Rewrite the public README layer around product outcomes and add a coherent, privacy-safe screenshot set for every first-party plugin.

Success means:

- the root README explains what `xtz` installs, how to start it, and what the six first-party plugins do;
- every first-party plugin README shows two to four core user journeys;
- screenshots reflect the current merged `main` product at desktop size and contain no private data;
- English and Chinese documents have matching facts and structure;
- plugin README images remain available when that plugin is installed from its Git path;
- engineering details remain reachable without dominating the user entry page.

## Scope

Update these English/Chinese README pairs:

- `README.md` and `README.zh.md`;
- `apps/cli/README.md` and `apps/cli/README.zh.md`;
- `apps/website/README.md` and `apps/website/README.zh.md`;
- `plugins/providers/README.md` and `plugins/providers/README.zh.md`;
- `plugins/im/README.md` and `plugins/im/README.zh.md`;
- `plugins/wecom-office/README.md` and `plugins/wecom-office/README.zh.md`;
- `plugins/xtz-ui/README.md` and `plugins/xtz-ui/README.zh.md`;
- `plugins/sidebar/README.md` and `plugins/sidebar/README.zh.md`;
- `plugins/market/README.md` and `plugins/market/README.zh.md`.

Add or replace screenshot assets under each owning plugin's `docs/` directory. Add one website preview under `apps/website/public/`. Mirror canonical plugin captures into `apps/website/public/` only where the VitePress site needs its own static copy.

## Non-goals

- Do not change product behavior, visual styling, plugin APIs, versions, installation contracts, or the market catalog.
- Do not rewrite `docs/README*`, plugin-internal `docs/README.md` files, templates, conventions, workflow, or contributor documentation.
- Do not add a permanent screenshot framework, Storybook, fixture subsystem, or new dependency.
- Do not capture the in-progress `feat/market-ui-upgrade` worktree.
- Do not use the official home, official port 3080, real external writes, or private account/session content.
- Do not create separate English and Chinese screenshot sets. Xiaotaozi's product UI is Chinese by default; the README captions and alt text are localized.

## Chosen approach

Use layered product documentation with plugin-owned screenshots.

The root README is the concise user landing page and reuses selected plugin images by relative path. Each plugin README goes deeper into that plugin's journeys and keeps its assets inside the plugin package. The CLI and website READMEs explain their own entry points rather than duplicating the complete product manual.

This is preferred over a central `docs/screenshots/` gallery because a plugin installed from `#path:plugins/<slug>` must carry its own README assets. It is preferred over repeating the complete gallery in every README because repeated facts and files drift quickly.

## Information architecture

### Root README

Order the page as:

1. product identity and one-sentence value;
2. one-minute install and `xtz start`;
3. one product overview image;
4. six first-party plugin outcomes;
5. six to eight selected screenshots with short outcome-led captions;
6. third-party market summary;
7. official/sandbox safety boundary in compact form;
8. links to CLI, plugin, contributing, conventions, and workflow documentation;
9. license.

Move or remove repeated installation tables, full repository layout, detailed development gates, and long contributor instructions when the authoritative material already exists in `CONTRIBUTING.md` or `docs/`. Keep required literal versions and the exact open/disabled CLI command contract consistent with repository checks.

### Plugin READMEs

Use the same high-level rhythm without forcing identical prose:

1. icon/identity and outcome statement;
2. what the plugin unlocks and where it appears;
3. quick start;
4. two to four core journey screenshots;
5. capabilities and explicit boundaries;
6. data, credentials, permissions, or external dependencies where relevant;
7. concise development commands and authoritative documentation links;
8. attribution and license.

A plugin README describes only its own job. Cross-plugin integrations receive one concise boundary statement and a link.

### CLI README

Keep installation, start/status/doctor, available commands, disabled commands, port ownership, fake-home development, and exit codes. Use copyable command blocks rather than terminal screenshots. Point users to the root product gallery for the browser UI.

### Website README

Keep the VitePress role, local development, structure, deployment boundary, and locale information. Add one local-build homepage preview and a clear link to the root product README. Do not turn this package README into a duplicate product manual.

## Screenshot system

### Visual standard

- Source: current merged `main` only.
- Browser: headless Chromium through Playwright.
- Viewport: 1440 by 900 CSS pixels.
- Theme: light.
- Format: WebP.
- Framing: product UI only; no operating-system or browser chrome.
- Content: natural UI without decorative frames, arrows, labels, or text baked into the image.
- Explanation: localized Markdown caption and alt text beside the image.
- Crop: keep enough surrounding chrome to make location and navigation clear; avoid tall full-page captures that become unreadable on GitHub.

### Plugin capture matrix

| Owner | Required captures | Suggested filenames |
| --- | --- | --- |
| `providers` | model overview and selection; add-provider catalog; subscription or custom-endpoint form | `models-overview.webp`, `add-provider.webp`, `provider-setup.webp` |
| `im` | channel overview; add-bot flow; existing-project selection and bot configuration | `channels-overview.webp`, `add-bot.webp`, `workspace-selection.webp` |
| `wecom-office` | office setup on a WeCom robot card; active office identity and write permission; a read-only calendar or document tool result | `office-setup.webp`, `office-permissions.webp`, `office-result.webp` |
| `xtz-ui` | welcome notice; Xiaotaozi settings; task board; Git graph or archive manager | `welcome.webp`, `xiaotaozi-settings.webp`, `task-board.webp`, `git-graph.webp` |
| `sidebar` | three-column workbench; files/editor; Git; terminal or Side card settings | `workbench.webp`, `files-editor.webp`, `git.webp`, `terminal.webp` |
| `market` | catalog; plugin detail; installing or installed state | `catalog.webp`, `plugin-detail.webp`, `install-state.webp` |

The root README selects six to eight of these captures. The `wecom-office` images live under `plugins/wecom-office/docs/` even though the surface is integrated into the IM robot card, so its standalone README remains complete. The IM README does not depend on those sibling assets.

### Existing assets

Replace existing screenshots that expose a real device name, account state, workspace path, conversation, or stale UI. Delete an old asset only after all Markdown and website references have moved. Preserve icon/IP artwork unless it is stale or unrelated to the requested screenshot work.

## Capture environment and privacy

Documentation changes live in a topic worktree created from `origin/main`. The screenshot source is the repository-root hub's current `main` sandbox on port 3081 because ordinary topic worktrees do not claim that port.

Before capture:

1. verify the root hub is clean, on `main`, and current with `origin/main`;
2. verify port 3081 is either free or owned by the root hub's marked sandbox;
3. start or use only that sandbox; never touch official `~/.dsh` or port 3080;
4. use a separate Playwright browser context;
5. prepare a clearly named demonstration project and demonstration content that can be published.

Safety rules:

- no real keys, tokens, bot identifiers, device names, user names, filesystem paths, private messages, session titles, or generated files appear;
- no external create, edit, send, or delete operation is performed for documentation;
- connected-state captures use only publishable demonstration state;
- read-only external results are allowed only when backed by dedicated demonstration data and explicit authorization already present in the sandbox;
- temporary scripts stay outside the repository unless a durable need emerges and receives separate approval;
- image editing may crop or encode but must not fabricate product controls or capability results.

If a required state cannot be produced safely and truthfully, omit that capture temporarily and report the exact blocker. Do not substitute private data, fake a result in an image editor, or weaken the environment boundary.

## Capture flow

For each surface:

1. navigate to the live local product and wait for the dynamic app to settle;
2. inspect the rendered DOM and current screenshot before choosing selectors;
3. create or select publishable demonstration state;
4. perform the real local UI journey up to the required state;
5. capture the relevant viewport or bounded surface as WebP;
6. inspect the image immediately for sensitive content, clipping, stale state, focus rings, loading indicators, and readability;
7. copy the approved asset into the owning plugin `docs/` directory;
8. mirror only the captures used by VitePress into `apps/website/public/`;
9. update both README languages before moving to the next plugin.

The screenshot work does not require a second sandbox or exceptional 3081 transfer.

## Failure handling

- Unknown or other-checkout 3081 listener: stop and report; never signal or steal it.
- Sandbox boot or product load failure: classify it before proceeding; do not paper over a broken current-main capture.
- Real or sensitive content visible: discard the image immediately and correct the demo state before recapturing.
- External authorization required: use a safe unconnected/setup view or report the blocked result capture.
- UI state differs from README claims: treat the implementation/spec as authoritative, correct the README, and flag any actual product mismatch separately.
- Market changes merge during the task: continue capturing the approved starting `main`; do not mix branch states. A later market screenshot refresh is a separate change.

## Validation

Run and record:

- visual review of every new image at full size and at typical GitHub README width;
- image dimension and format inspection;
- a repository check that every local Markdown image target exists;
- English/Chinese heading and fact comparison for every updated pair;
- `pnpm check` from the topic worktree;
- `pnpm build` from `apps/website`;
- `git diff --check`;
- `git status --short` to identify all replaced and removed assets.

The final report names any approved screenshot that could not be captured, any old asset deliberately retained, and confirms that official 3080 was untouched.

## Definition of done

- all 18 scoped README files follow the approved layered structure;
- every first-party plugin README contains two to four truthful core-journey screenshots, except a specifically reported safety blocker;
- the root README contains a concise six-to-eight-image product gallery;
- CLI commands, version literals, plugin boundaries, homes, and ports match the repository spec;
- screenshots are current-main, 1440-by-900 light-mode WebP assets with readable framing;
- no public image contains private data or secrets;
- old screenshot references are removed and no local image link is broken;
- repository and website documentation checks pass;
- no product code, official home, or official service was changed.
