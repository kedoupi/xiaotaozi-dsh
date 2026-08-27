import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import Schema from "@deepseek-ai/schemastery";
import { SETTINGS_FILE } from "./names.ts";
import { dshHome } from "./im-bridge.ts";

export interface StandaloneBot {
  botId: string;
  remoteBotId: string;
  secretRef: string;
  name: string;
}

export type OfficeIdentitySource = "im" | "standalone";

export interface OfficeIdentity extends StandaloneBot {
  source: OfficeIdentitySource;
}

export interface WecomOfficeSettings {
  cliPath: string;
  configDir: string;
  callTimeoutMs: number;
  enabledServices: string[];
  allowWrite: boolean;
  selectedBotId: string;
  activeBotId: string;
  guidance: boolean;
  standaloneBot: StandaloneBot | null;
  activeIdentity: OfficeIdentity | null;
}

export const OFFICE_SETTINGS_DEFAULTS: WecomOfficeSettings = {
  cliPath: "wecom-cli",
  configDir: "",
  callTimeoutMs: 30_000,
  enabledServices: [
    "calendar", "doc", "meeting", "contact", "sheet", "smartsheet", "smartpage",
    "todo", "disk", "mail", "media", "chat", "message",
  ],
  allowWrite: true,
  selectedBotId: "",
  activeBotId: "",
  guidance: true,
  standaloneBot: null,
  activeIdentity: null,
};

export const Config: Schema<WecomOfficeSettings> = Schema.object({
  cliPath: Schema.string().default(OFFICE_SETTINGS_DEFAULTS.cliPath),
  configDir: Schema.string().default(OFFICE_SETTINGS_DEFAULTS.configDir),
  callTimeoutMs: Schema.number().min(1).default(OFFICE_SETTINGS_DEFAULTS.callTimeoutMs),
  enabledServices: Schema.array(Schema.string()).default(OFFICE_SETTINGS_DEFAULTS.enabledServices),
  allowWrite: Schema.boolean().default(OFFICE_SETTINGS_DEFAULTS.allowWrite),
  selectedBotId: Schema.string().default(OFFICE_SETTINGS_DEFAULTS.selectedBotId),
  activeBotId: Schema.string().default(OFFICE_SETTINGS_DEFAULTS.activeBotId),
  guidance: Schema.boolean().default(OFFICE_SETTINGS_DEFAULTS.guidance),
  standaloneBot: Schema.any(),
  activeIdentity: Schema.any(),
});

export type Config = WecomOfficeSettings;

const OVERLAY_FIELDS = new Set(["selectedBotId", "activeBotId", "guidance", "allowWrite", "standaloneBot", "activeIdentity"]);

export function resolveConfigDir(settings: WecomOfficeSettings, home = dshHome()): string {
  if (settings.configDir.trim() !== "") return settings.configDir.trim();
  return join(home, "plugins", "wecom-office");
}

export function settingsPath(home = dshHome()): string {
  return join(home, "plugins", "wecom-office", SETTINGS_FILE);
}

export function sanitizeOverlay(value: unknown): Partial<WecomOfficeSettings> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const overlay: Partial<WecomOfficeSettings> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!OVERLAY_FIELDS.has(key)) continue;
    if ((key === "guidance" || key === "allowWrite") && typeof entry === "boolean") overlay[key] = entry;
    if ((key === "selectedBotId" || key === "activeBotId") && typeof entry === "string") {
      overlay[key] = entry;
    }
    if (key === "standaloneBot") overlay.standaloneBot = parseStandalone(entry);
    if (key === "activeIdentity") overlay.activeIdentity = parseIdentity(entry);
  }
  return overlay;
}

function parseStandalone(value: unknown): StandaloneBot | null {
  if (value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.botId !== "string" || typeof record.remoteBotId !== "string" || typeof record.secretRef !== "string") {
    return null;
  }
  return {
    botId: record.botId,
    remoteBotId: record.remoteBotId,
    secretRef: record.secretRef,
    name: typeof record.name === "string" && record.name.trim() ? record.name.trim() : "企业微信机器人",
  };
}

function parseIdentity(value: unknown): OfficeIdentity | null {
  const bot = parseStandalone(value);
  if (!bot) return null;
  const source = (value as { source?: unknown }).source === "im" ? "im" : "standalone";
  return { ...bot, source };
}

export function resolveOfficeSettings(
  entry: Partial<WecomOfficeSettings> | undefined,
  overlay: Partial<WecomOfficeSettings> = {},
): WecomOfficeSettings {
  const merged = { ...OFFICE_SETTINGS_DEFAULTS, ...(entry ?? {}), ...overlay };
  if (!Array.isArray(merged.enabledServices) || merged.enabledServices.length === 0) {
    merged.enabledServices = [...OFFICE_SETTINGS_DEFAULTS.enabledServices];
  }
  merged.standaloneBot = parseStandalone(merged.standaloneBot) ?? null;
  merged.activeIdentity = parseIdentity(merged.activeIdentity);
  return merged;
}

async function readOverlay(path: string): Promise<Partial<WecomOfficeSettings>> {
  try {
    return sanitizeOverlay(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      // ignore malformed overlay; next write replaces it
    }
  }
  return {};
}

export async function installOfficeSettings(
  entry: Partial<WecomOfficeSettings>,
  hooks: {
    setSource: (source: () => WecomOfficeSettings) => void;
    setWriter: (writer: ((patch: Partial<WecomOfficeSettings>) => Promise<void>) | undefined) => void;
  },
): Promise<void> {
  const path = settingsPath();
  let overlay = await readOverlay(path);
  hooks.setSource(() => resolveOfficeSettings(entry, overlay));
  hooks.setWriter(async (patch) => {
    overlay = sanitizeOverlay({ ...overlay, ...patch });
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, `${JSON.stringify(overlay, null, 2)}\n`, { mode: 0o600 });
  });
}
