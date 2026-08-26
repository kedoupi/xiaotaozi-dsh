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
  board: true,
  gitGraph: true,
  announceToAgent: true,
};

describe("hello config", () => {
  it("fills defaults and ignores unknown keys", () => {
    expect(resolveHelloConfig()).toMatchObject({ archive: true, announceToAgent: false });
    expect(pickFeaturePatch({ archive: false, extra: 1, workbench: false })).toEqual({ archive: false });
    expect(pickFeaturePatch(null)).toEqual({});
  });

  it("does not mount unshipped features even when Config is on", () => {
    expect(surfacesFor(resolveHelloConfig(), FEATURE_SHIPPED)).toEqual([
      "archive",
      "board",
      "gitGraph",
    ]);
    expect(surfacesFor(resolveHelloConfig({ archive: false, announceToAgent: true }), FEATURE_SHIPPED)).toEqual([
      "board",
      "gitGraph",
      "announceToAgent",
    ]);
  });

  it("omits a surface when its flag is off", () => {
    const config = resolveHelloConfig({
      archive: true,
      board: false,
      gitGraph: false,
    });
    expect(surfacesFor(config, allShipped)).toEqual(["archive"]);
  });
});
