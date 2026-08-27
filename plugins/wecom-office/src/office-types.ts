export type OfficeMainStatus =
  | "cli-missing"
  | "unbound"
  | "inactive"
  | "bound-activate-failed"
  | "activate-failed"
  | "active";

export interface OfficeBotOption {
  botId: string;
  remoteBotIdMasked: string;
  name: string;
  source: "im" | "standalone";
  listed: true;
}

export interface OfficeQrView {
  attemptId: string;
  status: "pending" | "refreshing" | "connecting" | "connected" | "failed" | "cancelled";
  expiresAt: number;
  pollIntervalMs: number;
  qrRevision: number;
  qrCodeDataUrl?: string;
  error?: { code: string; message: string };
}

export function isOfficeStatusPayload(value: unknown): value is OfficeStatusPayload {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.mainStatus === "string"
    && typeof record.cliInstalled === "boolean"
    && typeof record.imAvailable === "boolean"
    && Array.isArray(record.bots);
}

export interface OfficeStatusPayload {
  ok: boolean;
  imAvailable: boolean;
  cliInstalled: boolean;
  cliVersion?: string;
  mainStatus: OfficeMainStatus;
  selectedBotId: string;
  activeBotId: string;
  authorized: boolean;
  bots: OfficeBotOption[];
  qr: OfficeQrView | null;
  lastError?: { code: string; message: string };
  configDir: string;
  cliPath: string;
  writable: boolean;
  allowWrite: boolean;
  guidance: boolean;
}
