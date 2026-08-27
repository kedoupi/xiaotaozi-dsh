import { createHash } from "node:crypto";

export function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function digest24(remoteBotId: string): string {
  return createHash("sha256").update(remoteBotId).digest("hex").slice(0, 24);
}

export function deriveImBotIdentity(remoteBotId: string): { botId: string; secretRef: string } {
  const raw = cleanString(remoteBotId);
  if (!raw) throw new TypeError("Enterprise WeChat bot ID is required");
  const digest = digest24(raw);
  return {
    botId: `wecom_${digest}`,
    secretRef: `DSH_WECOM_BOT_SECRET_${digest.toUpperCase()}`,
  };
}

export function deriveOfficeBotIdentity(remoteBotId: string): { botId: string; secretRef: string } {
  const raw = cleanString(remoteBotId);
  if (!raw) throw new TypeError("Enterprise WeChat bot ID is required");
  const digest = digest24(raw);
  return {
    botId: `office_${digest}`,
    secretRef: `DSH_WECOM_OFFICE_BOT_SECRET_${digest.toUpperCase()}`,
  };
}

export function maskRemoteBotId(remoteBotId: string): string {
  const value = cleanString(remoteBotId) ?? "";
  if (!value) return "企业微信机器人";
  if (value.length <= 10) return `${value.slice(0, 3)}•••`;
  return `${value.slice(0, 6)}••••${value.slice(-4)}`;
}

export function isImBotId(botId: string): boolean {
  return /^wecom_[a-f0-9]{24}$/.test(botId);
}

export function isOfficeBotId(botId: string): boolean {
  return /^office_[a-f0-9]{24}$/.test(botId);
}
