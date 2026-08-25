import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import Schema from "@deepseek-ai/schemastery";
import { IMPORTER_IDS } from "./importers.ts";
import { MEMORY_SETTINGS_FILE } from "./names.ts";

export interface NoemaMemorySettings {
  enabled: boolean;
  command: string;
  workingDirectory: string;
  noemaRoot: string;
  autoStart: boolean;
  idleTimeoutMs: number;
  keepAlive: boolean;
  keepAliveIntervalMs: number;
  callTimeoutMs: number;
  restartDelayMs: number;
  recallBudgetTokens: number;
  acceptByDefault: boolean;
  guidance: boolean;
  importEnabled: boolean;
  importOnStartup: boolean;
  importWorkspaceFiles: boolean;
  importMaxBytes: number;
  importSources: string[];
}

export const NOEMA_MEMORY_SETTINGS_DEFAULTS: NoemaMemorySettings = {
  enabled: true,
  command: "bundled",
  workingDirectory: "",
  noemaRoot: "",
  autoStart: true,
  idleTimeoutMs: 0,
  keepAlive: true,
  keepAliveIntervalMs: 5_000,
  callTimeoutMs: 30_000,
  restartDelayMs: 1_000,
  recallBudgetTokens: 1_200,
  acceptByDefault: true,
  guidance: true,
  importEnabled: true,
  importOnStartup: false,
  importWorkspaceFiles: true,
  importMaxBytes: 65_536,
  importSources: ["codex", "claude-code", "opencode", "cursor", "grok", "workbuddy", "antigravity", "trae", "qoder", "hermes"],
};

export const Config: Schema<NoemaMemorySettings> = Schema.object({
  enabled: Schema.boolean().default(NOEMA_MEMORY_SETTINGS_DEFAULTS.enabled),
  command: Schema.string().default(NOEMA_MEMORY_SETTINGS_DEFAULTS.command),
  workingDirectory: Schema.string().default(NOEMA_MEMORY_SETTINGS_DEFAULTS.workingDirectory),
  noemaRoot: Schema.string().default(NOEMA_MEMORY_SETTINGS_DEFAULTS.noemaRoot),
  autoStart: Schema.boolean().default(NOEMA_MEMORY_SETTINGS_DEFAULTS.autoStart),
  idleTimeoutMs: Schema.number().default(NOEMA_MEMORY_SETTINGS_DEFAULTS.idleTimeoutMs),
  keepAlive: Schema.boolean().default(NOEMA_MEMORY_SETTINGS_DEFAULTS.keepAlive),
  keepAliveIntervalMs: Schema.number().default(NOEMA_MEMORY_SETTINGS_DEFAULTS.keepAliveIntervalMs),
  callTimeoutMs: Schema.number().min(1).default(NOEMA_MEMORY_SETTINGS_DEFAULTS.callTimeoutMs),
  restartDelayMs: Schema.number().default(NOEMA_MEMORY_SETTINGS_DEFAULTS.restartDelayMs),
  recallBudgetTokens: Schema.number().default(NOEMA_MEMORY_SETTINGS_DEFAULTS.recallBudgetTokens),
  acceptByDefault: Schema.boolean().default(NOEMA_MEMORY_SETTINGS_DEFAULTS.acceptByDefault),
  guidance: Schema.boolean().default(NOEMA_MEMORY_SETTINGS_DEFAULTS.guidance),
  importEnabled: Schema.boolean().default(NOEMA_MEMORY_SETTINGS_DEFAULTS.importEnabled),
  importOnStartup: Schema.boolean().default(NOEMA_MEMORY_SETTINGS_DEFAULTS.importOnStartup),
  importWorkspaceFiles: Schema.boolean().default(NOEMA_MEMORY_SETTINGS_DEFAULTS.importWorkspaceFiles),
  importMaxBytes: Schema.number().default(NOEMA_MEMORY_SETTINGS_DEFAULTS.importMaxBytes),
  importSources: Schema.array(Schema.string()).default(NOEMA_MEMORY_SETTINGS_DEFAULTS.importSources),
});

export type Config = NoemaMemorySettings;

export function settingsPath(): string {
  const home = process.env.DSH_HOME !== undefined && process.env.DSH_HOME !== "" ? process.env.DSH_HOME : join(homedir(), ".dsh");
  return join(home, "plugins", "memory", MEMORY_SETTINGS_FILE);
}

