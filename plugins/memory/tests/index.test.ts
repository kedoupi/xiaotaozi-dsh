import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bundledNoemaCandidates, noemaPlatformKey } from "../src/bundled-binary.ts";
import { memoryGuidanceText } from "../src/guidance.ts";
import { importerById, IMPORTERS, resolveImporters } from "../src/importers.ts";
import { collectItems, limitUtf8Bytes, ruleItem, splitMarkdown } from "../src/import-service.ts";
import type { McpStdioClient } from "../src/mcp-stdio.ts";
import { NOEMA_TOOL_NAMES, PLUGIN_NAME } from "../src/names.ts";
import { NoemaServerManager, tokenizeCommand } from "../src/server-manager.ts";
import { isLoopbackRemoteAddress, isTrustedBrowserRequest, isWebWritableSetting } from "../src/status-route.ts";
import { applySettingValue, NOEMA_MEMORY_SETTINGS_DEFAULTS, resolveNoemaMemorySettings, sanitizeOverlay, validateNoemaMemorySettings } from "../src/settings.ts";
import { isPathWithinRoot, resolveAllowedWorkspacePath } from "../src/workspace-boundary.ts";

it("exports the plugin name and Noema tools", () => {
  expect(PLUGIN_NAME).toBe("memory");
  expect(NOEMA_TOOL_NAMES).toContain("noema_recall");
  expect(NOEMA_TOOL_NAMES).toHaveLength(15);
});

describe("importers", () => {
  it("declares the ten supported sources", () => {
    expect(IMPORTERS.map((importer) => importer.id)).toEqual([
      "codex", "claude-code", "opencode", "cursor", "grok", "workbuddy", "antigravity", "trae", "qoder", "hermes",
    ]);
    expect(resolveImporters(["cursor", "codex"]).map((importer) => importer.id)).toEqual(["codex", "cursor"]);
    expect(importerById("nope")).toBeUndefined();
  });

  it("expands home paths for global candidates", () => {
    const codex = importerById("codex");
    expect(codex?.globalCandidates().some((row) => row.path.endsWith(join(".codex", "AGENTS.md")))).toBe(true);
    expect(importerById("hermes")?.workspaceCandidates("/ws").some((row) => row.path.endsWith(".hermes.md"))).toBe(true);
  });
});

describe("markdown split", () => {
  it("splits headings and prefixes the source", () => {
    const items = splitMarkdown("codex", "Codex", "/tmp/AGENTS.md", [
      "Intro line",
      "## Build system",
      "We use bun everywhere.",
      "## Commits",
      "No commits before 21:00.",
    ].join("\n"));
    expect(items).toHaveLength(3);
    expect(items[0]?.heading).toBe("(top)");
    expect(items[1]?.heading).toBe("Build system");
    expect(items[1]?.text).toContain("Codex · AGENTS.md · Build system");
    expect(items[1]?.text).toContain("We use bun everywhere.");
    expect(items[1]?.text).not.toContain("No commits");
    expect(items[1]?.text).not.toContain("/tmp/");
  });

  it("extracts mdc frontmatter", () => {
    const item = ruleItem("cursor", "Cursor", "/tmp/rules/react.mdc", [
      "---",
      "description: React conventions",
      "alwaysApply: true",
      "---",
      "",
      "Use function components.",
    ].join("\n"));
    expect(item.heading).toBe("react.mdc");
    expect(item.text).toContain("Cursor · react.mdc");
    expect(item.text).toContain("React conventions");
    expect(item.body).toContain("Use function components.");
    expect(item.text).not.toContain("/tmp/");
  });
});

