import { describe, expect, it, vi } from "vitest";
import {
  loadApiVendors,
  saveHostModels,
  type HostApi,
} from "../src/client/host-api.ts";
const ok = <T>(value: T) => ({ result: { ok: true as const, value } });
function apiFixture() {
  return {
    llm: {
      providers: vi.fn(async () =>
        ok({
          providers: [
            {
              provider: "openai",
              displayName: "OpenAI",
              settingsNs: "llm-test",
              settingsPath: ["openai"],
            },
          ],
        }),
      ),
      models: vi.fn(async () => ok({ groups: [] })),
      discoverModels: vi.fn(async () => ok({ models: [] })),
    },
    settings: {
      describe: vi.fn(async () =>
        ok({ namespaces: [{ ns: "llm-test", value: {}, revision: 1 }] }),
      ),
      mutate: vi.fn<HostApi["settings"]["mutate"]>(async () => ok(undefined)),
    },
    credentials: {
      describe: vi.fn<HostApi["credentials"]["describe"]>(async () =>
        ok({
          credentials: { OPENAI_API_KEY: { configured: true, writable: true } },
        }),
      ),
      set: vi.fn(async () => ok(undefined)),
      unset: vi.fn(async () => ok(undefined)),
    },
  } satisfies HostApi;
}
describe("Models Host configuration operations", () => {
  it.each(["rejected", "missing"] as const)(
    "does not turn %s credential metadata into editable unconfigured keys",
    async (kind) => {
      const api = apiFixture();
      api.credentials.describe.mockResolvedValue(
        kind === "rejected"
          ? {
              result: { ok: false, error: { message: "Metadata unavailable" } },
            }
          : ok({ credentials: {} }),
      );
      const loaded = await loadApiVendors(api, new Set());
      expect(loaded.vendors).toEqual([]);
      expect(loaded.error).toBeTruthy();
      expect(api.credentials.set).not.toHaveBeenCalled();
    },
  );
  it("projects environment-owned metadata as configured readonly without reading values", async () => {
    const api = apiFixture();
    api.credentials.describe.mockResolvedValue(
      ok({
        credentials: {
          OPENAI_API_KEY: { configured: true, writable: false, source: "env" },
        },
      }),
    );
    const loaded = await loadApiVendors(api, new Set());
    expect(loaded.vendors).toMatchObject([
      { configured: true, writable: false },
    ]);
    expect(loaded.error).toBeUndefined();
  });
  it("forwards the freshly described revision and preserves a concurrent winning selection on rejection", async () => {
    const api = apiFixture();
    let revision = 1;
    let saved = ["concurrent"];
    api.settings.mutate.mockImplementation(async (payload) => {
      expect(payload.expectedRevision).toBe(1);
      expect(payload.ops[0].path).toEqual(["openai", "models"]);
      revision++;
      if (payload.expectedRevision !== revision)
        return {
          result: {
            ok: false as const,
            error: { message: "Settings changed; reload" },
          },
        };
      saved = [];
      return ok(undefined);
    });
    const vendor = (await loadApiVendors(api, new Set())).vendors[0];
    expect(
      await saveHostModels(
        api,
        vendor,
        ["first"],
        [
          { id: "first", name: "First" },
          { id: "second", name: "Second" },
        ],
      ),
    ).toBeTruthy();
    expect(saved).toEqual(["concurrent"]);
    expect(api.settings.mutate).toHaveBeenCalledOnce();
  });
});
