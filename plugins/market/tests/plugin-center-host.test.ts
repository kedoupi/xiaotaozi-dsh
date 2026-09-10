import { existsSync, readFileSync } from "node:fs";
import { createElement, type ReactNode } from "react";
// @ts-expect-error The existing test-renderer dependency ships without declarations.
import TestRenderer from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import type { Context as ClientContext } from "@deepseek-ai/cordis";
import { createPluginCenterOpen } from "../src/client/plugin-center-open.ts";
import { mountPluginCenter } from "../src/client/plugin-center-mount.ts";
import { PluginCenterHost, registerPluginCenter, type CenterPageFace } from "../src/client/PluginCenterHost.tsx";

// Test renderer cannot host a react-dom portal. Only replace that boundary;
// the real Host, adapter, navigation store and all their effects still execute.
vi.mock("react-dom", () => ({ createPortal: (children: ReactNode) => children }));

it("declares details on shell.overlay and never takes conversation ownership", () => {
  const path = new URL("../src/client/PluginCenterHost.tsx", import.meta.url);
  // Absence is an assertion failure, not a module-resolution error presented as RED.
  const source = existsSync(path) ? readFileSync(path, "utf8") : "";
  expect(source).toContain('name: "shell.overlay"');
  expect(source).toContain('[DETAIL_SLOT]: { kind: "keyed", scope: "root" }');
  expect(source).not.toContain("createRoot");
  expect(source).not.toMatch(/name:\s*["'](?:root|conversation)["']/);
});

const ACTIVATE = "dsh-xtz-ui-panel-activate";
const ACTIVE = "data-dsh-plugin-center-active";
const VIEW = "data-dsh-plugin-center-view";

class Node extends EventTarget {
  attributes = new Map<string, string>();
  children: Node[] = [];
  parentElement: Node | null = null;
  connected = false;
  focus = vi.fn(() => { this.doc.activeElement = this; });
  constructor(readonly doc: Dom, readonly tag = "div") { super(); }
  get isConnected(): boolean { return this.connected || (this.parentElement?.isConnected ?? false); }
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  removeAttribute(key: string) { this.attributes.delete(key); }
  hasAttribute(key: string) { return this.attributes.has(key); }
  append(node: Node) { node.remove(); this.children.push(node); node.parentElement = this; }
  remove() {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(node => node !== this);
    this.parentElement = null;
    this.connected = false;
  }
  contains(node: Node | null): boolean { return node !== null && (node === this || this.children.some(child => child.contains(node))); }
  matches(selector: string): boolean {
    return selector.split(", ").some(part => {
      if (part === "h1" || part === "dialog") return this.tag === part;
      const match = /^\[([^=*]+)(\*?=)?"?([^"\]]*)"?\]$/.exec(part);
      if (!match) throw Error(`Unsupported selector: ${part}`);
      const value = this.attributes.get(match[1]);
      return value !== undefined && (!match[2] || (match[2] === "*=" ? value.includes(match[3]) : value === match[3]));
    });
  }
  closest(selector: string): Node | null { return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null; }
  querySelector(selector: string): Node | null {
    for (const child of this.children) {
      if (child.matches(selector)) return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }
  querySelectorAll(selector: string): Node[] {
    const found: Node[] = [];
    const visit = (node: Node): void => {
      if (node.matches(selector)) found.push(node);
      for (const child of node.children) visit(child);
    };
    for (const child of this.children) visit(child);
    return found;
  }
}
class Dom extends EventTarget {
  defaultView = new EventTarget();
  documentElement = new Node(this);
  body = new Node(this, "body");
  activeElement: Node | null = null;
  constructor() { super(); this.documentElement.connected = true; this.documentElement.append(this.body); }
  createElement(tag: string) { return new Node(this, tag); }
  querySelector(selector: string) { return this.body.querySelector(selector); }
  querySelectorAll(selector: string) { return this.body.querySelectorAll(selector); }
}

function fixture() {
  const doc = new Dom();
  const column = doc.createElement("div"); column.setAttribute("data-pane", "conversation"); doc.body.append(column);
  const opener = doc.createElement("button"); opener.setAttribute("data-dsh-market-entry", ""); doc.body.append(opener);
  const observers: Array<{ callback: () => void; disconnect: ReturnType<typeof vi.fn> }> = [];
  vi.stubGlobal("MutationObserver", class {
    disconnect = vi.fn();
    constructor(readonly callback: () => void) { observers.push(this); }
    observe() {}
  });
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", doc.defaultView);
  const center = createPluginCenterOpen();
  const anchorChanged = vi.fn();
  const activate = vi.fn(); doc.addEventListener(ACTIVATE, activate);
  const mount = () => mountPluginCenter({ doc: doc as unknown as Document, center, onAnchor: anchorChanged });
  const anchor = () => doc.querySelector(`[${VIEW}]`)!;
  return { doc, column, opener, observers, center, anchorChanged, activate, mount, anchor };
}
afterEach(() => { vi.unstubAllGlobals(); });

it("registers an authorized child declaration with the original injected face and lifecycle", () => {
  const center = createPluginCenterOpen();
  const t = () => "插件中心";
  const renderPage = () => createElement("h1", { tabIndex: -1 }, "插件中心");
  let activate: (() => () => void) | undefined;
  const offRegistration = vi.fn();
  const offInjection = vi.fn();
  const register = vi.fn(() => offRegistration);
  const ctx = { slots: { inject: vi.fn((slot: string, callback: () => () => void) => {
    expect(slot).toBe("shell.overlay"); activate = callback; return offInjection;
  }), register } } as unknown as ClientContext;
  const off = registerPluginCenter(ctx, { center, t, renderPage });
  expect(activate).toBeTypeOf("function");
  expect(register).not.toHaveBeenCalled();
  expect(activate!()).toBe(offRegistration);
  const [options, component] = register.mock.calls[0] as unknown as [{ name: string; id: string; order: number; children: object; inject: () => object }, unknown];
  expect(options).toMatchObject({ name: "shell.overlay", id: "plugin-center", order: 55,
    children: { "xiaotaozi.plugin-center.detail": { kind: "keyed", scope: "root" } } });
  expect(options.inject()).toEqual({ ctx, center, t, renderPage });
  expect(component).toBe(PluginCenterHost);
  off(); expect(offInjection).toHaveBeenCalledOnce();
});

it("activates only on open edges, synchronously yields to another panel, and removes only owned resources", () => {
  const f = fixture();
  const remove = vi.spyOn(f.doc, "removeEventListener");
  const offSubscribe = vi.fn(); const subscribe = f.center.subscribe;
  f.center.subscribe = fn => { const off = subscribe(fn); return () => { off(); offSubscribe(); }; };
  const dispose = f.mount();
  expect(f.anchor()).not.toBeNull();
  expect(f.activate).not.toHaveBeenCalled();
  f.center.open();
  expect(f.doc.documentElement.hasAttribute(ACTIVE)).toBe(true);
  expect(f.activate).toHaveBeenCalledOnce();
  expect(f.activate.mock.calls[0][0].detail).toBe("plugin-center");
  f.center.navigate({ ...f.center.getSnapshot().location, query: "memory", detail: { kind: "capability", id: "models" } });
  expect(f.activate).toHaveBeenCalledOnce();
  f.doc.documentElement.setAttribute("data-dsh-board-active", "");
  f.doc.dispatchEvent(new CustomEvent(ACTIVATE, { detail: "board" }));
  expect(f.center.getSnapshot().open).toBe(false);
  expect(f.doc.documentElement.hasAttribute(ACTIVE)).toBe(false);
  f.center.open(); expect(f.activate).toHaveBeenCalledTimes(3);
  const anchor = f.anchor(); dispose();
  expect(anchor.isConnected).toBe(false);
  expect(f.anchorChanged).toHaveBeenLastCalledWith(null);
  expect(f.doc.documentElement.hasAttribute(ACTIVE)).toBe(false);
  expect(f.doc.documentElement.hasAttribute("data-dsh-board-active")).toBe(true);
  expect(f.observers[0].disconnect).toHaveBeenCalledOnce();
  expect(offSubscribe).toHaveBeenCalledOnce();
  expect(remove).toHaveBeenCalledWith(ACTIVATE, expect.any(Function));
  expect(remove).toHaveBeenCalledWith("click", expect.any(Function), true);
  f.doc.dispatchEvent(new CustomEvent(ACTIVATE, { detail: "board" }));
  expect(f.center.getSnapshot().open).toBe(true);
  f.center.close(); f.center.open(); f.observers[0].callback();
  expect(f.anchor()).toBeNull();
  expect(f.doc.documentElement.hasAttribute(ACTIVE)).toBe(false);
});

it("reattaches a single anchor after column or anchor replacement, not ordinary DOM churn", () => {
  const f = fixture(); const dispose = f.mount(); const first = f.anchor();
  f.observers[0].callback(); expect(f.anchorChanged).toHaveBeenCalledTimes(1);
  f.center.open(); f.column.remove(); f.observers[0].callback();
  expect(f.anchorChanged).toHaveBeenLastCalledWith(null);
  const replacement = f.doc.createElement("div"); replacement.setAttribute("class", "layout_centerCol_hash"); f.doc.body.append(replacement);
  f.observers[0].callback(); const second = f.anchor();
  expect(second).not.toBe(first); expect(first.parentElement).toBeNull();
  expect(replacement.children).toEqual([second]);
  second.remove(); f.observers[0].callback();
  expect(replacement.children).toHaveLength(1); expect(f.anchor()).not.toBe(second);
  expect(f.activate).toHaveBeenCalledOnce(); dispose();
});

it.each(["sessionRow", "projectRow", "searchResultRow", "searchResultWorkspace", "newSession"])("closes on %s clicks without changing selection or stealing outside focus", className => {
  const f = fixture(); const dispose = f.mount(); f.center.open();
  const row = f.doc.createElement("button"); row.setAttribute("class", `host_${className}_hash`); f.doc.body.append(row); row.focus();
  const child = f.doc.createElement("span"); row.append(child);
  const click = new Event("click", { cancelable: true }); Object.defineProperty(click, "target", { value: child });
  f.doc.dispatchEvent(click);
  expect(f.center.getSnapshot().open).toBe(false); expect(click.defaultPrevented).toBe(false);
  expect(f.doc.activeElement).toBe(row); expect(f.opener.focus).not.toHaveBeenCalled(); dispose();
});

function renderHost(f: ReturnType<typeof fixture>) {
  let page: CenterPageFace | undefined;
  let renderer: ReturnType<typeof TestRenderer.create>;
  let heading: Node | null = null;
  const headingRef = (node: Node | null): void => {
    if (node === null) {
      if (f.doc.activeElement === heading) f.doc.activeElement = f.doc.body;
      heading?.remove();
    }
    heading = node;
  };
  const renderSlot = vi.fn();
  TestRenderer.act(() => {
    renderer = TestRenderer.create(createElement(PluginCenterHost, {
      ctx: {} as ClientContext, center: f.center, t: () => "插件中心", renderSlot,
      renderPage: (props: CenterPageFace) => {
        page = props;
        return createElement("h1", { tabIndex: -1, ref: headingRef }, "插件中心");
      },
    }), { createNodeMock: (element: { type: string }) => {
      const node = f.doc.createElement(element.type);
      f.anchor().append(node);
      return node;
    } });
  });
  const open = () => TestRenderer.act(() => { f.opener.focus(); f.center.open(); });
  const unmount = () => TestRenderer.act(() => renderer.unmount());
  return { open, unmount, page: () => page!, renderSlot };
}
function escape(f: ReturnType<typeof fixture>, options: { prevented?: boolean; composing?: boolean; key?: string } = {}) {
  const event = new Event("keydown", { cancelable: true });
  Object.defineProperties(event, { key: { value: options.key ?? "Escape" }, isComposing: { value: options.composing ?? false } });
  if (options.prevented) event.preventDefault();
  TestRenderer.act(() => { f.doc.defaultView.dispatchEvent(event); });
  return event;
}

it("focuses the committed h1 once per opening and restores the current connected entry on explicit Close/Escape", () => {
  const f = fixture(); const host = renderHost(f);
  expect(host.page()).toBeUndefined(); host.open();
  const heading = f.anchor().querySelector("h1")!;
  expect(f.doc.activeElement).toBe(heading); expect(heading.focus).toHaveBeenCalledOnce();
  expect(host.page().renderSlot).toBe(host.renderSlot);
  TestRenderer.act(() => f.center.navigate({ ...f.center.getSnapshot().location, query: "new" }));
  expect(heading.focus).toHaveBeenCalledOnce();
  f.opener.remove(); const current = f.doc.createElement("button"); current.setAttribute("data-dsh-market-entry", ""); f.doc.body.append(current);
  TestRenderer.act(() => host.page().onClose());
  expect(f.center.getSnapshot().open).toBe(false); expect(f.doc.activeElement).toBe(current);
  TestRenderer.act(() => f.center.open());
  expect(escape(f).defaultPrevented).toBe(true);
  expect(f.center.getSnapshot().open).toBe(false); expect(f.doc.activeElement).toBe(current);
  host.unmount();
});

it("Escape on a detail pops back to the list instead of closing", () => {
  const f = fixture(); const host = renderHost(f); host.open();
  TestRenderer.act(() => f.center.navigate({
    ...f.center.getSnapshot().location, detail: { kind: "capability", id: "models" },
  }));
  expect(escape(f).defaultPrevented).toBe(true);
  expect(f.center.getSnapshot().open).toBe(true);
  expect(f.center.getSnapshot().location.detail).toBeUndefined();
  expect(escape(f).defaultPrevented).toBe(true);
  expect(f.center.getSnapshot().open).toBe(false);
  host.unmount();
});

it("leaves Escape to a foreign modal overlay even when focus stays in the center", () => {
  const f = fixture(); const host = renderHost(f); host.open();
  const overlay = f.doc.createElement("div");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  f.doc.body.append(overlay);
  expect(escape(f).defaultPrevented).toBe(false);
  expect(f.center.getSnapshot().open).toBe(true);
  host.unmount();
});

it.each(["dialog", "alertdialog", "native"])("leaves nested %s Escape and composing/consumed events to their owner", role => {
  const f = fixture(); const host = renderHost(f); host.open();
  escape(f, { prevented: true }); expect(f.center.getSnapshot().open).toBe(true);
  escape(f, { composing: true }); expect(f.center.getSnapshot().open).toBe(true);
  escape(f, { key: "Enter" }); expect(f.center.getSnapshot().open).toBe(true);
  const dialog = f.doc.createElement(role === "native" ? "dialog" : "div");
  if (role !== "native") dialog.setAttribute("role", role);
  f.doc.body.append(dialog); const input = f.doc.createElement("input"); dialog.append(input); input.focus();
  expect(escape(f).defaultPrevented).toBe(false); expect(f.center.getSnapshot().open).toBe(true);
  host.unmount();
});

it("external closure restores only center-owned focus and unmount removes the window Escape listener", () => {
  const f = fixture(); const host = renderHost(f); host.open();
  TestRenderer.act(() => { f.doc.dispatchEvent(new CustomEvent(ACTIVATE, { detail: "board" })); });
  expect(f.doc.activeElement).toBe(f.opener);
  host.open(); const board = f.doc.createElement("button"); f.doc.body.append(board); board.focus();
  TestRenderer.act(() => { f.doc.dispatchEvent(new CustomEvent(ACTIVATE, { detail: "board" })); });
  expect(f.doc.activeElement).toBe(board);
  const remove = vi.spyOn(f.doc.defaultView, "removeEventListener"); host.unmount();
  expect(remove).toHaveBeenCalledWith("keydown", expect.any(Function));
  f.center.open(); escape(f); expect(f.center.getSnapshot().open).toBe(true);
});

it("captures and restores focus before an unbatched navigation subscription can remove the portal", () => {
  const f = fixture(); const host = renderHost(f);
  const setMarker = vi.spyOn(f.doc.documentElement, "setAttribute");
  const focusAtMarker: Array<Node | null> = [];
  setMarker.mockImplementation((key, value) => {
    if (key === ACTIVE) focusAtMarker.push(f.doc.activeElement);
    f.doc.documentElement.attributes.set(key, value);
  });
  f.opener.focus();
  // Outside act: exercise synchronous external-store publication, not React's
  // test batch which can hide subscriber ordering before portal teardown.
  f.center.open();
  expect(focusAtMarker).toEqual([f.opener]);
  expect(f.doc.activeElement?.tag).toBe("h1");
  f.doc.dispatchEvent(new CustomEvent(ACTIVATE, { detail: "board" }));
  expect(f.center.getSnapshot().open).toBe(false);
  expect(f.doc.activeElement).toBe(f.opener);
  host.unmount();
});
