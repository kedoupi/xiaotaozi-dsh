import { describe, expect, it } from "vitest";
import { buildRoutingContract, parseRoutingContract } from "../src/router/contract.ts";
import type { AuthorizedModelInventory } from "../src/router/inventory.ts";

function inventory(ids: string[]): AuthorizedModelInventory {
  return {
    capturedAt: 1,
    generation: ids.join(","),
    candidates: ids.map((id) => ({
      ref: `prov/${id}` as const,
      provider: "prov",
      model: id,
      source: "api" as const,
      displayName: `Name ${id}`,
      profile: { quality: 3 as const, speed: 3 as const, cost: 3 as const },
    })),
  };
}

describe("routing UX contract snapshot", () => {
  it("exposes candidateCount without changing mode persistence", () => {
    expect(buildRoutingContract("smart", inventory(["a", "b"]))).toEqual({
      mode: "smart",
      candidateCount: 2,
    });
    expect(buildRoutingContract("manual", inventory([])).candidateCount).toBe(0);
  });

  it("names lastSelected from inventory when present", () => {
    const contract = buildRoutingContract("smart", inventory(["flash"]), {
      provider: "prov",
      model: "flash",
    });
    expect(contract.lastSelected).toEqual({
      provider: "prov",
      model: "flash",
      displayName: "Name flash",
    });
  });

  it("parses a client snapshot and defaults broken payloads to manual", () => {
    expect(parseRoutingContract({
      mode: "smart",
      candidateCount: 3.9,
      lastSelected: { provider: "p", model: "m", displayName: "M" },
    })).toEqual({
      mode: "smart",
      candidateCount: 3,
      lastSelected: { provider: "p", model: "m", displayName: "M" },
    });
    expect(parseRoutingContract({ mode: "auto", candidateCount: -2 })).toEqual({
      mode: "manual",
      candidateCount: 0,
    });
    expect(parseRoutingContract(undefined).mode).toBe("manual");
  });
});
