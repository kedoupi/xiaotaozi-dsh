import { describe, expect, it } from 'vitest'
import { mediaResponseHeaders } from '../src/index.ts'

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
