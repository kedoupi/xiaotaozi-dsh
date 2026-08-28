import type { IncomingMessage, ServerResponse } from "node:http";
import { isSafeSessionId } from "../archive/encode.ts";
import { RouteError, readJsonBody, rejectUntrusted, sendJson, type WebServer } from "../http.ts";
import { XTZ_UI_GG_PREFIX } from "../names.ts";
import { pluginTrace } from "../trace.ts";
import { resolveSessionCwd, type CwdHost } from "../workbench/cwd.ts";
import { graphLog, listBranches, repoStatus, switchBranch } from "./service.ts";

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  run: () => Promise<unknown> | unknown,
): Promise<void> {
  if (rejectUntrusted(req, res)) return;
  try {
    sendJson(res, 200, await run());
  } catch (error) {
    if (error instanceof RouteError) {
      // Blank / IM sessions often have no bound workspace; the chip treats
      // this as "not a repo" and stays hidden. Do not log it as a fault.
      if (!(error.status === 404 && error.message === "no workspace")) {
        pluginTrace(`git-graph error status=${String(error.status)} ${error.message}`);
      }
      sendJson(res, error.status, { ok: false, error: error.message });
      return;
    }
    pluginTrace(`git-graph error status=500 ${error instanceof Error ? error.message : "internal"}`);
    sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : "internal" });
  }
}

function requestUrl(req: IncomingMessage): URL {
  return new URL(req.url ?? "", "http://127.0.0.1");
}

function sessionIdOf(req: IncomingMessage, body?: unknown): string {
  const fromQuery = requestUrl(req).searchParams.get("sessionId") ?? "";
  if (fromQuery !== "") return fromQuery;
  if (typeof body === "object" && body !== null) {
    const id = (body as { sessionId?: unknown }).sessionId;
    if (typeof id === "string") return id;
  }
  return "";
}

function requireCwd(home: string, sessionId: string, live?: CwdHost): string {
  if (!isSafeSessionId(sessionId)) throw new RouteError(400, "sessionId required");
  const cwd = resolveSessionCwd(home, sessionId, live);
  if (cwd === undefined) throw new RouteError(404, "no workspace");
  return cwd;
}

export function registerGitGraphRoutes(webServer: WebServer, home: string, live?: CwdHost): () => void {
  const disposers = [
    webServer.register({
      kind: "exact",
      path: `${XTZ_UI_GG_PREFIX}/status`,
      handler: async (req, res) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          sendJson(res, 405, { ok: false, error: "method not allowed" });
          return;
        }
        await handle(req, res, async () => {
          const cwd = requireCwd(home, sessionIdOf(req), live);
          return { ok: true, ...(await repoStatus(cwd)) };
        });
      },
    }),
    webServer.register({
      kind: "exact",
      path: `${XTZ_UI_GG_PREFIX}/branches`,
      handler: async (req, res) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          sendJson(res, 405, { ok: false, error: "method not allowed" });
          return;
        }
        await handle(req, res, async () => {
          const cwd = requireCwd(home, sessionIdOf(req), live);
          return { ok: true, ...(await listBranches(cwd)) };
        });
      },
    }),
    webServer.register({
      kind: "exact",
      path: `${XTZ_UI_GG_PREFIX}/log`,
      handler: async (req, res) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          sendJson(res, 405, { ok: false, error: "method not allowed" });
          return;
        }
        await handle(req, res, async () => {
          const cwd = requireCwd(home, sessionIdOf(req), live);
          const limit = Number(requestUrl(req).searchParams.get("limit") ?? "80");
          return { ok: true, ...(await graphLog(cwd, limit)) };
        });
      },
    }),
    webServer.register({
      kind: "exact",
      path: `${XTZ_UI_GG_PREFIX}/switch`,
      handler: async (req, res) => {
        if (req.method !== "POST") {
          sendJson(res, 405, { ok: false, error: "method not allowed" });
          return;
        }
        await handle(req, res, async () => {
          const body = await readJsonBody(req);
          const cwd = requireCwd(home, sessionIdOf(req, body), live);
          const record = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
          const branch = typeof record.branch === "string" ? record.branch : "";
          if (branch === "") throw new RouteError(400, "branch required");
          pluginTrace(`git-graph switch branch=${branch}`);
          return { ok: true, ...(await switchBranch(cwd, branch)) };
        });
      },
    }),
  ];
  return () => {
    for (const dispose of disposers) dispose();
  };
}
