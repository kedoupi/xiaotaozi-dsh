import type { IncomingMessage, ServerResponse } from 'node:http'

function isIpv4LoopbackAddress(address: string): boolean {
  const parts = address.split('.')
  return parts.length === 4
    && parts[0] === '127'
    && parts.every(part => /^\d{1,3}$/u.test(part) && Number(part) <= 255)
}

/** Trust the transport peer, including Node's IPv4-mapped IPv6 forms. */
export function isLoopbackRemoteAddress(address: string | undefined): boolean {
  if (address === undefined) return false
  const normalized = address.toLowerCase().split('%', 1)[0]!
  if (normalized === '::1' || isIpv4LoopbackAddress(normalized)) return true
  if (!normalized.startsWith('::ffff:')) return false
  const mapped = normalized.slice('::ffff:'.length)
  if (isIpv4LoopbackAddress(mapped)) return true
  const hexadecimal = /^([a-f0-9]{1,4}):([a-f0-9]{1,4})$/u.exec(mapped)
  return hexadecimal !== null && (Number.parseInt(hexadecimal[1]!, 16) >>> 8) === 127
}

function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]' || hostname === '::1') return true
  return isIpv4LoopbackAddress(hostname)
}

function requestAuthority(req: IncomingMessage): URL | undefined {
  const host = req.headers.host
  if (typeof host !== 'string') return undefined
  if (host === '' || /[\s/@\\?#]/u.test(host)) return undefined
  try {
    const parsed = new URL('http://' + host)
    if (parsed.pathname !== '/' || parsed.search !== '' || parsed.hash !== '' || parsed.username !== '' || parsed.password !== '') {
      return undefined
    }
    return parsed
  } catch {
    return undefined
  }
}

/** Apply loopback peer, Host, Fetch Metadata, and optional Origin checks. */
export function isTrustedRouteRequest(req: IncomingMessage, requireOrigin = false): boolean {
  if (!isLoopbackRemoteAddress(req.socket?.remoteAddress)) return false
  const authority = requestAuthority(req)
  if (authority === undefined || !isLoopbackHostname(authority.hostname)) return false
  if (req.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = req.headers.origin
  if (origin === undefined) return !requireOrigin
  if (typeof origin !== 'string') return false
  try {
    const parsed = new URL(origin)
    return parsed.origin === authority.origin
  } catch {
    return false
  }
}

/** Security headers shared by every AgentTeams route response. */
export function routeSecurityHeaders(cacheControl: string): Record<string, string> {
  return {
    'cache-control': cacheControl,
    'x-content-type-options': 'nosniff',
    'cross-origin-resource-policy': 'same-origin',
    'referrer-policy': 'no-referrer',
  }
}

/** Reject an untrusted route request before reading state or assets. */
export function rejectUntrustedRouteRequest(req: IncomingMessage, res: ServerResponse): boolean {
  // State-changing methods must prove a same-origin browser context: browsers
  // always attach Origin to non-GET/HEAD cross-context requests, so requiring
  // it here blocks form-based and no-CORS CSRF against loopback routes.
  const requireOrigin = req.method !== 'GET' && req.method !== 'HEAD'
  if (isTrustedRouteRequest(req, requireOrigin)) return false
  const body = JSON.stringify({ ok: false, error: 'the AgentTeams route is loopback-only and requires a same-origin browser context' })
  res.writeHead(403, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    ...routeSecurityHeaders('no-store'),
  })
  res.end(body)
  return true
}
