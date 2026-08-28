import { describe, expect, it } from "vitest";
import { isCatalogEntryInstalled, catalogEntriesFor, searchCatalog, sourceIdFor, tagsOf, validateSourceInput, type MarketSource } from "../src/catalog.ts";

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

describe("isCatalogEntryInstalled", () => {
  it("matches package name or exact install spec", () => {
    expect(isCatalogEntryInstalled(
      { packageName: "dsh-context", installSpec: "github:bowenliang123/dsh-context" },
      { "dsh-context": "^0.21.1" },
    )).toBe(true);
    expect(isCatalogEntryInstalled(
      { packageName: "@nanmicoder/dsh-agent-teams", installSpec: "github:NanmiCoder/dsh-agent-teams" },
      { other: "github:NanmiCoder/dsh-agent-teams" },
    )).toBe(true);
    expect(isCatalogEntryInstalled(
      { packageName: "dsh-opencontext", installSpec: "github:melandlabs/opencontext#path:plugins/dsh-opencontext" },
      {},
    )).toBe(false);
  });
});

describe("sourceIdFor", () => {
  it("is stable and url-specific", () => {
    expect(sourceIdFor("https://a.test/x")).toBe(sourceIdFor("https://a.test/x"));
    expect(sourceIdFor("https://a.test/x")).not.toBe(sourceIdFor("https://a.test/y"));
  });
});

describe("catalog entries", () => {
  it("official source lists market plugins and marks installed from profile deps", () => {
    const entries = catalogEntriesFor(official);
    expect(entries.map((entry) => entry.id)).toEqual(["agent-teams", "context", "opencontext"]);
    expect(entries.every((entry) => entry.installed === false)).toBe(true);
    const installed = catalogEntriesFor(official, { "dsh-context": "github:bowenliang123/dsh-context" });
    expect(installed.find((entry) => entry.id === "context")?.installed).toBe(true);
    expect(installed.find((entry) => entry.id === "agent-teams")?.installed).toBe(false);
  });
  it("extra user sources have no entries until a real index exists", () => {
    const third: MarketSource = { ...official, id: "src-2", builtin: false, label: "demo" };
    expect(catalogEntriesFor(third)).toEqual([]);
  });
});

describe("searchCatalog", () => {
  const entries = catalogEntriesFor(official);
  it("matches name, summary, and tags case-insensitively", () => {
    expect(searchCatalog(entries, "Agent").some((entry) => entry.id === "agent-teams")).toBe(true);
    expect(searchCatalog(entries, "召回").some((entry) => entry.id === "opencontext")).toBe(true);
  });
  it("filters by tag and combines with query", () => {
    const collab = searchCatalog(entries, "", "协作");
    expect(collab.every((entry) => entry.tags.includes("协作"))).toBe(true);
    expect(searchCatalog(entries, "context", "界面")).toHaveLength(1);
  });
  it("exposes sorted unique tags", () => {
    const tags = tagsOf(entries);
    expect(new Set(tags).size).toBe(tags.length);
  });
});
