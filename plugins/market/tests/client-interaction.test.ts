// @ts-nocheck
import React from "react";
import TestRenderer from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogEntry } from "../src/catalog.ts";
import { PluginCenterHost } from "../src/client/PluginCenterHost.tsx";
import { PluginCenter } from "../src/client/PluginCenter.tsx";
import { createPluginCenterOpen } from "../src/client/plugin-center-open.ts";
import { Icon } from "../src/client/icons.tsx";
import { en, type MarketKey } from "../src/client/locales.ts";

const { act, create } = TestRenderer;
const entries: CatalogEntry[] = [
  { id: "alpha", name: "Alpha Tools", version: "1.0.0", summary: "Team utilities", tags: ["Collaboration"], kind: "plugin", sourceId: "official", installed: true, installSpec: "alpha-tools" },
  { id: "beta", name: "Beta Memory", version: "2.3.4", summary: "Recall context", tags: ["Memory"], kind: "plugin", sourceId: "official", installed: false, installSpec: "github:example/beta-memory" },
  { id: "gamma", name: "Gamma Memory", version: "1.0.0", summary: "Durable recall", tags: ["Memory"], kind: "plugin", sourceId: "official", installed: true, installSpec: "gamma-memory" },
];
const sources = [
  { id: "official", label: "Xiaotaozi catalog", indexUrl: "https://example.test/market.json", builtin: true },
];

const t = (key: MarketKey): string => en[key];

const installedFor = (rows) => rows.filter(row => row.installed).map(row => ({
  id: `installed:${row.id}-package`, packageName: `${row.id}-package`, name: row.name,
  installSpec: row.installSpec, source: "catalog", catalogEntryId: row.id, version: row.version,
}));
const defaultSlots = { getVersion: () => 0, subscribe: () => () => {}, entriesOfSlot: () => [] };
const mounted = [];
afterEach(async () => { await act(async () => { mounted.splice(0).forEach(view => view.unmount()); }); });
async function renderCenter(options = {}, face = {}) {
  const center = face.center ?? createPluginCenterOpen(); center.open();
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(PluginCenter, {
      center, ctx: { slots: defaultSlots, get: () => undefined }, t, onClose: () => center.close(),
      renderSlot: (_name, _owner, options) => options.fallback, ...face,
    }), options);
    await Promise.resolve();
    await Promise.resolve();
  });
  mounted.push(renderer);
  return renderer;
}
async function renderDiscover(options = {}, face = {}) {
  const renderer = await renderCenter(options, face);
  await act(async () => renderer.root.findByProps({ id: "dsh-market-tab-discover" }).props.onClick());
  return renderer;
}

function cards(renderer) {
  return renderer.root.findAllByProps({ className: "dsh-market-card" });
}

function textOf(node): string {
  return node.children.map((child) => typeof child === "string" ? child : textOf(child)).join("");
}

function deferred() {
  let resolve;
  const promise = new Promise((next) => { resolve = next; });
  return { promise, resolve };
}

function response(payload) {
  return { json: async () => ({ ...payload, ...(payload.entries ? { installedPlugins: installedFor(payload.entries) } : {}) }) };
}

describe("PluginCenter initial visit", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("shows all four built-ins while catalog loads, with installed selected", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const center = createPluginCenterOpen(); center.open();
    const slots = { getVersion: () => 0, subscribe: () => () => {}, entriesOfSlot: () => [] };
    let view;
    await act(async () => { view = create(React.createElement(PluginCenter, {
      center, ctx: { slots, get: () => undefined }, t, onClose: () => center.close(),
      renderSlot: (_name, _owner, options) => options.fallback,
    })); });
    expect(view.root.findAll((node) => node.props['data-capability'] !== undefined)).toHaveLength(4);
    const tabs = view.root.findAllByProps({ role: 'tab' });
    expect(tabs).toHaveLength(2);
    expect(tabs[0].props['aria-selected']).toBe(true);
    expect(view.root.findAllByProps({ 'data-capability': 'models' })).toHaveLength(1);
    expect(JSON.stringify(view.toJSON())).toContain('Temporarily unavailable');
    expect(JSON.stringify(view.toJSON())).toContain(en.doctorHint);
    expect(JSON.stringify(view.toJSON())).toContain(t('loading'));
    expect(JSON.stringify(view.toJSON())).not.toContain('No third-party plugins installed.');
    await act(async () => view.unmount());
  });
});

