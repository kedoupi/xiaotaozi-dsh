import { describe, expect, it } from "vitest";
import {
  DEFAULT_PANEL_LAYOUT,
  compactPanelForBounds,
  dockPanelLayout,
  parsePanelLayout,
  resolvePanelGeometry,
} from "../src/client/panel-geometry.ts";

const wide = { width: 1440, height: 900, anchorRight: 1440 };
const narrow = { width: 800, height: 600, anchorRight: 800 };

describe("activity panel geometry", () => {
  it("rejects corrupt storage and fills in missing height mode", () => {
    expect(parsePanelLayout(null)).toEqual(DEFAULT_PANEL_LAYOUT);
    expect(parsePanelLayout("{")).toEqual(DEFAULT_PANEL_LAYOUT);
    expect(parsePanelLayout(JSON.stringify({
      mode: "floating",
      x: 10,
      y: 20,
      width: 400,
      height: 500,
    })).heightMode).toBe("auto");
  });

  it("compacts on a narrow shell and docks on a wide one", () => {
    expect(compactPanelForBounds(narrow)).toBe(true);
    expect(compactPanelForBounds(wide)).toBe(false);
    const docked = resolvePanelGeometry(DEFAULT_PANEL_LAYOUT, wide);
    expect(docked.mode).toBe("docked");
    expect(docked.x + docked.width).toBeLessThanOrEqual(wide.width);
    const compact = resolvePanelGeometry(DEFAULT_PANEL_LAYOUT, narrow);
    expect(compact.x).toBeGreaterThan(0);
    expect(compact.width).toBeLessThan(narrow.width);
  });

  it("returns to the dock without leaving the shell", () => {
    const floating = parsePanelLayout(JSON.stringify({
      mode: "floating",
      x: 40,
      y: 80,
      width: 400,
      height: 500,
      heightMode: "manual",
    }));
    const docked = dockPanelLayout(floating, wide);
    expect(docked.mode).toBe("docked");
    expect(docked.heightMode).toBe("auto");
  });
});
