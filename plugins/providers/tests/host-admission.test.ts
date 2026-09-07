import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  advertiseImageForSmartAdmission,
  installSmartHostAdmission,
} from "../src/router/host-admission.ts";

/** Host `prompt` admission only looks at `type === "image"`, not file MIME. */
function hostPromptHasImage(content: ReadonlyArray<{ type: string }>): boolean {
  return content.some((part) => part.type === "image");
}

describe("advertiseImageForSmartAdmission", () => {
  it("advertises image on a text-only Host picker model only in smart mode", () => {
    const textOnly = { id: "deepseek-chat", inputModalities: ["text"] as const };
    expect(advertiseImageForSmartAdmission(textOnly, "smart").inputModalities).toEqual([
      "text",
      "image",
    ]);
    expect(advertiseImageForSmartAdmission(textOnly, "manual")).toEqual(textOnly);
  });

  it("leaves vision models and unknown modalities unchanged", () => {
    const vision = { inputModalities: ["text", "image"] as const };
    const unknown = { inputModalities: undefined };
    expect(advertiseImageForSmartAdmission(vision, "smart")).toEqual(vision);
    expect(advertiseImageForSmartAdmission(unknown, "smart")).toEqual(unknown);
    expect(advertiseImageForSmartAdmission(unknown, "manual")).toEqual(unknown);
  });
});

describe("installSmartHostAdmission", () => {
  it("wraps Host resolveModelInfo in smart mode and restores on dispose", async () => {
    const llm = {
      resolveModelInfo: async (_provider: string, _model: string) => ({
        name: "DeepSeek",
        inputModalities: ["text"] as const,
      }),
    };
    const admission = installSmartHostAdmission(llm, () => "smart");
    await expect(llm.resolveModelInfo("deepseek", "deepseek-chat")).resolves.toEqual({
      name: "DeepSeek",
      inputModalities: ["text", "image"],
    });
    await expect(admission.resolveTruthful("deepseek", "deepseek-chat")).resolves.toEqual({
      name: "DeepSeek",
      inputModalities: ["text"],
    });
    admission.dispose();
    await expect(llm.resolveModelInfo("deepseek", "deepseek-chat")).resolves.toEqual({
      name: "DeepSeek",
      inputModalities: ["text"],
    });
  });

  it("does not wrap Host admission in manual mode", async () => {
    const llm = {
      resolveModelInfo: async (_provider: string, _model: string) => ({
        inputModalities: ["text"] as const,
      }),
    };
    const admission = installSmartHostAdmission(llm, () => "manual");
    await expect(llm.resolveModelInfo("deepseek", "deepseek-chat")).resolves.toEqual({
      inputModalities: ["text"],
    });
    admission.dispose();
  });

  it("fails closed to the original model info when mode lookup throws", async () => {
    const llm = {
      resolveModelInfo: async (_provider: string, _model: string) => ({
        inputModalities: ["text"] as const,
      }),
    };
    const admission = installSmartHostAdmission(llm, () => {
      throw new Error("routing.json unreadable");
    });
    await expect(llm.resolveModelInfo("deepseek", "deepseek-chat")).resolves.toEqual({
      inputModalities: ["text"],
    });
    admission.dispose();
  });
});

describe("Host image admission shape", () => {
  it("matches Host: only image parts trigger the picker-model gate", () => {
    expect(hostPromptHasImage([{ type: "image" }])).toBe(true);
    expect(hostPromptHasImage([
      { type: "file" },
    ])).toBe(false);
    expect(hostPromptHasImage([{ type: "text" }])).toBe(false);
  });

  it("does not invent Host image admission for PDF, SVG, or unknown files", () => {
    expect(hostPromptHasImage([
      { type: "file" },
    ])).toBe(false);
    expect(hostPromptHasImage([
      { type: "text" },
      { type: "file" },
    ])).toBe(false);
  });
});

describe("host admission wiring", () => {
  it("keeps inventory and image_generate on the truthful resolver", () => {
    const index = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
    expect(index).toContain("installSmartHostAdmission");
    expect(index).toContain("hostAdmission.resolveTruthful");
    expect(index).toContain("collectLiveInventory(ctx, providers, catalogs, hostAdmission.resolveTruthful");
    expect(index).toContain("resolveModelInfo: hostAdmission.resolveTruthful");
    expect(index).toContain("hostAdmission.dispose()");
  });
});