describe("market discovery controls", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (input) => ({
      json: async () => String(input).endsWith("/intents")
        ? { ok: true, intents: [] }
        : { ok: true, allowThirdPartySources: false, sources, installedPlugins: installedFor(entries), entries },
    })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("filters catalog entries as the user types", async () => {
    const renderer = await renderDiscover();
    const search = renderer.root.findByProps({ id: "dsh-market-search" });

    await act(async () => search.props.onChange({ target: { value: "alpha" } }));

    expect(cards(renderer).map(textOf).join(" ")).toContain("Alpha Tools");
    expect(cards(renderer).map(textOf).join(" ")).not.toContain("Beta Memory");
  });

  it("keeps labelled search and category controls before the discovery grid", async () => {
    const renderer = await renderDiscover();
    const search = renderer.root.findByProps({ id: "dsh-market-search" });
    const label = renderer.root.findByProps({ htmlFor: "dsh-market-search" });
    const pressed = renderer.root.findAll((node) => node.type === "button" && node.props["aria-pressed"] !== undefined);
    const memory = pressed.find((node) => textOf(node) === "Memory");
    const hostNodes = renderer.root.findAll((node) => typeof node.type === "string");
    const grid = renderer.root.findByProps({ className: "dsh-market-grid" });

    expect(textOf(label)).toBe(en.searchLabel);
    expect(pressed.find((node) => textOf(node) === en.allTags)?.props["aria-pressed"]).toBe(true);
    expect(memory?.props["aria-pressed"]).toBe(false);
    expect(hostNodes.indexOf(search)).toBeLessThan(hostNodes.indexOf(memory));
    expect(hostNodes.indexOf(memory)).toBeLessThan(hostNodes.indexOf(grid));

    await act(async () => memory.props.onClick());
    expect(cards(renderer)).toHaveLength(2);
    expect(cards(renderer).map(textOf).join(" ")).toContain("Gamma Memory");
  });

  it("explains empty matches and resets every discovery control", async () => {
    const renderer = await renderDiscover();
    const pressedButton = (label: string) => renderer.root
      .findAll((node) => node.type === "button" && node.props["aria-pressed"] !== undefined)
      .find((node) => textOf(node) === label);
    const search = renderer.root.findByProps({ id: "dsh-market-search" });

    await act(async () => pressedButton("Memory").props.onClick());
    expect(cards(renderer)).toHaveLength(2);
    expect(cards(renderer).map(textOf).join(" ")).toContain("Gamma Memory");

    await act(async () => search.props.onChange({ target: { value: "missing" } }));

    const empty = renderer.root.findByProps({ className: "dsh-market-empty" });
    expect(textOf(empty)).toContain(en.empty);
    expect(textOf(empty.findByType("button"))).toBe(en.resetFilters);
    expect(textOf(empty.findByType("button"))).not.toBe(en.allTags);

    await act(async () => empty.findByType("button").props.onClick());

    expect(renderer.root.findByProps({ id: "dsh-market-search" }).props.value).toBe("");
    expect(pressedButton(en.allTags).props["aria-pressed"]).toBe(true);
    expect(pressedButton("Memory").props["aria-pressed"]).toBe(false);
    expect(pressedButton(en.installed)).toBeUndefined();
    expect(cards(renderer)).toHaveLength(entries.length);
  });

  it("keeps catalog cards concise with a labelled source and sibling action", async () => {
    const renderer = await renderDiscover();
    const beta = cards(renderer).find((card) => textOf(card).includes("Beta Memory"));
    const alpha = cards(renderer).find((card) => textOf(card).includes("Alpha Tools"));
    const cardText = textOf(beta);
    const buttons = beta.findAllByType("button");

    expect(cardText).toContain("Beta Memory");
    expect(cardText).toContain("Recall context");
    expect(cardText).toContain("Xiaotaozi catalog");
    expect(cardText).toContain(en.install);
    expect(cardText).not.toContain("2.3.4");
    expect(cardText).not.toContain(en.kindPlugin);
    expect(buttons).toHaveLength(2);
    expect(buttons[0].parent).toBe(beta);
    expect(buttons[1].parent).toBe(beta);
    expect(textOf(alpha)).toContain(en.installed);
    expect(alpha.findAllByType("button")).toHaveLength(1);
  });

  it("keeps every market action outside other buttons and labels structural SVG controls", async () => {
    const view = await renderCenter();
    const assertActions = () => {
      for (const button of view.root.findAllByType("button")) {
        for (let parent = button.parent; parent; parent = parent.parent) {
          expect(parent.type).not.toBe("button");
          expect(parent.props.role).not.toBe("button");
        }
        expect(button.props["aria-label"] || textOf(button)).not.toBe("");
      }
      for (const svg of view.root.findAllByType("svg")) expect(svg.props["aria-hidden"]).toBe("true");
      expect(textOf(view.root)).not.toMatch(/[×‹]/);
    };
    assertActions();
    await act(async () => view.root.findByProps({ "data-capability": "models" }).props.onClick());
    assertActions();
    await act(async () => view.root.findByProps({ id: "dsh-market-tab-discover" }).props.onClick());
    assertActions();
    await act(async () => view.root.findByProps({ "aria-label": `${en.openDetails}: Alpha Tools` }).props.onClick());
    assertActions();
    await act(async () => view.root.findByProps({ className: "dsh-market-install" }).props.onClick());
    assertActions();
  });

  it("identifies npm install details without Git or official claims", async () => {
    const renderer = await renderDiscover();
    const alpha = cards(renderer).find((card) => textOf(card).includes("Alpha Tools"));

    await act(async () => alpha.findByProps({ className: "dsh-market-card-open" }).props.onClick());

    const detail = renderer.root.findByProps({ className: "dsh-market-detail" });
    const detailText = textOf(detail);
    const code = detail.findAllByType("code").map(textOf);
    expect(detailText).toContain(en.upstreamNpm);
    expect(code).toContain("alpha-tools");
    expect(code).not.toContain("dsh plugin --profile web add alpha-tools");
    expect(detailText).toContain(en.catalogVersion);
    expect(detailText).not.toContain(en.upstreamGit);
    expect(detailText).not.toContain(en.official);
  });

  it("moves exact install and transparent risk information into detail", async () => {
    const renderer = await renderDiscover();
    const beta = cards(renderer).find((card) => textOf(card).includes("Beta Memory"));

    await act(async () => beta.findByProps({ className: "dsh-market-card-open" }).props.onClick());

    const detail = renderer.root.findByProps({ className: "dsh-market-detail" });
    const detailText = textOf(detail);
    const risk = renderer.root.findByProps({ className: "dsh-market-risk" });

    expect(detailText).toContain("Recall context");
    expect(detailText).toContain("v2.3.4");
    expect(detailText).toContain("Xiaotaozi catalog");
    expect(detailText).toContain("github:example/beta-memory");
    expect(detailText).toContain("dsh plugin --profile web add github:example/beta-memory");
    expect(detailText).toContain(en.upstreamGit);
    expect(textOf(risk)).toContain(en.bundledSourceRisk);
    expect(textOf(risk)).toContain(en.compatibilityUndeclared);
    expect(renderer.root.findByProps({ className: "dsh-market-detail-name" }).props.tabIndex).toBe(-1);
  });
});

