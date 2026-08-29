# Xiaotaozi DSH Design System

Version: 0.1
Status: normative for first-party plugin Web UI
Reference: [reference.png](reference.png)

## Purpose

Xiaotaozi DSH is a dense browser-based developer workspace. Its UI should feel calm,
precise, warm, and native to the DeepSeek Harness shell. “Unified” means shared
semantics, geometry, interaction, and accessibility—not painting every surface peach
or erasing product-specific identity.

This document applies to every first-party `plugins/*/src/client` surface. Host/server
code, the `xtz` CLI, generated media, editor syntax colors, terminal ANSI colors,
Mermaid diagrams, and third-party catalog plugins are outside its visual scope.
The marketing website follows `apps/website/DESIGN.md` and is outside this contract.

## Product principles

1. **Host-native first.** Reuse DSH semantic tokens and UI primitives before adding a
   Xiaotaozi-specific abstraction.
2. **Peach is emphasis, not wallpaper.** Use it for brand moments, primary actions,
   and selected brand-owned controls. Keep surfaces neutral.
3. **Dense but legible.** Desktop controls are compact; hierarchy comes from spacing,
   typography, and alignment rather than nested cards.
4. **State is explicit.** Loading, empty, success, warning, error, disabled, and busy
   states are visually and semantically distinct.
5. **Keyboard is a first-class input.** Every workflow must remain operable without a
   pointer, including dialogs, tabs, menus, cards, and nested actions.
6. **Motion explains change.** Transitions are short and spatially stable, and all
   non-essential motion stops under `prefers-reduced-motion`.
7. **Plugins remain self-contained.** A plugin may consume host primitives and global
   tokens with fallbacks, but must never import source from a sibling plugin or a root
   workspace package.

## Visual direction

- Style: Minimalism / Swiss product UI.
- Density: 8/10 (dense dashboard).
- Motion: 3/10 (subtle).
- Variance: 3/10 (centered and systematic).
- Background character: true white or DSH neutral layer tokens; do not introduce a
  cream page wash, glassmorphism, decorative gradients, or glow.
- Container model: rails, lists, open sections, dialogs, and purposeful cards. Avoid
  nested card stacks and decorative badge grids.

## Color

### Brand scale

| Token | Value | Use |
|---|---:|---|
| Peach 50 | `#fdf6f1` | very soft brand tint |
| Peach 100 | `#f8e6d9` | selected/brand-soft background |
| Peach 200 | `#f3d0ba` | subtle border or highlight |
| Peach 300 | `#ebb396` | illustration only |
| Peach 400 | `#e08a62` | decorative mark; never white text |
| Peach 450 | `#d06840` | accent icon or border |
| Peach 500 | `#c45a32` | brand mark; not normal-size white text |
| Peach 600 | `#a84c2c` | primary action fill; white contrast 5.62:1 |
| Peach 700 | `#8f3f27` | primary hover; white contrast 7.22:1 |
| Peach 800 | `#5a3228` | primary pressed/dark brand surface |
| Peach 900 | `#3a241e` | dark brand ink |

### Semantic roles

Components consume semantic roles, not raw palette values:

- `action-fill`: Peach 600.
- `action-hover`: Peach 700.
- `action-pressed`: Peach 800.
- `on-action`: white.
- `brand-soft`: Peach 100 in light mode, Peach 800 in dark mode.
- `brand-ink` and `focus-ring`: Peach 600 on light surfaces and Peach 200 on dark
  surfaces. They are foreground roles and must not reuse the mode-invariant action
  fill. Host-native primitives may preserve an equally visible platform focus affordance.
- Small status text uses dedicated accessible ink rather than a host state-primary
  token: success `#13713b` / `#bbf7d0`, warning `#7a4a00` / `#fde68a`, and error
  `#b42318` / `#ffe0dc` in light / dark mode. State-primary colors remain suitable
  for tints only after the composed foreground/background pair is checked.
- `surface`, `surface-raised`, `surface-muted`, `text`, `text-muted`, `border`, and
  `shadow`: DSH semantic tokens.
- Success, warning, error, and information retain their semantic colors. Channel and
  provider brand colors are restricted to logos and necessary identity marks.

Normal text requires at least 4.5:1 contrast. Focus indicators, control boundaries,
  and meaningful icons require at least 3:1 against adjacent colors. Dark-mode checks
  include the DSH base/layer/border surfaces, not only white-on-button contrast. Validate composed
colors in both light and dark modes; a token name alone is not proof of contrast.

## Typography

Use the host font family and `--dsw-font-*` roles. Do not load a new WebFont.

| Role | Target |
|---|---|
| Dialog/page title | 18–20px, 650–700 |
| Section title | 15–16px, 600–650 |
| Control/body | 13–14px, 400–600 |
| Supporting text | 12–13px, line-height 1.45–1.6 |
| Caption/metadata | 11–12px; never use below 11px |
| Code/identifier | host mono font only |

Use weights from the shared set `400`, `500`, `600`, `650`, and `700`. Avoid new
one-off weights such as `560`, `680`, `750`, or `800` unless an external brand asset
requires them.

Readable metadata, placeholders, empty states, and help copy use the host secondary
label role. Tertiary/caption roles are reserved for disabled or genuinely
non-essential decoration because the stock light tokens do not meet 4.5:1 for text.

## Geometry and spacing

### Spacing scale

`4, 8, 12, 16, 24, 32px`. Use 2px only for optical alignment and 6px only inside
compact icon/label pairs.

### Radius

- Control: 8px.
- Button/input with stronger emphasis: 10px only when required by the host primitive.
- Card/panel: 12px.
- Dialog: 16px.
- Pill: 999px only for tags, statuses, or segmented selection—not ordinary buttons.

### Control size

