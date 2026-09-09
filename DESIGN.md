---
name: Xiaotaozi DSH
description: Dense in-app workbench for xtz; peach is emphasis, not wallpaper.
colors:
  brand-display: "#FC8940"
  action-fill: "#B94305"
  action-hover: "#9F3703"
  action-pressed: "#7C2C00"
  brand-soft: "#FFF0E6"
  brand-ink: "#A33B04"
  leaf-display: "#78A317"
  leaf-ink: "#4F7410"
  cocoa: "#5E2511"
  warning-ink: "#7a4a00"
  error-ink: "#b42318"
  on-action: "#ffffff"
  peach-50: "#FFF8F2"
typography:
  title:
    fontFamily: "inherit, var(--dsw-font-family)"
    fontSize: "18px"
    fontWeight: 650
    lineHeight: 1.35
  section:
    fontFamily: "inherit, var(--dsw-font-family)"
    fontSize: "15px"
    fontWeight: 650
    lineHeight: 1.4
  body:
    fontFamily: "inherit, var(--dsw-font-family)"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  supporting:
    fontFamily: "inherit, var(--dsw-font-family)"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: "inherit, var(--dsw-font-family)"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.45
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.45
rounded:
  control: "8px"
  card: "12px"
  panel: "16px"
  dialog: "24px"
  pill: "999px"
spacing:
  "2": "2px"
  "4": "4px"
  "6": "6px"
  "8": "8px"
  "12": "12px"
  "16": "16px"
  "24": "24px"
  "32": "32px"
components:
  button-primary:
    backgroundColor: "{colors.action-fill}"
    textColor: "{colors.on-action}"
    rounded: "{rounded.pill}"
    padding: "8px 14px"
    height: "38px"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
    textColor: "{colors.on-action}"
    rounded: "{rounded.pill}"
    padding: "8px 14px"
    height: "38px"
  button-primary-pressed:
    backgroundColor: "{colors.action-pressed}"
    textColor: "{colors.on-action}"
    rounded: "{rounded.pill}"
    padding: "8px 14px"
    height: "38px"
  button-secondary:
    backgroundColor: "{colors.on-action}"
    textColor: "{colors.brand-ink}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "38px"
  chip:
    backgroundColor: "{colors.on-action}"
    textColor: "{colors.brand-ink}"
    rounded: "{rounded.pill}"
    padding: "3px 8px"
    height: "24px"
  card:
    backgroundColor: "{colors.on-action}"
    textColor: "{colors.brand-ink}"
    rounded: "{rounded.card}"
    padding: "14px"
  input:
    backgroundColor: "{colors.on-action}"
    textColor: "{colors.brand-ink}"
    rounded: "{rounded.control}"
    padding: "9px 12px"
    height: "42px"
---

# Design System: Xiaotaozi DSH

## Overview

**Creative North Star: "桌上的暖伙伴"**

This is the in-app DeepSeek Harness workbench that `xtz start` opens. It should feel like a partner sitting at the same desk: warm, round-capped, and reliable. Surfaces stay host-native and dense. Fruit orange appears at brand moments, primary actions, and selected Xiaotaozi-owned controls. It is not the room.

Personality is Swiss product UI at dashboard density, not a fruit shop and not the public marketing site. The website has its own `apps/website/DESIGN.md` (cinematic, no peach chrome). This file documents first-party `plugins/*/src/client` only. Host/server code, the `xtz` CLI, editor syntax, terminal ANSI, Mermaid, and third-party catalog plugins are out of visual scope.

Confirmed visual rejections: cream page wash, glassmorphism, decorative gradients, glow, orange as wallpaper, and using leaf green as a second navigation accent.

**Key Characteristics:**

- Host-native first; peach retints DSH aliases rather than inventing a parallel chrome.
- Fruit orange is emphasis, not wallpaper.
- Resting surfaces are flat; a 1px lift answers hover; shadows belong to floating layers.
- Round caps, four radius steps, and stroke icons — no emoji as structure.
- Motion is short and spatially stable; `prefers-reduced-motion` stops decoration.

