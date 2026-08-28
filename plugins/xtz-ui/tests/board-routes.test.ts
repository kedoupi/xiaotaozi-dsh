import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { registerBoardRoutes } from "../src/board/routes.ts";
import { BoardService } from "../src/board/service.ts";
import type { WebServer } from "../src/http.ts";

const homes: string[] = [];
afterEach(() => { for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true }); });

describe("board routes", () => {
  it("serves CRUD, rejects untrusted writes, and reports validation errors", async () => {
    const home = mkdtempSync(join(tmpdir(), "xtz-board-routes-")); homes.push(home);
    const service = new BoardService({ apiProxy: undefined, workspaceRegistry: undefined }, { DSH_HOME: home });
    const routes = new Map<string, (req: IncomingMessage, res: ServerResponse) => void | Promise<void>>();
    const web: WebServer = { register: (route) => { routes.set(route.path, route.handler); return () => { routes.delete(route.path); }; } };
    const dispose = registerBoardRoutes(web, service);
    const server = createServer((req, res) => { const handler = routes.get(req.url ?? ""); if (!handler) { res.statusCode = 404; res.end(); return; } void handler(req, res); });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); if (address === null || typeof address === "string") throw new Error("no address");
    const base = `http://127.0.0.1:${String(address.port)}`;
    const request = async (path: string, init?: RequestInit) => { const response = await fetch(base + path, init); return { status: response.status, body: await response.json() as { tasks?: Array<{ id: string; title: string; status: string }>; error?: string } }; };
    try {
      expect((await request("/api/dsh-xtz-ui/board/tasks", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status).toBe(403);
      const created = await request("/api/dsh-xtz-ui/board/tasks", { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ title: "Route task", prompt: "P" }) });
      expect(created.status).toBe(200); const id = created.body.tasks?.[0]?.id; expect(id).toBeTruthy();
      const moved = await request("/api/dsh-xtz-ui/board/move", { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ id, status: "todo" }) });
      expect(moved.body.tasks?.[0]?.status).toBe("todo");
      const invalid = await request("/api/dsh-xtz-ui/board/move", { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ id, status: "nope" }) });
      expect(invalid).toMatchObject({ status: 400, body: { error: "id and status required" } });
      const deleted = await request("/api/dsh-xtz-ui/board/delete", { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ id }) });
      expect(deleted.body.tasks).toEqual([]);
    } finally { dispose(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
  });
});
