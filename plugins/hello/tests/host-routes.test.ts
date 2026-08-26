import { describe, expect, it } from "vitest";
import { resolveHelloConfig } from "../src/config.ts";
import { settingsPayload } from "../src/host-routes.ts";

describe("settings payload", () => {
  it("exposes config, shipped flags, and live surfaces", () => {
    const payload = settingsPayload(resolveHelloConfig({ announceToAgent: true }));
    expect(payload.ok).toBe(true);
    expect(payload.config.announceToAgent).toBe(true);
    expect(payload.shipped.announceToAgent).toBe(true);
    expect(payload.shipped.archive).toBe(true);
    expect(payload.shipped.workbench).toBe(true);
    expect(payload.shipped.workbenchFiles).toBe(true);
    expect(payload.shipped.workbenchGit).toBe(true);
    expect(payload.shipped.workbenchTerminal).toBe(true);
    expect(payload.shipped.workbenchBrowser).toBe(false);
    expect(payload.shipped.board).toBe(true);
    expect(payload.shipped.gitGraph).toBe(true);
    expect(payload.surfaces).toEqual([
      "archive",
      "workbench",
      "workbenchFiles",
      "workbenchGit",
      "workbenchTerminal",
      "board",
      "gitGraph",
      "announceToAgent",
    ]);
  });
});
