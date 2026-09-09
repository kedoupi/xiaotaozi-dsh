import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readProfileDependencies,
  readProfileState,
} from "../src/profile-deps.ts";
import { describe, expect, it } from "vitest";
import {
  installedPluginId,
  PROFILE_SOURCE_ID,
  sourceIdFor,
  type MarketSource,
  type CatalogEntry,
  type InstalledPlugin,
} from "../src/catalog.ts";
import { resolveMarketConfig } from "../src/config.ts";
import { RouteError } from "../src/http.ts";
import type { InstallIntent } from "../src/intents.ts";
import {
  MARKET_CATALOG_ROUTE,
  MARKET_INTENTS_ROUTE,
  MARKET_SOURCES_ROUTE,
} from "../src/names.ts";
import {
  catalogPayload,
  intentFromBody,
  mutateSources,
  officialSource,
  registerMarketRoutes,
  type MarketStores,
  type WebServer,
} from "../src/routes.ts";
import { MarketStateError } from "../src/state-store.ts";

const config = resolveMarketConfig();

function source(label: string, indexUrl: string): MarketSource {
  return { id: sourceIdFor(indexUrl), label, indexUrl, builtin: false };
}

interface RouteResponse {
  status: number;
  body: {
    ok?: boolean;
    code?: string;
    error?: string;
    allowThirdPartySources?: boolean;
    mutationApplied?: boolean;
    intents?: InstallIntent[];
    entries?: CatalogEntry[];
    installedPlugins?: InstalledPlugin[];
  };
}

