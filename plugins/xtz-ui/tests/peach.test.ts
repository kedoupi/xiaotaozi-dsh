import { expect, it } from "vitest";
import { applyPeachTheme, BRAND, PEACH, PEACH_SOURCE, PEACH_TOKENS, STATUS_INK } from "../src/client/peach.ts";

const DEEPSEEK_BLUE = "#4176e6";

it("overrides DeepSeek blue tokens with peach pairs", () => {
  expect(PEACH_SOURCE).toBe("dsh-xtz-ui");
  expect(PEACH[500].toLowerCase()).not.toBe(DEEPSEEK_BLUE);
  for (const [name, modes] of Object.entries(PEACH_TOKENS)) {
    expect(name.startsWith("--dsw-")).toBe(true);
    expect(modes.light.startsWith("#")).toBe(true);
    expect(modes.dark.startsWith("#")).toBe(true);
    expect(modes.light.toLowerCase()).not.toBe(DEEPSEEK_BLUE);
    expect(modes.dark.toLowerCase()).not.toBe(DEEPSEEK_BLUE);
  }
  expect(PEACH_TOKENS["--dsw-static-deepseek-500"]?.light).toBe(PEACH[500]);
  expect(PEACH_TOKENS["--dsw-alias-button-info-fill"]?.light).toBe(PEACH[600]);
  expect(PEACH_TOKENS["--dsw-alias-button-info-hover"]?.light).toBe(PEACH[700]);
  expect(PEACH_TOKENS["--dsw-alias-state-business-primary"]).toEqual({ light: PEACH[600], dark: PEACH[200] });
  expect(PEACH_TOKENS["--dsw-xtz-status-success-ink"]).toEqual(STATUS_INK.success);
  expect(PEACH_TOKENS["--dsw-xtz-status-warning-ink"]).toEqual(STATUS_INK.warning);
  expect(PEACH_TOKENS["--dsw-xtz-status-error-ink"]).toEqual(STATUS_INK.error);
  expect(PEACH_TOKENS["--dsw-xtz-brand-display"]).toEqual(BRAND.display);
  expect(PEACH_TOKENS["--dsw-xtz-brand-cream"]).toEqual(BRAND.cream);
  expect(PEACH_TOKENS["--dsw-xtz-brand-leaf"]).toEqual(BRAND.leaf);
  expect(PEACH_TOKENS["--dsw-xtz-brand-ink"]).toEqual(BRAND.ink);
});

it("registers the layer through overrideTokens", () => {
  const calls: Array<{ source: string; tokens: typeof PEACH_TOKENS }> = [];
  const dispose = applyPeachTheme({
    overrideTokens: (source, tokens) => {
      calls.push({ source, tokens });
      return () => {};
    },
  });
  expect(calls).toEqual([{ source: PEACH_SOURCE, tokens: PEACH_TOKENS }]);
  expect(typeof dispose).toBe("function");
});

/** Red-brown legacy family removed by the fruit-orange rebrand. */
const LEGACY_RED_BROWN = [
  "#a84c2c",
  "#b5522a",
  "#9a4423",
  "#5a3228",
  "#3a241e",
  "#d96a38",
  "#e57a45",
  "#f0915f",
  "#f3d0ba",
  "#f0b691",
  "#f8e6d9",
  "#fdf6f1",
  "#fc9052",
  "#ed8644",
  "#fcab7f",
  "#d98a5f",
  "#5b2413",
  "#98a92d",
  "#c2d45e",
];

function both(value: string) {
  return { light: value, dark: value };
}

it("pins the approved fruit-orange semantic palette", () => {
  expect(PEACH[100]).toBe("#FFF0E6");
  expect(PEACH[600]).toBe("#B94305");
  expect(PEACH[700]).toBe("#9F3703");
  expect(PEACH[800]).toBe("#7C2C00");
  expect(BRAND.display.light).toBe("#FC8940");
  expect(BRAND.display.dark).toBe("#FFC09A"); // ≥3:1 on every resolved DSH dark surface
  expect(BRAND.ink.light).toBe("#A33B04");
  expect(BRAND.cream.light).toBe("#FFF0E6");
  expect(BRAND.leaf.light).toBe("#78A317");
});

it("keeps token mappings semantic and drops the legacy red-brown family", () => {
  expect(PEACH_TOKENS["--dsw-alias-button-info-fill"]).toEqual(both(PEACH[600]));
  expect(PEACH_TOKENS["--dsw-alias-button-info-hover"]).toEqual(both(PEACH[700]));
  expect(PEACH_TOKENS["--dsw-alias-state-business-primary"]).toEqual({ light: PEACH[600], dark: PEACH[200] });
  expect(PEACH_TOKENS["--dsw-alias-state-business-tertiary"]).toEqual({ light: PEACH[100], dark: PEACH[800] });
  expect(PEACH_TOKENS["--dsw-xtz-brand-display"]).toEqual(BRAND.display);
  expect(PEACH_TOKENS["--dsw-xtz-brand-ink"]).toEqual(BRAND.ink);
  expect(PEACH_TOKENS["--dsw-xtz-status-success-ink"]).toEqual(STATUS_INK.success);
  const values = [
    ...Object.values(PEACH),
    ...Object.values(BRAND).flatMap((modes) => [modes.light, modes.dark]),
    ...Object.values(PEACH_TOKENS).flatMap((modes) => [modes.light, modes.dark]),
  ].map((value) => value.toLowerCase());
  for (const legacy of LEGACY_RED_BROWN) {
    expect(values).not.toContain(legacy);
  }
});
