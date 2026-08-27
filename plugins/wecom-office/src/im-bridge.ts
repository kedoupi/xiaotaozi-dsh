import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { IM_CONFIG_RELATIVE } from "./names.ts";
import { cleanString, deriveImBotIdentity, maskRemoteBotId } from "./identity.ts";

export interface ImWecomBot {
  botId: string;
  remoteBotId: string;
  secretRef: string;
  name: string;
  connectedAt: string | null;
}

export function dshHome(): string {
  return process.env.DSH_HOME !== undefined && process.env.DSH_HOME !== ""
    ? process.env.DSH_HOME
    : join(homedir(), ".dsh");
}

export function imWecomConfigPath(home = dshHome()): string {
  return join(home, ...IM_CONFIG_RELATIVE);
}

export function parseImWecomConfig(value: unknown): ImWecomBot[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
  const bots = (value as { version?: unknown; bots?: unknown }).bots;
  if ((value as { version?: unknown }).version !== 1 || !Array.isArray(bots)) return [];
  const result: ImWecomBot[] = [];
  for (const entry of bots) {
    if (typeof entry !== "object" || entry === null) continue;
    const remoteBotId = cleanString((entry as { remoteBotId?: unknown }).remoteBotId);
    const botId = cleanString((entry as { botId?: unknown }).botId);
    const secretRef = cleanString((entry as { secretRef?: unknown }).secretRef);
    if (!remoteBotId || !botId || !secretRef) continue;
    let derived;
    try {
      derived = deriveImBotIdentity(remoteBotId);
    } catch {
      continue;
    }
    if (derived.botId !== botId || derived.secretRef !== secretRef) continue;
    result.push({
      botId,
      remoteBotId,
      secretRef,
      name: cleanString((entry as { name?: unknown }).name) ?? "企业微信机器人",
      connectedAt: cleanString((entry as { connectedAt?: unknown }).connectedAt),
    });
  }
  return result;
}

export async function loadImWecomBots(path = imWecomConfigPath()): Promise<ImWecomBot[]> {
  try {
    return parseImWecomConfig(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    return [];
  }
}

export function maskImBots(bots: readonly ImWecomBot[]): Array<{
  botId: string;
  remoteBotIdMasked: string;
  name: string;
  source: "im";
  listed: true;
}> {
  return bots.map((bot) => ({
    botId: bot.botId,
    remoteBotIdMasked: maskRemoteBotId(bot.remoteBotId),
    name: bot.name,
    source: "im" as const,
    listed: true as const,
  }));
}
