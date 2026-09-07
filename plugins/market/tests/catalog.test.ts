import { describe, expect, it } from "vitest";
import {
  installedPluginId,
  installedPluginsFor,
  publicInstallSpec,
  isCatalogEntryInstalled,
  catalogEntriesFor,
  searchCatalog,
  sourceIdFor,
  tagsOf,
  validateSourceInput,
  type MarketSource,
} from "../src/catalog.ts";

const official: MarketSource = { id: "src-1", label: "小桃子市场", indexUrl: "https://example.test/market.json", builtin: true };

describe("installedPluginsFor", () => {
  it("projects top-level third-party packages retaining actual aliases and specs", () => {
    const dependencies = {
      "@deepseek-ai/dsh": "0.1.2-rc.1",
      "@deepseek-ai/dsh-session": "0.1.2-rc.1",
      "dsh-xtz-ui": "link:../xtz-ui",
      "dsh-sidebar": "link:../sidebar",
      "dsh-providers": "link:../providers",
      "dsh-im": "link:../im",
      "dsh-market": "link:../market",
      "dsh-wecom-office": "link:../wecom-office",
      alias: "github:bowenliang123/dsh-context",
      "@example/extra": "^2.0.0",
    };
    expect(installedPluginsFor(dependencies)).toEqual([
      {
        id: "installed:%40example%2Fextra",
        packageName: "@example/extra",
        name: "@example/extra",
        installSpec: "^2.0.0",
        source: "external",
      },
      {
        id: "installed:alias",
        packageName: "alias",
        name: "会话上下文",
        installSpec: "github:bowenliang123/dsh-context",
        source: "catalog",
        catalogEntryId: "context",
        version: "0.44.0",
      },
    ]);
    expect(installedPluginId("@example/extra")).not.toBe(
      installedPluginId("extra"),
    );
    expect(installedPluginsFor({})).toEqual([]);
  });
  it("prefers package identity and keeps raw Host targets separate from public specs", () => {
    const spec =
      "git+https://user:secret@example.test/repo.git?token=secret#v1";
    const dependencies: Record<string, string> = {
      "dsh-context": spec,
      alias: "github:bowenliang123/dsh-context",
    };
    const target = installedPluginsFor(dependencies).find(
      (row) => row.id === installedPluginId("dsh-context"),
    );
    expect(target).toMatchObject({
      packageName: "dsh-context",
      catalogEntryId: "context",
      installSpec: spec,
    });
    expect(dependencies[target!.packageName]).toBe(spec);
    expect(
      installedPluginsFor({
        "dsh-context":
          "github:melandlabs/opencontext#path:plugins/dsh-opencontext",
      })[0]?.catalogEntryId,
    ).toBe("context");
    expect(
      installedPluginsFor({ alias: " github:bowenliang123/dsh-context" })[0]
        ?.source,
    ).toBe("external");
  });
});

describe("publicInstallSpec", () => {
  it.each([
    [
      "git+https://user:secret@example.test/repo.git?token=secret#v1",
      "git+https://example.test/repo.git?redacted#v1",
    ],
    [
      " \u0000\thttps://user:secret@example.test/repo.git?token=secret#v1\r\n",
      "https://example.test/repo.git?redacted#v1",
    ],
    [
      "\u001fgit+https://user:secret@example.test/repo.git?token=secret#v1",
      "git+https://example.test/repo.git?redacted#v1",
    ],
    [
      "gi\tt+ht\ntps://user:secret@example.test/repo.git?token=secret#v1",
      "git+https://example.test/repo.git?redacted#v1",
    ],
    [
      "https://us\ter:sec\rret@example.test/repo?token=secret#path:plugins/extra",
      "https://example.test/repo?redacted#path:plugins/extra",
    ],
    ["https://example.test/repo#v1", "https://example.test/repo#v1"],
    ["^2.0.0", "^2.0.0"],
    ["npm:@example/extra@^2", "npm:@example/extra@^2"],
    ["github:bowenliang123/dsh-context", "github:bowenliang123/dsh-context"],
    [
      "github:melandlabs/opencontext#path:plugins/dsh-opencontext",
      "github:melandlabs/opencontext#path:plugins/dsh-opencontext",
    ],
  ])("sanitizes only the response copy of %j", (spec, expected) => {
    expect(publicInstallSpec(spec)).toBe(expected);
  });
  it.each([
    "https://user:secret@[invalid/repo?token=secret",
    "git+https://user:secret@",
    "https:secret",
    "//user:secret@example.test/repo?token=secret",
    "ht^tps://user:secret@example.test/repo?token=secret",
    "https\u0001://user:secret@example.test/repo?token=secret",
  ])("fails closed for unsafe/unparseable URL-like specs %j", (spec) => {
    expect(publicInstallSpec(spec)).toMatch(/unavailable/i);
    expect(publicInstallSpec(spec)).not.toContain("secret");
  });
});

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
    expect(entries.map((entry) => entry.installSpec)).toEqual([
      "@nanmicoder/dsh-agent-teams",
      "dsh-context",
      "dsh-opencontext",
    ]);
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
