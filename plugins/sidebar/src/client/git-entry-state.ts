const CONFLICT_CODES = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'])

export type GitEntryState =
  | { tone: 'warning'; label: 'conflict' }
  | { tone: 'neutral'; label: null }

export function gitEntryState(xy: string): GitEntryState {
  return CONFLICT_CODES.has(xy)
    ? { tone: 'warning', label: 'conflict' }
    : { tone: 'neutral', label: null }
}
