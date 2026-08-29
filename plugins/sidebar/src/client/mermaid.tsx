/**
 * Mermaid diagram renderer for the markdown preview, resident in the
 * `mermaid` lazy chunk (src/client/chunks/mermaid.tsx): the mermaid library
 * and its transitive graph deps (d3/dagre/cytoscape) are inlined into
 * lib/client-mermaid.js and fetched only when a previewed markdown file
 * actually contains a mermaid fence (see mermaid-blocks.ts).
 *
 * Rendering architecture: the whole document is rendered ONCE through the
 * DSH `MarkdownText` (so cross-fence semantics — reference-style links,
 * footnotes, ordered-list continuity — stay intact), then a layout effect
 * swaps every rendered `language-mermaid` CodeBlock for a diagram. The
 * swap keeps the React-managed `.md-code-block` host node in the tree and
 * only replaces its children (display:contents suppresses the code-block
 * chrome), so React reconciliation never loses the host; when a swapped
 * block stops being a mermaid fence, the original children are restored.
 *
 * Security: mermaid.render → sanitized SVG injected into the block.
 * `bindFunctions` is intentionally NOT applied (static diagrams; no
 * flowchart click handlers), `securityLevel` stays 'strict' (labels are
 * escaped, no raw-HTML foreignObject), `htmlLabels: false` keeps node text
 * as real SVG <text>, and the emitted SVG is re-sanitized (see
 * mermaid-sanitize.ts) before it reaches dangerouslySetInnerHTML. Clicking
 * a rendered diagram opens a zoom/pan modal (borrowed interaction design
 * from the mermaid PR #75, reimplemented on top of the sanitized SVG —
 * the clone carries no event surface, so the modal adds no attack surface).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import mermaid from 'mermaid'
import {
  IconCloseOutline16, IconCopyOutline16, IconPlusOutline16, IconRefreshOutline16,
  MarkdownText, writeClipboard,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { IconMinusOutline16 } from './icons.tsx'
import { isDarkScheme, subscribeColorScheme } from './theme.ts'
import { t } from './locales.ts'
import { MERMAID_ZOOM_ACTIONS } from './mermaid-zoom-actions.ts'
import { sanitizeSvg } from './mermaid-sanitize.ts'
import type { MermaidMarkdownProps } from './mermaid-blocks.ts'
import css from './sidebar.module.css'

/** Monotonic id seed: every render call gets a fresh, document-unique id. */
let mermaidSeq = 0

/** Configure mermaid for the current color scheme (idempotent). */
function configureMermaid(): void {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    // Labels as real SVG <text>: mermaid's default htmlLabels renders node
    // text inside <foreignObject>, which the sanitizer strips wholesale —
    // forcing pure SVG text keeps labels visible and the HTML label channel
    // closed (strict already escapes label content).
    htmlLabels: false,
    // Mermaid 11 renders a large error SVG into document.body before rejecting
    // invalid diagrams. The component already has its own error fallback, so
    // suppress that global side effect to keep the DSH shell intact.
    suppressErrorRendering: true,
    theme: isDarkScheme() ? 'dark' : 'default',
  })
}

/** First lines of a mermaid error (its dumps are huge; the head explains). */
function summarizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.split('\n').slice(0, 6).join('\n')
}

type MermaidZoomActionId = (typeof MERMAID_ZOOM_ACTIONS)[number]['id']

function MermaidZoomActionIcon({ id }: { id: MermaidZoomActionId }): React.ReactNode {
  if (id === 'zoomOut') return <IconMinusOutline16 size={16} />
  if (id === 'zoomIn') return <IconPlusOutline16 size={16} />
  if (id === 'reset') return <IconRefreshOutline16 size={16} />
  return <IconCloseOutline16 size={16} />
}