export function validateNoemaMemorySettings(value: Partial<NoemaMemorySettings>): void {
  for (const [field, label] of [
    ["idleTimeoutMs", "idle timeout"],
    ["restartDelayMs", "restart delay"],
  ] as const) {
    const current = value[field];
    if (current !== undefined && (!Number.isFinite(current) || current < 0)) {
      throw new Error(`记忆插件: ${label} (${field}) 必须是非负毫秒数`);
    }
  }
  if (value.callTimeoutMs !== undefined && (!Number.isInteger(value.callTimeoutMs) || value.callTimeoutMs < 1)) {
    throw new Error("记忆插件: 调用超时必须是至少 1 毫秒的正整数");
  }
  if (value.recallBudgetTokens !== undefined && (!Number.isInteger(value.recallBudgetTokens) || value.recallBudgetTokens < 1)) {
    throw new Error("记忆插件: 召回预算必须是正整数 token");
  }
  if (value.command !== undefined && value.command.trim() === "") {
    throw new Error("记忆插件: 服务器命令不能为空");
  }
  if (value.keepAliveIntervalMs !== undefined && (!Number.isInteger(value.keepAliveIntervalMs) || value.keepAliveIntervalMs < 1000)) {
    throw new Error("记忆插件: 保活间隔至少 1000 毫秒");
  }
  if (value.importMaxBytes !== undefined && (!Number.isInteger(value.importMaxBytes) || value.importMaxBytes < 1024)) {
    throw new Error("记忆插件: 导入文件上限至少 1024 字节");
  }
  if (value.importSources !== undefined) {
    const known = new Set(IMPORTER_IDS);
    for (const source of value.importSources) {
      if (!known.has(source)) throw new Error(`记忆插件: 未知导入源 ${JSON.stringify(source)}`);
    }
  }
}

const BOOLEAN_FIELDS = new Set<keyof NoemaMemorySettings>([
  "enabled", "autoStart", "keepAlive", "acceptByDefault", "guidance",
  "importEnabled", "importOnStartup", "importWorkspaceFiles",
]);
const NUMBER_FIELDS = new Set<keyof NoemaMemorySettings>([
  "idleTimeoutMs", "keepAliveIntervalMs", "callTimeoutMs", "restartDelayMs",
  "recallBudgetTokens", "importMaxBytes",
]);
const STRING_FIELDS = new Set<keyof NoemaMemorySettings>([
  "command", "workingDirectory", "noemaRoot",
]);

export function applySettingValue(field: keyof NoemaMemorySettings, value: unknown): Partial<NoemaMemorySettings> {
  if (BOOLEAN_FIELDS.has(field)) {
    if (typeof value !== "boolean") throw new Error(`记忆插件: ${String(field)} 必须是布尔值`);
    return { [field]: value };
  }
  if (NUMBER_FIELDS.has(field)) {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`记忆插件: ${String(field)} 必须是数字`);
    return { [field]: value };
  }
  if (STRING_FIELDS.has(field)) {
    if (typeof value !== "string") throw new Error(`记忆插件: ${String(field)} 必须是字符串`);
    return { [field]: value };
  }
  if (field === "importSources") {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
      throw new Error("记忆插件: importSources 必须是字符串数组");
    }
    return { importSources: value };
  }
  throw new Error(`记忆插件: 未知字段 ${String(field)}`);
}

export function resolveNoemaMemorySettings(
  entry: Partial<NoemaMemorySettings> | undefined,
  overlay: Partial<NoemaMemorySettings> = {},
): NoemaMemorySettings {
  return { ...NOEMA_MEMORY_SETTINGS_DEFAULTS, ...(entry ?? {}), ...overlay };
}

/** Process-launch fields are entry/profile-only; a disk overlay must never set them. */
const PROCESS_LAUNCH_FIELDS: readonly (keyof NoemaMemorySettings)[] = ["command", "workingDirectory", "noemaRoot"];

/**
 * Reduce a disk-loaded overlay to known, overlay-writable fields. Legacy or
 * hand-edited overlays may carry process launch fields (`command`,
 * `workingDirectory`, `noemaRoot`); accepting them would let a settings file
 * redirect which binary the plugin spawns, so they are dropped on load.
 */
export function sanitizeOverlay(value: unknown): Partial<NoemaMemorySettings> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const allowed = new Set<string>(Object.keys(NOEMA_MEMORY_SETTINGS_DEFAULTS));
  for (const field of PROCESS_LAUNCH_FIELDS) allowed.delete(field);
  const overlay: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (allowed.has(key)) overlay[key] = entry;
  }
  return overlay as Partial<NoemaMemorySettings>;
}

async function readOverlay(path: string): Promise<Partial<NoemaMemorySettings>> {
  try {
    return sanitizeOverlay(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      // malformed overlay is ignored; the next write replaces it
    }
  }
  return {};
}

export async function installNoemaMemorySettings(
  entry: Partial<NoemaMemorySettings>,
  hooks: {
    setSource: (source: () => NoemaMemorySettings) => void;
    setWriter: (writer: ((patch: Partial<NoemaMemorySettings>) => Promise<void>) | undefined) => void;
  },
): Promise<void> {
  const path = settingsPath();
  let overlay = await readOverlay(path);
  hooks.setSource(() => resolveNoemaMemorySettings(entry, overlay));
  hooks.setWriter(async (patch) => {
    validateNoemaMemorySettings(patch);
    overlay = { ...overlay, ...patch };
    const resolved = resolveNoemaMemorySettings(entry, overlay);
    validateNoemaMemorySettings(resolved);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, `${JSON.stringify(overlay, null, 2)}\n`, { mode: 0o600 });
  });
}

export { IMPORTER_IDS } from "./importers.ts";
