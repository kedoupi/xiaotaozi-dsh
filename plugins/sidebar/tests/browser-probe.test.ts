import { describe, expect, it, vi } from 'vitest'
import {
  extractFrameAncestors,
  isPublicProbeAddress,
  probePublicHttpHeaders,
  UnsafeProbeTargetError,
} from '../src/browser-probe.ts'

function probeSignal(): AbortSignal {
  return new AbortController().signal
}

describe('browser probe network boundary', () => {
  it('accepts ordinary public IPv4 and IPv6 addresses', () => {
    expect(isPublicProbeAddress('8.8.8.8')).toBe(true)
    expect(isPublicProbeAddress('2606:4700:4700::1111')).toBe(true)
  })

  it('rejects loopback, private, link-local, metadata and transition ranges', () => {
    for (const address of [
      '127.0.0.1', '10.0.0.1', '100.64.0.1', '169.254.169.254',
      '172.16.0.1', '192.168.1.1', '198.18.0.1', '224.0.0.1',
      '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', '2001:db8::1', '2002::1',
    ]) {
      expect(isPublicProbeAddress(address), address).toBe(false)
    }
  })

  it('parses frame-ancestors case-insensitively', () => {
    expect(extractFrameAncestors("default-src 'self'; frame-ancestors 'none'")).toEqual(["'none'"])
    expect(extractFrameAncestors("default-src 'self'; FrAmE-AnCeStOrS 'self' https://example.com"))
      .toEqual(["'self'", 'https://example.com'])
  })

  it('handles a public bracketed IPv6 URL as a literal without entering DNS', async () => {
    const lookup = vi.fn(async () => {
      throw new Error('literal addresses must not enter DNS')
    })
    const request = vi.fn(async (url: URL, method: 'HEAD' | 'GET', _signal: AbortSignal, pinned: {
      address: string
      family: 4 | 6
    }) => ({
      url: url.href,
      status: 200,
      headers: { 'x-frame-options': 'DENY' },
      method,
      pinned,
    }))

    const result = await probePublicHttpHeaders(
      new URL('https://[2606:4700:4700::1111]/'),
      probeSignal(),
      5,
      { lookup, request },
    )

    expect(result.status).toBe(200)
    expect(lookup).not.toHaveBeenCalled()
    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0]?.[1]).toBe('HEAD')
    expect(request.mock.calls[0]?.[3]).toEqual({
      address: '2606:4700:4700::1111',
      family: 6,
    })
  })

  it('fails a mixed public/private DNS answer closed before any connection', async () => {
    const request = vi.fn(async () => ({ url: '', status: 200, headers: {} }))
    const pending = probePublicHttpHeaders(
      new URL('https://mixed.example/'),
      probeSignal(),
      5,
      {
        lookup: async () => [
          { address: '2606:4700:4700::1111', family: 6 },
          { address: '169.254.169.254', family: 4 },
        ],
        request,
      },
    )

    await expect(pending).rejects.toBeInstanceOf(UnsafeProbeTargetError)
    expect(request).not.toHaveBeenCalled()
  })

  it('falls back across the fully validated dual-stack answer set', async () => {
    const attempts: string[] = []
    const result = await probePublicHttpHeaders(
      new URL('https://dual-stack.example/'),
      probeSignal(),
      5,
      {
        lookup: async () => [
          { address: '2606:4700:4700::1111', family: 6 },
          { address: '8.8.8.8', family: 4 },
        ],
        request: async (url, method, _signal, pinned) => {
          attempts.push(`${method}:${pinned.address}`)
          if (pinned.family === 6) {
            const error = new Error('IPv6 route unavailable') as NodeJS.ErrnoException
            error.code = 'ENETUNREACH'
            throw error
          }
          return {
            url: url.href,
            status: 200,
            headers: { 'x-frame-options': 'SAMEORIGIN' },
          }
        },
      },
    )

    expect(result.status).toBe(200)
    expect(attempts).toEqual([
      'HEAD:2606:4700:4700::1111',
      'HEAD:8.8.8.8',
    ])
  })

  it('bounds DNS lookup time before opening a request', async () => {
    vi.useFakeTimers()
    try {
      const request = vi.fn(async () => ({ url: '', status: 200, headers: {} }))
      const pending = probePublicHttpHeaders(
        new URL('https://slow-dns.example/'),
        probeSignal(),
        5,
        {
          lookup: async () => await new Promise(() => {}),
          request,
          dnsTimeoutMs: 25,
        },
      )
      const rejection = expect(pending).rejects.toThrow(/DNS lookup .* timed out/)
      await vi.advanceTimersByTimeAsync(25)
      await rejection
      expect(request).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('uses a body-discarding GET fallback when HEAD cannot expose embed policy', async () => {
    const methods: Array<'HEAD' | 'GET'> = []
    const result = await probePublicHttpHeaders(
      new URL('https://headless.example/'),
      probeSignal(),
      5,
      {
        lookup: async () => [{ address: '8.8.8.8', family: 4 }],
        request: async (url, method) => {
          methods.push(method)
          if (method === 'HEAD') return { url: url.href, status: 405, headers: {} }
          return {
            url: url.href,
            status: 200,
            headers: { 'content-security-policy': "default-src 'self'; FRAME-ANCESTORS 'none'" },
          }
        },
      },
    )

    expect(methods).toEqual(['HEAD', 'GET'])
    expect(extractFrameAncestors(String(result.headers['content-security-policy'])))
      .toEqual(["'none'"])
  })

  it('also checks GET when a successful HEAD omits frame policy, but avoids it when HEAD has policy', async () => {
    const missingMethods: Array<'HEAD' | 'GET'> = []
    await probePublicHttpHeaders(
      new URL('https://head-omits-policy.example/'),
      probeSignal(),
      5,
      {
        lookup: async () => [{ address: '8.8.8.8', family: 4 }],
        request: async (url, method) => {
          missingMethods.push(method)
          return method === 'HEAD'
            ? { url: url.href, status: 200, headers: { 'content-security-policy': "default-src 'self'" } }
            : { url: url.href, status: 200, headers: { 'x-frame-options': 'DENY' } }
        },
      },
    )
    expect(missingMethods).toEqual(['HEAD', 'GET'])

    const completeMethods: Array<'HEAD' | 'GET'> = []
    await probePublicHttpHeaders(
      new URL('https://head-has-policy.example/'),
      probeSignal(),
      5,
      {
        lookup: async () => [{ address: '8.8.8.8', family: 4 }],
        request: async (url, method) => {
          completeMethods.push(method)
          return {
            url: url.href,
            status: 200,
            headers: { 'content-security-policy': "frame-ancestors 'none'" },
          }
        },
      },
    )
    expect(completeMethods).toEqual(['HEAD'])
  })

  it('revalidates redirect destinations and refuses a private next hop', async () => {
    const request = vi.fn(async (url: URL) => ({
      url: url.href,
      status: 302,
      headers: { location: 'http://127.0.0.1/internal' },
      location: 'http://127.0.0.1/internal',
    }))
    const pending = probePublicHttpHeaders(
      new URL('https://public-redirect.example/'),
      probeSignal(),
      5,
      {
        lookup: async () => [{ address: '8.8.8.8', family: 4 }],
        request,
      },
    )

    await expect(pending).rejects.toBeInstanceOf(UnsafeProbeTargetError)
    expect(request).toHaveBeenCalledTimes(1)
  })
})
