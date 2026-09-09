import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadRoutingPreference,
  requireRoutingMode,
  saveRoutingPreference,
  updateRoutingPreference,
} from "../src/router/preferences.ts";

vi.mock("node:fs/promises", async (original) => {
  const fs = await original<typeof import("node:fs/promises")>();
  return { ...fs, rename: vi.fn(fs.rename) };
});

const files: string[] = [];

afterEach(async () => {
  vi.mocked(rename).mockRestore();
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
  it("custom-path save does not prepare default storage", async () => {
    const path = await tempFile();
    const forbidden = `${path}-default-home`;
    const previous = process.env.DSH_HOME;
    process.env.DSH_HOME = forbidden;
    try {
      await saveRoutingPreference("smart", path);
      await expect(stat(forbidden)).rejects.toMatchObject({ code: "ENOENT" });
      expect(await loadRoutingPreference(path)).toEqual({ mode: "smart" });
    } finally {
      if (previous === undefined) delete process.env.DSH_HOME;
      else process.env.DSH_HOME = previous;
    }
  });

  it("prepares missing private parents without chmod of an existing caller directory", async () => {
    const path = await tempFile();
    const parent = join(path, "nested");
    await saveRoutingPreference("smart", join(parent, "routing.json"));
    expect((await stat(parent)).mode & 0o777).toBe(0o700);
    await chmod(parent, 0o755);
    await saveRoutingPreference("manual", join(parent, "routing.json"));
    expect((await stat(parent)).mode & 0o777).toBe(0o755);
    expect((await stat(join(parent, "routing.json"))).mode & 0o777).toBe(0o600);
  });

  it("serializes decision patches with mode writes and retains optional identity", async () => {
    const path = await tempFile();
    await saveRoutingPreference("smart", path);
    const lastSelected = {
      provider: "p",
      model: "m",
      sessionId: "A",
      turn: 2,
      step: 1,
    };
    await Promise.all([
      updateRoutingPreference({ lastSelected }, path),
      saveRoutingPreference("manual", path),
    ]);
    expect(await loadRoutingPreference(path)).toEqual({
      mode: "manual",
      lastSelected,
    });
  });

  it("keeps manual mode when a decision rename is held behind a controllable boundary", async () => {
    const path = await tempFile();
    await saveRoutingPreference("smart", path);
    const actual =
      await vi.importActual<typeof import("node:fs/promises")>(
        "node:fs/promises",
      );
    let release!: () => void;
    let reached!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      reached = resolve;
    });
    vi.mocked(rename).mockImplementationOnce(async (from, to) => {
      reached();
      await blocked;
      await actual.rename(from, to);
    });
    const lastSelected = {
      provider: "p",
      model: "new",
      sessionId: "A",
      turn: 4,
      step: 2,
    };
    const decision = updateRoutingPreference({ lastSelected }, path);
    await entered;
    let modeSaved = false;
    const mode = saveRoutingPreference("manual", path).then(() => {
      modeSaved = true;
    });
    await Promise.resolve();
    expect(modeSaved).toBe(false);
    release();
    await Promise.all([decision, mode]);
    expect(await loadRoutingPreference(path)).toEqual({
      mode: "manual",
      lastSelected,
    });
  });

  it("a failed transaction does not poison the next write", async () => {
    const path = await tempFile();
    await mkdir(path);
    await expect(
      updateRoutingPreference({ mode: "smart" }, path),
    ).rejects.toThrow();
    await rm(path, { recursive: true });
    await saveRoutingPreference("manual", path);
    expect(await loadRoutingPreference(path)).toEqual({ mode: "manual" });
  });
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

  it("persists lastSelected and keeps it when only mode is saved", async () => {
    const path = await tempFile();
    await saveRoutingPreference(
      {
        mode: "smart",
        lastSelected: {
          provider: "deepseek-official",
          model: "deepseek-chat",
          displayName: "DeepSeek",
        },
      },
      path,
    );
    expect(await loadRoutingPreference(path)).toEqual({
      mode: "smart",
      lastSelected: {
        provider: "deepseek-official",
        model: "deepseek-chat",
        displayName: "DeepSeek",
      },
    });
    await saveRoutingPreference("manual", path);
    expect(await loadRoutingPreference(path)).toEqual({
      mode: "manual",
      lastSelected: {
        provider: "deepseek-official",
        model: "deepseek-chat",
        displayName: "DeepSeek",
      },
    });
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
