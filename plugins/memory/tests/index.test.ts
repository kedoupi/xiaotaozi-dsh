import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bundledNoemaCandidates, noemaPlatformKey } from "../src/bundled-binary.ts";
import { memoryGuidanceText } from "../src/guidance.ts";
import { importerById, IMPORTERS, resolveImporters } from "../src/importers.ts";
import { limitUtf8Bytes, ruleItem, splitMarkdown } from "../src/import-service.ts";
import { NOEMA_TOOL_NAMES, PLUGIN_NAME } from "../src/names.ts";
import { tokenizeCommand } from "../src/server-manager.ts";
import { isLoopbackRemoteAddress } from "../src/status-route.ts";
import { applySettingValue, NOEMA_MEMORY_SETTINGS_DEFAULTS, resolveNoemaMemorySettings, validateNoemaMemorySettings } from "../src/settings.ts";

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
});


