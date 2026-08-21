import { describe, expect, it } from "vitest";
import { enabledProviders, listedProducts, liveProviderIds, PRODUCTS, productsIn, requireEnabledProvider } from "../src/catalog.ts";

describe("subscription catalog", () => {
  it("keeps unique product ids", () => {
    expect(new Set(PRODUCTS.map((product) => product.id)).size).toBe(PRODUCTS.length);
  });

  it("only live products can authorize", () => {
    expect(liveProviderIds().sort()).toEqual(["claude", "codex", "grok", "kimi", "qwen"].sort());
    expect(PRODUCTS.find((product) => product.id === "kimi")?.login).toBe("device");
    expect(PRODUCTS.filter((product) => product.login === "soon").every((product) => product.region === "cn")).toBe(true);
  });

  it("splits regions", () => {
    expect(productsIn("cn").length + productsIn("intl").length).toBe(PRODUCTS.length);
  });

  it("drops unknown, soon, and duplicate provider ids", () => {
    expect(enabledProviders(["kimi", "glm", "kimi", "nope", "claude"])).toEqual(["kimi", "claude"]);
    expect(enabledProviders([])).toEqual([]);
  });

  it("lists only enabled live products in catalog order", () => {
    expect(listedProducts(["kimi", "glm", "claude"]).map((product) => product.id)).toEqual(["kimi", "claude"]);
    expect(listedProducts([])).toEqual([]);
  });

  it("rejects providers that Config.providers turned off", () => {
    expect(requireEnabledProvider(["qwen"], "qwen")).toBe("qwen");
    expect(() => requireEnabledProvider(["qwen"], "claude")).toThrow(/qwen/);
    expect(() => requireEnabledProvider([], "qwen")).toThrow(/\(none\)/);
  });
});
