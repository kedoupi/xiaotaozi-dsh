/**
 * Helpers for the `browser.probe` route (sidebar browser). Network probing
 * resolves and pins a public address for every redirect hop; private,
 * loopback, link-local, documentation and transition ranges are refused.
 */
import { lookup } from 'node:dns/promises'
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { BlockList, isIP, type LookupFunction } from 'node:net'

const blockedIpv4 = new BlockList()
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) {
  blockedIpv4.addSubnet(address, prefix, 'ipv4')
}
const blockedIpv6 = new BlockList()
for (const [address, prefix] of [
  ['::', 8], ['2001::', 23], ['2001:db8::', 32], ['2002::', 16],
  ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
] as const) {
  blockedIpv6.addSubnet(address, prefix, 'ipv6')
}

export class UnsafeProbeTargetError extends Error {}

/** Whether an address is globally routable enough for a server-side probe. */
export function isPublicProbeAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) return !blockedIpv4.check(address, 'ipv4')
  if (family === 6) return !blockedIpv6.check(address, 'ipv6')
  return false
}

interface ProbeResponse {
  url: string
  status: number
  headers: IncomingHttpHeaders
}

interface PinnedAddress {
  address: string
  family: 4 | 6
}

type ProbeMethod = 'HEAD' | 'GET'

/** Narrow dependency seam used by the network-boundary tests. */
interface ProbeDependencies {
  lookup?: (
    hostname: string,
    options: { all: true; verbatim: true },
  ) => Promise<readonly { address: string; family: number }[]>
  request?: (
    url: URL,
    method: ProbeMethod,
    signal: AbortSignal,
    pinned: PinnedAddress,
  ) => Promise<ProbeResponse & { location?: string }>
  dnsTimeoutMs?: number
}

/** A DNS query gets its own bound even when the caller forgot a deadline. */
const DEFAULT_DNS_TIMEOUT_MS = 5_000

function abortError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason
  const error = new Error('browser probe aborted')
  error.name = 'AbortError'
  return error
}

async function lookupWithDeadline(
  hostname: string,
  signal: AbortSignal,
  lookupAddress: NonNullable<ProbeDependencies['lookup']>,
  timeoutMs: number,
): Promise<readonly { address: string; family: number }[]> {
  if (signal.aborted) throw abortError(signal)
  return await new Promise((resolve, reject) => {
    let settled = false
    const finish = (callback: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      callback()
    }
    const onAbort = (): void => finish(() => reject(abortError(signal)))
    const timer = setTimeout(() => {
      finish(() => reject(new Error(`DNS lookup for "${hostname}" timed out`)))
    }, timeoutMs)
    timer.unref?.()
    signal.addEventListener('abort', onAbort, { once: true })
    void Promise.resolve()
      .then(async () => await lookupAddress(hostname, { all: true, verbatim: true }))
      .then(
        answers => finish(() => resolve(answers)),
        error => finish(() => reject(error)),
      )
  })
}

/** WHATWG URL keeps brackets in IPv6 `hostname`; DNS and `isIP` do not. */
function addressHostname(url: URL): string {
  const hostname = url.hostname
  return hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname
}

async function resolvePinnedAddresses(
  url: URL,
  signal: AbortSignal,
  dependencies: ProbeDependencies,
): Promise<PinnedAddress[]> {
  if (url.username !== '' || url.password !== '') {
    throw new UnsafeProbeTargetError('probe urls cannot contain credentials')
  }

  const hostname = addressHostname(url)
  const literalFamily = isIP(hostname)
  const answers = literalFamily === 4 || literalFamily === 6
    ? [{ address: hostname, family: literalFamily }]
    : await lookupWithDeadline(
      hostname,
      signal,
      dependencies.lookup ?? lookup,
      dependencies.dnsTimeoutMs ?? DEFAULT_DNS_TIMEOUT_MS,
    )

  if (answers.length === 0) {
    throw new UnsafeProbeTargetError('target hostname did not resolve to IPv4 or IPv6')
  }
  const pinned: PinnedAddress[] = []
  const seen = new Set<string>()
  for (const answer of answers) {
    const actualFamily = isIP(answer.address)
    if ((actualFamily !== 4 && actualFamily !== 6)
      || answer.family !== actualFamily
      || !isPublicProbeAddress(answer.address)) {
      // Fail the whole hostname closed. Choosing only its public answer would
      // let an attacker steer other clients (or a later retry) to the private
      // half of a mixed DNS response.
      throw new UnsafeProbeTargetError('private or special network addresses cannot be probed')
    }
    const key = `${String(actualFamily)}:${answer.address}`
    if (seen.has(key)) continue
    seen.add(key)
    pinned.push({ address: answer.address, family: actualFamily })
  }
  if (pinned.length === 0) {
    throw new UnsafeProbeTargetError('private or special network addresses cannot be probed')
  }
  return pinned
}

