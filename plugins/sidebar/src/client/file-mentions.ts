/**
 * Extend the chat's closing-prose file-mention seam so workspace-relative
 * inline-code paths are clickable, not only files the turn just mutated.
 *
 * Official `chatFileMentions` (ui-deliverables) only resolves produced
 * mutation locations. Listing existing docs as `` `dir/file.md` `` therefore
 * stays a dead chip. Wrapping that service keeps produced-file matching and
 * adds path-like tokens; clicks still go through `owner.openFile` (the same
 * funnel tool rows use, which we already intercept into the sidebar).
 */

const WRAPPED = '__sidebarPathMentions'

export interface FileMentionHit {
  open: () => void
  label: string
  title: string
}

export interface FileMentions {
  resolve(value: string): FileMentionHit | undefined
}

export interface ChatFileMentions {
  forClosing(owner: { openFile: (path: string) => void }): FileMentions | undefined
}

type WrappedMentions = ChatFileMentions & { [WRAPPED]?: true }

/** Inline-code tokens that are safe to treat as a workspace file path. */
export function looksLikeWorkspaceFilePath(value: string): boolean {
  if (typeof value !== 'string' || value.length < 3 || value.length > 512) return false
  if (/[\u0000-\u001f]/.test(value)) return false
  if (value.includes('://') || value.startsWith('//')) return false
  if (/^[a-z][a-z0-9+.-]*:/iu.test(value)) return false
  const normalized = value.replace(/\\/gu, '/')
  if (normalized.startsWith('/') || normalized.startsWith('~/')) return false
  if (normalized.includes('//')) return false
  const segments = normalized.split('/')
  if (segments.some((segment) => segment === '..')) return false
  if (segments.length < 2) return false
  const base = segments[segments.length - 1] ?? ''
  if (!base || base === '.' || base === '..') return false
  return /\.[A-Za-z0-9]{1,12}$/u.test(base)
}

export function composeFileMentions(
  inner: FileMentions | undefined,
  openFile: (path: string) => void,
  label: (path: string) => string,
): FileMentions {
  return {
    resolve(value) {
      const hit = inner?.resolve(value)
      if (hit) return hit
      if (!looksLikeWorkspaceFilePath(value)) return undefined
      return {
        open: () => {
          openFile(value)
        },
        label: label(value),
        title: value,
      }
    },
  }
}

function asMentions(value: unknown): WrappedMentions | undefined {
  if (value === null || typeof value !== 'object') return undefined
  if (typeof (value as ChatFileMentions).forClosing !== 'function') return undefined
  return value as WrappedMentions
}

/**
 * Patch the live `chatFileMentions` object in place (Cordis forbids a second
 * provide of the same name). Restores the original `forClosing` on dispose.
 */
export function patchChatFileMentions(
  service: ChatFileMentions,
  label: (path: string) => string,
): () => void {
  const wrapped = asMentions(service)
  if (!wrapped || wrapped[WRAPPED] === true) return () => {}
  const original = service.forClosing.bind(service)
  wrapped[WRAPPED] = true
  service.forClosing = (owner) => composeFileMentions(original(owner), owner.openFile, label)
  return () => {
    service.forClosing = original
    delete wrapped[WRAPPED]
  }
}

/** Wait for ui-deliverables when needed, then patch `forClosing`. */
export function registerChatFileMentions(
  ctx: {
    get(name: string): unknown
    inject?: (
      names: string[],
      callback: (ctx: { get(name: string): unknown }) => (() => void),
    ) => { dispose?: () => unknown }
  },
  label: (path: string) => string,
): () => void {
  const attach = (scope: { get(name: string): unknown }): (() => void) => {
    const service = asMentions(scope.get('chatFileMentions'))
    if (!service) return () => {}
    return patchChatFileMentions(service, label)
  }
  if (typeof ctx.inject !== 'function') return attach(ctx)
  const fiber = ctx.inject(['chatFileMentions'], (scope) => attach(scope))
  return () => { void fiber.dispose?.() }
}
