export interface StickyPromptRow { readonly key: string; readonly top: number; }

export function flattenStickyPromptText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

const PIN_EPSILON = 0.5;
const RELEASE_EPSILON = 8;

/** Pick the nearest user row above the scrollport, with release hysteresis. */
export function pickStickyPromptRow(rows: readonly StickyPromptRow[], scrollerTop: number, currentKey?: string): string | undefined {
  let lastPast: string | undefined;
  let lastPastIndex = -1;
  for (const [index, row] of rows.entries()) {
    if (row.top <= scrollerTop + PIN_EPSILON) { lastPast = row.key; lastPastIndex = index; }
  }
  if (currentKey !== undefined) {
    const currentIndex = rows.findIndex((row) => row.key === currentKey);
    const current = currentIndex < 0 ? undefined : rows[currentIndex];
    if (lastPastIndex > currentIndex) return lastPast;
    if (current !== undefined && current.top <= scrollerTop + RELEASE_EPSILON) return currentKey;
  }
  return lastPast;
}
