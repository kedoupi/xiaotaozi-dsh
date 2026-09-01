// @ts-nocheck
import React from "react";
import TestRenderer from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogEntry } from "../src/catalog.ts";
import { MarketPanel } from "../src/client/MarketPanel.tsx";
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

async function renderMarket() {
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(MarketPanel, { t }));
    await Promise.resolve();
    await Promise.resolve();
  });
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
  return { json: async () => payload };
}

describe("market discovery controls", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (input) => ({
      json: async () => String(input).endsWith("/intents")
        ? { ok: true, intents: [] }
        : { ok: true, allowThirdPartySources: false, sources, entries },
    })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("filters catalog entries as the user types", async () => {
    const renderer = await renderMarket();
    const search = renderer.root.findByProps({ id: "dsh-market-search" });

    await act(async () => search.props.onChange({ target: { value: "alpha" } }));

    expect(cards(renderer).map(textOf).join(" ")).toContain("Alpha Tools");
    expect(cards(renderer).map(textOf).join(" ")).not.toContain("Beta Memory");
  });

  it("keeps labelled search, category, and installed controls before the grid", async () => {
    const renderer = await renderMarket();
    const search = renderer.root.findByProps({ id: "dsh-market-search" });
    const label = renderer.root.findByProps({ htmlFor: "dsh-market-search" });
    const pressed = renderer.root.findAll((node) => node.type === "button" && node.props["aria-pressed"] !== undefined);
    const memory = pressed.find((node) => textOf(node) === "Memory");
    const installed = pressed.find((node) => textOf(node) === en.installed);
    const hostNodes = renderer.root.findAll((node) => typeof node.type === "string");
    const grid = renderer.root.findByProps({ className: "dsh-market-grid" });

    expect(textOf(label)).toBe(en.searchLabel);
    expect(pressed.find((node) => textOf(node) === en.allTags)?.props["aria-pressed"]).toBe(true);
    expect(memory?.props["aria-pressed"]).toBe(false);
    expect(installed?.props["aria-pressed"]).toBe(false);
    expect(hostNodes.indexOf(search)).toBeLessThan(hostNodes.indexOf(memory));
    expect(hostNodes.indexOf(memory)).toBeLessThan(hostNodes.indexOf(installed));
    expect(hostNodes.indexOf(installed)).toBeLessThan(hostNodes.indexOf(grid));

    await act(async () => memory.props.onClick());
    await act(async () => installed.props.onClick());

    expect(installed.props["aria-pressed"]).toBe(true);
    expect(cards(renderer)).toHaveLength(1);
    expect(textOf(cards(renderer)[0])).toContain("Gamma Memory");
  });

  it("explains empty matches and resets every discovery control", async () => {
    const renderer = await renderMarket();
    const pressedButton = (label: string) => renderer.root
      .findAll((node) => node.type === "button" && node.props["aria-pressed"] !== undefined)
      .find((node) => textOf(node) === label);
    const search = renderer.root.findByProps({ id: "dsh-market-search" });

    await act(async () => pressedButton("Memory").props.onClick());
    await act(async () => pressedButton(en.installed).props.onClick());
    expect(cards(renderer)).toHaveLength(1);
    expect(textOf(cards(renderer)[0])).toContain("Gamma Memory");

    await act(async () => search.props.onChange({ target: { value: "missing" } }));

    const empty = renderer.root.findByProps({ className: "dsh-market-empty" });
    expect(textOf(empty)).toContain(en.empty);
    expect(textOf(empty.findByType("button"))).toBe(en.resetFilters);
    expect(textOf(empty.findByType("button"))).not.toBe(en.allTags);

    await act(async () => empty.findByType("button").props.onClick());

    expect(renderer.root.findByProps({ id: "dsh-market-search" }).props.value).toBe("");
    expect(pressedButton(en.allTags).props["aria-pressed"]).toBe(true);
    expect(pressedButton("Memory").props["aria-pressed"]).toBe(false);
    expect(pressedButton(en.installed).props["aria-pressed"]).toBe(false);
    expect(cards(renderer)).toHaveLength(entries.length);
  });

  it("keeps catalog cards concise with a labelled source and sibling action", async () => {
    const renderer = await renderMarket();
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

  it("identifies npm install details without Git or official claims", async () => {
    const renderer = await renderMarket();
    const alpha = cards(renderer).find((card) => textOf(card).includes("Alpha Tools"));

    await act(async () => alpha.findByProps({ className: "dsh-market-card-open" }).props.onClick());

    const detail = renderer.root.findByProps({ className: "dsh-market-detail" });
    const detailText = textOf(detail);
    const code = detail.findAllByType("code").map(textOf);
    expect(detailText).toContain(en.upstreamNpm);
    expect(code).toContain("alpha-tools");
    expect(code).toContain("dsh plugin --profile web add alpha-tools");
    expect(detailText).not.toContain(en.upstreamGit);
    expect(detailText).not.toContain(en.official);
  });

  it("moves exact install and transparent risk information into detail", async () => {
    const renderer = await renderMarket();
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
      : { ok: true, allowThirdPartySources: false, sources, entries })));

    const renderer = await renderMarket();
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
        : { ok: true, allowThirdPartySources: false, sources, entries });
    }));
    const renderer = await renderMarket();
    const installButton = cards(renderer).find((card) => textOf(card).includes("Beta Memory")).findByProps({ className: "dsh-market-get" });

    await act(async () => installButton.props.onClick());

    expect(textOf(cards(renderer).find((card) => textOf(card).includes("Beta Memory")))).toContain(en.installing);
    expect(textOf(renderer.root.findByProps({ className: "dsh-market-announcer" }))).toContain(`Beta Memory: ${en.installing}`);

    await act(async () => install.resolve({
      ok: true,
      intents: [],
      allowThirdPartySources: false,
      sources,
      entries: entries.map((entry) => entry.id === "beta" ? { ...entry, installed: true } : entry),
    }));

    expect(textOf(cards(renderer).find((card) => textOf(card).includes("Beta Memory")))).toContain(en.installCompleted);
    expect(textOf(renderer.root.findByProps({ className: "dsh-market-announcer" }))).toContain(`Beta Memory: ${en.installCompleted}`);

    await act(async () => vi.runAllTimers());

    const beta = cards(renderer).find((card) => textOf(card).includes("Beta Memory"));
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
        entries: catalogLoads === 1
          ? entries
          : entries.map((entry) => entry.id === "beta" ? { ...entry, installed: true } : entry),
      });
    }));
    const renderer = await renderMarket();

    await act(async () => cards(renderer).find((card) => textOf(card).includes("Beta Memory")).findByProps({ className: "dsh-market-get" }).props.onClick());

    const beta = cards(renderer).find((card) => textOf(card).includes("Beta Memory"));
    expect(catalogLoads).toBe(2);
    expect(textOf(beta)).toContain(en.installCompleted);
    expect(beta.findAllByProps({ className: "dsh-market-get" })).toHaveLength(0);
    expect(textOf(renderer.root.findByProps({ role: "alert" }))).toContain(cleanupError);
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
          entries,
        });
        return response(await retry.promise);
      }
      return response(String(input).endsWith("/intents")
        ? { ok: true, intents: [] }
        : { ok: true, allowThirdPartySources: false, sources, entries });
    }));
    const renderer = await renderMarket();

    await act(async () => cards(renderer).find((card) => textOf(card).includes("Beta Memory")).findByProps({ className: "dsh-market-get" }).props.onClick());

    const betaFailed = cards(renderer).find((card) => textOf(card).includes("Beta Memory"));
    const alpha = cards(renderer).find((card) => textOf(card).includes("Alpha Tools"));
    expect(textOf(betaFailed)).toContain(en.installFailed);
    expect(textOf(betaFailed.findByProps({ className: "dsh-market-get" }))).toBe(en.retry);
    expect(textOf(alpha)).not.toContain(en.installFailed);
    expect(textOf(renderer.root.findByProps({ role: "alert" }))).toContain("Beta Memory: disk full");

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
      entries: entries.map((entry) => entry.id === "beta" ? { ...entry, installed: true } : entry),
    }));

    expect(textOf(cards(renderer).find((card) => textOf(card).includes("Beta Memory")))).toContain(en.installCompleted);
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
          entries,
        });
        if (posts === 2) return response({
          ok: true,
          intents: [],
          allowThirdPartySources: false,
          sources,
          entries: entries.map((entry) => entry.id === "alpha"
            ? { ...entry, installed: false }
            : entry.id === "beta" ? { ...entry, installed: true } : entry),
        });
        return response({
          ok: true,
          intents: [],
          allowThirdPartySources: false,
          sources,
          entries: entries.map((entry) => entry.id === "beta" ? { ...entry, installed: true } : entry),
        });
      }
      return response(String(input).endsWith("/intents")
        ? { ok: true, intents: [] }
        : { ok: true, allowThirdPartySources: false, sources, entries });
    }));
    const renderer = await renderMarket();

    await act(async () => cards(renderer).find((card) => textOf(card).includes("Beta Memory")).findByProps({ className: "dsh-market-get" }).props.onClick());
    const alpha = cards(renderer).find((card) => textOf(card).includes("Alpha Tools"));
    await act(async () => alpha.findByProps({ className: "dsh-market-card-open" }).props.onClick());
    await act(async () => renderer.root.findByProps({ className: "dsh-market-install" }).props.onClick());
    await act(async () => renderer.root.findByProps({ className: "dsh-market-confirm-remove" }).props.onClick());
    await act(async () => renderer.root.findByProps({ className: "dsh-market-back" }).props.onClick());
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
        return response({ ok: true, intents: [], allowThirdPartySources: false, sources, entries });
      }
      return response(String(input).endsWith("/intents")
        ? { ok: true, intents: [] }
        : { ok: true, allowThirdPartySources: false, sources, entries });
    }));
    const renderer = await renderMarket();
    const alpha = cards(renderer).find((card) => textOf(card).includes("Alpha Tools"));
    await act(async () => alpha.findByProps({ className: "dsh-market-card-open" }).props.onClick());

    await act(async () => renderer.root.findByProps({ className: "dsh-market-install" }).props.onClick());

    expect(posts).toBe(0);
    const confirmation = renderer.root.findByProps({ role: "alertdialog" });
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

  it("announces truthful remove progress and completion", async () => {
    const removal = deferred();
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      if (init?.method === "POST") return response(await removal.promise);
      return response(String(input).endsWith("/intents")
        ? { ok: true, intents: [] }
        : { ok: true, allowThirdPartySources: false, sources, entries });
    }));
    const renderer = await renderMarket();
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
      entries: entries.map((entry) => entry.id === "alpha" ? { ...entry, installed: false } : entry),
    }));

    expect(textOf(renderer.root.findByProps({ className: "dsh-market-detail" }))).toContain(en.removeCompleted);
    expect(textOf(renderer.root.findByProps({ className: "dsh-market-announcer" }))).toContain(`Alpha Tools: ${en.removeCompleted}`);
  });
});
