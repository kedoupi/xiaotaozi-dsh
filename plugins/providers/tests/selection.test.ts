import { access, mkdir, mkdtemp, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { advertisedModels, clearPicked, getPicked, setPicked } from "../src/auth/selection.ts";

import { pluginData } from "../src/paths.ts";

vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, readFile: vi.fn(actual.readFile), rename: vi.fn(actual.rename) };
});
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(yes => { resolve = yes; });
  return { promise, resolve };
}
const files: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await Promise.all(files.splice(0).map((file) => rm(file, { force: true, recursive: true })));
});

async function tempFile(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "providers-sel-"));
  files.push(dir);
  return join(dir, "selection.json");
}

it.each(["save", "clear"])("serializes overlapping %s with another provider save", async action => {
  const path = await tempFile();
  await setPicked("qwen", ["initial"], path);
  const entered = deferred();
  const release = deferred();
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  vi.mocked(readFile).mockImplementationOnce(async (...args) => {
    const snapshot = await actual.readFile(...args);
    entered.resolve();
    await release.promise;
    return snapshot;
  });
  const first = action === "save" ? setPicked("qwen", ["coder-model"], path) : clearPicked("qwen", path);
  await entered.promise;
  // A relative spelling must share the same whole-file transaction queue.
  const second = setPicked("kimi", ["k3-256k"], relative(process.cwd(), path));
  release.resolve();
  await Promise.all([first, second]);
  expect(await getPicked("qwen", path)).toEqual(action === "save" ? ["coder-model"] : undefined);
  expect(await getPicked("kimi", path)).toEqual(["k3-256k"]);
});

it("an explicit path never creates the default plugin directory", async () => {
  const path = await tempFile();
  const home = join(path, "..", "fake-home");
  await mkdir(home);
  vi.stubEnv("HOME", home);
  vi.stubEnv("DSH_HOME", home);
  const custom = join(path, "..", "custom", "selection.json");
  await mkdir(join(custom, ".."), { mode: 0o700 });
  await setPicked("qwen", ["coder-model"], custom);
  expect(await getPicked("qwen", custom)).toEqual(["coder-model"]);
  await clearPicked("qwen", custom);
  expect(await getPicked("qwen", custom)).toBeUndefined();
  await expect(access(pluginData())).rejects.toMatchObject({ code: "ENOENT" });
  expect((await stat(join(custom, ".."))).mode & 0o777).toBe(0o700);
  expect((await stat(custom)).mode & 0o777).toBe(0o600);
});

it("creates only an explicit parent with owner-only permissions", async () => {
  const path = await tempFile();
  const custom = join(path, "..", "new-parent", "selection.json");
  await setPicked("qwen", ["coder-model"], custom);
  expect(await getPicked("qwen", custom)).toEqual(["coder-model"]);
  expect((await stat(join(custom, ".."))).mode & 0o777).toBe(0o700);
  expect((await stat(custom)).mode & 0o777).toBe(0o600);
});

it("recovers the queue after a failed rename without temp siblings or lost restrictions", async () => {
  const path = await tempFile();
  await setPicked("qwen", ["coder-model"], path);
  vi.mocked(rename).mockRejectedValueOnce(new Error("fixture rename failure"));
  const failed = clearPicked("qwen", path).catch(error => error);
  const next = setPicked("kimi", ["k3"], path);
  expect(await failed).toBeInstanceOf(Error);
  await next;
  expect(await getPicked("qwen", path)).toEqual(["coder-model"]);
  expect(await getPicked("kimi", path)).toEqual(["k3"]);
  expect(await readdir(join(path, ".."))).toEqual(["selection.json"]);
});

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