## Colors

One ripe accent on a neutral DSH desk. Components consume semantic roles (`--dsw-*` / `--dsw-xtz-*`), never a raw hex as a standalone rule. Feature CSS may repeat an approved literal only as the fallback of its matching variable.

### Primary
- **熟桃** (`{colors.brand-display}`): logo-adjacent marks, selected indicators, key brand icons. Too light for normal-size white text.
- **灶橙** (`{colors.action-fill}`): primary actions with white labels. Hover `{colors.action-hover}`, pressed `{colors.action-pressed}`. Measured above 5:1 on white.
- **奶桃纸** (`{colors.brand-soft}`): selected and low-emphasis brand backgrounds, never a full-page wash.
- **品牌墨** (`{colors.brand-ink}`): brand text and icons on light or soft surfaces.

### Secondary
- **叶斑** (`{colors.leaf-display}`): success dot or compact success icon only. Accessible success copy uses `{colors.leaf-ink}`.

### Tertiary
- **桃核** (`{colors.cocoa}`): logo asset and rare dark-on-logo-orange treatment only. Not a UI fill.

### Neutral
- Host `surface` / `surface-raised` / `surface-muted`, `text` / `text-muted`, `border`, and `shadow` tokens. Light workbench pages are true white or DSH layer tokens, not cream.
- Warning ink `{colors.warning-ink}` and error ink `{colors.error-ink}` (dark-mode pairings `#fde68a` / `#ffe0dc`). Status color is always paired with text or a shape.
- Channel and provider colors stay inside official logos.

### Named Rules
**The Emphasis Rule.** Fruit orange occupies a minority of any screen. Its rarity is the point.

**The Leaf is Success Rule.** 叶斑 never navigates, never brands a tab, never paints a card.

## Typography

**Display Font:** host UI sans (`var(--dsw-font-family)`, inherit)
**Body Font:** the same host stack
**Label/Mono Font:** host mono; code uses `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`

**Character:** One voice, no costume display face. Hierarchy is size and weight, not a second family.

### Hierarchy
- **Title** (650–700, 18–20px, ~1.35): dialog and page titles.
- **Section** (600–650, 15–16px): section headings.
- **Body** (400–600, 13–14px, 1.5): controls and reading copy. Long help stays near 65–75ch.
- **Supporting** (400, 12–13px, 1.45–1.6): summaries, secondary labels. Use the host secondary label role so contrast holds.
- **Caption** (400, 11–12px): metadata only; never below 11px. Tertiary/caption host roles are for disabled or non-essential decoration.
- **Mono**: identifiers and install specs only.

Weights: `400`, `500`, `600`, `650`, `700`. Do not invent `560` / `680` / `750` / `800`.

### Named Rules
**The Host Type Rule.** Do not load a WebFont in first-party plugin UI.

## Layout

Dense dashboard. Spacing scale is 4 / 8 / 12 / 16 / 24 / 32px. Use 2px only for optical alignment and 6px only inside compact icon/label pairs.

Container model: rails, lists, open sections, dialogs, and purposeful cards. Avoid nested card stacks. Plugin Center is a main-area shell with Installed/Discover tabs; details stay in-area; destructive confirmations are modal. Settings are host nav plus one readable column. Page-level overflow at 375px is not allowed.

Control sizes: compact icon 32px desktop hit; standard control 36px min-height; primary dialog action 40px when space allows. At `max-width: 768px` or `(pointer: coarse)`, interactive targets are at least 44×44px.

Verify at 1440, 1024, 768, and 375. Dialogs go near-edge on small screens and respect safe-area insets. Sticky UI must not cover focused controls.

## Elevation & Depth

Tonal layers and 1px borders carry most desktop hierarchy. Shadows are not a resting card costume.

