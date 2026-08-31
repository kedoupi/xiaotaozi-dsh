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
