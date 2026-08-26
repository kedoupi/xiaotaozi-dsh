import { describe, expect, it } from "vitest";
import { isTrustedRouteRequest } from "../src/loopback.ts";

function request(host: string, origin?: string): Parameters<typeof isTrustedRouteRequest>[0] {
  return {
    method: "POST",
    socket: { remoteAddress: "127.0.0.1" },
    headers: { host, ...(origin === undefined ? {} : { origin }) },
  } as Parameters<typeof isTrustedRouteRequest>[0];
}

describe("market route trust", () => {
  it("requires an exact http origin for mutations", () => {
    expect(isTrustedRouteRequest(request("localhost:3081", "http://localhost:3081"), true)).toBe(true);
    expect(isTrustedRouteRequest(request("localhost:3081", "https://localhost:3081"), true)).toBe(false);
  });

  it("rejects malformed Host authorities", () => {
    for (const host of [" localhost:3081", "localhost:3081 ", "localhost:3081@evil.test", "localhost/path"]) {
      expect(isTrustedRouteRequest(request(host, `http://${host}`), true)).toBe(false);
    }
  });
});
