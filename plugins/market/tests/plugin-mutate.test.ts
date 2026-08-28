import { describe, expect, it } from "vitest";
import { spawnDshPluginMutate } from "../src/plugin-mutate.ts";

describe("spawnDshPluginMutate", () => {
  it("refuses local and externals specs without spawning", async () => {
    await expect(spawnDshPluginMutate("install", {
      id: "x",
      name: "x",
      version: "1",
      summary: "",
      tags: [],
      kind: "plugin",
      sourceId: "s",
      installed: false,
      installSpec: "link:./plugins/x",
    })).resolves.toMatchObject({ ok: false, error: "refused local spec" });
    await expect(spawnDshPluginMutate("install", {
      id: "x",
      name: "x",
      version: "1",
      summary: "",
      tags: [],
      kind: "plugin",
      sourceId: "s",
      installed: false,
      installSpec: "github:kedoupi/xiaotaozi-dsh#path:externals/opencontext",
    })).resolves.toMatchObject({ ok: false, error: "refused externals path" });
  });
});
