import { describe, expect, it } from 'vitest'
import { isTrustedApiRequest } from '../src/trust-fence.ts'

function request(init: {
  remote?: string
  host?: string
  origin?: string
  site?: string
  method?: string
}): Parameters<typeof isTrustedApiRequest>[0] {
  return {
    method: init.method ?? 'GET',
    socket: { remoteAddress: init.remote },
    headers: {
      host: init.host,
      origin: init.origin,
      'sec-fetch-site': init.site,
    },
  }
}

describe('privileged sidebar trust fence', () => {
  it('accepts an ordinary loopback read', () => {
    expect(isTrustedApiRequest(request({
      remote: '127.0.0.1',
      host: '127.0.0.1:3081',
    }))).toBe(true)
  })

  it('rejects LAN peers even when Host names loopback or a trusted deployment', () => {
    expect(isTrustedApiRequest(request({
      remote: '192.168.1.20',
      host: '127.0.0.1:3081',
    }))).toBe(false)
    expect(isTrustedApiRequest(request({
      remote: '192.168.1.20',
      host: '192.168.1.10:3081',
    }))).toBe(false)
  })

  it('requires an exact same-origin port for mutations', () => {
    const base = { remote: '::1', host: 'localhost:3081', method: 'POST' }
    expect(isTrustedApiRequest(request(base))).toBe(false)
    expect(isTrustedApiRequest(request({ ...base, origin: 'http://localhost:3081' }))).toBe(true)
    expect(isTrustedApiRequest(request({ ...base, origin: 'http://localhost:9999' }))).toBe(false)
    expect(isTrustedApiRequest(request({ ...base, origin: 'https://localhost:3081' }))).toBe(false)
  })

  it.each([
    'user@127.0.0.1:3081',
    '127.0.0.1:3081/path',
    '127.0.0.1:3081?query',
    '127.0.0.1:3081#fragment',
    '127.0.0.1:3081\\evil',
  ])('rejects a malformed Host authority: %s', (host) => {
    expect(isTrustedApiRequest(request({ remote: '127.0.0.1', host }))).toBe(false)
  })

  it('requires an exact Origin for WebSocket-style GET upgrades', () => {
    const base = { remote: '::ffff:127.0.0.1', host: '127.0.0.1:3081' }
    expect(isTrustedApiRequest(request(base), true)).toBe(false)
    expect(isTrustedApiRequest(request({ ...base, origin: 'http://127.0.0.1:3081' }), true)).toBe(true)
  })
})
