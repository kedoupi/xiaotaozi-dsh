/**
 * Full-window upload progress over the files tree: a semantic mask scrim
 * with a card showing the target
 * directory, file-level progress, and a cancel button. Esc cancels too —
 * clicking the scrim does not, so a stray click can never abort an upload.
 * Rendered inside TreePanel (absolute inset-0), so it covers only the file
 * window and never the conversation column.
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { IconUploadOutline16 } from './icons.tsx'
import { t } from './locales.ts'
import { uploadHintText } from './upload.ts'
import css from './sidebar.module.css'

export function UploadOverlay(props: {
  /** Absolute upload directory (the session workspace or a tree directory). */
  dir: string
  done: number
  total: number
  /** Relative path of the file being uploaded ('' when none is in flight). */
  current: string
  onCancel: () => void
  /** True while cancellation is in flight (disables the cancel button). */
  cancelling?: boolean
}): ReactNode {
  const { dir, done, total, current, onCancel, cancelling } = props
  const cancelRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const onCancelRef = useRef(onCancel)
  const cancellingRef = useRef(cancelling === true)
  useEffect(() => { onCancelRef.current = onCancel }, [onCancel])
  useEffect(() => { cancellingRef.current = cancelling === true }, [cancelling])

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    cancelRef.current?.focus()
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !cancellingRef.current) onCancelRef.current()
      if (event.key === 'Tab') {
        event.preventDefault()
        cancelRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      returnFocusRef.current?.focus()
    }
  }, [])

  const percent = total === 0 ? 0 : Math.min(100, Math.round((done / total) * 100))
  return (
    <div className={css.uploadOverlay} role="dialog" aria-modal="true" aria-busy="true" aria-label={t('uploadingTo', { dir })}>
      <div className={css.uploadOverlayCard}>
        <div className={css.uploadOverlayTitle} title={dir}>
          <span aria-hidden="true"><IconUploadOutline16 size={16} /></span>
          <span>{t('uploadingTo', { dir })}</span>
        </div>
        <div
          className={css.uploadOverlayProgress}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          aria-valuetext={t('uploadProgress', { done, total, name: current })}
        >
          <div className={css.uploadOverlayProgressFill} style={{ width: `${percent}%` }} />
        </div>
        <div className={css.uploadOverlayStatus} role="status" aria-live="polite" aria-atomic="true">{uploadHintText(done, total, current, dir, t)}</div>
        <button ref={cancelRef} type="button" className={css.uploadOverlayCancel} disabled={cancelling} onClick={onCancel}>
          {t('cancel')}
        </button>
      </div>
    </div>
  )
}