describe("install lifecycle presentation", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows every loaded pending intent as queued without claiming active host progress", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input) => response(String(input).endsWith("/intents")
      ? { ok: true, intents: [
        { requestId: "queued-alpha", entryId: "alpha", sourceId: "official", action: "remove", requestedAt: "2026-09-01T00:00:00.000Z", status: "pending" },
        { requestId: "queued-beta", entryId: "beta", sourceId: "official", action: "install", requestedAt: "2026-09-01T00:00:01.000Z", status: "pending" },
      ] }
      : { ok: true, allowThirdPartySources: false, sources, installedPlugins: installedFor(entries), entries })));

    const renderer = await renderDiscover();
    const alpha = cards(renderer).find((card) => textOf(card).includes("Alpha Tools"));
    const beta = cards(renderer).find((card) => textOf(card).includes("Beta Memory"));

    expect(textOf(alpha)).toContain(en.queued);
    expect(textOf(beta)).toContain(en.queued);
    expect(textOf(beta)).not.toContain(en.installing);
    expect(beta.findByProps({ className: "dsh-market-get" }).props.disabled).toBe(true);
    const announcer = renderer.root.findByProps({ className: "dsh-market-announcer" });
    expect(announcer.props.role).toBe("status");
    expect(announcer.props["aria-live"]).toBe("polite");
    expect(textOf(announcer)).toContain(`Alpha Tools: ${en.queued}`);
    expect(textOf(announcer)).toContain(`Beta Memory: ${en.queued}`);
  });

  it("shows installing, transient completion, then durable installed truth", async () => {
    vi.useFakeTimers();
    const install = deferred();
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      if (init?.method === "POST") return response(await install.promise);
      return response(String(input).endsWith("/intents")
        ? { ok: true, intents: [] }
        : { ok: true, allowThirdPartySources: false, sources, installedPlugins: installedFor(entries), entries });
    }));
    const renderer = await renderDiscover();
    const installButton = cards(renderer).find((card) => textOf(card).includes("Beta Memory")).findByProps({ className: "dsh-market-get" });

    await act(async () => installButton.props.onClick());

    expect(textOf(cards(renderer).find((card) => textOf(card).includes("Beta Memory")))).toContain(en.installing);
    expect(textOf(renderer.root.findByProps({ className: "dsh-market-announcer" }))).toContain(`Beta Memory: ${en.installing}`);

    await act(async () => install.resolve({
      ok: true,
      intents: [],
      allowThirdPartySources: false,
      sources,
      installedPlugins: [],
      entries: entries.map((entry) => entry.id === "beta" ? { ...entry, installed: true } : entry),
    }));

    expect(textOf(renderer.root.findByProps({ className: "dsh-market-detail" }))).toContain(en.installCompleted);
    expect(textOf(renderer.root.findByProps({ className: "dsh-market-announcer" }))).toContain(`Beta Memory: ${en.installCompleted}`);

    await act(async () => vi.runAllTimers());

    const beta = renderer.root.findByProps({ className: "dsh-market-detail" });
    expect(textOf(beta)).toContain(en.installed);
    expect(textOf(beta)).not.toContain(en.installCompleted);
  });

  it("treats an applied mutation with cleanup failure as completed but not retryable", async () => {
    const cleanupError = "Plugin install completed, but intent cleanup failed. Do not retry the plugin mutation until the state file is repaired.";
    let catalogLoads = 0;
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      if (init?.method === "POST") return response({
        ok: false,
        error: cleanupError,
        mutationApplied: true,
        intents: [],
      });
      if (String(input).endsWith("/intents")) return response({ ok: true, intents: [] });
      catalogLoads += 1;
      return response({
        ok: true,
        allowThirdPartySources: false,
        sources,
        installedPlugins: [],
        entries: catalogLoads === 1
          ? entries
          : entries.map((entry) => entry.id === "beta" ? { ...entry, installed: true } : entry),
      });
    }));
    const renderer = await renderDiscover();

    await act(async () => cards(renderer).find((card) => textOf(card).includes("Beta Memory")).findByProps({ className: "dsh-market-get" }).props.onClick());

    const beta = cards(renderer).find((card) => textOf(card).includes("Beta Memory"));
    expect(catalogLoads).toBe(2);
    expect(textOf(beta)).toContain(en.installCompleted);
    expect(beta.findAllByProps({ className: "dsh-market-get" })).toHaveLength(0);
    expect(textOf(renderer.root.findByProps({ className: "dsh-market-announcer" }))).toContain(cleanupError);
    expect(textOf(renderer.root.findByProps({ className: "dsh-market-announcer" }))).toContain(`Beta Memory: ${en.installCompleted}`);
  });

  it("keeps failure and retry ownership on the failed entry", async () => {
    const retry = deferred();
    let posts = 0;
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      if (init?.method === "POST") {
        posts += 1;
        if (posts === 1) return response({
          ok: false,
          error: "disk full",
          intents: [],
          allowThirdPartySources: false,
          sources,
          installedPlugins: [],
          entries,
        });
        return response(await retry.promise);
      }
      return response(String(input).endsWith("/intents")
        ? { ok: true, intents: [] }
        : { ok: true, allowThirdPartySources: false, sources, installedPlugins: installedFor(entries), entries });
    }));
    const renderer = await renderDiscover();

    await act(async () => cards(renderer).find((card) => textOf(card).includes("Beta Memory")).findByProps({ className: "dsh-market-get" }).props.onClick());

    const betaFailed = cards(renderer).find((card) => textOf(card).includes("Beta Memory"));
    const alpha = cards(renderer).find((card) => textOf(card).includes("Alpha Tools"));
    expect(textOf(betaFailed)).toContain(en.installFailed);
    const failedChip = betaFailed.findByProps({ "data-status": "failed" });
    expect({
      kind: failedChip.props["data-kind"],
      tone: failedChip.props["data-tone"],
      icon: failedChip.findByType(Icon).props.name,
    }).toEqual({ kind: "failed", tone: "danger", icon: "close" });
    expect(textOf(betaFailed.findByProps({ className: "dsh-market-get" }))).toBe(en.retry);
    expect(textOf(alpha)).not.toContain(en.installFailed);
    expect(textOf(renderer.root.findByProps({ className: "dsh-market-announcer" }))).toContain("Beta Memory: disk full");

    await act(async () => betaFailed.findByProps({ className: "dsh-market-get" }).props.onClick());

    expect(textOf(cards(renderer).find((card) => textOf(card).includes("Beta Memory")))).toContain(en.retryingInstall);
    expect(textOf(cards(renderer).find((card) => textOf(card).includes("Alpha Tools")))).not.toContain(en.retryingInstall);
    expect(textOf(renderer.root.findByProps({ className: "dsh-market-announcer" }))).toContain(`Beta Memory: ${en.retryingInstall}`);
    expect(renderer.root.findAllByProps({ role: "alert" })).toHaveLength(0);

    await act(async () => retry.resolve({
      ok: true,
      intents: [],
      allowThirdPartySources: false,
      sources,
      installedPlugins: [],
      entries: entries.map((entry) => entry.id === "beta" ? { ...entry, installed: true } : entry),
    }));

    expect(textOf(renderer.root.findByProps({ className: "dsh-market-detail" }))).toContain(en.installCompleted);
    expect(renderer.root.findAllByProps({ role: "alert" })).toHaveLength(0);
  });

  it("retries the owned failed action even if a later snapshot changes installed truth", async () => {
    vi.stubGlobal("requestAnimationFrame", (callback) => { callback(); return 0; });
    vi.stubGlobal("document", { getElementById: () => null });
    const postedActions: string[] = [];
    let posts = 0;
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      if (init?.method === "POST") {
        posts += 1;
        postedActions.push(JSON.parse(String(init.body)).action);
        if (posts === 1) return response({
          ok: false,
          error: "disk full",
          intents: [],
          allowThirdPartySources: false,
          sources,
          installedPlugins: [],
          entries,
        });
        if (posts === 2) return response({
          ok: true,
          intents: [],
          allowThirdPartySources: false,
          sources,
          installedPlugins: [],
          entries: entries.map((entry) => entry.id === "alpha"
            ? { ...entry, installed: false }
            : entry.id === "beta" ? { ...entry, installed: true } : entry),
        });
        return response({
          ok: true,
          intents: [],
          allowThirdPartySources: false,
          sources,
          installedPlugins: [],
          entries: entries.map((entry) => entry.id === "beta" ? { ...entry, installed: true } : entry),
        });
      }
      return response(String(input).endsWith("/intents")
        ? { ok: true, intents: [] }
        : { ok: true, allowThirdPartySources: false, sources, installedPlugins: installedFor(entries), entries });
    }));
    const renderer = await renderDiscover();

    await act(async () => cards(renderer).find((card) => textOf(card).includes("Beta Memory")).findByProps({ className: "dsh-market-get" }).props.onClick());
    const alpha = cards(renderer).find((card) => textOf(card).includes("Alpha Tools"));
    await act(async () => alpha.findByProps({ className: "dsh-market-card-open" }).props.onClick());
    await act(async () => renderer.root.findByProps({ className: "dsh-market-install" }).props.onClick());
    await act(async () => renderer.root.findByProps({ className: "dsh-market-confirm-remove" }).props.onClick());
    await act(async () => renderer.root.findByProps({ id: "dsh-market-tab-discover" }).props.onClick());
    const beta = cards(renderer).find((card) => textOf(card).includes("Beta Memory"));
    await act(async () => beta.findByProps({ className: "dsh-market-card-open" }).props.onClick());

    const detail = renderer.root.findByProps({ className: "dsh-market-detail" });
    expect(textOf(detail)).toContain(en.installFailed);
    expect(textOf(detail.findByProps({ className: "dsh-market-install" }))).toContain(en.retry);

    await act(async () => detail.findByProps({ className: "dsh-market-install" }).props.onClick());

    expect(postedActions).toEqual(["install", "remove", "install"]);
  });

  it("requires an accessible confirmation before removing", async () => {
    let posts = 0;
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      if (init?.method === "POST") {
        posts += 1;
        return response({ ok: true, intents: [], allowThirdPartySources: false, sources, installedPlugins: installedFor(entries), entries });
      }
      return response(String(input).endsWith("/intents")
        ? { ok: true, intents: [] }
        : { ok: true, allowThirdPartySources: false, sources, installedPlugins: installedFor(entries), entries });
    }));
    const renderer = await renderDiscover();
    const alpha = cards(renderer).find((card) => textOf(card).includes("Alpha Tools"));
    await act(async () => alpha.findByProps({ className: "dsh-market-card-open" }).props.onClick());

    await act(async () => renderer.root.findByProps({ className: "dsh-market-install" }).props.onClick());

    expect(posts).toBe(0);
    const confirmation = renderer.root.findByProps({ role: "alertdialog" });
    const backdrop = renderer.root.findByProps({ className: "dsh-market-confirm-overlay" });
    for (const handler of ["onClick", "onMouseDown", "onPointerDown"]) expect(backdrop.props[handler]).toBeUndefined();
    expect(confirmation.props["aria-modal"]).toBe("true");
    expect(confirmation.props["aria-labelledby"]).toBe("dsh-market-remove-title");
    expect(confirmation.props["aria-describedby"]).toBe("dsh-market-remove-description");
    expect(textOf(confirmation)).toContain("Alpha Tools");

    await act(async () => confirmation.find((node) => node.props.className?.includes("dsh-market-confirm-cancel")).props.onClick());
    expect(posts).toBe(0);
    expect(renderer.root.findAllByProps({ role: "alertdialog" })).toHaveLength(0);

    await act(async () => renderer.root.findByProps({ className: "dsh-market-install" }).props.onClick());
    await act(async () => renderer.root.findByProps({ className: "dsh-market-confirm-remove" }).props.onClick());
    expect(posts).toBe(1);
  });

  it("contains confirmation keys and focuses Installed heading after confirm", async () => {
    const listeners = {};
    const fakeDocument = {
      body: {}, documentElement: { setAttribute() {}, removeAttribute() {} },
      querySelector: () => null, dispatchEvent: () => true,
      activeElement: undefined,
      addEventListener: (type, listener) => { listeners[type] = listener; },
      removeEventListener: (type, listener) => { if (listeners[type] === listener) delete listeners[type]; },
      getElementById: () => null,
    };
    const focusNode = (id) => ({
      id,
      hidden: false,
      isConnected: true,
      tabIndex: 0,
      getAttribute: () => null,
      focus() {
        fakeDocument.activeElement = this;
        listeners.focusin?.({ target: this, preventDefault: vi.fn(), stopPropagation: vi.fn() });
      },
    });
    const trigger = focusNode("trigger");
    const heading = focusNode("heading");
    const installedHeading = focusNode("installed-heading");
    const cancel = focusNode("cancel");
    const confirm = focusNode("confirm");
    const dialog = {
      ...focusNode("dialog"),
      ownerDocument: fakeDocument,
      contains: (node) => node === dialog || node === cancel || node === confirm,
      querySelectorAll: () => [cancel, confirm],
    };
    vi.stubGlobal("document", fakeDocument);
    const hostWindow = new EventTarget();
    vi.stubGlobal("window", hostWindow);
    vi.stubGlobal("MutationObserver", class { observe() {} disconnect() {} });
    const center = createPluginCenterOpen(); center.open();
    let host;
    await act(async () => { host = create(React.createElement(PluginCenterHost, {
      center, ctx: {}, t, renderSlot: () => null, renderPage: () => null,
    })); });
    mounted.push(host);
    vi.stubGlobal("fetch", vi.fn(async (input, init) => response(init?.method === "POST"
      ? { ok: true, intents: [], allowThirdPartySources: false, sources, installedPlugins: installedFor(entries), entries }
      : String(input).endsWith("/intents")
        ? { ok: true, intents: [] }
        : { ok: true, allowThirdPartySources: false, sources, installedPlugins: installedFor(entries), entries })));
    const renderer = await renderDiscover({
      createNodeMock: (element) => {
        const className = element.props.className ?? "";
        if (className === "dsh-market-install") return trigger;
        if (className === "dsh-market-detail-name") return heading;
        if (element.type === "h2" && element.props.children === en.tabInstalled) return installedHeading;
        if (className === "dsh-market-confirm") return dialog;
        if (className.includes("dsh-market-confirm-cancel")) return cancel;
        if (className === "dsh-market-confirm-remove") return confirm;
        return focusNode(className);
      },
    }, { center });
    const alpha = cards(renderer).find((card) => textOf(card).includes("Alpha Tools"));
    await act(async () => alpha.findByProps({ className: "dsh-market-card-open" }).props.onClick());
    await act(async () => renderer.root.findByProps({ className: "dsh-market-install" }).props.onClick());

    expect(fakeDocument.activeElement).toBe(cancel);
    fakeDocument.activeElement = confirm;
    const tabEvent = { key: "Tab", shiftKey: false, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    listeners.keydown(tabEvent);
    expect(tabEvent.preventDefault).toHaveBeenCalledOnce();
    expect(tabEvent.stopPropagation).toHaveBeenCalledOnce();
    expect(fakeDocument.activeElement).toBe(cancel);

    const escapeEvent = new Event("keydown", { cancelable: true });
    Object.defineProperty(escapeEvent, "key", { value: "Escape" });
    vi.spyOn(escapeEvent, "preventDefault"); vi.spyOn(escapeEvent, "stopPropagation");
    await act(async () => listeners.keydown(escapeEvent));
    expect(escapeEvent.preventDefault).toHaveBeenCalledOnce();
    expect(escapeEvent.stopPropagation).toHaveBeenCalledOnce();
    expect(renderer.root.findAllByProps({ role: "alertdialog" })).toHaveLength(0);
    expect(fakeDocument.activeElement).toBe(trigger);
    await act(async () => hostWindow.dispatchEvent(escapeEvent));
    expect(center.getSnapshot().open).toBe(true);

    await act(async () => renderer.root.findByProps({ className: "dsh-market-install" }).props.onClick());
    await act(async () => renderer.root.findByProps({ className: "dsh-market-confirm-remove" }).props.onClick());
    expect(fakeDocument.activeElement).toBe(installedHeading);
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    await act(async () => { renderer.unmount(); host.unmount(); });
  });

  it("announces truthful remove progress and completion", async () => {
    const removal = deferred();
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      if (init?.method === "POST") return response(await removal.promise);
      return response(String(input).endsWith("/intents")
        ? { ok: true, intents: [] }
        : { ok: true, allowThirdPartySources: false, sources, installedPlugins: installedFor(entries), entries });
    }));
    const renderer = await renderDiscover();
    const alpha = cards(renderer).find((card) => textOf(card).includes("Alpha Tools"));
    await act(async () => alpha.findByProps({ className: "dsh-market-card-open" }).props.onClick());

    await act(async () => renderer.root.findByProps({ className: "dsh-market-install" }).props.onClick());
    await act(async () => renderer.root.findByProps({ className: "dsh-market-confirm-remove" }).props.onClick());

    expect(textOf(renderer.root.findByProps({ className: "dsh-market-detail" }))).toContain(en.removing);
    expect(textOf(renderer.root.findByProps({ className: "dsh-market-announcer" }))).toContain(`Alpha Tools: ${en.removing}`);

    await act(async () => removal.resolve({
      ok: true,
      intents: [],
      allowThirdPartySources: false,
      sources,
      installedPlugins: [],
      entries: entries.map((entry) => entry.id === "alpha" ? { ...entry, installed: false } : entry),
    }));

    expect(renderer.root.findAllByProps({ className: "dsh-market-detail" })).toHaveLength(0);
    expect(renderer.root.findByProps({ id: "dsh-market-tab-installed" }).props["aria-selected"]).toBe(true);
    expect(textOf(renderer.root.findByProps({ className: "dsh-market-announcer" }))).toContain(`Alpha Tools: ${en.removeCompleted}`);
  });
});

