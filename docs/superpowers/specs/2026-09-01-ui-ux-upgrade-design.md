# Xiaotaozi DSH UI/UX Upgrade Design

Date: 2026-09-01  
Status: Approved design  
Scope: First-party plugin Web UI

## 1. Goal

Upgrade Xiaotaozi DSH from prototype-quality plugin surfaces into one coherent, production-quality developer workspace.

The upgrade covers all six reported sources of prototype feel:

1. unclear information hierarchy;
2. temporary-looking cards, buttons, and dialogs;
3. incomplete loading, success, failure, and empty feedback;
4. overly technical or awkward configuration flows;
5. inconsistent visual language between plugins;
6. insufficient motion and interaction polish.

This is a visual and interaction redesign, not a product-boundary rewrite. Existing plugin responsibilities and user entry points remain intact.

## 2. Product decisions

- Upgrade depth: visual language, information hierarchy, configuration flows, empty states, and feedback all change where needed.
- Delivery approach: design-system-first, followed by independently reviewable plugin upgrades.
- Primary environment: desktop at 1440px and 1024px. A 375px viewport remains fully usable but is not a separate mobile product.
- Color modes: light and dark receive complete designs.
- Brand exposure: restrained. The mascot appears in the sidebar brand, welcome/onboarding, empty states, and occasional completion feedback.
- Visual direction: **Fruit Orange × DSH**.

## 3. DSH research and compatibility

The design follows the upstream DSH visual architecture rather than introducing a competing application shell.

Authoritative upstream references:

