# Design

<!-- impeccable:design-schema 1 -->

## World

Cinematic developer product site, peer craft of [grok-app.com](https://grok-app.com/). Dual appearance: dark OLED zinc (`#09090b`) and light paper zinc (`#f6f7f9`). No peach/red chrome. Primary CTAs invert with the theme (white on dark, black on light). Links use a cool periwinkle blue only. Product screenshots carry the visual proof.

## Type

- Display: Bricolage Grotesque (700), tracking about `-0.04em`
- Body: Source Sans 3
- Code: JetBrains Mono
- Appearance: `force-dark`

## Surfaces

- Landing: custom Vue `Landing.vue` (not VitePress `layout: home`)
- Docs: VitePress default chrome with the same dark tokens and peach brand
- Hero: centered oversized title, two pill CTAs, workbench screenshot (composer + files panel) in window chrome with soft peach glow
- Install: terminal card with script / npm / bun tabs and copy
- Plugins: list rows with real plugin marks, not emoji cards

## Contract

User-pinned competitor canon. Seed: `user-pinned-grok-app`.
