import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import { resolveXtzUiConfig } from "../src/config.ts";
import {
  PRODUCT_IDENTITY,
  PRODUCT_IDENTITY_ROUTE,
  registerIdentityRoute,
  settingsPayload,
  type WebServer,
} from "../src/host-routes.ts";

type RegisteredRoute = Parameters<WebServer["register"]>[0];

function identityRoute(instanceToken?: string): RegisteredRoute {
  let route: RegisteredRoute | undefined;
  registerIdentityRoute({
    register(candidate) {
      route = candidate;
      return () => {};
    },
  }, () => instanceToken);
  if (route === undefined) throw new Error("identity route was not registered");
  return route;
}

async function requestIdentity(
  route: RegisteredRoute,
  method: string,
  remoteAddress = "127.0.0.1",
): Promise<{ status: number; headers: Record<string, string | number>; body: unknown }> {
  let status = 0;
  let headers: Record<string, string | number> = {};
  let raw = "";
  const host = "127.0.0.1:3080";
  const req = {
    method,
    headers: { host, ...(method === "POST" ? { origin: `http://${host}` } : {}) },
    socket: { remoteAddress },
  } as IncomingMessage;
  const res = {
    writeHead(code: number, values: Record<string, string | number>) {
      status = code;
      headers = values;
      return this;
    },
    end(body?: string) {
      raw = body ?? "";
      return this;
    },
  } as unknown as ServerResponse;
  await route.handler(req, res);
  return { status, headers, body: JSON.parse(raw) as unknown };
}

describe("Desktop identity route", () => {
  it("is versioned, loopback-only, GET-only, and returns fixed readiness identity", async () => {
    const route = identityRoute();
    expect(route.kind).toBe("exact");
    expect(route.path).toBe(PRODUCT_IDENTITY_ROUTE);

    const first = await requestIdentity(route, "GET");
    const second = await requestIdentity(route, "GET", "::ffff:127.0.0.1");
    expect(first.status).toBe(200);
    expect(first.body).toEqual(PRODUCT_IDENTITY);
    expect(second.body).toEqual(PRODUCT_IDENTITY);
    expect(first.headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(first.headers["cache-control"]).toBe("no-store");

    expect((await requestIdentity(route, "HEAD")).status).toBe(405);
    expect((await requestIdentity(route, "POST")).status).toBe(405);
    expect((await requestIdentity(route, "GET", "10.0.0.8")).status).toBe(403);
  });

  it("echoes only a Desktop-generated instance token with the strict shape", async () => {
    const token = "ab".repeat(32);
    expect((await requestIdentity(identityRoute(token), "GET")).body).toEqual({
      ...PRODUCT_IDENTITY,
      instanceToken: token,
    });
    expect((await requestIdentity(identityRoute("not-a-token"), "GET")).body).toEqual(PRODUCT_IDENTITY);
  });
});

describe("settings payload", () => {
  it("exposes config, shipped flags, and live surfaces", () => {
    const payload = settingsPayload(resolveXtzUiConfig({ announceToAgent: true }));
    expect(payload.ok).toBe(true);
    expect(payload.config.announceToAgent).toBe(true);
    expect(payload.shipped.announceToAgent).toBe(true);
    expect(payload.shipped.archive).toBe(true);
    expect(payload.shipped.board).toBe(true);
    expect(payload.shipped.gitGraph).toBe(true);
    expect(payload.surfaces).toEqual([
      "archive",
      "board",
      "gitGraph",
      "announceToAgent",
    ]);
  });
});
