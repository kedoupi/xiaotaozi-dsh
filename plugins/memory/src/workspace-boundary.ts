import { realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'

export class WorkspaceBoundaryError extends Error {}

/** Lexically test whether a path is equal to or below a workspace root. */
export function isPathWithinRoot(path: string, root: string): boolean {
  const rel = relative(resolve(root), resolve(path))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

async function canonicalPath(path: string): Promise<string> {
  return realpath(resolve(path))
}

/**
 * Resolve an explicit import path and require its real location to be inside
 * one of the supplied workspace roots. Both sides use realpath so symlinks
 * cannot escape the boundary.
 */
export async function resolveAllowedWorkspacePath(
  path: string,
  workspaceRoots: readonly string[] | undefined,
): Promise<string> {
  if (workspaceRoots === undefined || workspaceRoots.length === 0) {
    throw new WorkspaceBoundaryError('explicit import path rejected: workspace roots are unavailable')
  }
  let candidate: string
  try {
    candidate = await canonicalPath(path)
  } catch {
    throw new WorkspaceBoundaryError('explicit import path rejected: path does not exist')
  }
  for (const root of workspaceRoots) {
    try {
      if (isPathWithinRoot(candidate, await canonicalPath(root))) return candidate
    } catch {
      // Ignore stale workspace entries and continue checking live roots.
    }
  }
  throw new WorkspaceBoundaryError('explicit import path rejected: path is outside the allowed workspace')
}
