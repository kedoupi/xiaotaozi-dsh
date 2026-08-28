import { describe, expect, it } from "vitest";
import {
  FEATURE_SHIPPED,
  pickFeaturePatch,
  resolveXtzUiConfig,
  surfacesFor,
  type FeatureShipped,
} from "../src/config.ts";

const allShipped: FeatureShipped = {
  archive: true,
  board: true,
  gitGraph: true,
  announceToAgent: true,
};

describe("xtz-ui config", () => {
  it("fills defaults and ignores unknown keys", () => {
    expect(resolveXtzUiConfig()).toMatchObject({ archive: true, announceToAgent: false });
    expect(pickFeaturePatch({ archive: false, extra: 1, workbench: false })).toEqual({ archive: false });
    expect(pickFeaturePatch(null)).toEqual({});
  });

  it("does not mount unshipped features even when Config is on", () => {
    expect(surfacesFor(resolveXtzUiConfig(), FEATURE_SHIPPED)).toEqual([
      "archive",
      "board",
      "gitGraph",
    ]);
    expect(surfacesFor(resolveXtzUiConfig({ archive: false, announceToAgent: true }), FEATURE_SHIPPED)).toEqual([
      "board",
      "gitGraph",
      "announceToAgent",
    ]);
  });

  it("omits a surface when its flag is off", () => {
    const config = resolveXtzUiConfig({
      archive: true,
      board: false,
      gitGraph: false,
    });
    expect(surfacesFor(config, allShipped)).toEqual(["archive"]);
  });
});