describe("PluginCenter failure boundaries and navigation", () => {
  afterEach(() => vi.unstubAllGlobals());
  const catalog = { ok: true, sources, entries, installedPlugins: installedFor(entries), allowThirdPartySources: false };
  const serve = (handler = () => undefined) => vi.stubGlobal("fetch", vi.fn(async (input, init) => {
    const value = await handler(input, init);
    return value ?? response(String(input).endsWith("/intents") ? { ok: true, intents: [] } : catalog);
  }));
  const open = async (view, name) => act(async () => view.root.findByProps({ "aria-label": `${en.openDetails}: ${name}` }).props.onClick());

  it("keeps built-ins viewable after catalog failure and distinguishes retry/loading/empty", async () => {
    let fail = true;
    serve((input) => String(input).endsWith("/catalog")
      ? { json: async () => fail ? { ok: false, error: "profile unreadable" } : { ...catalog, entries: [], installedPlugins: [] } }
      : undefined);
    const view = await renderCenter();
    expect(view.root.findAll((node) => node.props["data-capability"] !== undefined)).toHaveLength(4);
    expect(textOf(view.root)).toContain("profile unreadable");
    expect(textOf(view.root)).not.toContain(en.installedEmpty);
    await act(async () => view.root.findByProps({ "data-capability": "models" }).props.onClick());
    expect(textOf(view.root)).toContain(en.doctorHint);
    await act(async () => view.root.findByProps({ className: "dsh-market-back" }).props.onClick());
    fail = false;
    await act(async () => view.root.findByProps({ "data-retry": "catalog" }).props.onClick());
    expect(textOf(view.root)).toContain(en.installedEmpty);
    expect(textOf(view.root)).not.toContain("profile unreadable");
  });

  it("uses live slot winners and falls back after the selected winner abdicates", async () => {
    serve();
    let winners = [{ options: { key: "models" } }]; let version = 0; let notify;
    const slots = { getVersion: () => version, subscribe: (_slot, fn) => { notify = fn; return () => { notify = undefined; }; }, entriesOfSlot: () => winners };
    const renderSlot = vi.fn((_name, _owner, options) => winners.length ? React.createElement("p", { role: "status" }, "Models contribution") : options.fallback);
    const view = await renderCenter({}, { ctx: { slots, get: () => undefined }, renderSlot });
    expect(textOf(view.root.findByProps({ "data-capability": "models" }))).not.toContain(en.unavailable);
    await act(async () => view.root.findByProps({ "data-capability": "models" }).props.onClick());
    expect(renderSlot).toHaveBeenLastCalledWith("xiaotaozi.plugin-center.detail", {}, expect.objectContaining({ entryKey: "models" }));
    expect(view.root.findAllByProps({ className: "dsh-market-announcer" })).toHaveLength(0);
    expect(view.root.findAllByProps({ role: "status" })).toHaveLength(1);
    expect(textOf(view.root)).toContain("Models contribution");
    await act(async () => { winners = []; version++; notify(); });
    expect(textOf(view.root)).toContain(en.unavailable);
    expect(textOf(view.root)).not.toContain("Models contribution");
    expect(textOf(view.root)).toContain(en.doctorHint);
    const status = view.root.findAllByProps({ role: "status" });
    expect(status).toHaveLength(1);
    expect(status[0].props["aria-live"]).toBe("polite");
    expect(status[0].props["aria-atomic"]).toBe("true");
    await act(async () => view.root.findByProps({ className: "dsh-market-back" }).props.onClick());
    expect(textOf(view.root.findByProps({ "data-capability": "models" }))).toContain(en.unavailable);
  });

  it("loads optional inventory lazily once and rejection keeps installed truth and removal", async () => {
    serve(); const list = vi.fn(async () => { throw Error("offline"); });
    const center = createPluginCenterOpen(); center.open();
    center.navigate({ tab: "discover", query: "", tag: "", scrollTop: 0 });
    const view = await renderCenter({}, { center, ctx: { slots: defaultSlots, get: () => ({ pluginInventory: { list } }) } });
    expect(list).not.toHaveBeenCalled();
    await act(async () => view.root.findByProps({ id: "dsh-market-tab-installed" }).props.onClick());
    expect(list).toHaveBeenCalledOnce();
    await open(view, "Alpha Tools");
    expect(textOf(view.root)).toContain(en.runtimeUnknown);
    expect(view.root.findByProps({ className: "dsh-market-install" }).props.disabled).toBe(false);
    expect(textOf(view.root)).not.toContain(en.configure);
    await act(async () => view.root.findByProps({ className: "dsh-market-back" }).props.onClick());
    expect(list).toHaveBeenCalledOnce();
  });

  it("selects and focuses keyboard tabs, keeps both panels, and ignores composition", async () => {
    serve(); const focus = { installed: vi.fn(), discover: vi.fn() };
    const view = await renderCenter({ createNodeMock: element => element.props.role === "tab" ? { focus: focus[element.props.id.endsWith("installed") ? "installed" : "discover"] } : null });
    const key = async (tab, value, composing = false) => act(async () => view.root.findByProps({ id: `dsh-market-tab-${tab}` }).props.onKeyDown({ key: value, nativeEvent: { isComposing: composing }, preventDefault: vi.fn() }));
    const assertTabs = () => {
      const tabs = view.root.findAllByProps({ role: "tab" });
      expect(tabs.filter(tab => tab.props["aria-selected"])).toHaveLength(1);
      expect(tabs.filter(tab => tab.props.tabIndex === 0)).toHaveLength(1);
      for (const tab of tabs) {
        expect(tab.props.tabIndex).toBe(tab.props["aria-selected"] ? 0 : -1);
        const panel = view.root.findByProps({ id: tab.props["aria-controls"] });
        expect(panel.props.role).toBe("tabpanel");
        expect(panel.props["aria-labelledby"]).toBe(tab.props.id);
        expect(panel.props.hidden).toBe(!tab.props["aria-selected"]);
      }
    };
    expect(view.root.findAllByProps({ role: "tabpanel" })).toHaveLength(2);
    assertTabs();
    await key("installed", "End", true);
    expect(view.root.findByProps({ id: "dsh-market-tab-installed" }).props["aria-selected"]).toBe(true);
    for (const [from, keyName, to] of [["installed", "End", "discover"], ["discover", "Home", "installed"], ["installed", "ArrowLeft", "discover"], ["discover", "ArrowRight", "installed"]]) {
      await key(from, keyName);
      expect(view.root.findByProps({ id: `dsh-market-tab-${to}` }).props.tabIndex).toBe(0);
      expect(view.root.findByProps({ id: `dsh-market-panel-${from}` }).props.hidden).toBe(true);
      expect(focus[to]).toHaveBeenCalled();
      assertTabs();
    }
  });

  it("restores Back query, tag, actual scroll and original card focus without scrolling", async () => {
    serve(); const scroller = { scrollTop: 0 }; const focus = vi.fn();
    const view = await renderDiscover({ createNodeMock: element => element.props.className === "dsh-market-center-scroll" ? scroller : element.props.id === "dsh-market-card-beta" ? { focus } : null });
    await act(async () => view.root.findByProps({ id: "dsh-market-search" }).props.onChange({ target: { value: "beta" } }));
    await act(async () => view.root.findAllByProps({ className: "dsh-market-tag" }).find(n => textOf(n) === "Memory").props.onClick());
    scroller.scrollTop = 275;
    await open(view, "Beta Memory");
    expect(scroller.scrollTop).toBe(0);
    await act(async () => view.root.findByProps({ className: "dsh-market-back" }).props.onClick());
    expect(scroller.scrollTop).toBe(275);
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
    expect(view.root.findByProps({ id: "dsh-market-search" }).props.value).toBe("beta");
    expect(view.root.findAllByProps({ className: "dsh-market-tag" }).find(n => textOf(n) === "Memory").props["aria-pressed"]).toBe(true);
    await act(async () => view.root.findByProps({ id: "dsh-market-tab-installed" }).props.onClick());
    await act(async () => view.root.findByProps({ id: "dsh-market-tab-discover" }).props.onClick());
    expect(view.root.findByProps({ id: "dsh-market-search" }).props.value).toBe("beta");
  });

  it("restores the current Discover filters and scroll after direct card installation", async () => {
    const pending = deferred();
    serve((_input, init) => init?.method === "POST" ? pending.promise : undefined);
    const scroller = { scrollTop: 0 };
    const view = await renderDiscover({ createNodeMock: element => element.props.className === "dsh-market-center-scroll" ? scroller : null });
    await act(async () => view.root.findByProps({ id: "dsh-market-search" }).props.onChange({ target: { value: "memory" } }));
    await act(async () => view.root.findAllByProps({ className: "dsh-market-tag" }).find(n => textOf(n) === "Memory").props.onClick());
    await act(async () => view.root.findByProps({ "aria-label": `${en.install}: Beta Memory` }).props.onClick());
    await act(async () => view.root.findByProps({ id: "dsh-market-search" }).props.onChange({ target: { value: "beta" } }));
    scroller.scrollTop = 275;
    await act(async () => pending.resolve(response({ ...catalog, intents: [], entries: entries.map(e => e.id === "beta" ? { ...e, installed: true } : e) })));
    expect(view.root.findByProps({ id: "dsh-market-tab-installed" }).props["aria-selected"]).toBe(true);
    expect(textOf(view.root.findByProps({ className: "dsh-market-detail" }))).toContain("Beta Memory");
    scroller.scrollTop = 0;
    await act(async () => view.root.findByProps({ id: "dsh-market-tab-discover" }).props.onClick());
    expect(view.root.findByProps({ id: "dsh-market-search" }).props.value).toBe("beta");
    expect(view.root.findAllByProps({ className: "dsh-market-tag" }).find(n => textOf(n) === "Memory").props["aria-pressed"]).toBe(true);
    expect(scroller.scrollTop).toBe(275);
    expect(cards(view)).toHaveLength(1);
  });

  it.each([false, true])("ignores an older retry catalog after completed install (applied warning=%s)", async (appliedWarning) => {
    const staleCatalog = deferred();
    let catalogReads = 0; let intentReads = 0;
    const installedCatalog = { ...catalog, entries: entries.map(e => e.id === "beta" ? { ...e, installed: true } : e) };
    const warning = "Plugin installed but profile projection failed";
    serve((input, init) => {
      if (init?.method === "POST") return response(appliedWarning
        ? { ok: false, mutationApplied: true, intents: [], error: warning }
        : { ...installedCatalog, intents: [] });
      if (String(input).endsWith("/intents")) return response(++intentReads === 1
        ? { ok: false, error: "intents unreadable" } : { ok: true, intents: [] });
      if (String(input).endsWith("/catalog")) {
        catalogReads++;
        return catalogReads === 2 ? staleCatalog.promise : response(catalogReads === 1 ? catalog : installedCatalog);
      }
    });
    const view = await renderDiscover();
    expect(view.root.findByProps({ "aria-label": `${en.install}: Beta Memory` }).props.disabled).toBe(true);
    await act(async () => view.root.findByProps({ "data-retry": "intents" }).props.onClick());
    await open(view, "Beta Memory");
    expect(view.root.findByProps({ className: "dsh-market-install" }).props.disabled).toBe(false);
    await act(async () => view.root.findByProps({ className: "dsh-market-install" }).props.onClick());
    const assertInstalled = () => {
      expect(textOf(view.root.findByProps({ className: "dsh-market-detail" }))).toContain("Beta Memory");
      expect(textOf(view.root.findByProps({ className: "dsh-market-install" }))).toBe(en.remove);
      expect(view.root.findByProps({ className: "dsh-market-install" }).props.disabled).toBe(false);
      if (appliedWarning) expect(textOf(view.root)).toContain(warning);
      expect(view.root.findAllByProps({ "data-retry": "applied" })).toHaveLength(0);
    };
    assertInstalled();
    await act(async () => staleCatalog.resolve(response(catalog)));
    assertInstalled();
    await act(async () => view.root.findByProps({ id: "dsh-market-tab-discover" }).props.onClick());
    expect(view.root.findAllByProps({ "aria-label": `${en.install}: Beta Memory` })).toHaveLength(0);
    expect(view.root.findAllByProps({ "aria-label": `${en.retry}: Beta Memory` })).toHaveLength(0);
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("blocks mutations on intents failure but preserves browsing and supplied configuration until retry succeeds", async () => {
    let fail = true;
    serve((input) => String(input).endsWith("/intents") ? response(fail ? { ok: false, error: "intents unreadable" } : { ok: true, intents: [] }) : undefined);
    const slots = { ...defaultSlots, entriesOfSlot: () => [{ options: { key: "alpha-package" } }] };
    const view = await renderCenter({}, { ctx: { slots, get: () => undefined }, renderSlot: () => React.createElement("button", {}, "Plugin-owned configuration") });
    await open(view, "Alpha Tools");
    const mutation = view.root.findByProps({ className: "dsh-market-install" });
    expect(mutation.props.disabled).toBe(true);
    await act(async () => mutation.props.onClick());
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
    expect(textOf(view.root)).toContain("Plugin-owned configuration");
    expect(textOf(view.root)).toContain("intents unreadable");
    fail = false;
    await act(async () => view.root.findByProps({ "data-retry": "intents" }).props.onClick());
    expect(view.root.findByProps({ className: "dsh-market-install" }).props.disabled).toBe(false);
    await act(async () => view.root.findByProps({ className: "dsh-market-back" }).props.onClick());
    expect(view.root.findAllByProps({ className: "dsh-market-detail" })).toHaveLength(0);
  });

  it.each([false, true])("preserves applied warning/no snapshot through failed reads and refresh only (cleanup=%s)", async (cleanup) => {
    let reads = 0; let repaired = false;
    const warning = cleanup ? "Plugin installed but cleanup failed" : "Plugin installed but profile projection failed";
    serve((input, init) => {
      if (init?.method === "POST") return response({ ok: false, mutationApplied: true, intents: [], error: warning });
      if (String(input).endsWith("/catalog")) {
        reads++;
        if (reads > 1 && !repaired) return response({ ok: false, error: "profile still unreadable" });
        return response({ ...catalog, entries: repaired ? entries.map(e => e.id === "beta" ? { ...e, installed: true } : e) : entries });
      }
    });
    const view = await renderDiscover(); await open(view, "Beta Memory");
    const action = view.root.findByProps({ className: "dsh-market-install" });
    await act(async () => action.props.onClick());
    expect(textOf(view.root)).toContain(warning);
    expect(textOf(view.root)).toContain(en.installCompleted);
    expect(view.root.findAllByProps({ "aria-label": `${en.retry}: Beta Memory` })).toHaveLength(0);
    expect(view.root.findByProps({ className: "dsh-market-install" }).props.disabled).toBe(true);
    await act(async () => view.root.findByProps({ className: "dsh-market-install" }).props.onClick());
    await act(async () => view.root.findByProps({ "data-retry": "applied" }).props.onClick());
    expect(textOf(view.root)).toContain(warning);
    repaired = true;
    await act(async () => view.root.findByProps({ "data-retry": "applied" }).props.onClick());
    expect(view.root.findByProps({ className: "dsh-market-install" }).props.disabled).toBe(false);
    expect(textOf(view.root)).toContain(warning);
    expect(view.root.findAllByProps({ "aria-label": `${en.retry}: Beta Memory` })).toHaveLength(0);
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("retains the original failed mutation and action alongside projection diagnostics", async () => {
    const posted = [];
    serve((_input, init) => {
      if (init?.method === "POST") { posted.push(JSON.parse(init.body)); return response({ ok: false, error: "disk full; profile projection unavailable", intents: [] }); }
    });
    const view = await renderDiscover(); await open(view, "Beta Memory");
    await act(async () => view.root.findByProps({ className: "dsh-market-install" }).props.onClick());
    expect(textOf(view.root)).toContain("disk full; profile projection unavailable");
    expect(textOf(view.root)).toContain(en.installFailed);
    expect(textOf(view.root)).not.toContain(en.installCompleted);
    await act(async () => view.root.findByProps({ "aria-label": `${en.retry}: Beta Memory` }).props.onClick());
    expect(posted).toEqual([{ entryId: "beta", sourceId: "official", action: "install" }, { entryId: "beta", sourceId: "official", action: "install" }]);
  });

  it("removes external installs only with named confirmation and profile id", async () => {
    const extra = { id: "installed:%40example%2Fextra", packageName: "@example/extra", name: "@example/extra", installSpec: "link:/safe/example", source: "external" };
    vi.stubGlobal("fetch", vi.fn(async (_input, init) => ({ json: async () => init?.method === "POST" ? { ...catalog, intents: [], installedPlugins: [] } : String(_input).endsWith("/intents") ? { ok: true, intents: [] } : { ...catalog, installedPlugins: [extra] } })));
    const view = await renderCenter(); await open(view, "@example/extra");
    expect(textOf(view.root)).toContain(en.externalInstall);
    expect(textOf(view.root)).not.toContain(en.catalogVersion);
    await act(async () => view.root.findByProps({ className: "dsh-market-install" }).props.onClick());
    expect(textOf(view.root.findByProps({ role: "alertdialog" }))).toContain("@example/extra");
    await act(async () => view.root.findByProps({ className: "dsh-market-confirm-remove" }).props.onClick());
    expect(JSON.parse(fetch.mock.calls.find(([, init]) => init?.method === "POST")[1].body)).toEqual({ entryId: "installed:%40example%2Fextra", sourceId: "profile", action: "remove" });
    expect(textOf(view.root)).toContain(`@example/extra: ${en.removeCompleted}`);
  });

  it("guards same-tick/global busy across details and ignores settlement after unmount", async () => {
    const pending = deferred(); serve((_input, init) => init?.method === "POST" ? pending.promise : undefined);
    const center = createPluginCenterOpen(); const view = await renderDiscover({}, { center });
    const install = view.root.findByProps({ "aria-label": `${en.install}: Beta Memory` });
    await act(async () => { install.props.onClick(); install.props.onClick(); });
    await open(view, "Alpha Tools");
    expect(view.root.findByProps({ className: "dsh-market-install" }).props.disabled).toBe(true);
    await act(async () => view.root.findByProps({ className: "dsh-market-install" }).props.onClick());
    expect(view.root.findAllByProps({ role: "alertdialog" })).toHaveLength(0);
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    await act(async () => view.unmount()); center.close(); center.open();
    const visit = center.getSnapshot();
    await act(async () => pending.resolve(response({ ...catalog, intents: [], entries: entries.map(e => ({ ...e, installed: true })) })));
    expect(center.getSnapshot()).toBe(visit);
  });
});

describe("PluginCenter additional lifecycle regressions", () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each([
    [true, "active", "running"], [true, "loading", "runtimeLoading"],
    [true, "failed", "runtimeError"], [false, "active", "disabled"], [true, null, "runtimeUnknown"],
  ])("pairs installed truth with visible runtime words (enabled=%s, phase=%s)", async (enabled, fiberPhase, label) => {
    vi.stubGlobal("fetch", vi.fn(async input => response(String(input).endsWith("/intents")
      ? { ok: true, intents: [] } : { ok: true, entries, sources })));
    const view = await renderCenter({}, { ctx: { slots: defaultSlots, get: () => ({ pluginInventory: {
      list: async () => ({ ok: true, value: { entries: [{ moduleName: "alpha-package", enabled, fiberPhase }] } }),
    } }) } });
    const card = view.root.findByProps({ "aria-label": `${en.openDetails}: Alpha Tools` });
    expect(textOf(card)).toContain(en.installed);
    expect(textOf(card)).toContain(en[label]);
    await act(async () => card.props.onClick());
    expect(textOf(view.root.findByProps({ className: "dsh-market-meta" }))).toContain(en[label]);
    expect(view.root.findByProps({ className: "dsh-market-install" }).props.disabled).toBe(false);
  });
  it("requests inventory when a discovery card opens an already-installed detail", async () => {
    vi.stubGlobal("fetch", vi.fn(async input => response(String(input).endsWith("/intents") ? { ok: true, intents: [] } : { ok: true, entries, sources })));
    const list = vi.fn(async () => ({ ok: true, value: { entries: [{ moduleName: "alpha-package", enabled: true, fiberPhase: "active" }] } }));
    const center = createPluginCenterOpen(); center.open(); center.navigate({ tab: "discover", query: "", tag: "", scrollTop: 0 });
    const view = await renderCenter({}, { center, ctx: { slots: defaultSlots, get: () => ({ pluginInventory: { list } }) } });
    expect(list).not.toHaveBeenCalled();
    await act(async () => view.root.findByProps({ "aria-label": `${en.openDetails}: Alpha Tools` }).props.onClick());
    expect(list).toHaveBeenCalledOnce();
    expect(textOf(view.root.findByProps({ className: "dsh-market-detail" }))).toContain(en.running);
  });

  it("focuses the newly installed card when returning from successful installed detail", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input, init) => response(init?.method === "POST"
      ? { ok: true, intents: [], sources, entries: entries.map(row => row.id === "beta" ? { ...row, installed: true } : row) }
      : String(input).endsWith("/intents") ? { ok: true, intents: [] } : { ok: true, entries, sources })));
    const focus = vi.fn();
    const view = await renderDiscover({ createNodeMock: element => element.props.id === "dsh-market-card-installed:beta-package" ? { focus } : null });
    await act(async () => view.root.findByProps({ "aria-label": `${en.install}: Beta Memory` }).props.onClick());
    expect(view.root.findByProps({ id: "dsh-market-tab-installed" }).props["aria-selected"]).toBe(true);
    await act(async () => view.root.findByProps({ className: "dsh-market-back" }).props.onClick());
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
  });
});

