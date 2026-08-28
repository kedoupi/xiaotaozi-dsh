/** Destructive git actions gated by the confirm Modal, plus cancel. */
export type GitConfirmAction = 'discard' | 'revert' | 'cherryPick' | 'cancel'

/** Visual tone for a Git confirm footer control. */
export type GitConfirmTone = 'danger' | 'neutral'

/**
 * Discard / revert / cherry-pick confirm is destructive (error tokens).
 * Cancel is the non-destructive dismiss control.
 */
export function gitConfirmButtonTone(action: GitConfirmAction): GitConfirmTone {
  return action === 'cancel' ? 'neutral' : 'danger'
}
