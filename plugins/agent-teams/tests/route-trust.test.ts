import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'
import { isLoopbackRemoteAddress, isTrustedRouteRequest, rejectUntrustedRouteRequest, routeSecurityHeaders } from '../src/route-trust.ts'

function request(
  remoteAddress: string | undefined,
  host: string | undefined,
  headers: Record<string, string> = {},
  method = 'GET',
): IncomingMessage {
  return {
    method,
    socket: { remoteAddress },
    headers: { ...headers, ...(host === undefined ? {} : { host }) },
  } as unknown as IncomingMessage
}

function captureResponse(): {
  res: ServerResponse
  status: () => number | undefined
  headers: () => Record<string, unknown>
  body: () => string
} {
  let status: number | undefined
  let headers: Record<string, unknown> = {}
  let body = ''
  const res = {
    writeHead(code: number, head?: Record<string, unknown>) {
      status = code
      headers = head ?? {}
      return res
    },
    end(chunk?: unknown) {
      if (typeof chunk === 'string') body = chunk
    },
  } as unknown as ServerResponse
  return { res, status: () => status, headers: () => headers, body: () => body }
}

describe('AgentTeams route trust', () => {
  it('recognizes loopback transport forms', () => {
    expect(isLoopbackRemoteAddress('127.0.0.1')).toBe(true)
    expect(isLoopbackRemoteAddress('::1')).toBe(true)
    expect(isLoopbackRemoteAddress('::ffff:127.0.0.1')).toBe(true)
    expect(isLoopbackRemoteAddress('::ffff:7f00:1')).toBe(true)
    expect(isLoopbackRemoteAddress('8.8.8.8')).toBe(false)
  })

  it('requires both a loopback peer and loopback Host', () => {
    expect(isTrustedRouteRequest(request('127.0.0.1', 'localhost:3081'))).toBe(true)
    expect(isTrustedRouteRequest(request('10.0.0.2', 'localhost:3081'))).toBe(false)
    expect(isTrustedRouteRequest(request('127.0.0.1', 'attacker.example'))).toBe(false)
    expect(isTrustedRouteRequest(request('127.0.0.1', undefined))).toBe(false)
  })

  it('rejects cross-site fetches and mismatched origins', () => {
    expect(isTrustedRouteRequest(request('::1', '[::1]:3081', {
      origin: 'http://[::1]:3081',
      'sec-fetch-site': 'same-origin',
    }))).toBe(true)
    expect(isTrustedRouteRequest(request('127.0.0.1', 'localhost:3081', {
      'sec-fetch-site': 'cross-site',
    }))).toBe(false)
    expect(isTrustedRouteRequest(request('127.0.0.1', 'localhost:3081', {
      origin: 'http://127.0.0.1:3081',
    }))).toBe(false)
  })

  it('rejects Host header confusion attempts', () => {
    // userinfo smuggling: URL treats localhost:3081 as credentials for evil.com
    expect(isTrustedRouteRequest(request('127.0.0.1', 'localhost:3081@evil.com'))).toBe(false)
    // a path inside the Host header is never a bare authority
    expect(isTrustedRouteRequest(request('127.0.0.1', 'localhost/x'))).toBe(false)
    // IPv6 zone identifiers are invalid in a URL host and must not parse
    expect(isTrustedRouteRequest(request('::1', '[::1%25eth0]'))).toBe(false)
    // hostnames are case-insensitive; URL lowercases them
    expect(isTrustedRouteRequest(request('127.0.0.1', 'LOCALHOST:3081'))).toBe(true)
  })

  it('accepts zone-scoped loopback peers but not remote ones', () => {
    expect(isLoopbackRemoteAddress('::1%lo0')).toBe(true)
    expect(isTrustedRouteRequest(request('::1%lo0', 'localhost:3081'))).toBe(true)
  })

  it('rejects opaque and merged Origin values', () => {
    expect(isTrustedRouteRequest(request('127.0.0.1', 'localhost:3081', {
      origin: 'null',
    }))).toBe(false)
    // duplicate Origin headers joined by the HTTP layer never parse as one URL
    expect(isTrustedRouteRequest(request('127.0.0.1', 'localhost:3081', {
      origin: 'http://localhost:3081, http://evil.com',
    }))).toBe(false)
  })

  it('requires an Origin for state-changing methods only', () => {
    const trustedNoOrigin = (method: string): IncomingMessage =>
      request('127.0.0.1', 'localhost:3081', {}, method)
    expect(rejectUntrustedRouteRequest(trustedNoOrigin('GET'), captureResponse().res)).toBe(false)
    expect(rejectUntrustedRouteRequest(trustedNoOrigin('HEAD'), captureResponse().res)).toBe(false)

    const post = captureResponse()
    expect(rejectUntrustedRouteRequest(trustedNoOrigin('POST'), post.res)).toBe(true)
    expect(post.status()).toBe(403)

    expect(rejectUntrustedRouteRequest(
      request('127.0.0.1', 'localhost:3081', { origin: 'http://localhost:3081' }, 'POST'),
      captureResponse().res,
    )).toBe(false)
  })

  it('sends hardened headers and a JSON body on rejection', () => {
    const rejected = captureResponse()
    expect(rejectUntrustedRouteRequest(request('8.8.8.8', 'localhost:3081'), rejected.res)).toBe(true)
    expect(rejected.status()).toBe(403)
    expect(rejected.headers()).toMatchObject({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'cross-origin-resource-policy': 'same-origin',
      'referrer-policy': 'no-referrer',
    })
    expect(JSON.parse(rejected.body())).toMatchObject({ ok: false })
  })

  it('provides security headers for successful and error responses', () => {
    expect(routeSecurityHeaders('no-store')).toMatchObject({
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'cross-origin-resource-policy': 'same-origin',
      'referrer-policy': 'no-referrer',
    })
  })
})