- Compact icon or tertiary control: 32px minimum desktop hit area.
- Standard input/button/tab: 36px minimum desktop height.
- Primary dialog action: 40px when space permits.
- At `max-width: 768px` or `(pointer: coarse)`: all interactive targets are at least
  44×44px; visual glyphs may remain 16–20px inside the expanded hit area.

### Elevation

Prefer `--dsw-shadow-lv1`, `--dsw-shadow-lv2`, and `--dsw-shadow-lv3`. Do not create a
new rgba shadow per plugin. Borders carry most desktop hierarchy; shadows are reserved
for popovers, dialogs, and true floating layers.

## Motion

- Fast feedback: 120ms.
- Standard state transition: 160ms.
- Dialog/popover entrance or exit: up to 200ms.
- Animate opacity, color, border, shadow, or a small transform. Never animate layout
  width/height for routine controls.
- Exit may be slightly faster than entrance.
- Under `prefers-reduced-motion: reduce`, stop spinners and decorative transforms;
  preserve immediate state changes and progress text.

## Component contract

### Buttons

- Primary uses `action-fill`/`action-hover`/`action-pressed` with `on-action` text.
- Secondary uses neutral surface, semantic border, and primary text.
- Danger uses the host error role; never reuse peach.
- Every button has hover, active, focus-visible, and disabled states.
- Icon-only buttons require an accessible name; decorative icons beside visible text
  are `aria-hidden="true"`.

### Inputs and forms

- Every input, select, and textarea has a visible label or an equivalent persistent
  programmatic label. Placeholder text is a hint, never the only label.
- Error copy sits next to the field and is linked with `aria-describedby`; invalid
  controls expose `aria-invalid`.
- Busy forms preserve entered values and announce failure/success through an
  appropriate `role="alert"`, `role="status"`, or `aria-live` region.

### Dialogs and overlays

- Use `role="dialog"` and `aria-modal="true"`, with an accessible title.
- Move initial focus into the dialog, trap Tab/Shift+Tab, close on Escape, and restore
  focus to the opener.
- Scrim click may close only non-destructive dialogs. Destructive confirmation never
  relies on scrim dismissal.
- Dialog body scrolls independently; headers and action bars remain reachable without
  obscuring focus.

### Tabs and segmented controls

- Use `tablist`, `tab`, `aria-selected`, roving `tabIndex`, and linked `tabpanel`.
- Arrow keys move between tabs. Selected state is not conveyed by color alone.

### Cards, rows, and nested actions

- Do not nest an interactive button inside a `role="button"` container.
- When a row has secondary actions, make the title/open action a real button or link
  and keep sibling actions separate.
- Selected, busy, and disabled states must be announced as well as styled.

### Loading, empty, error, and status

- Loading is distinct from empty. Do not render an empty state before initial data has
  resolved.
- Busy regions expose `aria-busy="true"`; transient progress uses `role="status"`.
- Errors use `role="alert"` when immediate attention is required.
- Status color is always paired with text or an icon/shape.

## Page and surface patterns

- Settings: host navigation on the left, one readable content column, open section
  rhythm, and restrained cards only around independent configuration groups.
- Marketplace: modal shell, semantic tabs/search, responsive list/grid, cards with a
  separate open action and install action.
- IM manager: channel identity lives in logos/tabs; all functional actions use the
  Xiaotaozi/host semantic system.
- Task board: columns may scroll horizontally by design, but dialogs and toolbar
  controls adapt to narrow screens without page-level overflow.
- Sidebar: unify application chrome while leaving editor, terminal, diff, and rendered
  document color systems intact.

## Icon contract

- Prefer existing DSH primitives. Otherwise use one 16–20px outline family per
  surface, with 1.5–1.8px strokes, round caps/joins, and `currentColor`.
- Use SVG for close, back, add, disclosure, search, and navigation icons. Do not use
  text glyphs such as `×`, `x`, `‹`, or emoji as structural icons.
- Official channel/provider logos retain their proportions and brand colors.

## Responsive contract

Verify at 1440px, 1024px, 768px, and 375px.

- No page-level horizontal overflow at 375px. Purposeful board/table scrollers are
  allowed inside labeled regions.
- Dialogs become edge-to-edge or near-edge on small screens and respect safe-area
  insets.
- Multi-column settings and card grids collapse before content becomes unreadable.
- Fixed/sticky UI must not cover focused controls or the final scrollable action.

## Engineering contract

1. Prefer DSH UI primitives and `--dsw-*` semantic tokens.
2. `xtz-ui` owns the Xiaotaozi theme override. Other plugins consume the host tokens
   and keep safe local fallbacks so they remain installable alone.
3. Every plugin scopes CSS to its own root or uses CSS Modules. A deliberately shared
   global selector must have one identical tested recipe in every independent plugin.
4. Do not add `packages/ui`, import sibling plugin source, or make a plugin depend on a
   root workspace file. Small helpers stay inside the plugin; a real shared package
   must be separately published.
5. Brand literals are allowed only in the theme source and official logo assets.
   Feature CSS uses semantic variables.
6. Add tests for interaction semantics and repository checks for contrast-sensitive
   theme mappings, unscoped cross-plugin selectors, and forbidden structural glyphs.

## Definition of done

- Type checks, unit tests, plugin builds, isolated Git path checks, and policy checks
  pass.
- Desktop and 375px rendered QA pass in light and dark mode.
- Market, IM, settings, task board, and sidebar core interactions work without console
  errors.
- Keyboard focus is visible and never trapped outside the active dialog.
- No relevant WCAG contrast, placeholder-label, nested-interactive, or stale-loading
  findings remain in first-party UI.
- The rendered implementation is visually compared with `reference.png`; intentional
  deviations preserve existing Xiaotaozi functionality and copy.
