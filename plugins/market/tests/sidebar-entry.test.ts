import { afterEach, describe, expect, it, vi } from "vitest";
import { createPluginCenterOpen } from "../src/client/plugin-center-open.ts";
import {
  coalesce,
  createEntryMark,
  isNewSessionLabel,
  MARKET_TOOLS_ROW_CLASS,
  mountMarketEntry,
  placeInToolsRow,
} from "../src/client/sidebar-entry.ts";
import { PORTRAIT } from "../src/client/portrait.ts";

it("uses a market-specific tools-row marker for stable coexistence", () => {
  expect(MARKET_TOOLS_ROW_CLASS).toBe("dsh-market-tools-row");
});

it("matches the New Session button labels", () => {
  expect(isNewSessionLabel("新会话")).toBe(true);
  expect(isNewSessionLabel("新建会话")).toBe(true);
  expect(isNewSessionLabel(" New Session ")).toBe(true);
  expect(isNewSessionLabel("新会话历史")).toBe(false);
  expect(isNewSessionLabel("")).toBe(false);
});

describe("coalesce", () => {
  it("folds a burst of triggers into one deferred run", () => {
    const pending: Array<() => void> = [];
    let runs = 0;
    const trigger = coalesce(() => {
      runs += 1;
    }, (callback) => pending.push(callback));
    trigger();
    trigger();
    expect(runs).toBe(0);
    expect(pending).toHaveLength(1);
    pending.shift()?.();
    expect(runs).toBe(1);
  });
});

describe("placeInToolsRow", () => {
  function toolsRow() {
    return {
      children: [] as Array<Record<string, unknown>>,
      get firstElementChild() {
        return this.children[0] ?? null;
      },
      get lastElementChild() {
        return this.children.at(-1) ?? null;
      },
      insertBefore(node: Record<string, unknown>, ref: Record<string, unknown> | null) {
        const from = this.children.indexOf(node);
        if (from >= 0) this.children.splice(from, 1);
        const index = ref === null ? this.children.length : this.children.indexOf(ref);
        this.children.splice(index < 0 ? this.children.length : index, 0, node);
      },
      append(node: Record<string, unknown>) {
        this.insertBefore(node, null);
      },
    };
  }

  it("keeps the center entry first without duplicating it", () => {
    const market = { id: "market" };
    const row = toolsRow();
    placeInToolsRow(row as unknown as HTMLElement, market as unknown as HTMLElement, "start");
    placeInToolsRow(row as unknown as HTMLElement, market as unknown as HTMLElement, "start");
    expect(row.children).toEqual([market]);
  });
});

it("brands the sidebar entry with the dsh-market 3D portrait image", () => {
  const fakeDoc = {
    createElement(tag: string) {
      return { tag, src: "", alt: "unset", width: 0, height: 0 } as unknown as HTMLImageElement;
    },
  } as unknown as Document;
  const mark = createEntryMark(fakeDoc);
  expect(mark.src).toBe(PORTRAIT);
  expect(mark.alt).toBe("");
  expect(mark.width).toBe(15);
  expect(mark.height).toBe(15);
});

it("keeps the current entry's label and aria state across navigation and DOM recreation, then unsubscribes", async () => {
  const center = createPluginCenterOpen();
  let label = "插件中心";
  const onOpen = vi.fn(() => center.open());
  let observerCallback: () => void = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal("MutationObserver", class {
    constructor(callback: () => void) { observerCallback = callback; }
    observe() {}
    disconnect = disconnect;
  });
  const row = {
    previousElementSibling: null as unknown,
    firstElementChild: null as unknown,
    childElementCount: 0,
    classList: { add() {} },
    hasAttribute: () => true,
    insertBefore(node: unknown) { this.firstElementChild = node; this.childElementCount = 1; },
    remove: vi.fn(),
  };
  class Button extends EventTarget {
    textContent = "";
    className = "pill";
    parentElement = row;
    attributes = new Map<string, string>();
    span = { textContent: "", className: "label" };
    ownerDocument = doc;
    setAttribute(key: string, value: string) { this.attributes.set(key, value); }
    getAttribute(key: string) { return this.attributes.get(key) ?? null; }
    closest() { return null; }
    querySelector() { return this.span; }
    replaceChildren() {}
    append(node: { textContent: string; className: string }) { this.span = node; }
    after() { row.previousElementSibling = this; }
    remove() { if (button === this) button = null; row.firstElementChild = null; row.childElementCount = 0; }
  }
  let button: Button | null = null;
  const doc = {
    body: {},
    querySelectorAll: () => [session],
    querySelector: (selector: string) => selector === "[data-dsh-market-entry]" ? button : row,
    createElement: (tag: string) => {
      if (tag === "button") { button = new Button(); return button; }
      return { textContent: "", className: "" };
    },
  };
  const session = new Button(); session.textContent = "New Session";
  const current = () => button!;
  const offSubscribe = vi.fn(); const subscribe = center.subscribe;
  center.subscribe = fn => { const off = subscribe(fn); return () => { off(); offSubscribe(); }; };
  const dispose = mountMarketEntry(doc as unknown as Document, () => label, onOpen, center);
  expect(current().span.textContent).toBe("插件中心");
  expect(current().getAttribute("aria-expanded")).toBe("false");
  expect(current().getAttribute("aria-controls")).toBe("dsh-plugin-center");
  current().dispatchEvent(new Event("click"));
  expect(onOpen).toHaveBeenCalledOnce();
  expect(current().getAttribute("aria-expanded")).toBe("true");
  const first = current(); first.remove(); label = "Plugin Center";
  observerCallback(); await Promise.resolve();
  expect(current()).not.toBe(first);
  expect(current().span.textContent).toBe("Plugin Center");
  expect(current().getAttribute("aria-expanded")).toBe("true");
  expect(current().getAttribute("aria-controls")).toBe("dsh-plugin-center");
  center.close(); expect(current().getAttribute("aria-expanded")).toBe("false");
  observerCallback(); dispose(); await Promise.resolve();
  expect(button).toBeNull(); expect(disconnect).toHaveBeenCalledOnce();
  expect(offSubscribe).toHaveBeenCalledOnce();
  center.open(); observerCallback(); await Promise.resolve(); expect(button).toBeNull();
});

afterEach(() => vi.unstubAllGlobals());