### Shadow Vocabulary
- **Rest:** none on page chrome and ordinary cards.
- **Hover lift:** `translateY(-1px)` plus host `--dsw-shadow-lv1` (fallback `0 5px 18px rgb(20 10 5 / 9%)`).
- **Popover / dialog:** `--dsw-shadow-lv2` / `--dsw-shadow-lv3` (dialog fallback `0 16px 40px rgba(15, 23, 42, .16)`). Do not invent a new rgba shadow per plugin.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. Lift and shadow answer hover, popover, or modal — never decorate a parked card.

## Shapes

Round caps, no sharp stroke ends. Four radii: control 8px, card/panel 12px, large panel 16px, dialog 24px on desktop. Pill 999px is for tags, statuses, and segmented selection — not ordinary secondary buttons. Primary actions keep DSH capsule geometry.

Icons: 16–20px outline, 1.5–1.8px stroke, round caps/joins, `currentColor`. No `×` / `‹` / emoji as structure. Channel logos keep official proportions and colors, in squircle tiles.

## Components

### Buttons
**克制、可点、圆头.**
- **Shape:** primary is a capsule; secondary is 8px.
- **Primary:** 灶橙 fill, white label, ~38px tall, 8px 14px padding.
- **Hover / Focus:** fill darkens to action-hover; 2px focus ring in `{colors.action-fill}` (dark `{colors.brand-display}`-range peach). Press uses action-pressed. Disabled at ~48% opacity.
- **Secondary / Ghost:** neutral surface, semantic border, primary text. Hover tints the muted surface.
- **Danger:** host error fill, never fruit orange.

### Chips
- **Style:** 24px pill, 11px type, 1px border. Idle is neutral.
- **State:** installed/success uses leaf ink on a light leaf tint; queued uses 奶桃纸 + 品牌墨; failed uses error ink. Color is never the only signal — include a word or icon.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** host surface (white / layer-1). Lists may sit on surface-muted so cards separate.
- **Shadow Strategy:** Flat-By-Default; hover 1px lift.
- **Border:** 1px semantic l2; hover mixes in focus peach.
- **Internal Padding:** 14px typical.
- Do not nest a button inside a `role="button"` card. Title/open is a real button; sibling actions stay siblings.

### Inputs / Fields
- **Style:** 8px radius, 1px border, min-height 42px (44px / 16px type on coarse).
- **Focus:** border to focus peach plus a 3px soft ring (`color-mix` 15%).
- **Error / Disabled:** `aria-invalid` with error ink; error copy beside the field. Placeholder is never the only label.

### Navigation
Plugin Center tabs are a segmented control: unselected muted, selected uses surface + 品牌墨 + weight 650 + a light shadow. Arrow keys move between tabs. Selected is not color alone. Sidebar tools row is a shared 50/50 recipe owned by market CSS.

### Signature: Plugin Center tile
Two-column capability tiles (one column when coarse). Icon tile on 奶桃纸, name + summary + status chip, chevron. Hover lifts 1px with a peach border; press scales to 0.99. Empty third-party lists may show the market 3D peach (brand empty moment).

### Signature: 3D peach mark
Product mark is the xtz-ui 3D peach. Each first-party plugin uses its own `docs/ip-3d.jpg` for visible identity. Functional icons stay stroke SVG.

## Do's and Don'ts

### Do:
- **Do** consume `--dsw-*` / `--dsw-xtz-*` with the approved hex only as a variable fallback.
- **Do** keep primary white-on-灶橙; use 熟桃 for display, not for small white text.
- **Do** honor `prefers-reduced-motion` by dropping transition and animation.
- **Do** pair every status color with a word or icon.
- **Do** keep first-party plugins self-contained; no sibling source imports, no `packages/ui`.

### Don't:
- **Don't** paint a cream page wash, glass, glow, or decorative gradient.
- **Don't** use orange as wallpaper or leaf green as navigation.
- **Don't** load a new WebFont in plugin UI.
- **Don't** animate width/height for routine controls; only opacity, color, border, shadow, or a small transform (≤1px lift, ≤0.99 press).
- **Don't** apply this file to the public website, editor syntax, terminal, or third-party catalog plugins.