/** The zoom/pan modal for one rendered diagram (click-to-enlarge). */
function MermaidZoomModal({ svg, onClose }: { svg: SVGSVGElement; onClose: () => void }): React.ReactNode {
  const overlayRef = useRef<HTMLDivElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragRef = useRef({ active: false, startX: 0, startY: 0 })
  const zoomRef = useRef({ scale: 1, tx: 0, ty: 0 })

  const applyTransform = (): void => {
    const node = svgRef.current
    if (node === null) return
    const { scale, tx, ty } = zoomRef.current
    node.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`
  }

  /** Zoom by `delta` keeping the stage point (centerX/centerY) fixed. */
  const zoom = useCallback((delta: number, centerX?: number, centerY?: number): void => {
    const stage = stageRef.current
    if (stage === null) return
    const rect = stage.getBoundingClientRect()
    const cx = centerX ?? rect.width / 2
    const cy = centerY ?? rect.height / 2
    const current = zoomRef.current
    const newScale = Math.min(8, Math.max(0.2, current.scale * delta))
    // The svg is flex-centered in the stage, so its center sits at
    // (rect.width/2, rect.height/2). Solve for the translate that keeps the
    // mouse point stationary in stage coordinates across the scale change.
    const sx = rect.width / 2
    const sy = rect.height / 2
    const ratio = newScale / current.scale
    current.tx = cx - sx - (cx - sx - current.tx) * ratio
    current.ty = cy - sy - (cy - sy - current.ty) * ratio
    current.scale = newScale
    applyTransform()
  }, [])

  const reset = useCallback((): void => {
    zoomRef.current = { scale: 1, tx: 0, ty: 0 }
    applyTransform()
  }, [])

  const close = useCallback((): void => { onClose() }, [onClose])

  // Mount the caller-provided (sanitized) svg clone imperatively: React
  // types don't accept a raw DOM node as a child, and the modal owns the
  // node's lifetime (removed on unmount; the preview copy is untouched).
  useEffect(() => {
    const stage = stageRef.current
    if (stage === null) return
    svgRef.current = svg
    stage.appendChild(svg)
    return () => {
      svg.remove()
      svgRef.current = null
    }
  }, [svg])

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    return () => { returnFocusRef.current?.focus() }
  }, [])

  useEffect(() => {
    const bodyOverflow = document.body.style.overflow
    const rootOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = bodyOverflow
      document.documentElement.style.overflow = rootOverflow
    }
  }, [])

  useEffect(() => {
    const stage = stageRef.current
    const node = svgRef.current
    const overlay = overlayRef.current
    if (stage === null || node === null || overlay === null) return

    const onWheel = (event: WheelEvent): void => {
      event.preventDefault()
      const rect = stage.getBoundingClientRect()
      zoom(event.deltaY < 0 ? 1.1 : 1 / 1.1, event.clientX - rect.left, event.clientY - rect.top)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close()
        return
      }
      if (event.key === '+' || event.key === '=') {
        event.preventDefault()
        event.stopPropagation()
        zoom(1.2)
      } else if (event.key === '-') {
        event.preventDefault()
        event.stopPropagation()
        zoom(1 / 1.2)
      } else if (event.key === '0') {
        event.preventDefault()
        event.stopPropagation()
        reset()
      } else if (event.key === 'Tab') {
        const controls = Array.from(toolbarRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
        if (controls.length === 0) return
        const first = controls[0]
        const last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          event.stopPropagation()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          event.stopPropagation()
          first?.focus()
        }
      }
    }
    const onMouseDown = (event: MouseEvent): void => {
      event.preventDefault()
      dragRef.current = {
        active: true,
        startX: event.clientX - zoomRef.current.tx,
        startY: event.clientY - zoomRef.current.ty,
      }
    }
    const onMouseMove = (event: MouseEvent): void => {
      if (!dragRef.current.active) return
      zoomRef.current.tx = event.clientX - dragRef.current.startX
      zoomRef.current.ty = event.clientY - dragRef.current.startY
      applyTransform()
    }
    const onMouseUp = (): void => { dragRef.current.active = false }
    const onOverlayClick = (event: MouseEvent): void => {
      if (event.target === overlay) close()
    }

    // React's synthetic wheel is passive; a native listener is required to
    // preventDefault (the page must not scroll while zooming the modal).
    stage.addEventListener('wheel', onWheel, { passive: false })
    node.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('keydown', onKey, true)
    overlay.addEventListener('click', onOverlayClick)
    return () => {
      stage.removeEventListener('wheel', onWheel)
      node.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('keydown', onKey, true)
      overlay.removeEventListener('click', onOverlayClick)
    }
  }, [zoom, reset, close])

  const onZoomAction = (id: MermaidZoomActionId): void => {
    if (id === 'zoomOut') zoom(1 / 1.2)
    else if (id === 'zoomIn') zoom(1.2)
    else if (id === 'reset') reset()
    else close()
  }

  return createPortal(
    <div
      className={css.mermaidModal}
      data-mermaid-modal
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('mermaidZoomTitle')}
    >
      <div className={css.mermaidModalToolbar} ref={toolbarRef}>
        {MERMAID_ZOOM_ACTIONS.map(action => (
          <button
            key={action.id}
            ref={action.id === 'close' ? closeRef : undefined}
            type="button"
            className={css.mermaidModalButton}
            aria-label={t(action.labelKey)}
            title={t(action.labelKey)}
            onClick={() => { onZoomAction(action.id) }}
          >
            <span aria-hidden="true"><MermaidZoomActionIcon id={action.id} /></span>
          </button>
        ))}
      </div>
      <div className={css.mermaidModalStage} ref={stageRef} role="img" aria-label={t('mermaidZoomDialog')} />
      <div className={css.mermaidModalHint}>{t('mermaidZoomHint')}</div>
    </div>,
    document.body,
  )
}

/** One rendered mermaid fence: header chrome + diagram (or error + source). */
function MermaidDiagram({ code }: { code: string }): React.ReactNode {
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  /** Scheme state: a flip re-renders the diagram with the matching theme. */
  const [dark, setDark] = useState(() => isDarkScheme())
  /** The cloned svg shown in the zoom modal (null = closed). */
  const [zoomSvg, setZoomSvg] = useState<SVGSVGElement | null>(null)
  const copyTimer = useRef<number | undefined>(undefined)

  useEffect(() => subscribeColorScheme(() => { setDark(isDarkScheme()) }), [])

  useEffect(() => {
    let cancelled = false
    setSvg(null)
    setError(null)
    if (code.trim() === '') return () => { cancelled = true }
    configureMermaid()
    const id = `dsh-md-mermaid-${mermaidSeq += 1}`
    mermaid.render(id, code)
      .then(({ svg: rendered }) => {
        if (cancelled) return
        const clean = sanitizeSvg(rendered)
        if (clean === '') {
          // Parse/sanitize rejection: never pass the raw string through.
          setError(t('mermaidError'))
          return
        }
        setSvg(clean)
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        setError(summarizeError(reason))
      })
    return () => { cancelled = true }
  }, [code, dark])

  const onCopy = useCallback(() => {
    if (copied) return
    writeClipboard(code).then((ok) => {
      if (!ok) return
      setCopied(true)
      window.clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => { setCopied(false) }, 1000)
    })
  }, [code, copied])

  /** Clicking the diagram opens the zoom modal with a sanitized clone. */
  const onBodyClick = (event: ReactMouseEvent<HTMLButtonElement>): void => {
    const svgEl = event.currentTarget.querySelector('svg')
    if (svgEl === null) return
    const clone = svgEl.cloneNode(true) as SVGSVGElement
    // The modal owns sizing/transform; drop the preview's inline geometry.
    clone.removeAttribute('style')
    clone.removeAttribute('width')
    clone.removeAttribute('height')
    setZoomSvg(clone)
  }

  return (
    <div className={css.mermaidWrap}>
      <div className={css.mermaidHeader}>
        <span className={css.mermaidInfo}>mermaid</span>
        <button
          type="button"
          className={css.mermaidCopy}
          onClick={onCopy}
          aria-label={t('copy')}
          title={t('copy')}
        >
          <span aria-hidden="true"><IconCopyOutline16 /></span>
          <span>{copied ? t('copied') : t('copy')}</span>
        </button>
      </div>
      {code.trim() !== '' && svg === null && error === null && (
        <div className={css.mermaidStatus} role="status">{t('loading')}</div>
      )}
      {error !== null && <div className={css.mermaidError} role="alert" title={error}>{t('mermaidError')}</div>}
      {svg !== null && (
        <button
          type="button"
          className={css.mermaidBody}
          data-mermaid-diagram
          aria-label={t('mermaidZoomDialog')}
          title={t('mermaidZoomDialog')}
          onClick={onBodyClick}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
      {error !== null && <pre className={css.mermaidCode}><code>{code}</code></pre>}
      {zoomSvg !== null && <MermaidZoomModal svg={zoomSvg} onClose={() => { setZoomSvg(null) }} />}
    </div>
  )
}

/** One swapped mount: the diagram root + the CodeBlock children it displaced. */
interface MermaidMount {
  root: Root
  source: string
  removed: ChildNode[]
}

/**
 * True when a rendered CodeBlock is a mermaid fence. The DSH CodeBlock has
 * two bodies: the shiki path carries the `language-*` class on generated
 * <code> elements, while the plain path (which is always the one mermaid
 * takes — no shiki grammar) only shows the language in the banner
 * infostring (first element of the banner row; CSS-module classes are
 * hashed, so that match is structural).
 */
function isMermaidBlock(block: HTMLElement): boolean {
  const code = block.querySelector('code')
  if (code !== null && [...code.classList].some(c => c.startsWith('language-mermaid'))) return true
  const infostring = block.firstElementChild?.firstElementChild?.firstElementChild
  return infostring !== null
    && infostring !== undefined
    && (infostring.textContent ?? '').trim() === 'mermaid'
}

/**
 * The chunk-resident markdown preview renderer: ONE MarkdownText pass over
 * the full source (cross-fence reference/footnote/list semantics intact),
 * then every rendered `language-mermaid` code block is swapped for a
 * `MermaidDiagram`. The `.md-code-block` host stays in the React tree —
 * only its children are replaced — so reconciliation never loses the host;
 * a block that stops being a mermaid fence gets its original children back.
 * Only mounted when the source contains at least one mermaid fence (see
 * TextEditor.tsx).
 */
export function MermaidMarkdown({ text, codeLabels }: MermaidMarkdownProps): React.ReactNode {
  const containerRef = useRef<HTMLDivElement>(null)
  const mountsRef = useRef(new Map<HTMLElement, MermaidMount>())

  useLayoutEffect(() => {
    const container = containerRef.current
    if (container === null) return
    const mounts = mountsRef.current
    const seen = new Set<HTMLElement>()

    for (const block of container.querySelectorAll<HTMLElement>('.md-code-block')) {
      const mount = mounts.get(block)
      const isMermaid = isMermaidBlock(block)
      if (!isMermaid) {
        // A previously swapped block that is no longer a mermaid fence:
        // restore the CodeBlock children React still manages, so the plain
        // fence renders normally again.
        if (mount !== undefined) {
          mount.root.unmount()
          block.replaceChildren(...mount.removed)
          block.removeAttribute('data-mermaid-processed')
          mounts.delete(block)
        }
        continue
      }
      seen.add(block)
      // The plain body always carries the fence source in <code>.
      const source = block.querySelector('code')?.textContent ?? ''
      if (mount !== undefined && mount.source === source) continue
      if (mount === undefined) {
        const host = document.createElement('div')
        const removed = [...block.childNodes]
        block.replaceChildren(host)
        block.setAttribute('data-mermaid-processed', 'true')
        const root = createRoot(host)
        mounts.set(block, { root, source, removed })
        root.render(<MermaidDiagram code={source} />)
      } else {
        mount.source = source
        mount.root.render(<MermaidDiagram code={source} />)
      }
    }

    // Drop mounts whose code block left the tree (fence removed, document
    // restructured): the host node is gone with it.
    for (const [block, mount] of mounts) {
      if (seen.has(block)) continue
      mount.root.unmount()
      mounts.delete(block)
    }
  }, [text])

  useEffect(() => () => {
    for (const { root } of mountsRef.current.values()) root.unmount()
    mountsRef.current.clear()
  }, [])

  return (
    <div className={css.mermaidMarkdown} ref={containerRef}>
      <MarkdownText text={text} codeLabels={codeLabels} />
    </div>
  )
}
