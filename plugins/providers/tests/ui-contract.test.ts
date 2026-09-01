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

  it("shows rail identity, loginBadge, and a text state with semantic selection", () => {
    const workspace = readClient("ModelsWorkspace.tsx");
    const shared = readClient("workspace-shared.ts");
    const rail = workspace.slice(workspace.indexOf('aria-label={t("nav")}'), workspace.indexOf('<div className="dshM-main">'));
    expect(shared).toContain("export function loginBadge(");
    expect(shared).toContain("export function apiMethodBadge(");
    expect(rail).toContain("<ProviderLogo id={product.id}");
    expect(rail).toContain("<ProviderLogo id={vendor.id}");
    expect(rail).toContain("loginBadge(product, t)");
    expect(rail).toContain("apiMethodBadge(vendor, t)");
    expect(rail).toMatch(/aria-current=\{on \? "true" : undefined\}|aria-selected=/);
    expect(rail).toMatch(/t\("connected"\)|subscriptionRailState\(/);
    expect(rail).toMatch(/t\("loggedOut"\)|apiRailState\(/);
    expect(rail).not.toContain("enabledCount");
    expect(rail).not.toContain("hintZh");
    expect(rail).not.toContain("baseURL");
  });

  it("gives the detail pane one heading, one-sentence purpose, and non-primary destructive actions", () => {
    const workspace = readClient("ModelsWorkspace.tsx");
    const locales = readClient("locales.ts");
    const detail = workspace.slice(workspace.indexOf('<div className="dshM-main">'), workspace.indexOf("{picker ? ("));
    expect(locales).toContain("subPurpose:");
    expect(locales).toContain("apiPurpose:");
    expect(detail).toContain('<h3 className="dshM-title">{currentSub.nameZh}</h3>');
    expect(detail).toContain('<p className="dshM-hint">{t("subPurpose")}</p>');
    expect(detail).toContain('<h3 className="dshM-title">{currentApi.name}</h3>');
    expect(detail).toContain('<p className="dshM-hint">{t("apiPurpose")}</p>');
    expect(detail).toContain('<h3 className="dshM-title">{t("customTitle")}</h3>');
    expect(detail).toContain('<p className="dshM-hint">{t("customHint")}</p>');
    expect(detail).toContain('t("enabledCount")');
    expect(detail).not.toContain("currentSub.hintZh");
    expect(workspace).toMatch(/className="dshM-btn is-danger"[\s\S]*?\{t\("logout"\)\}/);
    expect(workspace).not.toMatch(/is-primary[\s\S]{0,160}t\("logout"\)/);
    expect(workspace).not.toMatch(/is-primary[\s\S]{0,160}t\("clearKey"\)/);
    expect(workspace).not.toMatch(/is-primary[\s\S]{0,160}t\("removeVendor"\)/);
  });
});
