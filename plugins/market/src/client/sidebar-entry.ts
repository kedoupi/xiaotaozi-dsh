/**
 * The official sidebar has no slot between New Session and the workspace
 * list (Studio adds `sidebar.primary.action` in its fork). Like hello's
 * chrome, we augment the DOM: clone the New Session pill and keep it
 * mounted across React re-renders with a MutationObserver.
 *
 * dsh-im shares this tools row (`data-dsh-sidebar-tools`): market left, IM right.
 */

export const NEW_SESSION_LABELS = ["新会话", "新建会话", "New Session", "New session"] as const;

export const MARKET_ENTRY_ATTR = "data-dsh-market-entry";
export const TOOLS_ROW_ATTR = "data-dsh-sidebar-tools";
export const TOOLS_ROW_CLASS = "dsh-sidebar-tools";

export function isNewSessionLabel(text: string): boolean {
  const compact = text.replace(/\s+/g, "").trim();
  return compact !== "" && NEW_SESSION_LABELS.some((label) => compact === label.replace(/\s+/g, ""));
}

/** The wide New Session pill: a sidebar button whose visible text is the label
 * (icon-only twins carry the label in aria-label, not text). */
export function findNewSessionButton(doc: Document): HTMLElement | undefined {
  const buttons = Array.from(doc.querySelectorAll<HTMLElement>("button"))
    .filter((button) => button.closest(`[${TOOLS_ROW_ATTR}]`) === null);
  const byText = buttons.filter((button) => isNewSessionLabel(button.textContent ?? ""));
  if (byText.length > 0) return byText.at(-1);
  const byAria = buttons.filter((button) => isNewSessionLabel(button.getAttribute("aria-label") ?? ""));
  return byAria.at(-1);
}

export function ensureToolsRow(doc: Document, sessionButton: HTMLElement): HTMLElement {
  let row = doc.querySelector<HTMLElement>(`[${TOOLS_ROW_ATTR}]`);
  if (row === null) {
    row = doc.createElement("div");
    row.setAttribute(TOOLS_ROW_ATTR, "");
    row.className = TOOLS_ROW_CLASS;
  }
  if (row.previousElementSibling !== sessionButton) sessionButton.after(row);
  return row;
}

export function pruneToolsRow(row: Element | null): void {
  if (row !== null && row.childElementCount === 0) row.remove();
}

export function placeInToolsRow(row: HTMLElement, button: HTMLElement, slot: "start" | "end"): void {
  if (slot === "start") {
    if (row.firstElementChild !== button) row.insertBefore(button, row.firstElementChild);
    return;
  }
  if (row.lastElementChild !== button) row.append(button);
}

/** Lucide layout-grid, stroked with currentColor so the peach accent applies. */
export const MARKET_ENTRY_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3h7v7H3z"/><path d="M14 3h7v7h-7z"/><path d="M14 14h7v7h-7z"/><path d="M3 14h7v7H3z"/></svg>';

function fillEntry(button: HTMLElement, label: string, sample?: HTMLElement): void {
  button.innerHTML = MARKET_ENTRY_ICON;
  const text = button.ownerDocument.createElement("span");
  const sampleLabel = sample?.querySelector("span");
  if (sampleLabel?.className) text.className = sampleLabel.className;
  text.textContent = label;
  button.append(text);
}

/** Insert or reposition the market entry as the left cell of the tools row. */
export function ensureMarketEntry(doc: Document, label: string, onOpen: () => void): void {
  const target = findNewSessionButton(doc);
  const existing = doc.querySelector<HTMLButtonElement>(`[${MARKET_ENTRY_ATTR}]`);
  if (target === undefined) {
    existing?.remove();
    pruneToolsRow(doc.querySelector(`[${TOOLS_ROW_ATTR}]`));
    return;
  }
  const row = ensureToolsRow(doc, target);
  let button = existing;
  if (button === null) {
    button = doc.createElement("button");
    button.type = "button";
    button.setAttribute(MARKET_ENTRY_ATTR, "");
    fillEntry(button, label, target);
    button.addEventListener("click", onOpen);
  }
  button.className = `${target.className} dsh-market-entry`;
  const span = button.querySelector("span");
  if (span !== null && span.textContent !== label) span.textContent = label;
  else if (span === null) fillEntry(button, label, target);
  placeInToolsRow(row, button, "start");
}

/** Coalesce observer bursts into one run per microtask (same as hello). */
export function coalesce(run: () => void, schedule: (callback: () => void) => void = queueMicrotask): () => void {
  let scheduled = false;
  return () => {
    if (scheduled) return;
    scheduled = true;
    schedule(() => {
      scheduled = false;
      run();
    });
  };
}

export function mountMarketEntry(doc: Document, label: () => string, onOpen: () => void): () => void {
  const ensure = (): void => ensureMarketEntry(doc, label(), onOpen);
  ensure();
  let disposed = false;
  const scheduleEnsure = coalesce(() => {
    if (!disposed) ensure();
  });
  const observer = new MutationObserver(scheduleEnsure);
  observer.observe(doc.body, { childList: true, subtree: true });
  return () => {
    disposed = true;
    observer.disconnect();
    const button = doc.querySelector(`[${MARKET_ENTRY_ATTR}]`);
    const row = button?.parentElement?.hasAttribute(TOOLS_ROW_ATTR) === true
      ? button.parentElement
      : doc.querySelector(`[${TOOLS_ROW_ATTR}]`);
    button?.remove();
    pruneToolsRow(row);
  };
}