describe("guidance and settings", () => {
  it("drops guidance when disabled", () => {
    expect(memoryGuidanceText({ ...NOEMA_MEMORY_SETTINGS_DEFAULTS, enabled: false })).toBe("");
    expect(memoryGuidanceText({ ...NOEMA_MEMORY_SETTINGS_DEFAULTS, guidance: false })).toBe("");
    expect(memoryGuidanceText(NOEMA_MEMORY_SETTINGS_DEFAULTS)).toContain("noema_recall");
    expect(memoryGuidanceText(NOEMA_MEMORY_SETTINGS_DEFAULTS)).not.toContain("noema_review_list");
    expect(memoryGuidanceText(NOEMA_MEMORY_SETTINGS_DEFAULTS)).not.toContain("/_dsh/");
    expect(memoryGuidanceText({ ...NOEMA_MEMORY_SETTINGS_DEFAULTS, acceptByDefault: false })).toContain("noema_review_list");
  });

  it("validates numeric fields and import sources", () => {
    expect(() => validateNoemaMemorySettings({ callTimeoutMs: 0 })).toThrow(/调用超时/);
    expect(() => validateNoemaMemorySettings({ importSources: ["nope"] })).toThrow(/未知/);
    expect(resolveNoemaMemorySettings({ recallBudgetTokens: 800 }).recallBudgetTokens).toBe(800);
    expect(() => applySettingValue("enabled", "yes")).toThrow(/布尔/);
    expect(applySettingValue("enabled", false)).toEqual({ enabled: false });
  });

  it("strips process launch fields and unknown keys from disk overlays", () => {
    expect(sanitizeOverlay({
      enabled: false,
      command: "/tmp/evil",
      workingDirectory: "/tmp",
      noemaRoot: "/tmp/root",
      recallBudgetTokens: 900,
      mystery: "nope",
    })).toEqual({ enabled: false, recallBudgetTokens: 900 });
    expect(sanitizeOverlay(null)).toEqual({});
    expect(sanitizeOverlay(["command"])).toEqual({});
    expect(sanitizeOverlay("command")).toEqual({});
    // the overlay never overrides launch fields even through resolution
    const resolved = resolveNoemaMemorySettings({}, sanitizeOverlay({ command: "/tmp/evil" }));
    expect(resolved.command).toBe(NOEMA_MEMORY_SETTINGS_DEFAULTS.command);
  });

  it("caps CJK by UTF-8 bytes not UTF-16 units", () => {
    const chinese = Buffer.from("中".repeat(10), "utf8");
    expect(chinese.length).toBe(30);
    const limited = limitUtf8Bytes(chinese, 6);
    expect(limited.truncated).toBe(true);
    expect(Buffer.byteLength(limited.text.split("\n")[0] ?? "", "utf8")).toBe(6);
  });
});

describe("launch helpers", () => {
  it("tokenizes a command without a shell", () => {
    expect(tokenizeCommand(`bundled --flag "quoted arg"`)).toEqual(["bundled", "--flag", "quoted arg"]);
  });

  it("lists bundled binary candidates for this platform", () => {
    const key = noemaPlatformKey();
    const candidates = bundledNoemaCandidates({ isFile: () => false, resolvePackageJson: () => {
      throw new Error("missing");
    } });
    expect(key.includes("-")).toBe(true);
    expect(candidates.some((path) => path.includes("noema-mcp"))).toBe(true);
  });
});

describe("status route trust", () => {
  it("accepts loopback addresses", () => {
    expect(isLoopbackRemoteAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackRemoteAddress("::1")).toBe(true);
    expect(isLoopbackRemoteAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopbackRemoteAddress("8.8.8.8")).toBe(false);
  });

  it("does not expose process launch paths as Web-writable settings", () => {
    expect(isWebWritableSetting("enabled")).toBe(true);
    expect(isWebWritableSetting("command")).toBe(false);
    expect(isWebWritableSetting("workingDirectory")).toBe(false);
    expect(isWebWritableSetting("noemaRoot")).toBe(false);
  });

  it("requires the exact http origin and rejects malformed Host headers", () => {
    const request = (host: string, origin: string) => ({
      headers: { host, origin },
    }) as Parameters<typeof isTrustedBrowserRequest>[0];
    expect(isTrustedBrowserRequest(request("localhost:3081", "http://localhost:3081"), true)).toBe(true);
    expect(isTrustedBrowserRequest(request("localhost:3081", "https://localhost:3081"), true)).toBe(false);
    expect(isTrustedBrowserRequest(request(" localhost:3081", "http://localhost:3081"), true)).toBe(false);
    expect(isTrustedBrowserRequest(request("localhost:3081@evil.test", "http://evil.test"), true)).toBe(false);
  });
});

