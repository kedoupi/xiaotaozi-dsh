import type { IncomingMessage, ServerResponse } from "node:http";
import { RouteError, readJsonBody, rejectUntrusted, sendJson, sessionIdsFromBody, type WebServer } from "../http.ts";
import { XTZ_UI_ARCHIVE_PREFIX } from "../names.ts";
import {
  deleteSessions,
  listArchives,
  previewArchive,
  unarchiveSessions,
  type ArchiveLiveHost,
} from "./ledger.ts";
import { pluginTrace } from "../trace.ts";

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

export function registerArchiveRoutes(
  webServer: WebServer,
  home: string,
  live: ArchiveLiveHost | undefined,
): () => void {
  let mutationQueue: Promise<void> = Promise.resolve();
  const mutate = <T>(work: () => Promise<T>): Promise<T> => {
    const result = mutationQueue.then(work, work);
    mutationQueue = result.then(() => undefined, () => undefined);
    return result;
  };
  const disposers = [
    webServer.register({
      kind: "exact",
      path: `${XTZ_UI_ARCHIVE_PREFIX}/archives`,
      handler: async (req, res) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          sendJson(res, 405, { ok: false, error: "method not allowed" });
          return;
        }
        await handle(req, res, () => mutate(async () => {
          const { items } = listArchives(home, live);
          return { ok: true, archives: items, total: items.length };
        }));
      },
    }),
    webServer.register({
      kind: "exact",
      path: `${XTZ_UI_ARCHIVE_PREFIX}/detail`,
      handler: async (req, res) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          sendJson(res, 405, { ok: false, error: "method not allowed" });
          return;
        }
        await handle(req, res, () => {
          const url = new URL(req.url ?? "", "http://127.0.0.1");
          const sessionId = url.searchParams.get("sessionId") ?? "";
          const detail = previewArchive(home, sessionId, live);
          if (detail === undefined) throw new RouteError(404, "session not found");
          return { ok: true, sessionId, ...detail };
        });
      },
    }),
    webServer.register({
      kind: "exact",
      path: `${XTZ_UI_ARCHIVE_PREFIX}/unarchive`,
      handler: async (req, res) => {
        if (req.method !== "POST") {
          sendJson(res, 405, { ok: false, error: "method not allowed" });
          return;
        }
        await handle(req, res, async () => {
          const ids = sessionIdsFromBody(await readJsonBody(req, 64 * 1024));
          if (ids.length === 0) throw new RouteError(400, "sessionIds required");
          pluginTrace(`archive unarchive n=${String(ids.length)}`);
          const result = await mutate(async () => await unarchiveSessions(home, ids, live));
          return { ok: true, ...result };
        });
      },
    }),
    webServer.register({
      kind: "exact",
      path: `${XTZ_UI_ARCHIVE_PREFIX}/delete`,
      handler: async (req, res) => {
        if (req.method !== "POST") {
          sendJson(res, 405, { ok: false, error: "method not allowed" });
          return;
        }
        await handle(req, res, async () => {
          const ids = sessionIdsFromBody(await readJsonBody(req, 64 * 1024));
          if (ids.length === 0) throw new RouteError(400, "sessionIds required");
          pluginTrace(`archive delete n=${String(ids.length)}`);
          const result = await mutate(async () => await deleteSessions(home, ids, live));
          return { ok: true, ...result };
        });
      },
    }),
    webServer.register({
      kind: "exact",
      path: `${XTZ_UI_ARCHIVE_PREFIX}/delete-all`,
      handler: async (req, res) => {
        if (req.method !== "POST") {
          sendJson(res, 405, { ok: false, error: "method not allowed" });
          return;
        }
        await handle(req, res, () => mutate(async () => {
          const { items } = listArchives(home, live);
          const ids = items.map((item) => item.sessionId);
          if (ids.length === 0) return { ok: true, done: [], notFound: [], errors: [] };
          const result = await deleteSessions(home, ids, live);
          return { ok: true, ...result };
        }));
      },
    }),
  ];
  return () => {
    for (const dispose of disposers) dispose();
  };
}
