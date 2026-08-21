import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { advertisedModels, getPicked, setPicked } from "../src/auth/selection.ts";

const files: string[] = [];

afterEach(async () => {
  await Promise.all(files.splice(0).map((file) => rm(file, { force: true, recursive: true })));
});

async function tempFile(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "passport-sel-"));
  files.push(dir);
  return join(dir, "selection.json");
}

describe("advertisedModels", () => {
  it("keeps every model until the user picks", async () => {
    const path = await tempFile();
    const models = [{ id: "k3", name: "K3" }, { id: "k3-256k", name: "256K" }];
    expect(await advertisedModels("kimi", models, path)).toEqual(models);
    expect(await getPicked("kimi", path)).toBeUndefined();
  });

  it("returns only picked ids, including none", async () => {
    const path = await tempFile();
    await setPicked("kimi", ["k3"], path);
    expect(await advertisedModels("kimi", [{ id: "k3" }, { id: "k3-256k" }], path)).toEqual([{ id: "k3" }]);
    await setPicked("kimi", [], path);
    expect(await advertisedModels("kimi", [{ id: "k3" }, { id: "k3-256k" }], path)).toEqual([]);
  });
});
