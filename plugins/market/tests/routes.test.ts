import { describe, expect, it } from "vitest";
import { resolveMarketConfig } from "../src/config.ts";
import { RouteError } from "../src/http.ts";
import { catalogPayload, intentFromBody, mutateSources, officialSource } from "../src/routes.ts";
import { pickSources } from "../src/sources-store.ts";

const config = resolveMarketConfig();

describe("catalogPayload", () => {
  it("merges official and user sources with their entries", () => {
    const user = pickSources([{ label: "内网源", indexUrl: "https://mirror.corp/market.json" }]);
    const payload = catalogPayload(config, user);
    expect(payload.sources).toHaveLength(2);
    expect(payload.sources[0]!.builtin).toBe(true);
    expect(payload.entries.some((entry) => entry.sourceId === user[0]!.id)).toBe(true);
  });
});

describe("mutateSources", () => {
  it("adds a valid source and rejects duplicates", () => {
    const added = mutateSources(config, [], { add: { label: "内网源", indexUrl: "https://mirror.corp/market.json" } });
    expect(added).toHaveLength(1);
    expect(() => mutateSources(config, added, { add: { label: "again", indexUrl: "https://mirror.corp/market.json" } }))
      .toThrowError(RouteError);
  });
  it("cannot shadow the official source", () => {
    expect(() => mutateSources(config, [], { add: { label: "假官方", indexUrl: config.indexUrl } }))
      .toThrowError(RouteError);
  });
  it("removes by id and honors allowThirdPartySources", () => {
    const added = mutateSources(config, [], { add: { label: "内网源", indexUrl: "https://mirror.corp/market.json" } });
    expect(mutateSources(config, added, { remove: added[0]!.id })).toEqual([]);
    const locked = resolveMarketConfig({ allowThirdPartySources: false });
    expect(() => mutateSources(locked, [], { add: { label: "x", indexUrl: "https://mirror.corp/m.json" } }))
      .toThrowError(RouteError);
  });
});

describe("intentFromBody", () => {
  it("builds a pending intent with a timestamp", () => {
    const now = new Date("2026-08-26T01:02:03.000Z");
    const built = intentFromBody({ entryId: "hello", sourceId: officialSource(config).id, action: "install" }, () => now);
    expect(built).toMatchObject({ entryId: "hello", action: "install", status: "pending", requestedAt: now.toISOString() });
  });
  it("rejects missing fields and bad actions", () => {
    expect(() => intentFromBody({ sourceId: "s", action: "install" })).toThrowError(RouteError);
    expect(() => intentFromBody({ entryId: "e", sourceId: "s", action: "upgrade" })).toThrowError(RouteError);
  });
});
