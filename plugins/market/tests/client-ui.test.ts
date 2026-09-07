import { createElement } from "react";
// @ts-expect-error The existing test-renderer dependency ships without declarations.
import TestRenderer from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { PluginCenter } from "../src/client/PluginCenter.tsx";
import { apply } from "../src/client/index.ts";
import { createPluginCenterOpen } from "../src/client/plugin-center-open.ts";
import type { CenterPageFace } from "../src/client/PluginCenterHost.tsx";
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

describe("plugin center and confirmation accessibility", () => {
  it("renders a non-modal labelled page and one atomic loading region", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    let view: ReturnType<typeof TestRenderer.create>;
    try {
      await TestRenderer.act(async () => { view = TestRenderer.create(createElement(PluginCenter, {
        center: createPluginCenterOpen(),
        ctx: { slots: { subscribe: () => () => {}, getVersion: () => 0, entriesOfSlot: () => [] }, get: () => undefined } as unknown as CenterPageFace["ctx"],
        renderSlot: (_name, _owner, options) => options?.fallback,
        t: (key: MarketKey) => zh[key], onClose: () => {},
      })); });
      const page = view.root.findByProps({ id: "dsh-plugin-center" });
      expect(page.props.id).toBe("dsh-plugin-center");
      expect(page.props["aria-labelledby"]).toBe("dsh-plugin-center-title");
      expect(view.root.findAllByProps({ role: "dialog" })).toHaveLength(0);
      expect(view.root.findAllByProps({ "aria-modal": "true" })).toHaveLength(0);
      const scroller = view.root.findByProps({ className: "dsh-market-center-scroll" });
      expect(scroller.findAllByProps({ role: "tabpanel" })).toHaveLength(2);
      expect(scroller.findAllByType("header")).toHaveLength(0);
      expect(scroller.findAllByProps({ role: "tablist" })).toHaveLength(0);
      expect(view.root.findAllByType("h1")).toHaveLength(1);
      expect(view.root.findByType("h1").props.tabIndex).toBe(-1);
      const status = view.root.findByProps({ role: "status" });
      expect(status.props["aria-atomic"]).toBe("true");
      expect(JSON.stringify(view.toJSON())).toContain(zh.loading);
      const portrait = view.root.findByType("img");
      expect(portrait.props).toMatchObject({ src: "/docs/ip-3d.jpg", alt: "", width: 36, height: 36 });
    } finally {
      await TestRenderer.act(async () => view?.unmount());
      vi.unstubAllGlobals();
    }
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
  it("takes over only the marked main column and keeps body focus out of the header", () => {
    expect(marketCss).toContain("html[data-dsh-plugin-center-active]");
    expect(cssBlock("[data-dsh-plugin-center-view]")).toMatch(/display: none;[^}]*position: absolute;[^}]*inset: 0;/s);
    expect(cssBlock("html[data-dsh-plugin-center-active] [data-dsh-plugin-center-view]")).toMatch(/display: block;[^}]*z-index: 60;/s);
    expect(marketCss).toContain("[data-pane='conversation'] > :not([data-dsh-plugin-center-view])");
    expect(marketCss).not.toContain(".dsh-market-overlay");
    expect(marketCss).not.toContain(".dsh-market-dialog");
    expect(cssBlock(".dsh-market-center-head")).toContain("flex: none");
    expect(cssBlock(".dsh-market-center-scroll")).toMatch(/flex: 1;[^}]*min-height: 0;[^}]*min-width: 0;[^}]*overflow: auto;/s);
    expect(cssBlock(".dsh-market-center-scroll")).toContain("scroll-padding-block: 12px");
    expect(cssBlock(".dsh-market-detail code")).toContain("overflow-wrap: anywhere; white-space: pre-wrap");
    expect(cssBlock(".dsh-market-search")).toContain("box-sizing: border-box");
    expect(cssBlock(".dsh-market-tab[aria-selected=\"true\"]")).toContain("font-weight: 650");
  });

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
    expect(marketCss).toMatch(/\.dsh-market-chip\[data-kind="failed"\] \{[^}]*color: var\(--mk-danger-ink\);[^}]*var\(--mk-danger\)/s);
    expect(marketCss).not.toMatch(/#(?:a84c2c|8f3f27|5a3228|f8e6d9|13713b)/i);
    expect(marketCss).not.toContain("--dsw-static-deepseek-600");
    expect(marketCss).not.toMatch(/\.dsh-market-icon-tile\[data-kind=/);
    const dark = cssBlock("body[data-ds-dark-theme] .dsh-market-center");
    expect(dark).toContain("--mk-primary-soft: var(--dsw-alias-state-business-tertiary, #3D2B1F);");
    expect(dark).toContain("--mk-focus: var(--dsw-alias-state-business-primary, #FFC09A);");
    expect(dark).toContain("--mk-brand-on-soft: var(--dsw-alias-state-business-primary, #FFDCC4);");
    expect(dark).toContain("--mk-ok-ink: var(--dsw-xtz-status-success-ink, #bbf7d0);");
    expect(dark).toContain("--mk-danger-ink: var(--dsw-xtz-status-error-ink, #ffe0dc);");
  });

  it("uses a neutral column-sized page and open detail sections", () => {
    expect(cssBlock(".dsh-market-center")).toContain("width: 100%; height: 100%");
    expect(cssBlock(".dsh-market-center")).toContain("font-family: inherit");
    expect(cssBlock(".dsh-market-center")).not.toContain("box-shadow");
    expect(cssBlock(".dsh-market-center")).not.toContain("border-radius");
    expect(cssBlock(".dsh-market-center")).toContain("background: var(--mk-surface)");
    expect(cssBlock(".dsh-market-meta")).toMatch(/border-bottom: 1px solid var\(--mk-border\)/);
    expect(cssBlock(".dsh-market-meta")).not.toContain("border-radius");
    expect(cssBlock(".dsh-market-install-info")).toMatch(/border-bottom: 1px solid var\(--mk-border\)/);
    expect(cssBlock(".dsh-market-install-info")).not.toContain("border-radius");
    expect(cssBlock(".dsh-market-risk")).toContain("background: transparent");
    expect(cssBlock(".dsh-market-risk")).not.toContain("border-left");
    expect(cssBlock(".dsh-market-risk")).not.toContain("border-top");
    expect(cssBlock(".dsh-market-confirm-overlay")).toContain("position: fixed");
    expect(cssBlock(".dsh-market-confirm")).toContain("background: var(--mk-surface)");
    expect(cssBlock(".dsh-market-confirm")).toContain("max-height: 100%; overflow: auto");
    expect(cssBlock(".dsh-market-confirm p")).toContain("overflow-wrap: anywhere");
    expect(marketCss).toMatch(/\.dsh-market-confirm-remove \{ background: var\(--mk-danger-fill\); border-color: var\(--mk-danger-fill\); \}/);
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

    expect(mobile).toMatch(/\.dsh-market-confirm-overlay \{[^}]*env\(safe-area-inset-top\)[^}]*env\(safe-area-inset-bottom\)/s);
    expect(mobile).toMatch(/\.dsh-market-confirm-actions \{ flex-direction: column-reverse; \}/);

    const coarse = marketCss.slice(
      marketCss.indexOf("@media (max-width: 768px), (pointer: coarse)"),
      marketCss.indexOf("@media (prefers-reduced-motion: reduce)"),
    );
    for (const selector of [
      ".dsh-market-center-close",
      ".dsh-market-capability",
      ".dsh-market-card-open",
      ".dsh-market-tab",
      ".dsh-market-tag",
      ".dsh-market-get",
      ".dsh-market-back",
      ".dsh-market-install",
      ".dsh-market-confirm-remove",
      ".dsh-market-source-remove",
      ".dsh-market-add-submit",
    ]) expect(coarse).toContain(selector);
    expect(coarse).toContain("min-height: 44px");
    expect(coarse).toContain("min-width: 44px");
    expect(coarse).toContain(".dsh-market-grid { grid-template-columns: minmax(0, 1fr); }");
    expect(coarse).toMatch(/\.dsh-market-center-close,[\s\S]*width: 44px; height: 44px;/);
    expect(coarse).toMatch(/\.dsh-market-search,[\s\S]*font-size: 16px;/);
  });

  it("keeps focus visible and stops animation as well as transitions for reduced motion", () => {
    expect(marketCss).toMatch(/\.dsh-market-center :is\(button, input, select, \[tabindex\]\):focus-visible \{[^}]*outline: 2px solid var\(--mk-focus\);[^}]*outline-offset: 2px;/s);
    expect(marketCss).toContain("--mk-motion-fast: 120ms;");
    expect(marketCss).toContain("--mk-motion: 160ms;");
    const reduced = marketCss.slice(marketCss.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toContain("transition: none !important");
    expect(reduced).toContain("animation: none !important");
    expect(reduced).toContain(".dsh-market-confirm *");
    expect(reduced).not.toContain("animation-duration");
    expect(reduced).not.toContain("animation-iteration-count");
  });
});

describe("plugin center apply wiring", () => {
  it("supplies the actual page to the authorized host and one center-owned sidebar effect", () => {
    const effects: string[] = [];
    let face: { renderPage: (props: CenterPageFace) => { type: unknown; props: unknown } } | undefined;
    const ctx = {
      effect: (_effect: unknown, label: string) => { effects.push(label); },
      locale: { bind: () => (key: MarketKey) => zh[key] },
      slots: {
        inject: (_name: string, callback: () => void) => callback(),
        register: (options: { inject: () => typeof face }) => { face = options.inject(); },
      },
    };
    apply(ctx as unknown as CenterPageFace["ctx"]);
    const props = {} as CenterPageFace;
    expect(face?.renderPage(props)).toMatchObject({ type: PluginCenter, props });
    expect(effects).toEqual(["dsh-market css", "dsh-market copy", "dsh-market plugin center entry"]);
  });
});
