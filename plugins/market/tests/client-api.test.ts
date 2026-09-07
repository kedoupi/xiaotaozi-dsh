import { afterEach, describe, expect, it, vi } from "vitest";
import { loadCatalog, queueIntent, removeSource } from "../src/client/api.ts";

function respond(payload: unknown, status = 200): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(payload), { status })),
  );
}
const collections = { sources: [], entries: [], installedPlugins: [] };
afterEach(() => vi.unstubAllGlobals());

describe("catalog snapshot parsing", () => {
  it("rejects a successful catalog without installedPlugins", async () => {
    respond({ ok: true, sources: [], entries: [] });
    await expect(loadCatalog()).rejects.toThrow("market request failed");
  });
  it.each(["sources", "entries", "installedPlugins"])(
    "rejects missing and non-array %s",
    async (field) => {
      for (const value of [undefined, null, {}, "bad"]) {
        respond({ ok: true, ...collections, [field]: value });
        await expect(loadCatalog()).rejects.toThrow("market request failed");
      }
    },
  );
  it("accepts all three arrays and retains source compatibility", async () => {
    respond({ ok: true, ...collections });
    await expect(loadCatalog()).resolves.toEqual({
      allowThirdPartySources: false,
      ...collections,
    });
    await expect(removeSource("legacy")).resolves.toEqual({
      allowThirdPartySources: false,
      ...collections,
    });
  });
});

describe("queueIntent snapshot and settled outcome parsing", () => {
  it.each([true, false])(
    "preserves complete snapshots even when ok is %s",
    async (ok) => {
      respond(
        {
          ok,
          ...collections,
          intents: [],
          ...(ok ? {} : { error: "original failure" }),
        },
        ok ? 200 : 500,
      );
      const result = await queueIntent("context", "official", "install");
      expect(result.snapshot).toEqual({
        allowThirdPartySources: false,
        ...collections,
      });
      expect(result.error).toBe(ok ? undefined : "original failure");
    },
  );
  it.each(["sources", "entries", "installedPlugins"])(
    "omits incomplete/non-array %s snapshots without dropping settlement",
    async (field) => {
      for (const value of [undefined, null, {}, "bad"]) {
        respond(
          {
            ok: false,
            ...collections,
            [field]: value,
            intents: [],
            error: "original failure",
          },
          500,
        );
        const result = await queueIntent("context", "official", "install");
        expect(result.intents).toEqual([]);
        expect(result.snapshot).toBeUndefined();
        expect(result.error).toBe("original failure");
      }
    },
  );
  it.each([true, false])(
    "preserves HTTP 500 settled outcomes without a snapshot (applied=%s)",
    async (applied) => {
      const error = applied
        ? "Plugin install completed. Do not retry the plugin mutation. Check with xtz doctor, then refresh."
        : "original failure. Check with xtz doctor, then refresh.";
      respond(
        {
          ok: false,
          code: "market-profile-unavailable",
          intents: [],
          error,
          ...(applied ? { mutationApplied: true } : {}),
        },
        500,
      );
      const result = await queueIntent("context", "official", "install");
      expect(result.intents).toEqual([]);
      expect(result.error).toBe(error);
      expect(result.mutationApplied).toBe(applied ? true : undefined);
      expect(result.snapshot).toBeUndefined();
    },
  );
});
