import { describe, expect, it } from "vitest";
import {
  FEATURE_SHIPPED,
  pickFeaturePatch,
  resolveHelloConfig,
  surfacesFor,
  type FeatureShipped,
} from "../src/config.ts";

const allShipped: FeatureShipped = {
  archive: true,
  workbench: true,
  workbenchFiles: true,
  workbenchGit: true,
  workbenchTerminal: true,
  workbenchBrowser: true,
  board: true,
  gitGraph: true,
  announceToAgent: true,
};

describe("hello config", () => {
  it("fills defaults and ignores unknown keys", () => {
    expect(resolveHelloConfig()).toMatchObject({ archive: true, announceToAgent: false });
    expect(pickFeaturePatch({ archive: false, extra: 1 })).toEqual({ archive: false });
    expect(pickFeaturePatch(null)).toEqual({});
  });

  it("does not mount unshipped features even when Config is on", () => {
    expect(surfacesFor(resolveHelloConfig(), FEATURE_SHIPPED)).toEqual([
      "archive",
      "workbench",
      "workbenchFiles",
      "workbenchGit",
      "workbenchTerminal",
      "board",
      "gitGraph",
    ]);
    expect(surfacesFor(resolveHelloConfig({ archive: false, announceToAgent: true }), FEATURE_SHIPPED)).toEqual([
      "workbench",
      "workbenchFiles",
      "workbenchGit",
      "workbenchTerminal",
      "board",
      "gitGraph",
      "announceToAgent",
    ]);
  });

  it("drops workbench children when the parent workbench flag is off", () => {
    const config = resolveHelloConfig({
      workbench: false,
      workbenchFiles: true,
      workbenchGit: true,
      archive: true,
      board: false,
      gitGraph: false,
    });
    expect(surfacesFor(config, allShipped)).toEqual(["archive"]);
  });

  it("lists nested surfaces only when parent and child are on", () => {
    const config = resolveHelloConfig({
      workbench: true,
      workbenchFiles: true,
      workbenchGit: false,
      workbenchTerminal: true,
      workbenchBrowser: false,
      archive: false,
      board: false,
      gitGraph: false,
    });
    expect(surfacesFor(config, allShipped)).toEqual(["workbench", "workbenchFiles", "workbenchTerminal"]);
  });
});