- [Web UI style reference](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/web-styling.md)
- [UI primitives](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/client/ui-primitives)
- [Theme runtime and semantic tokens](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/client/ui-theme)
- [Layout shell](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/client/ui-layout)
- [Official Harness product presentation](https://deepseek.com/harness/en/)

The relevant upstream rules are:

- `ui-theme` owns shared colors, typography, motion, elevation, and light/dark behavior.
- Feature surfaces consume `--dsw-*` semantic aliases instead of copying palette literals.
- DSH primitives are preferred for buttons, inputs, menus, modals, disclosures, status, and feedback.
- Feature presentation stays local through CSS Modules or a plugin-scoped stylesheet.
- DSH does not add Tailwind or a second component library.
- Keyboard focus and reduced-motion behavior are part of the base interaction contract.

Xiaotaozi therefore keeps DSH's neutral, dense developer-workspace skeleton and adds a controlled brand layer through supported theme and slot APIs.

## 4. Scope and ownership

### 4.1 DSH-owned foundation

DSH continues to own:

- the three-column application layout;
- the settings shell;
- theme selection and presentation;
- host typography, shadows, borders, and motion tokens;
- shared UI primitives;
- editor, terminal, Diff, Markdown, and other technical renderers.

### 4.2 Xiaotaozi brand owner

`plugins/xtz-ui` owns:

- the Xiaotaozi logo and brand name;
- the semantic fruit-orange theme override;
- welcome/onboarding brand moments;
- Xiaotaozi settings, archive, task board, and Git graph.

It does not absorb Models, IM, Market, WeCom office, or the right-hand workbench.

### 4.3 Feature owners

- `plugins/providers`: provider identity, authentication, credentials, and model visibility.
- `plugins/im`: channel selection, bot lifecycle, workspace confirmation, and the user-facing WeCom office entry.
- `plugins/market`: discovery, detail, source, install, and installed-state surfaces.
- `plugins/sidebar`: files, editor chrome, Git, terminal, tabs, and status chrome.
- `plugins/wecom-office`: remains host-only; its user-visible controls stay inside the corresponding WeCom bot card in `dsh-im`.

### 4.4 Package boundary

No `packages/ui`, root workspace UI library, or sibling-plugin source import will be added. Every Git path plugin remains self-contained.

Existing DSH primitives are the shared layer. Small feature-specific recipes remain local. A repeated helper is copied only when independent installability requires it; no abstraction is created in anticipation of reuse.

## 5. Brand system

### 5.1 Logo source

The approved logo is the rounded orange Xiaotaozi mascot with green leaves and chocolate-brown eyes. Its dominant solid orange is normalized to `#FC8940` for UI roles. The full logo retains its original gradients and colors as an image asset.

### 5.2 Semantic color roles

| Role | Light value | Use |
|---|---:|---|
| Brand display | `#FC8940` | Logo-adjacent marks, selected indicators, key brand icons |
| Action fill | `#B94305` | Primary actions with white text |
| Action hover | `#9F3703` | Primary hover |
| Action pressed | `#7C2C00` | Primary pressed |
| Brand soft | `#FFF0E6` | Selected and low-emphasis brand backgrounds |
| Brand ink | `#A33B04` | Brand text/icons on light neutral or soft surfaces |
| Focus ring | `#B94305` | Light-mode focus where a host-native focus is not already sufficient |
| Leaf display | `#78A317` | Success dot or compact success icon only |
| Leaf ink | `#4F7410` | Accessible success text on light surfaces |
| Cocoa | `#5E2511` | Logo asset and rare dark-on-logo-orange treatment only |

The action pair `#B94305` and white has a contrast ratio above 5:1. The exact logo orange is not used behind normal-size white text because it is too light for that pairing.

Dark mode keeps neutral DSH surfaces and derives brighter orange/green foreground roles that preserve the same semantics. Exact values must be validated against the resolved DSH dark surfaces before implementation is accepted; feature CSS does not branch on theme.

### 5.3 Color restrictions

- Remove the current red-brown peach action family, including `#B5522A`-like primary fills.
- Do not use orange as wallpaper or a full-page wash.
- Leaf green is success, not a second navigation accent.
- Provider and channel colors stay inside official logos and identity marks.
- Error, warning, and information keep their DSH semantic roles.
- Editor syntax, terminal ANSI, Diff, Markdown, and generated media colors are not recolored.

## 6. Visual language

### 6.1 Surfaces and hierarchy

Use neutral DSH base/layer surfaces. Establish hierarchy in this order:

1. page title and one-sentence purpose;
2. current state or summary;
3. one primary action;
4. main content;
5. advanced and destructive actions.

Avoid nested card stacks. Use open sections, spacing, typography, and separators first. Cards are reserved for independent entities such as a bot, provider, plugin, task, or repository state.

### 6.2 Geometry

Follow DSH-native geometry when a primitive owns the component:

- inputs and compact controls: 8px radius;
- navigation cells and ordinary cards: 12px radius;
- primary action buttons: DSH capsule geometry;
- full dialogs and settings-like overlays: 24px radius on desktop;
- status tags: pill geometry;
- compact controls: at least 32px on desktop;
- standard controls: 36–40px;
- coarse pointer or narrow viewport targets: at least 44×44px.

### 6.3 Typography

Use the host font and `--dsw-font-*` roles. No WebFont is added.

- dialog/page title: 18–20px;
- section title: 15–16px;
- controls/body: 13–14px;
- supporting text: 12–13px;
- metadata: 11–12px, never below 11px;
- paths, identifiers, and code: host monospace.

### 6.4 Brand exposure

The mascot is shown only in:

- expanded and collapsed sidebar brand seats;
- first launch and first configuration;
- empty states where it improves orientation;
- occasional successful completion feedback.

Ordinary settings, lists, tool chrome, and repeated cards do not carry mascot illustrations.

### 6.5 Motion

Motion explains state and spatial relationships:

- fast feedback: 120ms;
- ordinary state transition: 160ms;
- dialog or popover: no more than 200ms;
- animate color, opacity, border, shadow, or a small transform;
- no decorative floating, glow, large travel, or routine width/height animation;
- all non-essential motion stops under `prefers-reduced-motion`.

## 7. Shared interaction contract

### 7.1 Configuration flow

First-time connection and setup flows use the same sequence where applicable:

1. choose a method;
2. enter credentials or authorize;
3. validate the connection;
4. confirm the workspace/target;
5. show completion and the next useful action.

Persistent labels identify every technical field. Help is placed next to the field or step that needs it. Advanced values stay collapsed until requested.

A failed operation preserves user input. Save, validate, authorize, retry, and cancel are distinct actions rather than variations of a generic confirmation button.

### 7.2 State model

Every core surface distinguishes:

| State | Required presentation |
|---|---|
| Initial loading | Skeleton or stable progress region; never premature empty content |
| Empty | Explanation plus one next action |
| Busy | Disabled conflicting actions, visible progress copy, `aria-busy` where applicable |
| Success | Durable state update plus concise confirmation |
| Warning | Cause, consequence, and available mitigation |
| Error | Specific failure, retained input/context, and retry or recovery action |
| Offline/unavailable | Reason and the action that can restore availability |
| Disabled | Visible reason when it is not self-evident |

Transient status uses `role="status"`; immediate errors use `role="alert"` where appropriate. Color is never the only state signal.

### 7.3 Actions and dialogs

- One primary action per local decision area.
- Secondary and tertiary actions use neutral treatment.
- Danger never uses orange.
- Destructive confirmation uses a dedicated accessible dialog; it does not replace the entire business card inline.
- Dialogs trap focus, close on Escape where safe, restore focus, and keep final actions reachable.
- Nested interactive elements are prohibited; rows with secondary actions use sibling buttons/links.

### 7.4 Responsive behavior

Desktop remains dense. At narrow widths:

- columns collapse in reading/task order;
- forms become single-column;
- toolbars wrap or move secondary controls into menus;
- dialogs become near-edge and honor safe-area insets;
- fonts do not shrink to preserve a desktop grid;
- purposeful board/editor scrollers remain local and labeled;
- no page-level overflow occurs at 375px.

## 8. Plugin-specific design

### 8.1 Providers

- The provider rail shows identity, login method, and current state only.
- The content pane focuses on the active task: authenticate, enter a key, or select models.
- Authorization always shows the current device, the next action, progress, and recovery.
- Model visibility stays separate from authentication.
- Advanced provider/model fields remain behind progressive disclosure.
- Existing provider logos retain their official colors.

### 8.2 IM and WeCom office

- Channel navigation, connection actions, and bot entities form three visible hierarchy levels.
- Every channel maps its unique protocol onto one shared connect/validate/error/remove interaction model.
- Bot cards lead with identity and health, followed by workspace and optional capability details.
- The first real action remains blocked until workspace confirmation, per the onboarding contract.
- WeCom office setup, bot selection, status, permission, and advanced settings stay inside the corresponding WeCom bot card.
- Connection and credential errors retain the bot/channel context and provide a direct recovery action.

### 8.3 Market

- Search, category, and installed state are the first-level controls.
- Catalog cards show only name, purpose, source, and one install/open action.
- Detail holds full description, version, install source, and risk/compatibility notes.
- Install state distinguishes queued, installing, completed, failed, retrying, and installed.
- Buttons never silently change without an accompanying status announcement.

### 8.4 Xtz UI

- Xiaotaozi settings becomes a clear list of feature toggles with state and dependency explanations.
- Archive unifies search, filtering, restore, empty, and error behavior.
- Task board unifies column headers, task cards, drag feedback, and editing dialogs.
- Git graph strengthens branch, commit, and current-node hierarchy while reducing decorative noise.
- Brand visuals appear only where allowed by the restrained exposure rule.

### 8.5 Sidebar

- Preserve the specialist color systems of the editor, terminal, Diff, rendered documents, and Mermaid.
- Unify file tree, tab bar, Git actions, terminal chrome, and status-bar control geometry.
- Make unsaved, loading, conflict, running, disconnected, and failed states explicit.
- Retain local overflow for editor/terminal content and prevent surrounding chrome from shifting.
- Improve focus order and keyboard access without changing technical renderer semantics.

## 9. Delivery sequence

The rollout uses separate topic branches and PRs:

1. **Foundation** — update `design-system/xiaotaozi-dsh/MASTER.md`, replace the red-brown theme mapping in `xtz-ui`, and establish the approved semantic roles and interaction recipes.
2. **Providers** — establish the new settings and configuration reference surface.
3. **IM** — apply the reference to the most complex onboarding and entity-management flow, including embedded WeCom office controls.
4. **Market** — redesign discovery, detail, and install state.
5. **Xtz UI feature surfaces** — settings, archive, board, and Git graph.
6. **Sidebar** — update the largest and most specialized workbench chrome after the general language is stable.
7. **Product documentation** — replace outdated screenshots and complete assembled-product QA.

Each step must be shippable and reversible. Temporary old/new coexistence is acceptable between merged steps; one PR must not contain all plugin rewrites.

## 10. Testing and acceptance

### 10.1 Per-plugin checks

Every plugin phase must pass:

- TypeScript checks;
- the plugin's unit tests;
- the plugin build;
- interaction tests for changed non-trivial behavior;
- light and dark rendered QA;
- 1440px, 1024px, and 375px rendered QA;
- keyboard-only core-flow QA;
- loading, empty, success, error, disabled, and destructive-state QA;
- browser-console inspection;
- sandbox verification on port 3081 without touching official port 3080.

IM changes that affect binding or workspace selection must additionally exercise bind → confirm target → first real action and prove no first work lands in the plugin checkout.

### 10.2 Repository gates

At the appropriate rollout checkpoints run:

- `pnpm check`
- `pnpm check:build`
- `pnpm check:path`
- affected plugin tests and builds

No screenshot framework or shared UI package is added up front. Existing Vitest checks, CSS/token policy tests, and real browser QA are sufficient until repeated measurable cost proves otherwise.

### 10.3 Final product acceptance

The upgrade is complete when:

- Providers, IM, Market, Xtz UI, and Sidebar read as one product;
- no red-brown global action theme remains;
- the UI uses the approved real-logo orange roles;
- users can identify current state and next action without guessing;
- first-time configuration completes and recovers from failure without lost input;
- main surfaces no longer contain avoidable nested-card stacks or competing primary actions;
- light and dark modes both pass visual and contrast review;
- desktop is polished and 375px remains fully operable;
- core workflows produce no new console errors;
- README screenshots show the upgraded product.

## 11. Explicit non-goals

- Reorganizing product entry points or plugin responsibilities.
- Adding new business capabilities during the visual upgrade.
- Rebuilding the DSH application shell.
- Creating a shared root UI workspace or coupling Git path plugins.
- Recoloring editors, terminals, Diff output, diagrams, provider logos, or channel logos.
- Adding wallpaper, glassmorphism, decorative gradients, glow, or mascot decoration on ordinary pages.
- Making mobile a separate first-class product.