async function requestPinnedHeaders(
  url: URL,
  method: ProbeMethod,
  signal: AbortSignal,
  pinned: PinnedAddress,
): Promise<ProbeResponse & { location?: string }> {
  const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
    if (options.all) {
      callback(null, [{ address: pinned.address, family: pinned.family }], pinned.family)
      return
    }
    callback(null, pinned.address, pinned.family)
  }
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      method,
      signal,
      agent: false,
      family: pinned.family,
      lookup: pinnedLookup,
      maxHeaderSize: 32 * 1024,
      headers: { Accept: '*/*', 'User-Agent': 'Xiaotaozi-DSH-Browser-Probe/1' },
    }, (response) => {
      const location = Array.isArray(response.headers.location)
        ? response.headers.location[0]
        : response.headers.location
      const result: ProbeResponse & { location?: string } = {
        url: url.href,
        status: response.statusCode ?? 0,
        headers: response.headers,
        ...(location !== undefined ? { location } : {}),
      }
      response.destroy()
      resolve(result)
    })
    request.once('error', reject)
    request.end()
  })
}

interface AddressedResponse {
  response: ProbeResponse & { location?: string }
  pinned: PinnedAddress
}

/** Try every already-validated answer without ever re-entering DNS. */
async function requestAcrossPinnedAddresses(
  url: URL,
  method: ProbeMethod,
  signal: AbortSignal,
  addresses: readonly PinnedAddress[],
  requestAddress: NonNullable<ProbeDependencies['request']>,
): Promise<AddressedResponse> {
  const errors: unknown[] = []
  for (const pinned of addresses) {
    if (signal.aborted) throw abortError(signal)
    try {
      return { response: await requestAddress(url, method, signal, pinned), pinned }
    } catch (error: unknown) {
      if (signal.aborted) throw abortError(signal)
      errors.push(error)
    }
  }
  throw new AggregateError(errors, `all validated addresses for "${url.hostname}" failed`)
}

function prioritizedAddresses(
  addresses: readonly PinnedAddress[],
  preferred: PinnedAddress,
): PinnedAddress[] {
  return [
    preferred,
    ...addresses.filter(candidate => candidate.address !== preferred.address || candidate.family !== preferred.family),
  ]
}

function headerValues(headers: IncomingHttpHeaders, name: string): string[] {
  const value = headers[name]
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

/** Whether HEAD already carried every header relevant to iframe blocking. */
function hasEmbeddingPolicy(headers: IncomingHttpHeaders): boolean {
  if (headerValues(headers, 'x-frame-options').length > 0) return true
  return headerValues(headers, 'content-security-policy')
    .some(value => extractFrameAncestors(value) !== undefined)
}

function isRedirect(response: ProbeResponse & { location?: string }): boolean {
  return response.status >= 300 && response.status < 400 && response.location !== undefined
}

/**
 * Probe one redirect hop. HEAD is preferred; a minimal GET is issued only
 * when HEAD is unsupported or omitted the headers that decide embeddability.
 * The GET reuses the exact validated addresses and destroys its body as soon
 * as response headers arrive.
 */
async function requestHop(
  url: URL,
  signal: AbortSignal,
  dependencies: ProbeDependencies,
): Promise<ProbeResponse & { location?: string }> {
  const addresses = await resolvePinnedAddresses(url, signal, dependencies)
  const requestAddress = dependencies.request ?? requestPinnedHeaders
  const head = await requestAcrossPinnedAddresses(url, 'HEAD', signal, addresses, requestAddress)
  if (isRedirect(head.response)) return head.response
  if (head.response.status !== 405
    && head.response.status !== 501
    && hasEmbeddingPolicy(head.response.headers)) {
    return head.response
  }
  return (await requestAcrossPinnedAddresses(
    url,
    'GET',
    signal,
    prioritizedAddresses(addresses, head.pinned),
    requestAddress,
  )).response
}

/** Fetch response headers without automatic redirects or response bodies. */
export async function probePublicHttpHeaders(
  input: URL,
  signal: AbortSignal,
  maxRedirects = 5,
  dependencies: ProbeDependencies = {},
): Promise<ProbeResponse> {
  let current = new URL(input)
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    if (current.protocol !== 'http:' && current.protocol !== 'https:') {
      throw new UnsafeProbeTargetError('only http/https urls can be probed')
    }
    const response = await requestHop(current, signal, dependencies)
    const location = response.location
    if (response.status < 300 || response.status >= 400 || location === undefined) return response
    if (hop === maxRedirects) throw new UnsafeProbeTargetError('too many probe redirects')
    current = new URL(location, current)
  }
  throw new UnsafeProbeTargetError('too many probe redirects')
}

/**
 * Extract the `frame-ancestors` source list of a Content-Security-Policy
 * header, or undefined when the directive is absent (or empty). The
 * directive is the only one with a source list; sources are space-separated
 * tokens (`'none'`, `'self'`, `*`, or origins).
 */
export function extractFrameAncestors(csp: string | null): string[] | undefined {
  if (csp === null) return undefined
  for (const directive of csp.split(';')) {
    const parts = directive.trim().split(/\s+/)
    if (parts[0]?.toLowerCase() === 'frame-ancestors') {
      const sources = parts.slice(1).filter(source => source !== '')
      return sources.length === 0 ? undefined : sources
    }
  }
  return undefined
}
