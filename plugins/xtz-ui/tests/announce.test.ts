import { describe, expect, it } from "vitest";
import { workbenchGuidanceText } from "../src/announce.ts";
import { resolveXtzUiConfig } from "../src/config.ts";

describe("workbench guidance", () => {
  it("is empty when announce is off", () => {
    expect(workbenchGuidanceText(resolveXtzUiConfig())).toBe("");
  });

  it("names live Xiaotaozi surfaces when announce is on", () => {
    const text = workbenchGuidanceText(resolveXtzUiConfig({ announceToAgent: true }));
    expect(text).toContain("Xiaotaozi chrome");
    expect(text).toContain("Archived conversations");
    expect(text).toContain("Plugin Center → Installed → Xiaotaozi");
    expect(text).toContain("commit graph");
    expect(text).toContain("right Git tab");
    expect(text).not.toContain("blank session");
    expect(text).not.toContain("Settings → Xiaotaozi");
    expect(text).not.toContain("PTY terminal");
  });

  it("omits disabled surfaces", () => {
    const text = workbenchGuidanceText(resolveXtzUiConfig({
      announceToAgent: true,
      archive: false,
      gitGraph: true,
    }));
    expect(text).toContain("commit graph");
    expect(text).not.toContain("Archived conversations");
  });
});
