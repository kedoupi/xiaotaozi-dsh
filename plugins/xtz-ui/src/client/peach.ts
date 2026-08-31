/** Layer id for `theme.overrideTokens`. */
export const PEACH_SOURCE = "dsh-xtz-ui";

/** Creamy fruit / skin / shadow from the Xiaotaozi peach mark (APP_ICON).
 * Mid tones were recalibrated toward the icon's milky orange; 600 stays at or
 * above the 4.5:1 white-text contrast floor (measured 4.98). */
export const PEACH = {
  50: "#fdf6f1",
  100: "#f8e6d9",
  200: "#f3d0ba",
  300: "#f0b691",
  400: "#f0915f",
  450: "#e57a45",
  500: "#d96a38",
  600: "#b5522a",
  700: "#9a4423",
  800: "#5a3228",
  900: "#3a241e",
} as const;

/** Brand accents sampled pixel-level from APP_ICON. Leaf is decoration only
 * (never semantic); ink is the heavy color on brand surfaces.
 * Spec: docs/brand.zh.md §2.1. */
export const BRAND = {
  display: { light: "#fc9052", dark: "#ed8644" },
  cream: { light: "#fcab7f", dark: "#d98a5f" },
  leaf: { light: "#98a92d", dark: "#c2d45e" },
  ink: { light: "#5b2413", dark: "#f3d0ba" },
} as const satisfies Record<string, TokenModes>;

/** Accessible semantic text colors. Host state primaries remain available for
 * dots, borders, and tints, but are not guaranteed to pass 4.5:1 as small text. */
export const STATUS_INK = {
  success: { light: "#13713b", dark: "#bbf7d0" },
  warning: { light: "#7a4a00", dark: "#fde68a" },
  error: { light: "#b42318", dark: "#ffe0dc" },
} as const satisfies Record<string, TokenModes>;

export type TokenModes = { light: string; dark: string };
export type TokenOverrides = Record<string, TokenModes>;

function both(value: string): TokenModes {
  return { light: value, dark: value };
}

/**
 * Retint DeepSeek blue to peach. Statics feed aliases and the few host
 * rules that still name `--dsw-static-deepseek-*`. Interactive fills use
 * 600/700 so white labels pass WCAG AA in both schemes.
 */
export const PEACH_TOKENS: TokenOverrides = {
  "--dsw-static-deepseek-50": both(PEACH[50]),
  "--dsw-static-deepseek-100": both(PEACH[100]),
  "--dsw-static-deepseek-200": both(PEACH[200]),
  "--dsw-static-deepseek-300": both(PEACH[300]),
  "--dsw-static-deepseek-400": both(PEACH[400]),
  "--dsw-static-deepseek-450": both(PEACH[450]),
  "--dsw-static-deepseek-500": both(PEACH[500]),
  "--dsw-static-deepseek-600": both(PEACH[600]),
  "--dsw-static-deepseek-700": both(PEACH[700]),
  "--dsw-static-deepseek-800": both(PEACH[800]),
  "--dsw-static-deepseek-900": both(PEACH[900]),
  "--dsw-alias-button-info-fill": both(PEACH[600]),
  "--dsw-alias-button-info-hover": both(PEACH[700]),
  "--dsw-alias-brand-primary-new-colorprimary-new-color": { light: PEACH[600], dark: PEACH[200] },
  "--dsw-alias-state-business-primary": { light: PEACH[600], dark: PEACH[200] },
  "--dsw-alias-state-business-tertiary": { light: PEACH[100], dark: PEACH[800] },
  "--dsw-xtz-status-success-ink": STATUS_INK.success,
  "--dsw-xtz-status-warning-ink": STATUS_INK.warning,
  "--dsw-xtz-status-error-ink": STATUS_INK.error,
  "--dsw-specific-bubble": { light: PEACH[50], dark: "#2c2622" },
  "--dsw-specific-bubble-highlight": { light: PEACH[200], dark: "#3a322c" },
  "--dsw-specific-sidebar-nav-item-active-accent": { light: PEACH[100], dark: "#3a322c" },
  "--dsw-xtz-brand-display": BRAND.display,
  "--dsw-xtz-brand-cream": BRAND.cream,
  "--dsw-xtz-brand-leaf": BRAND.leaf,
  "--dsw-xtz-brand-ink": BRAND.ink,
};

export function applyPeachTheme(theme: {
  overrideTokens: (source: string, tokens: TokenOverrides) => () => void;
}): () => void {
  return theme.overrideTokens(PEACH_SOURCE, PEACH_TOKENS);
}
