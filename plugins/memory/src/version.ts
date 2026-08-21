/** Runtime package version shared with MCP client metadata. */
import { createRequire } from 'node:module'

const requireFromPlugin = createRequire(import.meta.url)
const manifest = requireFromPlugin('../package.json') as { version?: unknown }

if (typeof manifest.version !== 'string' || manifest.version === '') {
  throw new Error('dsh-memory package.json has no valid version')
}

export const DSH_MEMORY_VERSION = manifest.version
