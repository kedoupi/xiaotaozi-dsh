import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadRoutingPreference,
  requireRoutingMode,
  saveRoutingPreference,
} from "../src/router/preferences.ts";

const files: string[] = [];

afterEach(async () => {
  await Promise.all(
    files.splice(0).map((file) => rm(file, { force: true, recursive: true })),
  );
});

async function tempFile(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "providers-route-"));
  files.push(dir);
  return join(dir, "routing.json");
}

describe("routing preference store", () => {
  it("defaults to manual when the file is missing", async () => {
    const path = await tempFile();
    expect(await loadRoutingPreference(path)).toEqual({ mode: "manual" });
  });

  it("defaults to manual when JSON is broken or the mode is invalid", async () => {
    const path = await tempFile();
    await writeFile(path, "{");
    expect(await loadRoutingPreference(path)).toEqual({ mode: "manual" });
    await writeFile(path, JSON.stringify({ mode: "auto" }));
    expect(await loadRoutingPreference(path)).toEqual({ mode: "manual" });
    await writeFile(path, JSON.stringify({ mode: "quality" }));
    expect(await loadRoutingPreference(path)).toEqual({ mode: "manual" });
  });

  it("reads smart and writes only mode at 0600", async () => {
    const path = await tempFile();
    await saveRoutingPreference("smart", path);
    expect(await loadRoutingPreference(path)).toEqual({ mode: "smart" });
    const raw = JSON.parse(await readFile(path, "utf8")) as unknown;
    expect(raw).toEqual({ mode: "smart" });
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    await saveRoutingPreference("manual", path);
    expect(await loadRoutingPreference(path)).toEqual({ mode: "manual" });
  });

  it("ignores extra keys instead of persisting them", async () => {
    const path = await tempFile();
    await writeFile(
      path,
      JSON.stringify({
        mode: "smart",
        objective: "economy",
        classifier: true,
        prompt: "secret",
      }),
    );
    expect(await loadRoutingPreference(path)).toEqual({ mode: "smart" });
    await saveRoutingPreference("smart", path);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ mode: "smart" });
  });
});

describe("requireRoutingMode", () => {
  it("accepts only manual or smart", () => {
    expect(requireRoutingMode("manual")).toBe("manual");
    expect(requireRoutingMode("smart")).toBe("smart");
    expect(() => requireRoutingMode("auto")).toThrow(/manual or smart/);
    expect(() => requireRoutingMode(undefined)).toThrow(/manual or smart/);
    expect(() => requireRoutingMode({ mode: "smart" })).toThrow(
      /manual or smart/,
    );
  });
});
