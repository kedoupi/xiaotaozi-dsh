import type { IncomingMessage, ServerResponse } from "node:http";
import { OFFICE_STATUS_ROUTE } from "./names.ts";
import { isLoopbackRequest, isTrustedBrowserRequest } from "./loopback.ts";
import type { OfficeController } from "./office-controller.ts";
import { OfficeError, publicErrorMessage } from "./errors.ts";
import type { OfficeStatusPayload } from "./office-types.ts";
import { pluginTrace, shortId } from "./trace.ts";

type WebServer = {
  register(route: {
    kind: "exact";
    path: string;
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
  }): () => void;
};

class StatusRouteError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function isJsonRequest(req: IncomingMessage): boolean {
  const contentType = req.headers["content-type"];
  return typeof contentType === "string" && /^application\/json(?:\s*;|$)/iu.test(contentType);
}

function sendJson(res: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}): void {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "cross-origin-resource-policy": "same-origin",
    "referrer-policy": "no-referrer",
    ...headers,
  });
  res.end(body);
}

async function readBody(req: IncomingMessage, maxBytes = 16 * 1024): Promise<string> {
  const contentLength = req.headers["content-length"];
  if (typeof contentLength === "string") {
    const declared = Number(contentLength);
    if (!Number.isSafeInteger(declared) || declared < 0) throw new StatusRouteError(400, "invalid content-length");
    if (declared > maxBytes) throw new StatusRouteError(413, "request body too large");
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) throw new StatusRouteError(413, "request body too large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function imHint(payload: Record<string, unknown>): boolean {
  return payload.imAvailable === true || payload.imAvailableHint === true;
}

function noisyQrPoll(action: string, snap: OfficeStatusPayload): boolean {
  return action === "qrPoll" && (snap.qr?.status === "pending" || snap.qr?.status === "refreshing");
}

function traceRpc(action: string, hint: boolean, host: boolean, snap: OfficeStatusPayload, extra = ""): void {
  if (noisyQrPoll(action, snap)) return;
  const cli = snap.cliInstalled ? (snap.cliVersion ?? "yes") : "missing";
  const err = snap.lastError ? ` error=${snap.lastError.code}` : "";
  pluginTrace(
    `rpc action=${action} hint=${String(hint)} host=${String(host)} im=${String(snap.imAvailable)} main=${snap.mainStatus} bots=${String(snap.bots.length)} cli=${cli} active=${shortId(snap.activeBotId)}${extra}${err}`,
  );
}

export function registerOfficeStatusRoute(
  webServer: WebServer,
  controller: OfficeController,
  hostImAvailable: () => boolean = () => false,
): () => void {
  return webServer.register({
    kind: "exact",
    path: OFFICE_STATUS_ROUTE,
    handler: async (req, res) => {
      if (!isLoopbackRequest(req)) {
        sendJson(res, 403, { ok: false, error: "the WeCom office status route is loopback-only" });
        return;
      }
      if (!isTrustedBrowserRequest(req, req.method === "POST")) {
        sendJson(res, 403, { ok: false, error: "the WeCom office status route requires a same-origin DSH browser context" });
        return;
      }
      if (req.method !== "POST") {
        sendJson(res, 405, { ok: false, error: "method not allowed" }, { allow: "POST" });
        return;
      }
      if (!isJsonRequest(req)) {
        sendJson(res, 415, { ok: false, error: "WeCom office writes require application/json" });
        return;
      }
      let payload: Record<string, unknown>;
      try {
        const body = await readBody(req);
        const parsed: unknown = body.trim() === "" ? {} : JSON.parse(body);
        payload = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
          ? parsed as Record<string, unknown>
          : {};
      } catch (error) {
        const status = error instanceof StatusRouteError ? error.status : 400;
        sendJson(res, status, { ok: false, error: `invalid JSON body: ${error instanceof Error ? error.message : String(error)}` });
        return;
      }
      const action = typeof payload.action === "string" ? payload.action : "status";
      const hint = imHint(payload);
      const host = hostImAvailable();
      const imAvailable = hint || host;
      const reply = (snap: OfficeStatusPayload, extra = "") => {
        sendJson(res, 200, snap);
        traceRpc(action, hint, host, snap, extra);
      };
      try {
        if (action === "status") {
          reply(await controller.snapshot(imAvailable));
          return;
        }
        if (action === "select") {
          if (typeof payload.botId !== "string" || payload.botId === "") {
            sendJson(res, 400, { ok: false, error: "select needs botId" });
            pluginTrace("rpc action=select error=need-botId");
            return;
          }
          reply(await controller.select(payload.botId, imAvailable), ` bot=${shortId(payload.botId)}`);
          return;
        }
        if (action === "activate") {
          if (typeof payload.botId !== "string" || payload.botId === "") {
            sendJson(res, 400, { ok: false, error: "activate needs botId" });
            pluginTrace("rpc action=activate error=need-botId");
            return;
          }
          reply(await controller.activate(payload.botId, imAvailable), ` bot=${shortId(payload.botId)}`);
          return;
        }
        if (action === "qrStart") {
          reply(await controller.qrStart(imAvailable));
          return;
        }
        if (action === "qrPoll") {
          if (typeof payload.attemptId !== "string") {
            sendJson(res, 400, { ok: false, error: "qrPoll needs attemptId" });
            pluginTrace("rpc action=qrPoll error=need-attemptId");
            return;
          }
          reply(await controller.qrPoll(payload.attemptId, imAvailable));
          return;
        }
        if (action === "qrCancel") {
          reply(await controller.qrCancel(imAvailable));
          return;
        }
        if (action === "bindManual") {
          if (typeof payload.remoteBotId !== "string" || typeof payload.secret !== "string") {
            sendJson(res, 400, { ok: false, error: "bindManual needs remoteBotId and secret" });
            pluginTrace("rpc action=bindManual error=need-credentials");
            return;
          }
          reply(await controller.bindManual(payload.remoteBotId.trim(), payload.secret, imAvailable));
          return;
        }
        if (action === "clearStandalone") {
          reply(await controller.clearStandalone(imAvailable));
          return;
        }
        if (action === "configure") {
          if (payload.field === "guidance" && typeof payload.value === "boolean") {
            reply(await controller.setGuidance(payload.value, imAvailable));
            return;
          }
          if (payload.field === "allowWrite" && typeof payload.value === "boolean") {
            reply(await controller.setAllowWrite(payload.value, imAvailable));
            return;
          }
          sendJson(res, 400, { ok: false, error: "unknown configure field" });
          pluginTrace("rpc action=configure error=unknown-field");
          return;
        }
        sendJson(res, 400, { ok: false, error: "unknown action" });
        pluginTrace(`rpc action=${action} error=unknown-action`);
      } catch (error) {
        const pub = publicErrorMessage(error);
        const status = error instanceof OfficeError && error.code === "cli-missing" ? 200 : 502;
        pluginTrace(`rpc action=${action} error=${pub.code} http=${String(status)}`);
        try {
          const snap = await controller.snapshot(imAvailable);
          sendJson(res, status, { ...snap, ok: false, lastError: pub });
        } catch {
          sendJson(res, 502, { ok: false, error: pub.message, lastError: pub });
        }
      }
    },
  });
}
