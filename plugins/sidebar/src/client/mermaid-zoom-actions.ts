import type { CopyKey } from './locales.ts'

/** One toolbar control in the mermaid zoom overlay. Visuals are SVGs in mermaid.tsx. */
export interface MermaidZoomAction {
  id: 'zoomOut' | 'zoomIn' | 'reset' | 'close'
  labelKey: CopyKey
}

/**
 * Toolbar actions for the mermaid zoom dialog. Accessible names must come
 * from `t(labelKey)` (zh + en in locales.ts), independently of the SVG.
 */
export const MERMAID_ZOOM_ACTIONS: readonly MermaidZoomAction[] = [
  { id: 'zoomOut', labelKey: 'mermaidZoomOut' },
  { id: 'zoomIn', labelKey: 'mermaidZoomIn' },
  { id: 'reset', labelKey: 'mermaidZoomReset' },
  { id: 'close', labelKey: 'close' },
]
