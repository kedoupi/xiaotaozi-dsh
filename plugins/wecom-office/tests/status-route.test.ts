import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import type { OfficeController } from "../src/office-controller.ts";
import type { OfficeStatusPayload } from "../src/office-types.ts";
import { registerOfficeStatusRoute } from "../src/status-route.ts";

type Route = {
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
};

const status: OfficeStatusPayload = {
  ok: true,
  imAvailable: true,
  cliInstalled: true,
  mainStatus: "inactive",
  selectedBotId: "",
  activeBotId: "",
  authorized: false,
  bots: [],
  qr: null,
  configDir: "/safe/config",
  cliPath: "wecom-cli",
  writable: true,
  allowWrite: false,
  guidance: true,
};

function registeredRoute(controller: Partial<OfficeController> = {}): Route {
  let route: Route | undefined;
  registerOfficeStatusRoute({
    register(candidate) {
      route = candidate;
      return () => {};
    },
  }, {
    snapshot: async () => status,
    ...controller,
  } as OfficeController);
  if (route === undefined) throw new Error("office status route was not registered");
  return route;
}

async function request(
  route: Route,
  options: {
    body?: unknown;
    contentType?: string;
    origin?: string;
    remoteAddress?: string;
  } = {},
): Promise<{ status: number; raw: string; body: Record<string, unknown> }> {
  const host = "127.0.0.1:3080";
  const rawBody = JSON.stringify(options.body ?? { action: "status" });
  const req = Readable.from([rawBody]) as unknown as IncomingMessage;
  req.method = "POST";
  req.headers = {
    host,
    origin: options.origin ?? `http://${host}`,
    "content-type": options.contentType ?? "application/json",
  };
  Object.defineProperty(req, "socket", {
    value: { remoteAddress: options.remoteAddress ?? "127.0.0.1" },
  });
  let responseStatus = 0;
  let raw = "";
  const res = {
    writeHead(code: number) {
      responseStatus = code;
      return this;
    },
    end(body?: string) {
      raw = body ?? "";
      return this;
    },
  } as unknown as ServerResponse;

  await route.handler(req, res);
  return { status: responseStatus, raw, body: JSON.parse(raw) as Record<string, unknown> };
}

describe("WeCom office status route trust boundary", () => {
  it("rejects non-loopback, cross-origin, and non-JSON requests", async () => {
    const route = registeredRoute();
    expect((await request(route, { remoteAddress: "10.0.0.8" })).status).toBe(403);
    expect((await request(route, { origin: "http://evil.example" })).status).toBe(403);
    expect((await request(route, { contentType: "text/plain" })).status).toBe(415);
  });

  it.each(["select", "qrStart"])("rejects removed %s action", async (action) => {
    const response = await request(registeredRoute(), {
      body: {
        action,
        botId: "raw-remote-bot-id",
        secret: "top-secret",
        secretRef: "credential://secret-ref",
      },
    });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ ok: false, error: "unknown action" });
    expect(response.raw).not.toContain("top-secret");
    expect(response.raw).not.toContain("credential://secret-ref");
    expect(response.raw).not.toContain("raw-remote-bot-id");
  });

  it("cleans unexpected controller errors before sending them to the browser", async () => {
    const route = registeredRoute({
      snapshot: async () => {
        throw new Error("secret=top-secret secretRef=credential://secret-ref remoteBotId=raw-remote-bot-id");
      },
    });
    const response = await request(route);
    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      ok: false,
      error: "企业微信办公调用失败。",
      lastError: { code: "cli-failed", message: "企业微信办公调用失败。" },
    });
    expect(response.raw).not.toContain("top-secret");
    expect(response.raw).not.toContain("credential://secret-ref");
    expect(response.raw).not.toContain("raw-remote-bot-id");
  });
});
