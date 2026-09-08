import { describe, expect, it } from 'vitest'
import { htmlPreviewResponseHeaders, mediaResponseHeaders } from '../src/index.ts'

describe('/sidebar/html response headers', () => {
  it.each([
    ['style.css', 'text/css; charset=utf-8'],
    ['app.js', 'text/javascript; charset=utf-8'],
    ['module.mjs', 'text/javascript; charset=utf-8'],
    ['index.html', 'text/html; charset=utf-8'],
    ['INDEX.HTM', 'text/html; charset=utf-8'],
    ['image.png', 'image/png'],
    ['unknown.bin', 'application/octet-stream'],
  ])('serves preview %s with usable MIME and opaque-origin CSP', (path, mime) => {
    const headers = htmlPreviewResponseHeaders(path)
    expect(headers['content-type']).toBe(mime)
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['content-security-policy']).toContain('sandbox allow-scripts')
    expect(headers['content-security-policy']).not.toContain('allow-same-origin')
    expect(headers['content-security-policy']).toContain("object-src 'none'")
    expect(mediaResponseHeaders('attack.html')['content-disposition']).toMatch(/^attachment;/)
  })
})

describe('/sidebar/file response headers', () => {
  it.each(['attack.html', 'attack.HTM', 'attack.svg'])(
    'forces active workspace document %s to download as inert bytes',
    (name) => {
      const headers = mediaResponseHeaders(`/workspace/${name}`)
      expect(headers['content-type']).toBe('application/octet-stream')
      expect(headers['content-disposition']).toMatch(/^attachment;/)
      expect(headers['x-content-type-options']).toBe('nosniff')
      expect(headers['content-security-policy']).toContain('sandbox')
    },
  )

  it('keeps passive images inline and honors explicit download', () => {
    expect(mediaResponseHeaders('/workspace/image.png')['content-disposition']).toBeUndefined()
    expect(mediaResponseHeaders('/workspace/image.png')['content-type']).toBe('image/png')
    expect(mediaResponseHeaders('/workspace/image.png', true)['content-disposition']).toMatch(/^attachment;/)
  })
})