async function withMarketServer(
  stores: MarketStores,
  run: (
    request: (path: string, init?: RequestInit) => Promise<RouteResponse>,
    base: string,
  ) => Promise<void>,
): Promise<void> {
  const routes = new Map<
    string,
    (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  >();
  const web: WebServer = {
    register: (route) => {
      routes.set(route.path, route.handler);
      return () => {
        routes.delete(route.path);
      };
    },
  };
  const dispose = registerMarketRoutes(web, config, stores);
  const server = createServer((req, res) => {
    const handler = routes.get(req.url ?? "");
    if (handler === undefined) {
      res.statusCode = 404;
      res.end();
      return;
    }
    void handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("no test server address");
  const base = `http://127.0.0.1:${String(address.port)}`;
  const request = async (
    path: string,
    init?: RequestInit,
  ): Promise<RouteResponse> => {
    const response = await fetch(base + path, init);
    return {
      status: response.status,
      body: (await response.json()) as RouteResponse["body"],
    };
  };
  try {
    await run(request, base);
  } finally {
    dispose();
    await new Promise<void>((resolve, reject) =>
      server.close((error) =>
        error === undefined ? resolve() : reject(error),
      ),
    );
  }
}

function memoryStores(overrides: Partial<MarketStores> = {}): MarketStores {
  let sources = [source("legacy", "https://legacy.example/market.json")];
  let intents: InstallIntent[] = [];
  return {
    readSources: () => sources,
    writeSources: (next) => {
      sources = next;
    },
    readIntents: () => intents,
    writeIntents: (next) => {
      intents = next;
    },
    readDependencies: () => ({}),
    mutatePlugin: async () => ({ ok: true }),
    ...overrides,
  };
}

describe("catalogPayload", () => {
  it("projects current third-party dependencies without first-party or core packages", () => {
    const payload = catalogPayload(config, [], {
      "@deepseek-ai/dsh": "0.1.2-rc.1",
      "dsh-xtz-ui": "link:../xtz-ui",
      "dsh-sidebar": "link:../sidebar",
      "dsh-providers": "link:../providers",
      "dsh-im": "link:../im",
      "dsh-market": "link:../market",
      "dsh-wecom-office": "link:../wecom-office",
      alias: "github:bowenliang123/dsh-context",
      "@example/extra": "^2.0.0",
    });
    expect(payload).toHaveProperty("installedPlugins", [
      {
        id: "installed:%40example%2Fextra",
        packageName: "@example/extra",
        name: "@example/extra",
        installSpec: "^2.0.0",
        source: "external",
      },
      {
        id: "installed:alias",
        packageName: "alias",
        name: "会话上下文",
        installSpec: "github:bowenliang123/dsh-context",
        source: "catalog",
        catalogEntryId: "context",
      },
    ]);
    expect(payload.installedPlugins[1]).not.toHaveProperty("version");
    expect(
      JSON.parse(JSON.stringify(payload)).installedPlugins[1].version,
    ).toBeUndefined();
  });
  it.each([
    "git+https://user:secret@example.test/repo.git?token=secret#v1",
    " \u0000\thttps://user:secret@example.test/repo.git?token=secret#v1\r\n",
    "\u001fgit+https://user:secret@example.test/repo.git?token=secret#v1",
    "gi\tt+ht\ntps://user:secret@example.test/repo.git?token=secret#v1",
    "https://user:secret@[invalid/repo?token=secret",
    "ht^tps://user:secret@example.test/repo?token=secret",
    "https\u0001://user:secret@example.test/repo?token=secret",
  ])("does not serialize URL credentials/query from %j", (spec) => {
    const dependencies = {
      "dsh-context": spec,
      alias: "github:bowenliang123/dsh-context",
    };
    const payload = catalogPayload(config, [], dependencies);
    expect(payload).toHaveProperty("installedPlugins");
    expect(JSON.stringify(payload)).not.toContain("secret");
    expect(dependencies["dsh-context"]).toBe(spec);
    expect(
      payload.entries.find((entry) => entry.id === "context")?.installed,
    ).toBe(false);
  });
  it("merges official and user sources with their entries", () => {
    const user = [source("内网源", "https://mirror.corp/market.json")];
    const payload = catalogPayload(config, user);
    expect(payload.sources).toHaveLength(2);
    expect(payload.sources[0]!.builtin).toBe(true);
    expect(
      payload.entries.every(
        (entry) => entry.sourceId === payload.sources[0]!.id,
      ),
    ).toBe(true);
    expect(payload.entries.some((entry) => entry.id === "agent-teams")).toBe(
      true,
    );
    expect(payload.allowThirdPartySources).toBe(false);
  });
  it("does not certify catalog installation from dependencies alone", () => {
    const payload = catalogPayload(config, [], {
      "dsh-opencontext":
        "github:melandlabs/opencontext#path:plugins/dsh-opencontext",
    });
    expect(
      payload.entries.find((entry) => entry.id === "opencontext")?.installed,
    ).toBe(false);
    expect(
      payload.entries.find((entry) => entry.id === "context")?.installed,
    ).toBe(false);
  });
});

describe("mutateSources", () => {
  it("rejects source adds honestly while remote catalogs are unavailable", () => {
    let caught: unknown;
    try {
      mutateSources(config, [], {
        add: { label: "内网源", indexUrl: "https://mirror.corp/market.json" },
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RouteError);
    expect(caught).toMatchObject({
      status: 501,
      message: "third-party source catalogs are not supported in this build",
    });
  });
  it("still lets users remove a previously saved source", () => {
    const existing = [source("内网源", "https://mirror.corp/market.json")];
    expect(
      mutateSources(config, existing, { remove: existing[0]!.id }),
    ).toEqual([]);
  });
});

describe("intentFromBody", () => {
  it("builds a pending intent with a timestamp", () => {
    const now = new Date("2026-08-26T01:02:03.000Z");
    const built = intentFromBody(
      {
        entryId: "agent-teams",
        sourceId: officialSource(config).id,
        action: "install",
      },
      () => now,
      () => "request-123",
    );
    expect(built).toMatchObject({
      requestId: "request-123",
      entryId: "agent-teams",
      action: "install",
      status: "pending",
      requestedAt: now.toISOString(),
    });
  });
  it("assigns distinct request identities to otherwise identical intents", () => {
    const now = new Date("2026-08-26T01:02:03.000Z");
    const body = {
      entryId: "agent-teams",
      sourceId: officialSource(config).id,
      action: "install",
    };
    const first = intentFromBody(body, () => now);
    const second = intentFromBody(body, () => now);
    expect(first.requestedAt).toBe(second.requestedAt);
    expect(first.requestId).not.toBe(second.requestId);
  });
  it("rejects missing fields and bad actions", () => {
    expect(() =>
      intentFromBody({ sourceId: "s", action: "install" }),
    ).toThrowError(RouteError);
    expect(() =>
      intentFromBody({ entryId: "e", sourceId: "s", action: "upgrade" }),
    ).toThrowError(RouteError);
  });
});

describe("market route lifecycle", () => {
  it.each(["absent", "dependency-only", "quarantined"])(
    "repairs %s after a failed add instead of certifying dependency-only success",
    async (initial) => {
      const deps: Record<string, string> = {
        unrelated: "^7",
        ...(initial === "absent" ? {} : { "dsh-context": "^1" }),
      };
      const bundles = ["unrelated"];
      let loadable = initial === "quarantined";
      let attempts = 0;
      const actions: string[] = [];
      const stores = memoryStores({
        readDependencies: () => deps,
        readProfileState: () => ({ dependencies: deps, bundles }),
        inspectInstalled: () =>
          loadable
            ? { ok: true }
            : { ok: false, reason: "missing lib/index.js" },
        mutatePlugin: async (action) => {
          actions.push(action);
          attempts += 1;
          deps["dsh-context"] = "^1";
          if (attempts === 1) return { ok: false, error: "install timed out" };
          loadable = true;
          bundles.push("dsh-context");
          return { ok: true };
        },
      });
      await withMarketServer(stores, async (request, base) => {
        const post = () =>
          request(MARKET_INTENTS_ROUTE, {
            method: "POST",
            headers: { "content-type": "application/json", origin: base },
            body: JSON.stringify({
              entryId: "context",
              sourceId: officialSource(config).id,
              action: "install",
            }),
          });
        const failed = await post();
        expect(failed.status).toBe(500);
        expect(failed.body.error).toContain("未自动回滚");
        const partial = await request(MARKET_CATALOG_ROUTE);
        expect(
          partial.body.entries?.find((e) => e.id === "context"),
        ).toMatchObject({ installed: false, installationState: "partial" });
        expect((await post()).status).toBe(200);
        const repaired = await request(MARKET_CATALOG_ROUTE);
        expect(
          repaired.body.entries?.find((e) => e.id === "context"),
        ).toMatchObject({ installed: true, installationState: "installed" });
        expect((await post()).status).toBe(200);
        expect(actions).toEqual(["install", "install"]);
        expect(deps.unrelated).toBe("^7");
        expect(bundles.filter((name) => name !== "dsh-context")).toEqual([
          "unrelated",
        ]);
        expect(stores.readIntents()).toEqual([]);
      });
    },
  );

  it.each(["throw", "global-reconcile", "unreadable"])(
    "retains failed %s changes without a dangerous global rollback",
    async (failure) => {
      const deps: Record<string, string> = { unrelated: "^7" };
      const bundles = ["unrelated"];
      let started = false;
      const actions: string[] = [];
      const stores = memoryStores({
        readDependencies: () => deps,
        readProfileState: () => {
          if (started && failure === "unreadable")
            throw new Error("private read detail");
          return { dependencies: deps, bundles };
        },
        inspectInstalled: () => ({ ok: false, reason: "missing lib/index.js" }),
        mutatePlugin: async (action) => {
          actions.push(action);
          started = true;
          deps["dsh-context"] = "^1";
          if (failure === "global-reconcile") {
            deps.unrelated = "^8";
            bundles.push("another");
          }
          if (failure === "throw") throw new Error("private subprocess detail");
          return { ok: false, error: "install timed out" };
        },
      });
      await withMarketServer(stores, async (request, base) => {
        const response = await request(MARKET_INTENTS_ROUTE, {
          method: "POST",
          headers: { "content-type": "application/json", origin: base },
          body: JSON.stringify({
            entryId: "context",
            sourceId: officialSource(config).id,
            action: "install",
          }),
        });
        expect(response.status).toBe(500);
        expect(response.body.error).toContain("未自动回滚");
        if (failure === "global-reconcile")
          expect(response.body.error).toContain(
            "unrelated profile state changed",
          );
        expect(response.body.error).not.toContain("private");
        expect(actions).toEqual(["install"]);
        expect(deps["dsh-context"]).toBe("^1");
        expect(stores.readIntents()).toEqual([]);
      });
    },
  );

  it.each(["missing", "invalid", "changing"])(
    "fails closed on %s profile verification before mutation",
    async (kind) => {
      let reads = 0;
      let calls = 0;
      const stores = memoryStores({
        readProfileState: () => {
          reads++;
          if (kind === "missing") throw new Error("private path");
          return {
            dependencies:
              kind === "changing" && reads > 2
                ? { "dsh-context": "^2" }
                : { "dsh-context": "^1" },
            bundles:
              kind === "invalid"
                ? (null as unknown as string[])
                : ["dsh-context"],
          };
        },
        inspectInstalled: () => ({ ok: true }),
        mutatePlugin: async () => {
          calls++;
          return { ok: true };
        },
      });
      await withMarketServer(stores, async (request, base) => {
        const response = await request(MARKET_INTENTS_ROUTE, {
          method: "POST",
          headers: { "content-type": "application/json", origin: base },
          body: JSON.stringify({
            entryId: "context",
            sourceId: officialSource(config).id,
            action: "install",
          }),
        });
        expect(response.status).toBe(500);
        expect(calls).toBe(0);
        expect(response.body.error).not.toContain("private");
        expect(stores.readIntents()).toEqual([]);
      });
    },
  );

  it.each(["coherent", "partial", "ambiguous"])(
    "binds %s catalog aliases without duplicate install or destructive repair",
    async (kind) => {
      const deps: Record<string, string> = {
        alias: "github:bowenliang123/dsh-context",
        ...(kind === "ambiguous" ? { "dsh-context": "^1" } : {}),
      };
      const calls: string[] = [];
      const inspections: (string | undefined)[] = [];
      const stores = memoryStores({
        readProfileState: () => ({
          dependencies: deps,
          bundles: kind === "partial" ? [] : ["alias"],
        }),
        inspectInstalled: (entry) => {
          inspections.push(entry.packageName);
          return { ok: true };
        },
        mutatePlugin: async (action) => {
          calls.push(action);
          return { ok: true };
        },
      });
      await withMarketServer(stores, async (request, base) => {
        const response = await request(MARKET_INTENTS_ROUTE, {
          method: "POST",
          headers: { "content-type": "application/json", origin: base },
          body: JSON.stringify({
            entryId: "context",
            sourceId: officialSource(config).id,
            action: "install",
          }),
        });
        expect(response.status).toBe(
          kind === "coherent" ? 200 : kind === "ambiguous" ? 409 : 500,
        );
        expect(calls).toEqual([]);
        expect(deps.alias).toBe("github:bowenliang123/dsh-context");
        if (kind !== "ambiguous") expect(inspections).toContain("alias");
      });
    },
  );

  it.each(["alias", "dsh-context"])(
    "keeps ambiguous inventory readable for explicit %s removal",
    async (key) => {
      const deps: Record<string, string> = {
        alias: "github:bowenliang123/dsh-context",
        "dsh-context": "^1",
        "dsh-opencontext":
          "github:melandlabs/opencontext#path:plugins/dsh-opencontext",
      };
      const bundles = Object.keys(deps);
      const mutations: string[] = [];
      const stores = memoryStores({
        readDependencies: () => deps,
        readProfileState: () => ({ dependencies: deps, bundles }),
        inspectInstalled: (entry) =>
          Object.hasOwn(deps, entry.packageName ?? "")
            ? { ok: true }
            : { ok: false, reason: "missing lib/index.js" },
        mutatePlugin: async (action, entry) => {
          mutations.push(`${action}:${entry.packageName}`);
          delete deps[entry.packageName!];
          bundles.splice(bundles.indexOf(entry.packageName!), 1);
          return { ok: true };
        },
      });
      await withMarketServer(stores, async (request, base) => {
        const catalog = await request(MARKET_CATALOG_ROUTE);
        expect(catalog.status).toBe(200);
        expect(
          catalog.body.entries?.find((entry) => entry.id === "context"),
        ).toMatchObject({ installed: false });
        expect(
          catalog.body.entries?.find((entry) => entry.id === "context")
            ?.installationState,
        ).toBeUndefined();
        expect(
          catalog.body.installedPlugins
            ?.filter((row) => row.catalogEntryId === "context")
            .map((row) => row.packageName)
            .sort(),
        ).toEqual(["alias", "dsh-context"]);
        expect(
          catalog.body.entries?.find((entry) => entry.id === "opencontext"),
        ).toMatchObject({ installed: true, installationState: "installed" });
        const post = (entryId: string, sourceId: string, action: string) =>
          request(MARKET_INTENTS_ROUTE, {
            method: "POST",
            headers: { "content-type": "application/json", origin: base },
            body: JSON.stringify({ entryId, sourceId, action }),
          });
        expect(
          (await post("opencontext", officialSource(config).id, "install"))
            .status,
        ).toBe(200);
        for (const action of ["install", "remove"]) {
          expect(
            (await post("context", officialSource(config).id, action)).status,
          ).toBe(409);
        }
        expect(mutations).toEqual([]);
        expect(
          (await post(`installed:${key}`, "profile", "remove")).status,
        ).toBe(200);
        expect(mutations).toEqual([`remove:${key}`]);
        const remaining = key === "alias" ? "dsh-context" : "alias";
        const refreshed = await request(MARKET_CATALOG_ROUTE);
        expect(refreshed.status).toBe(200);
        expect(
          refreshed.body.installedPlugins
            ?.filter((row) => row.catalogEntryId === "context")
            .map((row) => row.packageName),
        ).toEqual([remaining]);
        expect(
          refreshed.body.entries?.find((entry) => entry.id === "context"),
        ).toMatchObject({ installed: true, installationState: "installed" });
        expect(deps["dsh-opencontext"]).toBe(
          "github:melandlabs/opencontext#path:plugins/dsh-opencontext",
        );
        expect(bundles).toContain("dsh-opencontext");
      });
    },
  );

  it("rejects ambiguous catalog removal rather than choosing an arbitrary dependency", async () => {
    let mutations = 0;
    const stores = memoryStores({
      readDependencies: () => ({
        alias: "github:bowenliang123/dsh-context",
        "dsh-context": "^1",
      }),
      mutatePlugin: async () => {
        mutations++;
        return { ok: true };
      },
    });
    await withMarketServer(stores, async (request, base) => {
      const response = await request(MARKET_INTENTS_ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json", origin: base },
        body: JSON.stringify({
          entryId: "context",
          sourceId: officialSource(config).id,
          action: "remove",
        }),
      });
      expect(response.status).toBe(409);
      expect(mutations).toBe(0);
      expect(stores.readIntents()).toEqual([]);
    });
  });

  it("does not certify canonical absence when a queued alias removal loses its dependency identity", async () => {
    let reads = 0;
    let mutations = 0;
    const stores = memoryStores({
      readProfileState: () => {
        const dependencies: Record<string, string> =
          ++reads === 1 ? { alias: "github:bowenliang123/dsh-context" } : {};
        return { dependencies, bundles: ["alias"] };
      },
      inspectInstalled: () => ({ ok: false, reason: "missing lib/index.js" }),
      mutatePlugin: async () => {
        mutations++;
        return { ok: true };
      },
    });
    await withMarketServer(stores, async (request, base) => {
      const response = await request(MARKET_INTENTS_ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json", origin: base },
        body: JSON.stringify({
          entryId: "context",
          sourceId: officialSource(config).id,
          action: "remove",
        }),
      });
      expect(response.status).toBe(500);
      expect(mutations).toBe(0);
      expect(response.body.error).toContain("target identity changed");
      expect(stores.readIntents()).toEqual([]);
    });
  });

  it("serializes install then remove with a fresh inside-lane snapshot", async () => {
    const deps: Record<string, string> = {};
    let bundles: string[] = [];
    const actions: string[] = [];
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const stores = memoryStores({
      readProfileState: () => ({ dependencies: deps, bundles }),
      inspectInstalled: () => ({ ok: true }),
      mutatePlugin: async (action) => {
        actions.push(action);
        if (action === "install") {
          await held;
          deps["dsh-context"] = "^1";
          bundles = ["dsh-context"];
        } else {
          delete deps["dsh-context"];
          bundles = [];
        }
        return { ok: true };
      },
    });
    await withMarketServer(stores, async (request, base) => {
      const post = (action: string) =>
        request(MARKET_INTENTS_ROUTE, {
          method: "POST",
          headers: { "content-type": "application/json", origin: base },
          body: JSON.stringify({
            entryId: "context",
            sourceId: officialSource(config).id,
            action,
          }),
        });
      const first = post("install");
      await expect.poll(() => actions.length).toBe(1);
      const second = post("remove");
      try {
        await expect.poll(() => stores.readIntents()[0]?.action).toBe("remove");
        expect(actions).toEqual(["install"]);
      } finally {
        release();
      }
      expect((await first).status).toBe(200);
      expect((await second).status).toBe(200);
      expect(actions).toEqual(["install", "remove"]);
      expect(deps).toEqual({});
      expect(bundles).toEqual([]);
      expect(stores.readIntents()).toEqual([]);
    });
  });

  it.each(["retired", "orphan", "throw", "unrelated", "already-orphan"])(
    "verifies explicit removal %s without rollback or dependency-only no-op",
    async (result) => {
      const deps: Record<string, string> = {
        unrelated: "^7",
        ...(result === "already-orphan" ? {} : { "dsh-context": "^1" }),
      };
      let bundles = ["unrelated", "dsh-context"];
      const actions: string[] = [];
      const stores = memoryStores({
        readProfileState: () => ({ dependencies: deps, bundles }),
        inspectInstalled: () => ({ ok: false, reason: "missing lib/index.js" }),
        mutatePlugin: async (action) => {
          actions.push(action);
          delete deps["dsh-context"];
          if (result !== "orphan" && result !== "already-orphan")
            bundles = ["unrelated"];
          if (result === "throw") throw new Error("private remove detail");
          if (result === "unrelated") deps.unrelated = "^8";
          return { ok: true };
        },
      });
      await withMarketServer(stores, async (request, base) => {
        const response = await request(MARKET_INTENTS_ROUTE, {
          method: "POST",
          headers: { "content-type": "application/json", origin: base },
          body: JSON.stringify({
            entryId: "context",
            sourceId: officialSource(config).id,
            action: "remove",
          }),
        });
        expect(response.status).toBe(result === "retired" ? 200 : 500);
        expect(actions).toEqual(["remove"]);
        expect(stores.readIntents()).toEqual([]);
        if (result !== "retired") {
          expect(response.body.error).toContain("未自动回滚");
          expect(response.body.error).not.toContain("private");
          expect(response.body.mutationApplied).toBe(
            result === "throw" ? undefined : true,
          );
        }
      });
    },
  );

  it("preserves unrelated synthetic plugin/data checksums on failed repair", async () => {
    const home = mkdtempSync(join(tmpdir(), "market-preserve-data-"));
    const profile = join(home, "profiles", "web");
    mkdirSync(profile, { recursive: true });
    const plugin = join(profile, "unrelated-plugin.js");
    const data = join(home, "unrelated-data.json");
    writeFileSync(plugin, "export const sentinel = true;\n");
    writeFileSync(data, '{"disposable":"keep"}');
    const hash = (path: string) =>
      createHash("sha256").update(readFileSync(path)).digest("hex");
    const before = [hash(plugin), hash(data)];
    const manifest = {
      dependencies: { unrelated: "^7", "dsh-context": "^1" },
      dsh: { profile: { bundles: ["unrelated"] } },
    };
    writeFileSync(join(profile, "package.json"), JSON.stringify(manifest));
    const actions: string[] = [];
    const stores = memoryStores({
      readProfileState: () => readProfileState({ DSH_HOME: home }),
      inspectInstalled: () => ({ ok: false, reason: "missing lib/index.js" }),
      mutatePlugin: async (action) => {
        actions.push(action);
        if (action === "remove") {
          writeFileSync(plugin, "unsafe global reconcile");
          writeFileSync(data, "unsafe cleanup");
        }
        manifest.dependencies["dsh-context"] = "^2";
        writeFileSync(join(profile, "package.json"), JSON.stringify(manifest));
        return { ok: false, error: "install timed out" };
      },
    });
    try {
      await withMarketServer(stores, async (request, base) => {
        const response = await request(MARKET_INTENTS_ROUTE, {
          method: "POST",
          headers: { "content-type": "application/json", origin: base },
          body: JSON.stringify({
            entryId: "context",
            sourceId: officialSource(config).id,
            action: "install",
          }),
        });
        expect(response.status).toBe(500);
        expect(actions).toEqual(["install"]);
        expect([hash(plugin), hash(data)]).toEqual(before);
        expect(readProfileState({ DSH_HOME: home })).toEqual({
          dependencies: { unrelated: "^7", "dsh-context": "^2" },
          bundles: ["unrelated"],
        });
      });
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("does not dispatch when intent persistence fails", async () => {
    let mutations = 0;
    const stores = memoryStores({
      writeIntents: () => {
        throw new MarketStateError("write-failed", "intents", "/synthetic");
      },
      mutatePlugin: async () => {
        mutations++;
        return { ok: true };
      },
    });
    await withMarketServer(stores, async (request, base) => {
      const response = await request(MARKET_INTENTS_ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json", origin: base },
        body: JSON.stringify({
          entryId: "context",
          sourceId: officialSource(config).id,
          action: "install",
        }),
      });
      expect(response.status).toBe(500);
      expect(mutations).toBe(0);
    });
  });

  it("cannot certify installed or skip repair through a legacy dependency-only store", async () => {
    let mutations = 0;
    const stores = memoryStores({
      readDependencies: () => ({ "dsh-context": "^1" }),
      mutatePlugin: async () => {
        mutations += 1;
        return { ok: true };
      },
    });
    await withMarketServer(stores, async (request, base) => {
      expect(
        (await request(MARKET_CATALOG_ROUTE)).body.entries?.find(
          (e) => e.id === "context",
        )?.installed,
      ).toBe(false);
      const response = await request(MARKET_INTENTS_ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json", origin: base },
        body: JSON.stringify({
          entryId: "context",
          sourceId: officialSource(config).id,
          action: "install",
        }),
      });
      expect(response).toMatchObject({
        status: 500,
        body: { mutationApplied: true },
      });
      expect(response.body.error).toContain("verification unavailable");
      expect(
        response.body.entries?.find((e) => e.id === "context")
          ?.installationState,
      ).toBeUndefined();
      expect(mutations).toBe(1);
    });
  });
  it("removes only the Host-resolved installed name, ignoring a forged body spec", async () => {
    let deps: Record<string, string> = {
      "@example/extra": "link:/temporary/extra",
    };
    const calls: Array<[string, string | undefined]> = [];
    let bundles = ["@example/extra"];
    const stores = memoryStores({
      readDependencies: () => deps,
      readProfileState: () => ({ dependencies: deps, bundles }),
      mutatePlugin: async (action, entry) => {
        calls.push([action, entry.packageName]);
        deps = {};
        bundles = [];
        return { ok: true };
      },
    });
    await withMarketServer(stores, async (request, base) => {
      const response = await request(MARKET_INTENTS_ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json", origin: base },
        body: JSON.stringify({
          entryId: installedPluginId("@example/extra"),
          sourceId: PROFILE_SOURCE_ID,
          action: "remove",
          packageName: "dsh-market",
          installSpec: "--help",
        }),
      });
      expect(response).toMatchObject({
        status: 200,
        body: { ok: true, intents: [], installedPlugins: [] },
      });
      expect(calls).toEqual([["remove", "@example/extra"]]);
      expect(stores.readIntents()).toEqual([]);
    });
  });

  it.each([
    ["@example/extra", "install", 400],
    ["dsh-xtz-ui", "remove", 404],
    ["dsh-sidebar", "remove", 404],
    ["dsh-providers", "remove", 404],
    ["dsh-im", "remove", 404],
    ["dsh-market", "remove", 404],
    ["dsh-wecom-office", "remove", 404],
    ["@deepseek-ai/dsh", "remove", 404],
    ["@deepseek-ai/dsh-session", "remove", 404],
    ["unknown", "remove", 404],
  ] as const)(
    "rejects profile target %s action %s before enqueue",
    async (name, action, status) => {
      let writes = 0;
      let mutations = 0;
      const stores = memoryStores({
        readDependencies: () => ({
          "@example/extra": "link:/temporary/extra",
          ...(name === "unknown"
            ? {}
            : { [name]: "github:bowenliang123/dsh-context" }),
        }),
        writeIntents: () => {
          writes += 1;
        },
        mutatePlugin: async () => {
          mutations += 1;
          return { ok: true };
        },
      });
      await withMarketServer(stores, async (request, base) => {
        const response = await request(MARKET_INTENTS_ROUTE, {
          method: "POST",
          headers: { "content-type": "application/json", origin: base },
          body: JSON.stringify({
            entryId: installedPluginId(name),
            sourceId: PROFILE_SOURCE_ID,
            action,
          }),
        });
        expect(response.status).toBe(status);
        expect(response.body.ok).toBe(false);
        expect(writes).toBe(0);
        expect(mutations).toBe(0);
        expect(stores.readIntents()).toEqual([]);
      });
    },
  );

  it("rejects cross-origin profile removal before reading or writing state", async () => {
    let reads = 0;
    let writes = 0;
    let mutations = 0;
    const stores = memoryStores({
      readDependencies: () => {
        reads += 1;
        return { "@example/extra": "^1" };
      },
      writeIntents: () => {
        writes += 1;
      },
      mutatePlugin: async () => {
        mutations += 1;
        return { ok: true };
      },
    });
    await withMarketServer(stores, async (request) => {
      const response = await request(MARKET_INTENTS_ROUTE, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://evil.example",
        },
        body: JSON.stringify({
          entryId: installedPluginId("@example/extra"),
          sourceId: PROFILE_SOURCE_ID,
          action: "remove",
        }),
      });
      expect(response).toMatchObject({
        status: 403,
        body: { ok: false, error: "loopback-only" },
      });
      expect([reads, writes, mutations]).toEqual([0, 0, 0]);
    });
  });

  it("rejects a non-loopback profile removal before consuming its body", async () => {
    let handler: Parameters<WebServer["register"]>[0]["handler"] | undefined;
    const dispose = registerMarketRoutes(
      {
        register: (route) => {
          if (route.path === MARKET_INTENTS_ROUTE) handler = route.handler;
          return () => {};
        },
      },
      config,
      memoryStores({
        readDependencies: () => {
          throw new Error("must not read profile");
        },
        writeIntents: () => {
          throw new Error("must not enqueue");
        },
        mutatePlugin: async () => {
          throw new Error("must not mutate");
        },
      }),
    );
    let status = 0;
    let body = "";
    let consumed = false;
    try {
      await handler!(
        {
          method: "POST",
          socket: { remoteAddress: "192.0.2.1" },
          headers: {
            host: "localhost:1234",
            origin: "http://localhost:1234",
            "content-type": "application/json",
          },
          async *[Symbol.asyncIterator]() {
            consumed = true;
            yield Buffer.from(
              JSON.stringify({
                entryId: installedPluginId("@example/extra"),
                sourceId: PROFILE_SOURCE_ID,
                action: "remove",
              }),
            );
          },
        } as IncomingMessage,
        {
          writeHead: (value: number) => {
            status = value;
          },
          end: (value: string) => {
            body = value;
          },
        } as unknown as ServerResponse,
      );
      expect(status).toBe(403);
      expect(JSON.parse(body)).toEqual({ ok: false, error: "loopback-only" });
      expect(consumed).toBe(false);
    } finally {
      dispose();
    }
  });

  it("rejects a malformed profile before enqueueing removal", async () => {
    const home = mkdtempSync(join(tmpdir(), "market-remove-profile-"));
    mkdirSync(join(home, "profiles", "web"), { recursive: true });
    writeFileSync(join(home, "profiles", "web", "package.json"), "{malformed");
    let writes = 0;
    let mutations = 0;
    const stores = memoryStores({
      readDependencies: () => readProfileDependencies({ DSH_HOME: home }),
      writeIntents: () => {
        writes += 1;
      },
      mutatePlugin: async () => {
        mutations += 1;
        return { ok: true };
      },
    });
    try {
      await withMarketServer(stores, async (request, base) => {
        const response = await request(MARKET_INTENTS_ROUTE, {
          method: "POST",
          headers: { "content-type": "application/json", origin: base },
          body: JSON.stringify({
            entryId: installedPluginId("@example/extra"),
            sourceId: PROFILE_SOURCE_ID,
            action: "remove",
          }),
        });
        expect(response).toMatchObject({
          status: 500,
          body: { ok: false, code: "market-profile-unavailable" },
        });
        expect(response.body.error).toContain("xtz doctor");
        expect([writes, mutations]).toEqual([0, 0]);
        expect(stores.readIntents()).toEqual([]);
      });
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it.each(["alias", "dsh-context"])(
    "removes the live dependency key %s for a catalog request",
    async (name) => {
      const calls: Array<[string, string | undefined]> = [];
      let dependencies: Record<string, string> = {
        [name]: "github:bowenliang123/dsh-context",
      };
      let bundles = [name];
      const stores = memoryStores({
        readProfileState: () => ({ dependencies, bundles }),
        mutatePlugin: async (action, entry) => {
          calls.push([action, entry.packageName]);
          dependencies = {};
          bundles = [];
          return { ok: true };
        },
      });
      await withMarketServer(stores, async (request, base) => {
        const response = await request(MARKET_INTENTS_ROUTE, {
          method: "POST",
          headers: { "content-type": "application/json", origin: base },
          body: JSON.stringify({
            entryId: "context",
            sourceId: officialSource(config).id,
            action: "remove",
          }),
        });
        expect(response).toMatchObject({
          status: 200,
          body: { ok: true, intents: [] },
        });
        expect(calls).toEqual([["remove", name]]);
        expect(stores.readIntents()).toEqual([]);
      });
    },
  );

  it("revalidates overlapping profile removals and settles both request identities", async () => {
    let deps: Record<string, string> = {
      "@example/extra": "link:/temporary/extra",
    };
    const calls: Array<string | undefined> = [];
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const enqueuedIds = new Set<string>();
    let bundles = ["@example/extra"];
    const stores = memoryStores({
      readDependencies: () => deps,
      readProfileState: () => ({ dependencies: deps, bundles }),
      mutatePlugin: async (_action, entry) => {
        calls.push(entry.packageName);
        await held;
        deps = {};
        bundles = [];
        return { ok: true };
      },
    });
    const writeIntents = stores.writeIntents;
    stores.writeIntents = (next) => {
      writeIntents(next);
      for (const intent of next) enqueuedIds.add(intent.requestId);
    };
    await withMarketServer(stores, async (request, base) => {
      const post = () =>
        request(MARKET_INTENTS_ROUTE, {
          method: "POST",
          headers: { "content-type": "application/json", origin: base },
          body: JSON.stringify({
            entryId: installedPluginId("@example/extra"),
            sourceId: PROFILE_SOURCE_ID,
            action: "remove",
          }),
        });
      const responses = Promise.all([post(), post()]);
      try {
        await expect.poll(() => enqueuedIds.size).toBe(2);
        expect(calls).toEqual(["@example/extra"]);
        expect(stores.readIntents()).toHaveLength(1);
      } finally {
        release();
        await responses;
      }
      expect(
        (await responses).every((response) => response.status === 200),
      ).toBe(true);
      expect(calls).toEqual(["@example/extra"]);
      expect(stores.readIntents()).toEqual([]);
    });
  });

  it.each(["profile-read", "mutator"])(
    "settles rather than claiming absence when queued %s throws",
    async (failure) => {
      let reads = 0;
      let mutations = 0;
      const stores = memoryStores({
        readDependencies: () => {
          reads += 1;
          if (failure === "profile-read" && reads === 2)
            throw new Error("synthetic private read detail");
          return { "@example/extra": "^1" };
        },
        mutatePlugin: async () => {
          mutations += 1;
          throw new Error("synthetic private mutation detail");
        },
      });
      await withMarketServer(stores, async (request, base) => {
        const response = await request(MARKET_INTENTS_ROUTE, {
          method: "POST",
          headers: { "content-type": "application/json", origin: base },
          body: JSON.stringify({
            entryId: installedPluginId("@example/extra"),
            sourceId: PROFILE_SOURCE_ID,
            action: "remove",
          }),
        });
        expect(response).toMatchObject({
          status: 500,
          body: { ok: false, intents: [] },
        });
        expect(response.body.error).toContain("plugin mutation failed");
        if (failure === "mutator")
          expect(response.body.error).toContain("未自动回滚");
        expect(response.body.mutationApplied).not.toBe(true);
        expect(mutations).toBe(failure === "profile-read" ? 0 : 1);
        expect(reads).toBe(3);
        expect(stores.readIntents()).toEqual([]);
        expect(JSON.stringify(response.body)).not.toContain("private");
      });
    },
  );

  it("does not write source removal when the web profile cannot be read", async () => {
    const home = mkdtempSync(join(tmpdir(), "market-source-profile-"));
    let writes = 0;
    const stores = memoryStores({
      readDependencies: () =>
        readProfileDependencies({ DSH_HOME: home, DSH_PROFILE: "web" }),
      writeSources: () => {
        writes += 1;
      },
    });
    const existing = stores.readSources();
    try {
      await withMarketServer(stores, async (request, base) => {
        const response = await request(MARKET_SOURCES_ROUTE, {
          method: "POST",
          headers: { "content-type": "application/json", origin: base },
          body: JSON.stringify({ remove: existing[0]!.id }),
        });
        expect(response).toMatchObject({
          status: 500,
          body: { ok: false, code: "market-profile-unavailable" },
        });
        expect(response.body.error).toContain("xtz doctor");
        expect(writes).toBe(0);
        expect(stores.readSources()).toEqual(existing);
        for (const field of ["sources", "entries", "installedPlugins"])
          expect(response.body).not.toHaveProperty(field);
        expect(JSON.stringify(response.body)).not.toContain(home);
      });
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("removes a saved source and returns the complete prepared profile snapshot", async () => {
    const dependencies = {
      alias: "github:bowenliang123/dsh-context",
      "@example/extra": "^2.0.0",
    };
    const order: string[] = [];
    const stores = memoryStores({
      readDependencies: () => {
        order.push("project");
        return dependencies;
      },
    });
    const writeSources = stores.writeSources;
    stores.writeSources = (next) => {
      order.push("write");
      writeSources(next);
    };
    const existing = stores.readSources();
    await withMarketServer(stores, async (request, base) => {
      const response = await request(MARKET_SOURCES_ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json", origin: base },
        body: JSON.stringify({ remove: existing[0]!.id }),
      });
      expect(response).toEqual({
        status: 200,
        body: catalogPayload(config, [], dependencies),
      });
      expect(stores.readSources()).toEqual([]);
      expect(order).toEqual(["project", "write"]);
    });
  });

  it("reports an unavailable web profile instead of an empty-success catalog", async () => {
    const home = mkdtempSync(join(tmpdir(), "market-route-profile-"));
    try {
      await withMarketServer(
        memoryStores({
          readDependencies: () =>
            readProfileDependencies({ DSH_HOME: home, DSH_PROFILE: "web" }),
        }),
        async (request) => {
          const response = await request(MARKET_CATALOG_ROUTE);
          expect(response).toMatchObject({
            status: 500,
            body: { ok: false, code: "market-profile-unavailable" },
          });
          expect(response.body.error).toContain("xtz doctor");
          for (const field of ["sources", "entries", "installedPlugins"])
            expect(response.body).not.toHaveProperty(field);
          expect(JSON.stringify(response.body)).not.toContain(home);
        },
      );
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it.each([
    ["catalog", true],
    ["catalog", false],
    ["profile", true],
    ["profile", false],
  ] as const)(
    "retains settled %s mutation outcome after final profile read fails (ok=%s)",
    async (sourceKind, ok) => {
      const external = sourceKind === "profile";
      const action = external ? "remove" : "install";
      const entryId = external
        ? installedPluginId("@example/extra")
        : "agent-teams";
      const sourceId = external ? PROFILE_SOURCE_ID : officialSource(config).id;
      const home = mkdtempSync(join(tmpdir(), "market-outcome-profile-"));
      let reads = 0;
      let mutations = 0;
      const writes: InstallIntent[][] = [];
      let intents: InstallIntent[] = [
        {
          requestId: "unrelated",
          entryId: "context",
          sourceId: officialSource(config).id,
          action: "install",
          requestedAt: "2026-09-05T00:00:00.000Z",
          status: "pending",
        },
      ];
      const unrelated = [...intents];
      const stores = memoryStores({
        readSources: () => [],
        readDependencies: () => {
          reads += 1;
          return reads <= 2
            ? external
              ? { "@example/extra": "link:/temporary/extra" }
              : {}
            : readProfileDependencies({ DSH_HOME: home, DSH_PROFILE: "web" });
        },
        readIntents: () => intents,
        writeIntents: (next) => {
          writes.push(next);
          intents = next;
        },
        mutatePlugin: async (currentAction, entry) => {
          expect(currentAction).toBe(action);
          expect(entry.id).toBe(entryId);
          mutations += 1;
          return ok
            ? { ok: true }
            : { ok: false, error: "original install failure" };
        },
      });
      try {
        await withMarketServer(stores, async (request, base) => {
          const response = await request(MARKET_INTENTS_ROUTE, {
            method: "POST",
            headers: { "content-type": "application/json", origin: base },
            body: JSON.stringify({ entryId, sourceId, action }),
          });
          expect(mutations).toBe(1);
          expect(reads).toBe(3);
          expect(writes).toHaveLength(2);
          expect(writes[0]).toHaveLength(2);
          expect(intents).toEqual(unrelated);
          expect(response).toMatchObject({
            status: 500,
            body: {
              ok: false,
              code: "market-profile-unavailable",
              intents: unrelated,
            },
          });
          expect(response.body.error).toContain("xtz doctor");
          expect(response.body.error).toContain("refresh");
          if (ok) {
            expect(response.body.mutationApplied).toBe(true);
            expect(response.body.error).toContain("mutation acknowledged");
            expect(response.body.error).not.toContain("completed");
            expect(response.body.error).toContain(
              "Do not retry the plugin mutation",
            );
          } else {
            expect(response.body.mutationApplied).not.toBe(true);
            expect(response.body.error).toContain("original install failure");
          }
          for (const field of ["sources", "entries", "installedPlugins"])
            expect(response.body).not.toHaveProperty(field);
          expect(JSON.stringify(response.body)).not.toContain(home);
        });
      } finally {
        rmSync(home, { recursive: true, force: true });
      }
    },
  );
  it.each([true, false])(
    "preserves the outcome and independent state diagnostics if final sources fail (ok=%s)",
    async (ok) => {
      let sourceReads = 0;
      let mutations = 0;
      const stores = memoryStores({
        readSources: () => {
          sourceReads += 1;
          if (sourceReads === 3)
            throw new MarketStateError(
              "read-failed",
              "sources",
              "/synthetic/secret",
              "secret",
            );
          return [];
        },
        mutatePlugin: async () => {
          mutations += 1;
          return ok
            ? { ok: true }
            : { ok: false, error: "original install failure" };
        },
      });
      await withMarketServer(stores, async (request, base) => {
        const response = await request(MARKET_INTENTS_ROUTE, {
          method: "POST",
          headers: { "content-type": "application/json", origin: base },
          body: JSON.stringify({
            entryId: "agent-teams",
            sourceId: officialSource(config).id,
            action: "install",
          }),
        });
        expect(mutations).toBe(1);
        expect(sourceReads).toBe(3);
        expect(stores.readIntents()).toEqual([]);
        expect(response).toMatchObject({
          status: 500,
          body: { ok: false, code: "market-state-read-failed", intents: [] },
        });
        expect(response.body.mutationApplied).toBe(ok ? true : undefined);
        expect(response.body.error).toContain(
          ok ? "Do not retry the plugin mutation" : "original install failure",
        );
        expect(response.body.error).toContain(
          "sources state could not be read",
        );
        expect(JSON.stringify(response.body)).not.toContain("secret");
        for (const field of ["sources", "entries", "installedPlugins"])
          expect(response.body).not.toHaveProperty(field);
      });
    },
  );

  it.each([
    ["catalog", true],
    ["catalog", false],
    ["profile", true],
    ["profile", false],
  ] as const)(
    "preserves %s cleanup-failure outcome without a new profile projection read (ok=%s)",
    async (sourceKind, ok) => {
      const external = sourceKind === "profile";
      let deps: Record<string, string> = external
        ? { "@example/extra": "link:/temporary/extra" }
        : {};
      let reads = 0;
      let writes = 0;
      let mutations = 0;
      let intents: InstallIntent[] = [];
      const stores = memoryStores({
        readDependencies: () => {
          reads += 1;
          return deps;
        },
        readIntents: () => intents,
        writeIntents: (next) => {
          writes += 1;
          if (writes === 2)
            throw new MarketStateError(
              "write-failed",
              "intents",
              "/synthetic/secret",
              "secret",
            );
          intents = next;
        },
        mutatePlugin: async (action, entry) => {
          expect(action).toBe(external ? "remove" : "install");
          expect(entry.packageName).toBe(
            external ? "@example/extra" : "@nanmicoder/dsh-agent-teams",
          );
          mutations += 1;
          if (ok) deps = {};
          return ok
            ? { ok: true }
            : { ok: false, error: "original mutation failure" };
        },
      });
      await withMarketServer(stores, async (request, base) => {
        const response = await request(MARKET_INTENTS_ROUTE, {
          method: "POST",
          headers: { "content-type": "application/json", origin: base },
          body: JSON.stringify({
            entryId: external
              ? installedPluginId("@example/extra")
              : "agent-teams",
            sourceId: external ? PROFILE_SOURCE_ID : officialSource(config).id,
            action: external ? "remove" : "install",
          }),
        });
        expect(reads).toBe(2);
        expect(mutations).toBe(1);
        expect(writes).toBe(2);
        expect(intents).toHaveLength(1);
        expect(response).toMatchObject({
          status: 500,
          body: {
            ok: false,
            code: "market-state-write-failed",
            mutationApplied: ok,
            intents: [],
          },
        });
        expect(response.body.error).toContain(
          ok ? "Do not retry the plugin mutation" : "original mutation failure",
        );
        if (!ok)
          expect(response.body.error).toContain(
            "Repair the state file before retrying",
          );
        expect(JSON.stringify(response.body)).not.toContain("secret");
        for (const field of ["sources", "entries", "installedPlugins"])
          expect(response.body).not.toHaveProperty(field);
      });
    },
  );

  it("serializes overlapping profile mutations", async () => {
    let active = 0;
    let maxActive = 0;
    const dependencies: Record<string, string> = {};
    const bundles: string[] = [];
    const stores = memoryStores({
      readSources: () => [],
      readProfileState: () => ({ dependencies, bundles }),
      inspectInstalled: () => ({ ok: true }),
      mutatePlugin: async (_action, entry) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
        dependencies[entry.packageName!] = "^1";
        bundles.push(entry.packageName!);
        return { ok: true };
      },
    });
    await withMarketServer(stores, async (request, base) => {
      const post = () =>
        request(MARKET_INTENTS_ROUTE, {
          method: "POST",
          headers: { "content-type": "application/json", origin: base },
          body: JSON.stringify({
            entryId: "agent-teams",
            sourceId: officialSource(config).id,
            action: "install",
          }),
        });
      const responses = await Promise.all([post(), post()]);
      expect(responses.every((response) => response.status === 200)).toBe(true);
      expect(maxActive).toBe(1);
    });
  });
  it("settles success and failure intents so reload and retry stay available", async () => {
    let intents: InstallIntent[] = [];
    let mutation = 0;
    const pendingDuringMutation: InstallIntent[][] = [];
    const dependencies: Record<string, string> = {};
    const bundles: string[] = [];
    const stores = memoryStores({
      readSources: () => [],
      readProfileState: () => ({ dependencies, bundles }),
      inspectInstalled: () => ({ ok: true }),
      readIntents: () => intents,
      writeIntents: (next) => {
        intents = next;
      },
      mutatePlugin: async () => {
        mutation += 1;
        pendingDuringMutation.push([...intents]);
        if (mutation === 2)
          return { ok: false, error: "simulated install failure" };
        dependencies["@nanmicoder/dsh-agent-teams"] = "^1";
        bundles.push("@nanmicoder/dsh-agent-teams");
        return { ok: true };
      },
    });
    await withMarketServer(stores, async (request, base) => {
      const body = JSON.stringify({
        entryId: "agent-teams",
        sourceId: officialSource(config).id,
        action: "install",
      });
      const post = (): Promise<RouteResponse> =>
        request(MARKET_INTENTS_ROUTE, {
          method: "POST",
          headers: { "content-type": "application/json", origin: base },
          body,
        });

      const success = await post();
      expect(success).toMatchObject({
        status: 200,
        body: { ok: true, intents: [] },
      });
      expect(pendingDuringMutation[0]).toHaveLength(1);
      expect(intents).toEqual([]);

      const reloaded = await request(MARKET_INTENTS_ROUTE);
      expect(reloaded).toMatchObject({
        status: 200,
        body: { ok: true, intents: [] },
      });

      bundles.length = 0; // CLI quarantine keeps the dependency but retires activation membership.
      const failed = await post();
      expect(failed).toMatchObject({
        status: 500,
        body: { ok: false, intents: [] },
      });
      expect(failed.body.error).toContain("simulated install failure");
      expect(failed.body.error).toContain("未自动回滚");
      expect(intents).toEqual([]);

      const retry = await post();
      expect(retry).toMatchObject({
        status: 200,
        body: { ok: true, intents: [] },
      });
      expect(mutation).toBe(3);
      expect(
        pendingDuringMutation.every((current) => current.length === 1),
      ).toBe(true);
    });
  });

  it("returns the real mutation reason and traces it instead of mutation-failed", async () => {
    const traces: string[] = [];
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      traces.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    const previous = process.env.DSH_PLUGIN_TRACE;
    process.env.DSH_PLUGIN_TRACE = "1";
    try {
      const stores = memoryStores({
        readSources: () => [],
        mutatePlugin: async () => ({
          ok: false,
          error: `[ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED] The git-hosted package "dsh-context@0.44.0" needs to execute build scripts but is not in the "allowBuilds" allowlist.`,
        }),
      });
      await withMarketServer(stores, async (request, base) => {
        const response = await request(MARKET_INTENTS_ROUTE, {
          method: "POST",
          headers: { "content-type": "application/json", origin: base },
          body: JSON.stringify({
            entryId: "context",
            sourceId: officialSource(config).id,
            action: "install",
          }),
        });
        expect(response.status).toBe(500);
        expect(response.body.ok).toBe(false);
        expect(response.body.error).toContain("allowBuilds");
        expect(response.body.error).not.toBe("mutation-failed");
        expect(response.body.error).not.toBe("dsh plugin install failed");
      });
      expect(
        traces.some(
          (line) =>
            line.includes("error=allow-builds-blocked") &&
            line.includes("detail="),
        ),
      ).toBe(true);
      expect(
        traces.some((line) => /error=mutation-failed(?:\s|$)/u.test(line)),
      ).toBe(false);
    } finally {
      process.stdout.write = write;
      if (previous === undefined) delete process.env.DSH_PLUGIN_TRACE;
      else process.env.DSH_PLUGIN_TRACE = previous;
    }
  });

  it("retains an unloadable install rather than invoking global remove as automatic rollback", async () => {
    const actions: string[] = [];
    const dependencies: Record<string, string> = {};
    const stores = memoryStores({
      readSources: () => [],
      readProfileState: () => ({ dependencies, bundles: [] }),
      mutatePlugin: async (action) => {
        actions.push(action);
        dependencies["dsh-context"] = "^1";
        return { ok: true };
      },
      inspectInstalled: () => ({
        ok: false,
        reason: "plugin has no loadable entry (missing lib/index.js)",
      }),
    });
    await withMarketServer(stores, async (request, base) => {
      const response = await request(MARKET_INTENTS_ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json", origin: base },
        body: JSON.stringify({
          entryId: "context",
          sourceId: officialSource(config).id,
          action: "install",
        }),
      });
      expect(response).toMatchObject({
        status: 500,
        body: {
          ok: false,
          mutationApplied: true,
        },
      });
      expect(response.body.error).toContain("missing lib/index.js");
      expect(response.body.error).toContain("未自动回滚");
      expect(response.body.error).not.toContain("已回滚安装");
      expect(actions).toEqual(["install"]);
    });
  });

  it("returns actionable state diagnostics instead of an empty queue", async () => {
    const stateError = new MarketStateError(
      "invalid-json",
      "intents",
      "/tmp/market/intents.json",
    );
    await withMarketServer(
      memoryStores({
        readIntents: () => {
          throw stateError;
        },
      }),
      async (request) => {
        const response = await request(MARKET_INTENTS_ROUTE);
        expect(response).toMatchObject({
          status: 500,
          body: {
            ok: false,
            code: "market-state-invalid-json",
          },
        });
        expect(response.body.error).toContain("original file was kept");
      },
    );

    const sourceError = new MarketStateError(
      "invalid-schema",
      "sources",
      "/tmp/market/sources.json",
    );
    await withMarketServer(
      memoryStores({
        readSources: () => {
          throw sourceError;
        },
      }),
      async (request) => {
        const response = await request(MARKET_CATALOG_ROUTE);
        expect(response).toMatchObject({
          status: 500,
          body: {
            ok: false,
            code: "market-state-invalid-schema",
          },
        });
        expect(response.body.error).toContain(
          "sources state has an invalid schema",
        );
      },
    );
  });

  it("fails closed when queued mutation state cannot be revalidated and settlement cannot persist", async () => {
    let intents: InstallIntent[] = [];
    let writes = 0;
    let sourceReads = 0;
    const stores = memoryStores({
      readSources: () => {
        sourceReads += 1;
        if (sourceReads > 1) {
          throw new MarketStateError(
            "read-failed",
            "sources",
            "/tmp/market/sources.json",
            "read denied",
          );
        }
        return [];
      },
      readIntents: () => intents,
      writeIntents: (next) => {
        writes += 1;
        if (writes === 2) {
          throw new MarketStateError(
            "write-failed",
            "intents",
            "/tmp/market/intents.json",
            "rename denied",
          );
        }
        intents = next;
      },
      readDependencies: () => ({}),
      mutatePlugin: async () => ({ ok: true }),
    });
    await withMarketServer(stores, async (request, base) => {
      const response = await request(MARKET_INTENTS_ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json", origin: base },
        body: JSON.stringify({
          entryId: "agent-teams",
          sourceId: officialSource(config).id,
          action: "install",
        }),
      });
      expect(response).toMatchObject({
        status: 500,
        body: {
          ok: false,
          code: "market-state-write-failed",
          mutationApplied: false,
          intents: [],
        },
      });
      expect(response.body.error).toContain(
        "Plugin install failed (插件操作失败：plugin mutation failed)",
      );
      expect(response.body.error).toContain(
        "Repair the state file before retrying",
      );
      expect(intents).toHaveLength(1);
      expect(sourceReads).toBe(2);
    });
  });

  it("reports source adding as unsupported at the route boundary", async () => {
    await withMarketServer(memoryStores(), async (request, base) => {
      const catalog = await request(MARKET_CATALOG_ROUTE);
      expect(catalog.body.allowThirdPartySources).toBe(false);
      const response = await request(MARKET_SOURCES_ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json", origin: base },
        body: JSON.stringify({
          add: { label: "demo", indexUrl: "https://demo.example/catalog.json" },
        }),
      });
      expect(response).toMatchObject({
        status: 501,
        body: {
          ok: false,
          error: "third-party source catalogs are not supported in this build",
        },
      });
    });
  });
});
