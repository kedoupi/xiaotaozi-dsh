import { describe, expect, it } from "vitest";
import { isLoopbackRemoteAddress, isTrustedRouteRequest } from "../src/loopback.ts";

function req(init: {
  remote?: string;
  host?: string;
  origin?: string;
  site?: string;
  method?: string;
}): Parameters<typeof isTrustedRouteRequest>[0] {
  return {
    method: init.method ?? "GET",
    socket: { remoteAddress: init.remote },
    headers: {
      host: init.host,
      origin: init.origin,
      "sec-fetch-site": init.site,
    },
  } as Parameters<typeof isTrustedRouteRequest>[0];
}

describe("loopback fence", () => {
  it("accepts ipv4, mapped ipv6, and ::1", () => {
    expect(isLoopbackRemoteAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackRemoteAddress("::1")).toBe(true);
    expect(isLoopbackRemoteAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopbackRemoteAddress("10.0.0.2")).toBe(false);
  });

  it("rejects cross-site and non-loopback hosts", () => {
    expect(isTrustedRouteRequest(req({ remote: "127.0.0.1", host: "127.0.0.1:3081" }))).toBe(true);
    expect(isTrustedRouteRequest(req({ remote: "10.0.0.2", host: "127.0.0.1:3081" }))).toBe(false);
    expect(isTrustedRouteRequest(req({ remote: "127.0.0.1", host: "example.com" }))).toBe(false);
    expect(isTrustedRouteRequest(req({
      remote: "127.0.0.1",
      host: "127.0.0.1:3081",
      site: "cross-site",
    }))).toBe(false);
  });

  it("requires Origin on mutations", () => {
    const base = { remote: "127.0.0.1", host: "127.0.0.1:3081", method: "POST" };
    expect(isTrustedRouteRequest(req(base), true)).toBe(false);
    expect(isTrustedRouteRequest(req({ ...base, origin: "http://127.0.0.1:3081" }), true)).toBe(true);
    expect(isTrustedRouteRequest(req({ ...base, origin: "http://evil.example" }), true)).toBe(false);
  });
});
