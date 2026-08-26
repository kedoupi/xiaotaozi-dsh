/**
 * Clone the New Session pill into a tools row, same as dsh-market / dsh-im.
 * The task board sits in our own row under that pair.
 */

import { HELLO_BOARD_ENTRY, HELLO_TOOLS_ROW } from "../names.ts";

export const NEW_SESSION_LABELS = ["新会话", "新建会话", "New Session", "New session"] as const;
export const MARKET_TOOLS_ROW = "data-dsh-sidebar-tools";
export const HELLO_TOOLS_CLASS = "dsh-hello-tools";
export const HELLO_TOOL_CLASS = "dsh-hello-tool";

export const helloToolsCss = `
.dsh-hello-tools { display: flex; flex-wrap: wrap; align-items: stretch; gap: 8px; margin: 0 2px 8px; min-width: 0; }
.dsh-hello-tools > button { flex: 1 1 calc(50% - 4px); min-width: 0; margin: 0 !important; padding-inline: 8px !important; justify-content: center; cursor: pointer; }
.dsh-hello-tools > button span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-hello-tool svg { color: var(--dsw-alias-state-business-primary, #c45a32); flex: none; }
.dsh-hello-tools > button[data-active] { font-weight: 600; }
`;

export const BOARD_ENTRY_ICON = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M2 6.5h12M6.5 6.5v7"/></svg>';

export function isNewSessionLabel(text: string): boolean {
  const compact = text.replace(/\s+/g, "").trim();
  return compact !== "" && NEW_SESSION_LABELS.some((label) => compact === label.replace(/\s+/g, ""));
}

function inAnyToolsRow(button: Element): boolean {
  return button.closest(`[${MARKET_TOOLS_ROW}], [${HELLO_TOOLS_ROW}]`) !== null;
}

export function findNewSessionButton(doc: Document): HTMLElement | undefined {
  const buttons = [...doc.querySelectorAll<HTMLElement>("button")].filter((button) => !inAnyToolsRow(button));
  const byText = buttons.filter((button) => isNewSessionLabel(button.textContent ?? ""));
  if (byText.length > 0) return byText.at(-1);
  const byAria = buttons.filter((button) => isNewSessionLabel(button.getAttribute("aria-label") ?? ""));
  return byAria.at(-1);
}

/** Sit under New Session, and under the market/IM row when that row exists. */
export function ensureHelloToolsRow(doc: Document, sessionButton: HTMLElement): HTMLElement {
  let row = doc.querySelector<HTMLElement>(`[${HELLO_TOOLS_ROW}]`);
  if (row === null) {
    row = doc.createElement("div");
    row.setAttribute(HELLO_TOOLS_ROW, "");
    row.className = HELLO_TOOLS_CLASS;
  }
  const marketRow = doc.querySelector<HTMLElement>(`[${MARKET_TOOLS_ROW}]`);
  const after = marketRow ?? sessionButton;
  if (row.previousElementSibling !== after) after.after(row);
  return row;
}

export function pruneToolsRow(row: Element | null): void {
  if (row !== null && row.childElementCount === 0) row.remove();
}

export function placeInToolsRow<T>(
  row: {
    firstElementChild: T | null;
    lastElementChild: T | null;
    insertBefore(node: T, ref: T | null): unknown;
  },
  button: T,
  slot: "start" | "end",
): void {
  if (slot === "start") {
    if (row.firstElementChild !== button) row.insertBefore(button, row.firstElementChild);
    return;
  }
  if (row.lastElementChild !== button) row.insertBefore(button, null);
}

function fillEntry(button: HTMLElement, icon: string, label: string, sample?: HTMLElement): void {
  button.innerHTML = icon;
  const text = button.ownerDocument.createElement("span");
  const sampleLabel = sample?.querySelector("span");
  if (sampleLabel?.className) text.className = sampleLabel.className;
  text.textContent = label;
  button.append(text);
}

export interface HelloToolOptions {
  attr: string;
  icon: string;
  slot: "start" | "end";
  label(): string;
  tooltip?(): string;
  onToggle(): void;
  active?: {
    subscribe(listener: () => void): () => void;
    isOpen(): boolean;
  };
}

export function ensureHelloTool(doc: Document, options: HelloToolOptions): void {
  const session = findNewSessionButton(doc);
  const existing = doc.querySelector<HTMLButtonElement>(`[${options.attr}]`);
  if (session === undefined) {
    existing?.remove();
    pruneToolsRow(doc.querySelector(`[${HELLO_TOOLS_ROW}]`));
    return;
  }
  const row = ensureHelloToolsRow(doc, session);
  let button = existing;
  if (button === null) {
    button = doc.createElement("button");
    button.type = "button";
    button.setAttribute(options.attr, "");
    button.setAttribute("data-dsh-part", "sidebar-entry");
    fillEntry(button, options.icon, options.label(), session);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      options.onToggle();
    });
  }
  button.className = `${session.className} ${HELLO_TOOL_CLASS}`;
  button.setAttribute("aria-label", options.label());
  if (options.tooltip !== undefined) button.setAttribute("title", options.tooltip());
  const span = button.querySelector("span");
  if (span !== null && span.textContent !== options.label()) span.textContent = options.label();
  else if (span === null) fillEntry(button, options.icon, options.label(), session);
  placeInToolsRow(row, button, options.slot);
}

function coalesce(run: () => void): () => void {
  let scheduled = false;
  return () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      run();
    });
  };
}

export function mountHelloTool(doc: Document, options: HelloToolOptions): () => void {
  if (doc.body === null) return () => {};
  const ensure = (): void => ensureHelloTool(doc, options);
  ensure();
  let disposed = false;
  const schedule = coalesce(() => {
    if (!disposed) ensure();
  });
  const observer = new MutationObserver(schedule);
  observer.observe(doc.body, { childList: true, subtree: true });
  const unsubscribeActive = options.active === undefined ? undefined : (() => {
    const sync = (): void => {
      const button = doc.querySelector<HTMLButtonElement>(`[${options.attr}]`);
      if (button === null) return;
      if (options.active!.isOpen()) {
        button.dataset.active = "true";
        button.setAttribute("aria-pressed", "true");
      } else {
        delete button.dataset.active;
        button.setAttribute("aria-pressed", "false");
      }
    };
    const off = options.active.subscribe(sync);
    sync();
    return off;
  })();
  return () => {
    disposed = true;
    observer.disconnect();
    unsubscribeActive?.();
    const button = doc.querySelector(`[${options.attr}]`);
    const row = button?.parentElement?.hasAttribute(HELLO_TOOLS_ROW) === true
      ? button.parentElement
      : doc.querySelector(`[${HELLO_TOOLS_ROW}]`);
    button?.remove();
    pruneToolsRow(row);
  };
}

export function boardToolOptions(label: () => string, onToggle: () => void, active: HelloToolOptions["active"]): HelloToolOptions {
  return {
    attr: HELLO_BOARD_ENTRY,
    icon: BOARD_ENTRY_ICON,
    slot: "start",
    label,
    onToggle,
    active,
  };
}
