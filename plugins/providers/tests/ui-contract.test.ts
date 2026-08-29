import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { css } from "../src/client/styles.ts";

const readClient = (name: string): string => readFileSync(new URL(`../src/client/${name}`, import.meta.url), "utf8");

describe("Providers UI contract", () => {
  it("uses the Xiaotaozi action role and a generic content surface", () => {
    expect(css).toContain("--dshM-primary: var(--dsw-alias-button-info-fill, #a84c2c)");
    expect(css).toContain("--dshM-primary-hover: var(--dsw-alias-button-info-hover, #8f3f27)");
    expect(css).toContain("--dshM-brand-ink: var(--dsw-alias-state-business-primary, #a84c2c)");
    expect(css).toContain("--dshM-brand-soft: var(--dsw-alias-state-business-tertiary");
    expect(css).toContain("--dshM-panel: var(--dsw-alias-bg-layer-2");
    expect(css).not.toContain("--dsw-specific-sidebar-fill");
    expect(css).not.toContain("#4176e6");
  });

  it("keeps keyboard, touch, and reduced-motion states explicit", () => {
    expect(css).toContain(":focus-visible");
    expect(css).toContain("@media (pointer: coarse)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("keeps small metadata and status copy readable in both color schemes", () => {
    const gallery = readClient("ImageGallery.tsx");
    const imageTool = readClient("ImageGenerateToolview.tsx");
    const videoTool = readClient("VideoGenerateToolview.tsx");
    expect(css).toContain("--dshM-dim: var(--dsw-alias-label-secondary");
    expect(css).toContain("--dshM-success-ink: color-mix");
    expect(css).toContain("--dshM-error-ink: color-mix");
    expect(css).toContain(".dshM-error { margin: 0; color: var(--dshM-error-ink)");
    expect(gallery).toContain('loading: { fontSize: 12, color: "var(--dsw-alias-label-secondary)"');
    expect(`${gallery}\n${imageTool}\n${videoTool}`).toContain("64%, var(--dsw-alias-label-primary");
    expect(`${imageTool}\n${videoTool}`).not.toMatch(/subtle:[^\n]+label-tertiary/u);
  });

  it("uses semantic modal chrome instead of text close glyphs", () => {
    const workspace = readClient("ModelsWorkspace.tsx");
    const gallery = readClient("ImageGallery.tsx");
    expect(workspace).toContain('aria-modal="true"');
    expect(gallery).toContain('aria-modal="true"');
    expect(`${workspace}\n${gallery}`).not.toMatch(/>\s*(?:×|x|‹)\s*</u);
  });
});
