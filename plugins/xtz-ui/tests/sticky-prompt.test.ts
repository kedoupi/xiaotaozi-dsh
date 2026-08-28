import { describe, expect, it } from "vitest";
import { flattenStickyPromptText, overlayBlocksStickyPrompt, pickStickyPromptRow } from "../src/client/sticky-prompt.ts";

describe("sticky prompt", () => {
  it("flattens whitespace", () => expect(flattenStickyPromptText(" hello\n  world ")).toBe("hello world"));
  it("picks the nearest crossed row", () => expect(pickStickyPromptRow([{key:"a",top:0},{key:"b",top:40},{key:"c",top:100}],50)).toBe("b"));
  it("keeps the current row within release hysteresis", () => expect(pickStickyPromptRow([{key:"a",top:0},{key:"b",top:56}],50,"b")).toBe("b"));
  it("switches forward when another row crosses", () => expect(pickStickyPromptRow([{key:"a",top:0},{key:"b",top:49}],50,"a")).toBe("b"));
  it("treats IM hub and archive overlays as blocking", () => {
    expect(overlayBlocksStickyPrompt({
      querySelector: (sel) => sel.includes(".dim-hubScrim") ? {} : null,
    })).toBe(true);
    expect(overlayBlocksStickyPrompt({ querySelector: () => null })).toBe(false);
  });
});
