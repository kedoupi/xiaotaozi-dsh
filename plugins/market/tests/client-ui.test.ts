import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarketOverlay } from "../src/client/MarketOverlay.tsx";
import { trapDialogTab } from "../src/client/dialog-focus.ts";
import { marketCss } from "../src/client/market-css.ts";
import { zh, type MarketKey } from "../src/client/locales.ts";

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

  it("uses deep peach primary actions and ships small-screen/reduced-motion rules", () => {
    expect(marketCss).toContain("--dsw-static-deepseek-600");
    expect(marketCss).toContain("body[data-ds-dark-theme] .dsh-market-dialog");
    expect(marketCss).toContain("@media (max-width: 640px)");
    expect(marketCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(marketCss).toMatch(/\.dsh-market-search,[\s\S]*font-size: 16px;/);
  });
});
