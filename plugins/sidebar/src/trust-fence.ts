/**
 * Browser-trust fence for the privileged sidebar routes. Unlike the generic
 * /api gateway, this surface exposes filesystem, Git and PTY capabilities,
 * so a configured LAN trusted-host is not sufficient authority: the network
 * peer and Host must both be loopback. Mutations and WebSocket upgrades also
 * require an exact same-origin Origin (including the port).
 */
import type { IncomingHttpHeaders } from 'node:http'
import { isLoopbackRemoteAddress } from './loopback.ts'

/** The request facts the fence reads (structural subset of IncomingMessage). */
interface ApiTrustRequest {
  method?: string
  headers: IncomingHttpHeaders
  socket?: { remoteAddress?: string }
}

function header(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name]
  return typeof value === 'string' ? value : undefined
}

/** Normalized URL of a Host-header authority, or undefined when unparsable. */
function parseAuthority(authority: string): URL | undefined {
  if (
    authority === ''
    || /[\s/@\\?#]/u.test(authority)
  ) return undefined
  try {
    const parsed = new URL(`http://${authority}`)
    if (
      parsed.username !== ''
      || parsed.password !== ''
      || parsed.pathname !== '/'
      || parsed.search !== ''
      || parsed.hash !== ''
    ) return undefined
    return parsed
  } catch {
    return undefined
  }
}

/** Whether a normalized URL hostname names the local loopback authority. */
export function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return parts.length === 4
    && parts[0] === '127'
    && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

/**
 * Decide whether one sidebar request may reach the plugin routes.
 * @param request - node HTTP request facts.
 * @param requireOrigin - force an Origin for GET-like transports such as WebSocket upgrades.
 * @returns true only for a loopback peer, loopback Host and exact same-origin browser request.
 */
export function isTrustedApiRequest(request: ApiTrustRequest, requireOrigin = false): boolean {
  if (!isLoopbackRemoteAddress(request.socket?.remoteAddress)) return false
  const host = header(request.headers, 'host')
  if (host === undefined) return false
  const hostUrl = parseAuthority(host)
  if (hostUrl === undefined) return false
  if (!isLoopbackHostname(hostUrl.hostname)) return false
  if (header(request.headers, 'sec-fetch-site') === 'cross-site') return false
  const origin = header(request.headers, 'origin')
  const method = request.method?.toUpperCase()
  const mutation = method !== undefined && method !== 'GET' && method !== 'HEAD'
  if (origin === undefined) return !requireOrigin && !mutation
  try {
    const originUrl = new URL(origin)
    return originUrl.origin === hostUrl.origin
  } catch {
    return false
  }
}
