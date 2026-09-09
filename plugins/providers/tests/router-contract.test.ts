import { describe, expect, it } from "vitest";
import {
  buildRoutingContract,
  parseRoutingContract,
  routingRefreshTiming,
} from "../src/router/contract.ts";
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
  it("does not leak A's last decision into B; uses only B's durable last-used header", () => {
    const last = {
      provider: "prov",
      model: "a",
      sessionId: "A",
      turn: 3,
      step: 1,
    };
    expect(
      buildRoutingContract("smart", inventory(["a", "b"]), last, {
        sessionId: "B",
      }),
    ).toEqual({
      mode: "smart",
      candidateCount: 2,
      attribution: "session",
      sessionId: "B",
    });
    expect(
      buildRoutingContract("smart", inventory(["a", "b"]), last, {
        sessionId: "B",
        lastUsed: { provider: "prov", model: "b" },
      }),
    ).toMatchObject({
      attribution: "session",
      sessionId: "B",
      lastSelected: { model: "b" },
    });
    expect(
      buildRoutingContract("smart", inventory(["a"]), last, { sessionId: "A" }),
    ).toMatchObject({
      attribution: "session",
      sessionId: "A",
      lastSelected: { model: "a" },
    });
    expect(
      buildRoutingContract("smart", inventory(["a"]), last, {}),
    ).toMatchObject({
      attribution: "historical",
      lastSelected: { model: "a" },
    });
  });

  it("validates optional attribution and finite positive integer refresh bounds", () => {
    expect(routingRefreshTiming()).toEqual({
      pollIntervalMs: 500,
      totalTimeoutMs: 90_000,
    });
    expect(
      routingRefreshTiming({ pollIntervalMs: 7, totalTimeoutMs: 13 }),
    ).toEqual({ pollIntervalMs: 7, totalTimeoutMs: 13 });
    for (const invalid of [NaN, Infinity, 0, -1, 1.5, "7", 2 ** 40]) {
      expect(
        routingRefreshTiming({
          pollIntervalMs: invalid,
          totalTimeoutMs: invalid,
        }),
      ).toEqual({ pollIntervalMs: 500, totalTimeoutMs: 90_000 });
    }
    expect(
      parseRoutingContract({
        mode: "smart",
        attribution: "session",
        sessionId: "B",
        refreshTiming: { pollIntervalMs: 7, totalTimeoutMs: 13 },
      }),
    ).toMatchObject({
      attribution: "session",
      sessionId: "B",
      refreshTiming: { pollIntervalMs: 7, totalTimeoutMs: 13 },
    });
    expect(
      parseRoutingContract({ attribution: "session", sessionId: "" })
        .attribution,
    ).not.toBe("session");
  });
  it("exposes candidateCount without changing mode persistence", () => {
    expect(buildRoutingContract("smart", inventory(["a", "b"]))).toEqual({
      mode: "smart",
      candidateCount: 2,
    });
    expect(buildRoutingContract("manual", inventory([])).candidateCount).toBe(
      0,
    );
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
    expect(
      parseRoutingContract({
        mode: "smart",
        candidateCount: 3.9,
        lastSelected: { provider: "p", model: "m", displayName: "M" },
      }),
    ).toEqual({
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
