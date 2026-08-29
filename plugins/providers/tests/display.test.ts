import { describe, expect, it } from "vitest";
import { collapseApiVendors, isFeaturedVendor, isRecommendedVendor, modelDisplayName, pairedApiVendorId, pairedSubscriptionId, slugFromName, vendorDisplayName } from "../src/display.ts";

describe("vendorDisplayName", () => {
  it("uses official product names instead of raw ids", () => {
    expect(vendorDisplayName("deepseek")).toBe("DeepSeek");
    expect(vendorDisplayName("deepseek-official", "DeepSeek")).toBe("DeepSeek");
    expect(vendorDisplayName("openai", "openai")).toBe("OpenAI");
    expect(vendorDisplayName("anthropic", "anthropic")).toBe("Anthropic");
    expect(vendorDisplayName("qwen")).toBe("通义千问");
    expect(vendorDisplayName("glm")).toBe("智谱 GLM");
  });

  it("keeps a custom human display name", () => {
    expect(vendorDisplayName("acme-gateway", "Acme Gateway")).toBe("Acme Gateway");
  });
});

describe("modelDisplayName", () => {
  it("maps official product names", () => {
    expect(modelDisplayName("k3")).toBe("Kimi K3");
    expect(modelDisplayName("kimi-for-coding")).toBe("Kimi K2.7 Code");
    expect(modelDisplayName("coder-model")).toBe("Qwen Coder");
    expect(modelDisplayName("deepseek-v4-flash")).toBe("DeepSeek-V4-Flash");
    expect(modelDisplayName("claude-opus-4-5")).toBe("Claude Opus 4.5");
  });

  it("strips vendor slashes from ids", () => {
    expect(modelDisplayName("openai/gpt-5.1-codex")).toBe("GPT-5.1 Codex");
    expect(modelDisplayName("moonshotai/kimi-k2.5", "moonshotai/kimi-k2.5")).toBe("Kimi K2.5");
  });

  it("keeps an official display name from the provider", () => {
    expect(modelDisplayName("gpt-5.1-codex", "GPT-5.1 Codex")).toBe("GPT-5.1 Codex");
  });
});

describe("collapseApiVendors", () => {
  it("hides the generic DeepSeek catalog when the official adapter is present", () => {
    const rows = collapseApiVendors([
      { id: "deepseek-official", name: "DeepSeek" },
      { id: "deepseek", name: "deepseek" },
      { id: "openai", name: "openai" },
    ]);
    expect(rows.map((row) => row.id)).toEqual(["deepseek-official", "openai"]);
  });

  it("collapses regional clones onto one product", () => {
    const rows = collapseApiVendors([
      { id: "minimax", name: "MiniMax" },
      { id: "minimax-cn", name: "MiniMax" },
      { id: "moonshotai", name: "Moonshot" },
      { id: "moonshotai-cn", name: "Moonshot" },
    ]);
    expect(rows.map((row) => row.id)).toEqual(["minimax", "moonshotai"]);
  });

  it("hides subscription aliases and gateway noise from the API list", () => {
    const rows = collapseApiVendors([
      { id: "kimi-coding", name: "kimi-coding" },
      { id: "openai-codex", name: "openai-codex" },
      { id: "opencode", name: "OpenCode" },
      { id: "google", name: "google" },
    ]);
    expect(rows.map((row) => row.id)).toEqual(["google"]);
  });

  it("marks only curated products as featured", () => {
    expect(isFeaturedVendor("openai")).toBe(true);
    expect(isFeaturedVendor("deepseek-official")).toBe(true);
    expect(isFeaturedVendor("minimax-cn")).toBe(true);
    expect(isFeaturedVendor("opencode")).toBe(false);
  });

  it("keeps a short suggested list for the add sheet", () => {
    expect(isRecommendedVendor("deepseek-official")).toBe(true);
    expect(isRecommendedVendor("openai")).toBe(false);
    expect(isRecommendedVendor("anthropic")).toBe(false);
    expect(isRecommendedVendor("cerebras")).toBe(false);
  });

  it("pairs Claude membership with the Anthropic key", () => {
    expect(pairedApiVendorId("claude")).toBe("anthropic");
    expect(pairedSubscriptionId("anthropic")).toBe("claude");
  });

  it("builds a unique custom route from a display name", () => {
    expect(slugFromName("Acme Gateway", new Set())).toBe("custom-acme-gateway");
    expect(slugFromName("公司网关", new Set())).toBe("custom-gw");
    expect(slugFromName("Acme", new Set(["custom-acme"]))).toBe("custom-acme-2");
  });
});
