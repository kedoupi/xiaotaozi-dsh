import { isStampPort, webLaunchArgs } from "./ports";
import { OFFICIAL_PORT } from "./status";

export const WEB_PID_FILE = "xiaotaozi-xtz-web.pid";
export const XTZ_STAMP_FILE = "xiaotaozi-xtz.json";
export const WEB_READY_ATTEMPTS = 40;
export const WEB_READY_DELAY_MS = 250;
export const WEB_LAUNCH_ARGS = webLaunchArgs(OFFICIAL_PORT);

export interface WebPidRecord {
  pid: number;
  startedAt: string;
}

export interface XtzStamp {
  writer: "xtz";
  createdAt: string;
  plugins?: string[];
  port?: number;
}

export function parseWebPidRecord(text: string | null): WebPidRecord | null {
  if (text === null) return null;
  try {
    const parsed = JSON.parse(text) as { pid?: unknown; startedAt?: unknown };
    if (!Number.isInteger(parsed.pid) || (parsed.pid as number) <= 1) return null;
    if (typeof parsed.startedAt !== "string" || parsed.startedAt.length === 0) return null;
    return { pid: parsed.pid as number, startedAt: parsed.startedAt };
  } catch {
    return null;
  }
}

export function parseXtzStamp(text: string | null): XtzStamp | null {
  if (text === null) return null;
  try {
    const parsed = JSON.parse(text) as { writer?: unknown; createdAt?: unknown; plugins?: unknown; port?: unknown };
    if (parsed.writer !== "xtz") return null;
    if (typeof parsed.createdAt !== "string" || parsed.createdAt.length === 0) return null;
    const stamp: XtzStamp = { writer: "xtz", createdAt: parsed.createdAt };
    if (Array.isArray(parsed.plugins) && parsed.plugins.every((item) => typeof item === "string")) {
      stamp.plugins = parsed.plugins;
    }
    if (typeof parsed.port === "number" && isStampPort(parsed.port)) stamp.port = parsed.port;
    return stamp;
  } catch {
    return null;
  }
}
