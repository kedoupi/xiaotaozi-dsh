import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarketOverlay } from "../src/client/MarketOverlay.tsx";
import { trapDialogTab } from "../src/client/dialog-focus.ts";
import { marketCss } from "../src/client/market-css.ts";
import { zh, type MarketKey } from "../src/client/locales.ts";

function cssBlock(selector: string): string {
  const start = marketCss.indexOf(`${selector} {`);
  expect(start, `missing CSS block for ${selector}`).toBeGreaterThanOrEqual(0);
  const end = marketCss.indexOf("}", start);
  return marketCss.slice(start, end + 1);
}

function focusHarness(activeIndex: number | "dialog") {
  let focused: string | undefined;
  const elements = ["first", "middle", "last"].map((id) => ({
    id,
    hidden: false,
    tabIndex: 0,
    getAttribute: () => null,
    focus: () => { focused = id; },
  }));
  const ownerDocument: { activeElement: unknown } = {
    activeElement: activeIndex === "dialog" ? undefined : elements[activeIndex],
  };
  const dialog = {
    ownerDocument,
    hidden: false,
    querySelectorAll: () => elements,
    contains: (node: unknown) => node === dialog || elements.some((element) => element === node),
    focus: () => { focused = "dialog"; },
  };
  if (activeIndex === "dialog") ownerDocument.activeElement = dialog;
  let prevented = false;
  const event = {
    key: "Tab",
    shiftKey: false,
    preventDefault: () => { prevented = true; },
  };
  return {
    dialog: dialog as unknown as HTMLElement,
    event: event as unknown as KeyboardEvent,
    get focused() { return focused; },
    get prevented() { return prevented; },
  };
}

describe("market dialog accessibility", () => {
  it("renders an explicitly labelled modal and a live loading state", () => {
    const html = renderToStaticMarkup(createElement(MarketOverlay, {
      t: (key: MarketKey) => zh[key],
      onClose: () => {},
    }));
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="dsh-market-dialog-title"');
    expect(html).toContain('role="status"');
    expect(html).toContain(zh.loading);
  });

  it("wraps forward Tab from the last control to the first", () => {
    const harness = focusHarness(2);
    expect(trapDialogTab(harness.event, harness.dialog)).toBe(true);
    expect(harness.prevented).toBe(true);
    expect(harness.focused).toBe("first");
  });

  it("wraps reverse Tab from initial dialog focus to the last control", () => {
    const harness = focusHarness("dialog");
    Object.assign(harness.event, { shiftKey: true });
    expect(trapDialogTab(harness.event, harness.dialog)).toBe(true);
    expect(harness.prevented).toBe(true);
    expect(harness.focused).toBe("last");
  });

  it("skips roving-tab controls with tabIndex -1", () => {
    const harness = focusHarness(1);
    const controls = harness.dialog.querySelectorAll<HTMLElement>("button");
    Object.assign(controls[0], { tabIndex: -1 });
    Object.assign(harness.event, { shiftKey: true });
    expect(trapDialogTab(harness.event, harness.dialog)).toBe(true);
    expect(harness.focused).toBe("last");
  });
});

