import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { boardZh, boardEn } from "../src/client/board-locales.ts";

const readClient = (name: string): string => readFileSync(new URL(`../src/client/${name}`, import.meta.url), "utf8");

describe("board brand wiring (docs/brand.zh.md)", () => {
  it("board radii and motion ride the shared xtz tokens", () => {
    const css = readClient("board-css.ts");
    expect(css).toContain("var(--xtz-radius-s,");
    expect(css).toContain("var(--xtz-radius-m,");
    expect(css).toContain("var(--xtz-radius-l,");
    expect(css).toContain("var(--xtz-radius-pill,");
    expect(css).toContain("var(--xtz-dur-fast,");
    expect(css).toContain("var(--xtz-ease-out,");
  });

  it("renders a brand empty state with the mark, and leaf stays decorative", () => {
    const panel = readClient("BoardPanel.tsx");
    const css = readClient("board-css.ts");
    expect(panel).toContain("APP_ICON");
    expect(panel).toContain('k("emptyBoard")');
    expect(css).toContain("var(--dsw-xtz-brand-display,");
    expect(css).toContain("var(--dsw-xtz-brand-leaf,");
    // Leaf is decoration only: it must not drive any status color.
    expect(css).not.toMatch(/statusDot[^}]*brand-leaf/su);
  });

  it("empty-state copy exists in both locales", () => {
    expect(boardZh.emptyBoardTitle.length).toBeGreaterThan(0);
    expect(boardZh.emptyBoardBody.length).toBeGreaterThan(0);
    expect(boardEn.emptyBoardTitle.length).toBeGreaterThan(0);
    expect(boardEn.emptyBoardBody.length).toBeGreaterThan(0);
  });
});
