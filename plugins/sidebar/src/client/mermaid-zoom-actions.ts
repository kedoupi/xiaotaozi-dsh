import type { CopyKey } from './locales.ts'

/** One toolbar control in the mermaid zoom overlay (glyphs are visual only). */
export interface MermaidZoomAction {
  id: 'zoomOut' | 'zoomIn' | 'reset' | 'close'
  labelKey: CopyKey
  glyph: string
}

/**
 * Toolbar actions for the mermaid zoom dialog. Accessible names must come
 * from `t(labelKey)` (zh + en in locales.ts), not from the glyph.
 */
export const MERMAID_ZOOM_ACTIONS: readonly MermaidZoomAction[] = [
  { id: 'zoomOut', labelKey: 'mermaidZoomOut', glyph: '−' },
  { id: 'zoomIn', labelKey: 'mermaidZoomIn', glyph: '+' },
  { id: 'reset', labelKey: 'mermaidZoomReset', glyph: '⟳' },
  { id: 'close', labelKey: 'close', glyph: '✕' },
]
