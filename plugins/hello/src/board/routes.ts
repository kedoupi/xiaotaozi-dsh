import type { IncomingMessage, ServerResponse } from "node:http";
import { RouteError, readJsonBody, rejectUntrusted, sendJson, type WebServer } from "../http.ts";
import { HELLO_BOARD_PREFIX } from "../names.ts";
import { isTaskStatus } from "./types.ts";
import type { BoardService } from "./service.ts";

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
      sendJson(res, error.status, { ok: false, error: error.message });
      return;
    }
    sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : "internal" });
  }
}

function asBody(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) return {};
  return value as Record<string, unknown>;
}

function stringField(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === "string" ? value : undefined;
}

export function registerBoardRoutes(webServer: WebServer, service: BoardService): () => void {
  const disposers = [
    webServer.register({
      kind: "exact",
      path: `${HELLO_BOARD_PREFIX}`,
      handler: async (req, res) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          sendJson(res, 405, { ok: false, error: "method not allowed" });
          return;
        }
        await handle(req, res, () => ({ ok: true, ...service.snapshot() }));
      },
    }),
    webServer.register({
      kind: "exact",
      path: `${HELLO_BOARD_PREFIX}/tasks`,
      handler: async (req, res) => {
        if (req.method === "POST") {
          await handle(req, res, async () => {
            const body = asBody(await readJsonBody(req, 64 * 1024));
            const title = stringField(body, "title") ?? "";
            const prompt = stringField(body, "prompt") ?? title;
            const tasks = service.create({
              title,
              prompt,
              description: stringField(body, "description"),
              workspaceId: stringField(body, "workspaceId"),
              cron: stringField(body, "cron"),
              scheduleEnabled: body.scheduleEnabled === true,
            });
            return { ok: true, tasks };
          });
          return;
        }
        if (req.method === "PUT" || req.method === "PATCH") {
          await handle(req, res, async () => {
            const body = asBody(await readJsonBody(req, 64 * 1024));
            const id = stringField(body, "id") ?? "";
            if (id === "") throw new RouteError(400, "id required");
            const tasks = service.update(id, {
              title: stringField(body, "title"),
              prompt: stringField(body, "prompt"),
              description: stringField(body, "description"),
              workspaceId: stringField(body, "workspaceId"),
              cron: stringField(body, "cron"),
              scheduleEnabled: typeof body.scheduleEnabled === "boolean" ? body.scheduleEnabled : undefined,
            });
            return { ok: true, tasks };
          });
          return;
        }
        sendJson(res, 405, { ok: false, error: "method not allowed" });
      },
    }),
    webServer.register({
      kind: "exact",
      path: `${HELLO_BOARD_PREFIX}/move`,
      handler: async (req, res) => {
        if (req.method !== "POST") {
          sendJson(res, 405, { ok: false, error: "method not allowed" });
          return;
        }
        await handle(req, res, async () => {
          const body = asBody(await readJsonBody(req));
          const id = stringField(body, "id") ?? "";
          const status = body.status;
          if (id === "" || !isTaskStatus(status)) throw new RouteError(400, "id and status required");
          return { ok: true, tasks: service.move(id, status) };
        });
      },
    }),
    webServer.register({
      kind: "exact",
      path: `${HELLO_BOARD_PREFIX}/run`,
      handler: async (req, res) => {
        if (req.method !== "POST") {
          sendJson(res, 405, { ok: false, error: "method not allowed" });
          return;
        }
        await handle(req, res, async () => {
          const body = asBody(await readJsonBody(req));
          const id = stringField(body, "id") ?? "";
          if (id === "") throw new RouteError(400, "id required");
          return { ok: true, tasks: service.run(id) };
        });
      },
    }),
    webServer.register({
      kind: "exact",
      path: `${HELLO_BOARD_PREFIX}/delete`,
      handler: async (req, res) => {
        if (req.method !== "POST") {
          sendJson(res, 405, { ok: false, error: "method not allowed" });
          return;
        }
        await handle(req, res, async () => {
          const body = asBody(await readJsonBody(req));
          const id = stringField(body, "id") ?? "";
          if (id === "") throw new RouteError(400, "id required");
          return { ok: true, tasks: service.remove(id) };
        });
      },
    }),
  ];
  return () => {
    for (const dispose of disposers) dispose();
  };
}
