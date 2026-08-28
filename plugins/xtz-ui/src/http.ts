import type { IncomingMessage, ServerResponse } from "node:http";
import { isTrustedRouteRequest } from "./loopback.ts";

export type WebServer = {
  register(route: {
    kind: "exact";
    path: string;
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
  }): () => void;
};

export const SECURITY_HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "cross-origin-resource-policy": "same-origin",
  "referrer-policy": "no-referrer",
} as const;

export class RouteError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export function sendJson(res: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    ...SECURITY_HEADERS,
  });
  res.end(body);
}

export function rejectUntrusted(req: IncomingMessage, res: ServerResponse): boolean {
  const requireOrigin = req.method !== "GET" && req.method !== "HEAD";
  if (isTrustedRouteRequest(req, requireOrigin)) return false;
  sendJson(res, 403, { ok: false, error: "loopback-only" });
  return true;
}

export async function readJsonBody(req: IncomingMessage, maxBytes = 16 * 1024): Promise<unknown> {
  const contentType = req.headers["content-type"];
  if (typeof contentType !== "string" || !/^application\/json(?:\s*;|$)/iu.test(contentType)) {
    throw new RouteError(415, "json required");
  }
  const contentLength = req.headers["content-length"];
  if (typeof contentLength === "string") {
    const declared = Number(contentLength);
    if (!Number.isSafeInteger(declared) || declared < 0) throw new RouteError(400, "invalid content-length");
    if (declared > maxBytes) throw new RouteError(413, "too large");
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) throw new RouteError(413, "too large");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new RouteError(400, "invalid json");
  }
}

export function sessionIdsFromBody(body: unknown): string[] {
  if (typeof body !== "object" || body === null) return [];
  const record = body as Record<string, unknown>;
  if (Array.isArray(record.sessionIds)) {
    return record.sessionIds.filter((id): id is string => typeof id === "string" && id !== "");
  }
  if (typeof record.sessionId === "string" && record.sessionId !== "") return [record.sessionId];
  return [];
}
