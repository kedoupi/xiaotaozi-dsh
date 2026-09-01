// @ts-nocheck
import React from "react";
import TestRenderer from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogEntry } from "../src/catalog.ts";
import { MarketPanel } from "../src/client/MarketPanel.tsx";
import { en, type MarketKey } from "../src/client/locales.ts";

const { act, create } = TestRenderer;
const entries: CatalogEntry[] = [
  { id: "alpha", name: "Alpha Tools", version: "1.0.0", summary: "Team utilities", tags: ["Collaboration"], kind: "plugin", sourceId: "official", installed: true },
  { id: "beta", name: "Beta Memory", version: "1.0.0", summary: "Recall context", tags: ["Memory"], kind: "plugin", sourceId: "official", installed: false },
  { id: "gamma", name: "Gamma Memory", version: "1.0.0", summary: "Durable recall", tags: ["Memory"], kind: "plugin", sourceId: "official", installed: true },
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

describe("market discovery controls", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (input) => ({
      json: async () => String(input).endsWith("/intents")
        ? { ok: true, intents: [] }
        : { ok: true, allowThirdPartySources: false, sources: [], entries },
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
    const search = renderer.root.findByProps({ id: "dsh-market-search" });

    await act(async () => search.props.onChange({ target: { value: "missing" } }));

    const empty = renderer.root.findByProps({ className: "dsh-market-empty" });
    expect(textOf(empty)).toContain(en.empty);

    await act(async () => empty.findByType("button").props.onClick());

    expect(renderer.root.findByProps({ id: "dsh-market-search" }).props.value).toBe("");
    expect(cards(renderer)).toHaveLength(entries.length);
  });
});
