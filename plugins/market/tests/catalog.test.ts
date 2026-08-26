import { describe, expect, it } from "vitest";
import { mockEntriesFor, searchCatalog, sourceIdFor, tagsOf, validateSourceInput, type MarketSource } from "../src/catalog.ts";

const official: MarketSource = { id: "src-1", label: "小桃子市场", indexUrl: "https://example.test/market.json", builtin: true };

describe("validateSourceInput", () => {
  it("accepts https sources", () => {
    const valid = validateSourceInput({ label: "内网源", indexUrl: "https://mirror.corp/market.json" });
    expect(valid).toMatchObject({ ok: true, label: "内网源" });
  });
  it("allows loopback http for dev", () => {
    expect(validateSourceInput({ label: "dev", indexUrl: "http://127.0.0.1:3081/market.json" }).ok).toBe(true);
  });
  it("rejects plain http, credentials, and junk", () => {
    expect(validateSourceInput({ label: "x", indexUrl: "http://mirror.corp/market.json" }).ok).toBe(false);
    expect(validateSourceInput({ label: "x", indexUrl: "https://user:pw@mirror.corp/a.json" }).ok).toBe(false);
    expect(validateSourceInput({ label: "", indexUrl: "https://mirror.corp/a.json" }).ok).toBe(false);
    expect(validateSourceInput("nope").ok).toBe(false);
  });
});

describe("sourceIdFor", () => {
  it("is stable and url-specific", () => {
    expect(sourceIdFor("https://a.test/x")).toBe(sourceIdFor("https://a.test/x"));
    expect(sourceIdFor("https://a.test/x")).not.toBe(sourceIdFor("https://a.test/y"));
  });
});

describe("mock catalog", () => {
  it("official source lists shipped plugins as installed", () => {
    const entries = mockEntriesFor(official);
    const hello = entries.find((entry) => entry.id === "hello");
    expect(hello?.installed).toBe(true);
    expect(entries.some((entry) => entry.kind === "workflow")).toBe(true);
    expect(entries.every((entry) => entry.sourceId === official.id)).toBe(true);
  });
  it("third-party source gets a demo entry", () => {
    const third: MarketSource = { ...official, id: "src-2", builtin: false, label: "demo" };
    const entries = mockEntriesFor(third);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.installed).toBe(false);
  });
});

describe("searchCatalog", () => {
  const entries = mockEntriesFor(official);
  it("matches name, summary, and tags case-insensitively", () => {
    expect(searchCatalog(entries, "微信").some((entry) => entry.id === "im")).toBe(true);
    expect(searchCatalog(entries, "PPT")).toHaveLength(1);
  });
  it("filters by tag and combines with query", () => {
    const workflows = searchCatalog(entries, "", "工作流");
    expect(workflows.every((entry) => entry.tags.includes("工作流"))).toBe(true);
    expect(searchCatalog(entries, "excel", "工作流")).toHaveLength(1);
  });
  it("exposes sorted unique tags", () => {
    const tags = tagsOf(entries);
    expect(new Set(tags).size).toBe(tags.length);
  });
});
