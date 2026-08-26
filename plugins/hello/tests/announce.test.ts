import { describe, expect, it } from "vitest";
import { workbenchGuidanceText } from "../src/announce.ts";
import { resolveHelloConfig } from "../src/config.ts";

describe("workbench guidance", () => {
  it("is empty when announce is off", () => {
    expect(workbenchGuidanceText(resolveHelloConfig())).toBe("");
  });

  it("names live workbench surfaces when announce is on", () => {
    const text = workbenchGuidanceText(resolveHelloConfig({ announceToAgent: true }));
    expect(text).toContain("Xiaotaozi workbench");
    expect(text).toContain("PTY terminal");
    expect(text).toContain("system browser");
    expect(text).toContain("Archives");
    expect(text).toContain("task board");
    expect(text).toContain("commit graph");
  });

  it("omits disabled surfaces", () => {
    const text = workbenchGuidanceText(resolveHelloConfig({
      announceToAgent: true,
      workbench: false,
      archive: false,
      board: false,
      gitGraph: true,
    }));
    expect(text).toContain("commit graph");
    expect(text).not.toContain("PTY terminal");
    expect(text).not.toContain("Archives");
    expect(text).not.toContain("task board");
  });
});