describe("PluginDetail confirmation mutation lock", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("does not submit a confirmation opened before mutation controls become disabled", async () => {
    const { PluginDetail } = await import("../src/client/PluginDetail.tsx");
    const onQueue = vi.fn(); const onBack = vi.fn();
    const props = {
      target: { kind: "installed", entry: installedFor(entries)[0] },
      snapshot: { sources, entries, installedPlugins: installedFor(entries), allowThirdPartySources: false },
      presentation: { status: "installed", label: "installed", tone: "success", retryable: false, action: "remove" },
      runtimeState: "unknown", configuration: React.createElement("button", {}, "Plugin-owned configuration"), t, onQueue, onBack,
    };
    let view; await act(async () => { view = create(React.createElement(PluginDetail, props)); }); mounted.push(view);
    await act(async () => view.root.findByProps({ className: "dsh-market-install" }).props.onClick());
    expect(view.root.findAllByProps({ role: "alertdialog" })).toHaveLength(1);
    await act(async () => view.update(React.createElement(PluginDetail, { ...props, mutationDisabled: true })));
    await act(async () => view.root.findByProps({ className: "dsh-market-confirm-remove" }).props.onClick());
    expect(onQueue).not.toHaveBeenCalled();
    expect(textOf(view.root)).toContain("Plugin-owned configuration");
    await act(async () => view.root.findByProps({ className: "dsh-market-back" }).props.onClick());
    expect(onBack).toHaveBeenCalledOnce();
    await act(async () => view.update(React.createElement(PluginDetail, props)));
    await act(async () => view.root.findByProps({ className: "dsh-market-install" }).props.onClick());
    await act(async () => view.root.findByProps({ className: "dsh-market-confirm-remove" }).props.onClick());
    expect(onQueue).toHaveBeenCalledExactlyOnceWith("installed:alpha-package", "profile", "remove");
  });
});
