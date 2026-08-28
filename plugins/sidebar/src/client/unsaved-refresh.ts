import type { CopyKey } from './locales.ts'

/** Copy keys for the in-app unsaved-refresh Modal (title, body, confirm, cancel). */
export const UNSAVED_REFRESH_COPY_KEYS = {
  title: 'refreshUnsavedTitle',
  body: 'refreshUnsavedConfirm',
  confirm: 'refresh',
  cancel: 'cancel',
} as const satisfies Record<string, CopyKey>
