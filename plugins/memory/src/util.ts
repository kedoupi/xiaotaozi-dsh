import { homedir } from 'node:os'

/** Expand a leading tilde to the user's home directory. */
export function expandHome(path: string): string {
  if (path === '~') return homedir()
  if (path.startsWith('~/') || path.startsWith('~\\')) {
    return homedir() + path.slice(1)
  }
  return path
}
