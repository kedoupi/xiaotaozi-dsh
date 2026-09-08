import { join } from "node:path";

export const WEB_AUTH_URL_FILE = "xiaotaozi-xtz-web.auth";

export interface WebAuthUrlRecord {
  pid: number;
  url: string;
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK.has(hostname.toLowerCase());
}

export function redactLaunchToken(text: string): string {
  return text.replace(/([?&]token=)[^&\s#]+/giu, "$1[redacted]");
}

export function parseDshWebAuthenticatedUrl(text: string): string | undefined {
  for (const raw of text.split(/\r?\n/u)) {
    const match = /^dsh web: (https?:\/\/\S+)/u.exec(raw.trim());
    if (match === null) continue;
    try {
      const url = new URL(match[1]);
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      if (!isLoopbackHost(url.hostname)) continue;
      const tokens = url.searchParams.getAll("token");
      if (tokens.length !== 1 || tokens[0] === undefined || tokens[0].length === 0) continue;
      url.hash = "";
      return url.href;
    } catch {
      continue;
    }
  }
  return undefined;
}

export function parseWebAuthUrlRecord(text: string | null): WebAuthUrlRecord | null {
  if (text === null) return null;
  try {
    const parsed = JSON.parse(text) as { pid?: unknown; url?: unknown };
    if (!Number.isInteger(parsed.pid) || (parsed.pid as number) <= 1) return null;
    if (typeof parsed.url !== "string" || parsed.url.length === 0) return null;
    const url = new URL(parsed.url);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!isLoopbackHost(url.hostname)) return null;
    const tokens = url.searchParams.getAll("token");
    if (tokens.length !== 1 || tokens[0] === undefined || tokens[0].length === 0) return null;
    return { pid: parsed.pid as number, url: url.href };
  } catch {
    return null;
  }
}

export function authUrlMatchesPort(url: string, host: string, port: number): boolean {
  try {
    const parsed = new URL(url);
    const parsedPort = parsed.port === "" ? (parsed.protocol === "https:" ? 443 : 80) : Number(parsed.port);
    return parsed.hostname === host && parsedPort === port;
  } catch {
    return false;
  }
}

export function webAuthUrlPath(home: string): string {
  return join(home, WEB_AUTH_URL_FILE);
}
