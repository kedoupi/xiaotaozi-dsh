import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { css } from "../src/client/styles.ts";

const readClient = (name: string): string => readFileSync(new URL(`../src/client/${name}`, import.meta.url), "utf8");

describe("Providers UI contract", () => {
  it("uses the Xiaotaozi action role and a generic content surface", () => {
    expect(css).toMatch(/--dshM-primary:\s*var\(--dsw-alias-button-info-fill,\s*#b94305\)/i);
    expect(css).toMatch(/--dshM-primary-hover:\s*var\(--dsw-alias-button-info-hover,\s*#9f3703\)/i);
    expect(css).toContain("--dshM-primary-pressed:");
    expect(css).not.toMatch(/#a84c2c|#8f3f27|#b5522a/i);
    expect(css).toContain("--dshM-brand-ink: var(--dsw-alias-state-business-primary");
    expect(css).toContain("--dshM-brand-soft: var(--dsw-alias-state-business-tertiary");
    expect(css).toContain("--dshM-panel: var(--dsw-alias-bg-layer-2");
    expect(css).not.toContain("--dsw-specific-sidebar-fill");
    expect(css).not.toContain("#4176e6");
  });

  it("pins page purpose, status summary, one primary action, and a11y contracts", () => {
    expect(css).toContain(".dshM-hint");
    expect(css).toContain(".dshM-status");
    expect(css).toContain(".dshM-btn.is-primary");
    expect(css).toContain(":focus-visible");
    expect(css).toContain("@media (pointer: coarse)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("uses 24px desktop dialog geometry", () => {
    expect(css).toMatch(/\.dshM-confirm\s*\{[^}]*border-radius:\s*24px/u);
    expect(css).toMatch(/\.dshM-sheet\s*\{[^}]*border-radius:\s*24px/u);
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