describe("market design contract", () => {
  it("shares one deterministic tools-row recipe with IM", () => {
    expect(marketCss).toMatch(/\[data-dsh-sidebar-tools\] \{[^}]*gap: 8px;[^}]*margin: 0 2px 8px;/s);
    expect(marketCss).toMatch(/\[data-dsh-sidebar-tools\] > button \{[^}]*flex: 1 1 calc\(50% - 4px\);[^}]*min-height: 38px;[^}]*cursor: pointer;/s);
    expect(marketCss).not.toMatch(/\.dsh-sidebar-tools\s*\{/);
  });

  it("uses the approved semantic Fruit Orange and success-only Leaf fallbacks", () => {
    expect(marketCss).toContain("--mk-primary: var(--dsw-alias-button-info-fill, #B94305);");
    expect(marketCss).toContain("--mk-primary-hover: var(--dsw-alias-button-info-hover, #9F3703);");
    expect(marketCss).toContain("--mk-primary-pressed: var(--dsw-static-deepseek-800, #7C2C00);");
    expect(marketCss).toContain("--mk-primary-soft: var(--dsw-alias-state-business-tertiary, #FFF0E6);");
    expect(marketCss).toContain("--mk-ok: var(--dsw-alias-state-success-primary, #78A317);");
    expect(marketCss).toContain("--mk-ok-ink: var(--dsw-xtz-status-success-ink, #4F7410);");
    expect(marketCss.match(/#78A317/gi)).toHaveLength(1);
    expect(marketCss).toMatch(/--mk-danger: var\(--dsw-alias-state-error-primary, #[0-9a-f]{6}\);/i);
    expect(marketCss).not.toMatch(/#(?:a84c2c|8f3f27|5a3228|f8e6d9|13713b)/i);
    expect(marketCss).not.toContain("--dsw-static-deepseek-600");
    expect(marketCss).not.toMatch(/\.dsh-market-icon-tile\[data-kind=/);
    const dark = cssBlock("body[data-ds-dark-theme] .dsh-market-dialog");
    expect(dark).toContain("--mk-primary-soft: var(--dsw-alias-state-business-tertiary, #3D2B1F);");
    expect(dark).toContain("--mk-focus: var(--dsw-alias-state-business-primary, #FFC09A);");
    expect(dark).toContain("--mk-brand-on-soft: var(--dsw-alias-state-business-primary, #FFDCC4);");
    expect(dark).toContain("--mk-ok-ink: var(--dsw-xtz-status-success-ink, #bbf7d0);");
    expect(dark).toContain("--mk-danger-ink: var(--dsw-xtz-status-error-ink, #ffe0dc);");
  });

  it("uses a neutral 24px dialog and open detail sections", () => {
    expect(marketCss).toContain("--mk-radius-dialog: 24px;");
    expect(cssBlock(".dsh-market-dialog")).toContain("border-radius: var(--mk-radius-dialog)");
    expect(cssBlock(".dsh-market-dialog")).toContain("background: var(--mk-surface)");
    expect(cssBlock(".dsh-market-meta")).toMatch(/border-bottom: 1px solid var\(--mk-border\)/);
    expect(cssBlock(".dsh-market-meta")).not.toContain("border-radius");
    expect(cssBlock(".dsh-market-install-info")).toMatch(/border-bottom: 1px solid var\(--mk-border\)/);
    expect(cssBlock(".dsh-market-install-info")).not.toContain("border-radius");
    expect(cssBlock(".dsh-market-risk")).toContain("background: transparent");
    expect(cssBlock(".dsh-market-risk")).not.toContain("border-left");
    expect(cssBlock(".dsh-market-discovery")).toContain("gap: 12px");
    expect(cssBlock(".dsh-market-search-field")).toContain("gap: 8px");
    expect(cssBlock(".dsh-market-tags")).toContain("gap: 8px");
  });

  it("keeps mobile geometry inside safe areas with coarse 44px targets", () => {
    const mobile = marketCss.slice(
      marketCss.indexOf("@media (max-width: 640px)"),
      marketCss.indexOf("@media (max-width: 768px), (pointer: coarse)"),
    );
    expect(mobile).toContain("env(safe-area-inset-top)");
    expect(mobile).toContain("env(safe-area-inset-right)");
    expect(mobile).toContain("env(safe-area-inset-bottom)");
    expect(mobile).toContain("env(safe-area-inset-left)");
    expect(mobile).toMatch(/\.dsh-market-dialog \{[^}]*width: 100%;[^}]*height: 100%;[^}]*min-width: 0;/s);
    expect(mobile).toMatch(/\.dsh-market-grid \{ grid-template-columns: 1fr; \}/);

    const coarse = marketCss.slice(
      marketCss.indexOf("@media (max-width: 768px), (pointer: coarse)"),
      marketCss.indexOf("@media (prefers-reduced-motion: reduce)"),
    );
    for (const selector of [
      ".dsh-market-dialog-close",
      ".dsh-market-tab",
      ".dsh-market-tag",
      ".dsh-market-get",
      ".dsh-market-back",
      ".dsh-market-install",
      ".dsh-market-source-remove",
      ".dsh-market-add-submit",
    ]) expect(coarse).toContain(selector);
    expect(coarse).toContain("min-height: 44px");
    expect(coarse).toMatch(/\.dsh-market-dialog-close,[\s\S]*width: 44px; height: 44px;/);
    expect(coarse).toMatch(/\.dsh-market-search,[\s\S]*font-size: 16px;/);
  });

  it("keeps focus visible and removes routine motion without disabling loading animation", () => {
    expect(marketCss).toMatch(/\.dsh-market-dialog :is\(button, input, \[tabindex\]\):focus-visible \{[^}]*outline: 2px solid var\(--mk-focus\);[^}]*outline-offset: 2px;/s);
    expect(marketCss).toContain("--mk-motion-fast: 120ms;");
    expect(marketCss).toContain("--mk-motion: 160ms;");
    const reduced = marketCss.slice(marketCss.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toContain("transition: none !important");
    expect(reduced).not.toContain("animation-duration");
    expect(reduced).not.toContain("animation-iteration-count");
  });
});
