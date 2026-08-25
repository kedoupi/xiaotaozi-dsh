import { expect, it } from "vitest";
import { applyPeachTheme, PEACH, PEACH_SOURCE, PEACH_TOKENS } from "../src/client/peach.ts";

const DEEPSEEK_BLUE = "#4176e6";

it("overrides DeepSeek blue tokens with peach pairs", () => {
  expect(PEACH_SOURCE).toBe("dsh-hello");
  expect(PEACH[500].toLowerCase()).not.toBe(DEEPSEEK_BLUE);
  for (const [name, modes] of Object.entries(PEACH_TOKENS)) {
    expect(name.startsWith("--dsw-")).toBe(true);
    expect(modes.light.startsWith("#")).toBe(true);
    expect(modes.dark.startsWith("#")).toBe(true);
    expect(modes.light.toLowerCase()).not.toBe(DEEPSEEK_BLUE);
    expect(modes.dark.toLowerCase()).not.toBe(DEEPSEEK_BLUE);
  }
  expect(PEACH_TOKENS["--dsw-static-deepseek-500"]?.light).toBe(PEACH[500]);
  expect(PEACH_TOKENS["--dsw-alias-button-info-fill"]?.light).toBe(PEACH[500]);
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