describe("workspace import boundary", () => {
  it("uses path segments rather than string prefixes", () => {
    expect(isPathWithinRoot("/work/project/subdir", "/work/project")).toBe(true);
    expect(isPathWithinRoot("/work/project-evil", "/work/project")).toBe(false);
    expect(isPathWithinRoot("/work/project/../secret", "/work/project")).toBe(false);
  });

  it("accepts real descendants and rejects symlink escapes", async () => {
    const base = await mkdtemp(join(tmpdir(), "dsh-memory-boundary-"));
    const workspace = join(base, "workspace");
    const child = join(workspace, "child");
    const outside = join(base, "outside");
    await mkdir(child, { recursive: true });
    await mkdir(outside);
    await symlink(outside, join(workspace, "escape"));
    try {
      await expect(resolveAllowedWorkspacePath(child, [workspace])).resolves.toBe(await realpath(child));
      await expect(resolveAllowedWorkspacePath(join(workspace, "escape"), [workspace])).rejects.toThrow(/outside/);
      await expect(resolveAllowedWorkspacePath(child, undefined)).rejects.toThrow(/unavailable/);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});

const TEST_IMPORTER = {
  id: "test",
  label: "Test",
  globalCandidates: () => [],
  workspaceCandidates: () => [],
};

async function directorySymlink(target: string, path: string): Promise<void> {
  await symlink(target, path, process.platform === "win32" ? "junction" : "dir");
}

describe("recursive import symlink boundary", () => {
  it("rejects a recursive entry symlink that resolves outside the workspace", async () => {
    const base = await mkdtemp(join(tmpdir(), "dsh-memory-import-entry-link-"));
    const workspace = join(base, "workspace");
    const outside = join(base, "outside-rules");
    const entry = join(workspace, ".cursor", "rules");
    await mkdir(join(workspace, ".cursor"), { recursive: true });
    await mkdir(outside);
    await writeFile(join(outside, "escaped.mdc"), "outside");
    await directorySymlink(outside, entry);
    const errors: string[] = [];
    try {
      await expect(collectItems(TEST_IMPORTER, entry, "rules", ".cursor/rules", 4096, errors, workspace)).resolves.toEqual([]);
      expect(errors.join("\n")).toMatch(/symbolic link resolves outside the allowed import root/);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it("rejects a descendant file symlink that resolves outside the workspace", async () => {
    const base = await mkdtemp(join(tmpdir(), "dsh-memory-import-child-link-"));
    const workspace = join(base, "workspace");
    const rules = join(workspace, ".cursor", "rules");
    const outside = join(base, "outside.mdc");
    await mkdir(rules, { recursive: true });
    await writeFile(outside, "outside");
    await symlink(outside, join(rules, "escaped.mdc"), "file");
    const errors: string[] = [];
    try {
      await expect(collectItems(TEST_IMPORTER, rules, "rules", ".cursor/rules", 4096, errors, workspace)).resolves.toEqual([]);
      expect(errors.join("\n")).toMatch(/symbolic link resolves outside the allowed import root/);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it("visits a real directory once when an in-workspace symlink creates a loop", async () => {
    const base = await mkdtemp(join(tmpdir(), "dsh-memory-import-link-loop-"));
    const workspace = join(base, "workspace");
    const rules = join(workspace, ".cursor", "rules");
    const nested = join(rules, "nested");
    await mkdir(nested, { recursive: true });
    await writeFile(join(rules, "inside.mdc"), "Use safe imports.");
    await directorySymlink(rules, join(nested, "loop"));
    const errors: string[] = [];
    try {
      const items = await collectItems(TEST_IMPORTER, rules, "rules", ".cursor/rules", 4096, errors, workspace);
      expect(items.map(item => item.body)).toEqual(["Use safe imports."]);
      expect(errors).toEqual([]);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: Error): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function fakeManagedClient(callTool: (name: string) => Promise<{ text: string }>) {
  let state: "stopped" | "running" = "stopped";
  let disposeCount = 0;
  return {
    get state() { return state; },
    get disposeCount() { return disposeCount; },
    pid: 123,
    startedAt: 1,
    exitAt: undefined,
    async start() { state = "running"; },
    callTool,
    async dispose() {
      disposeCount += 1;
      state = "stopped";
    },
  };
}

function idleSettings(idleTimeoutMs = 50) {
  return {
    ...NOEMA_MEMORY_SETTINGS_DEFAULTS,
    command: "fake-noema",
    keepAlive: false,
    restartDelayMs: 0,
    idleTimeoutMs,
  };
}

afterEach(() => vi.useRealTimers());

describe("server manager idle calls", () => {
  it("does not stop during a successful active MCP call and arms idle after success", async () => {
    vi.useFakeTimers();
    const entered = deferred<void>();
    const response = deferred<{ text: string }>();
    const client = fakeManagedClient(async () => {
      entered.resolve();
      return response.promise;
    });
    const manager = new NoemaServerManager(
      () => idleSettings(),
      undefined,
      () => client as unknown as McpStdioClient,
    );

    const call = manager.call("noema_recall", {}, {});
    await entered.promise;
    await vi.advanceTimersByTimeAsync(100);
    expect(client.disposeCount).toBe(0);
    response.resolve({ text: "ok" });
    await expect(call).resolves.toEqual({ text: "ok" });
    await vi.advanceTimersByTimeAsync(49);
    expect(client.disposeCount).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(client.disposeCount).toBe(1);
  });

  it("does not stop during a failing active MCP call and arms idle after failure", async () => {
    vi.useFakeTimers();
    const entered = deferred<void>();
    const response = deferred<{ text: string }>();
    const client = fakeManagedClient(async () => {
      entered.resolve();
      return response.promise;
    });
    const manager = new NoemaServerManager(
      () => idleSettings(),
      undefined,
      () => client as unknown as McpStdioClient,
    );

    const call = manager.call("noema_remember", {}, {});
    const rejected = expect(call).rejects.toThrow("tool failed");
    await entered.promise;
    await vi.advanceTimersByTimeAsync(100);
    expect(client.disposeCount).toBe(0);
    response.reject(new Error("tool failed"));
    await rejected;
    await vi.advanceTimersByTimeAsync(50);
    expect(client.disposeCount).toBe(1);
  });

  it("waits for the last concurrent MCP call before arming idle", async () => {
    vi.useFakeTimers();
    const firstEntered = deferred<void>();
    const secondEntered = deferred<void>();
    const firstResponse = deferred<{ text: string }>();
    const secondResponse = deferred<{ text: string }>();
    const client = fakeManagedClient(async name => {
      if (name === "first") {
        firstEntered.resolve();
        return firstResponse.promise;
      }
      secondEntered.resolve();
      return secondResponse.promise;
    });
    const manager = new NoemaServerManager(
      () => idleSettings(),
      undefined,
      () => client as unknown as McpStdioClient,
    );

    const first = manager.call("first", {}, {});
    const second = manager.call("second", {}, {});
    await Promise.all([firstEntered.promise, secondEntered.promise]);
    await vi.advanceTimersByTimeAsync(100);
    expect(client.disposeCount).toBe(0);
    firstResponse.resolve({ text: "first done" });
    await expect(first).resolves.toEqual({ text: "first done" });
    await vi.advanceTimersByTimeAsync(100);
    expect(client.disposeCount).toBe(0);
    secondResponse.resolve({ text: "second done" });
    await expect(second).resolves.toEqual({ text: "second done" });
    await vi.advanceTimersByTimeAsync(50);
    expect(client.disposeCount).toBe(1);
  });
});
