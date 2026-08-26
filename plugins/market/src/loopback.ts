import type { IncomingMessage } from "node:http";

function isIpv4LoopbackAddress(address: string): boolean {
  const parts = address.split(".");
  return parts.length === 4
    && parts[0] === "127"
    && parts.every((part) => /^\d{1,3}$/u.test(part) && Number(part) <= 255);
}

export function isLoopbackRemoteAddress(address: string | undefined): boolean {
  if (address === undefined) return false;
  const normalized = address.toLowerCase().split("%", 1)[0]!;
  if (normalized === "::1" || isIpv4LoopbackAddress(normalized)) return true;
  if (!normalized.startsWith("::ffff:")) return false;
  const mapped = normalized.slice("::ffff:".length);
  if (isIpv4LoopbackAddress(mapped)) return true;
  const hexadecimal = /^([a-f0-9]{1,4}):([a-f0-9]{1,4})$/u.exec(mapped);
  return hexadecimal !== null && (Number.parseInt(hexadecimal[1]!, 16) >>> 8) === 127;
}

function isLoopbackHostname(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "[::1]" || hostname === "::1") return true;
  return isIpv4LoopbackAddress(hostname);
}

function requestAuthority(req: IncomingMessage): URL | undefined {
  const host = req.headers.host;
  if (typeof host !== "string") return undefined;
  try {
    const parsed = new URL(`http://${host}`);
    if (parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== "" || parsed.username !== "" || parsed.password !== "") {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

/** Loopback peer, Host, Fetch-Metadata, and same-origin Origin (required for mutations). */
export function isTrustedRouteRequest(req: IncomingMessage, requireOrigin = false): boolean {
  if (!isLoopbackRemoteAddress(req.socket?.remoteAddress)) return false;
  const authority = requestAuthority(req);
  if (authority === undefined || !isLoopbackHostname(authority.hostname)) return false;
  if (req.headers["sec-fetch-site"] === "cross-site") return false;
  const origin = req.headers.origin;
  if (origin === undefined) return !requireOrigin;
  if (typeof origin !== "string") return false;
  try {
    const parsed = new URL(origin);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.host === authority.host;
  } catch {
    return false;
  }
}
