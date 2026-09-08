import type { RouteLastSelected, RoutingContract } from "../router/contract.ts";
import { EMPTY_POOL_GUIDE, isEmptyAuthorizedPool } from "../router/empty-pool.ts";

/** Host composer model seat. Lowest number wins on single slots. */
export const MODEL_SEAT_SLOT = "conversation.input.model";
/** Full-width notice above the composer card (list slot). */
export const SMART_DOCK_SLOT = "conversation.input.dock";
export const SMART_DOCK_ID = "providers-smart-ux";
export const SHADOW_PRIORITY = -1;
/**
 * Additive list order after host Todo (0) / Goal / Queue (20).
 * List cells use `order` + a unique `id`. `priority` is a shadowing rank and
 * must stay on the single model seat only.
 */
export const SMART_DOCK_ORDER = 80;

/**
 * Host ConversationRoot paints `conversation.input.dock` as a sibling of the
 * input card inside `.composerStack` (column flex, sticky footer). Dock cards
 * share `--dsh-chat-content-width`. A shrink-to-fit child becomes a left
 * column of that full-width seat — visually beside the session list.
 *
 * After mount we move the host cell into the composer card so the chip sits on
 * the card (hero home included) instead of between the Workspace toolbar and
 * the input.
 */
export const SMART_UX_DOCK_LAYOUT = {
  boxSizing: "border-box",
  width: "min(100%, var(--dsh-chat-content-width, var(--dsh-composer-card-max-width, 100%)))",
  maxWidth: "100%",
  minWidth: "0",
  marginInline: "auto",
  position: "relative",
  zIndex: "0",
  flex: "0 0 auto",
  alignSelf: "center",
  overflow: "hidden",
} as const;

export function smartUxDockRegistration(): {
  name: typeof SMART_DOCK_SLOT;
  id: typeof SMART_DOCK_ID;
  order: typeof SMART_DOCK_ORDER;
} {
  return {
    name: SMART_DOCK_SLOT,
    id: SMART_DOCK_ID,
    order: SMART_DOCK_ORDER,
  };
}

export const EMPTY_POOL_GUIDE_TEXT = EMPTY_POOL_GUIDE;

/** Pull routing after send: Host `onDecision` is not pushed to the Client. */
export const SMART_UX_REFRESH_MS = [200, 800, 2400] as const;

/**
 * Host paints dock rows as stack siblings *before* the composer card.
 * The card is the last child of that stack.
 */
export function pickComposerCardFromChildren<T extends { contains?(other: T): boolean }>(
  children: readonly T[],
  dockRow: T,
): T | undefined {
  const last = children.at(-1);
  if (last === undefined || last === dockRow) return undefined;
  if (dockRow.contains?.(last) === true || last.contains?.(dockRow) === true) return undefined;
  return last;
}

export function findComposerStack(hostCell: Element): { stack: Element; dockRow: Element } | undefined {
  let row: Element = hostCell;
  let parent = hostCell.parentElement;
  while (parent !== null) {
    if (parent.hasAttribute("data-composer-seat")) return undefined;
    if (parent.childElementCount >= 2) {
      const kids = Array.from(parent.children);
      const index = kids.indexOf(row);
      if (index >= 0 && index < kids.length - 1) {
        return { stack: parent, dockRow: row };
      }
    }
    row = parent;
    parent = parent.parentElement;
  }
  return undefined;
}

export function pickComposerCard(stack: Element, dockRow: Element): Element | undefined {
  return pickComposerCardFromChildren(Array.from(stack.children), dockRow);
}

/** Move the dock host cell to the top of the composer card. Restores on dispose. */
export function attachDockToComposerCard(root: HTMLElement): () => void {
  const hostCell = root.parentElement;
  if (hostCell === null) return () => {};
  const found = findComposerStack(hostCell);
  if (found === undefined) return () => {};
  const card = pickComposerCard(found.stack, found.dockRow);
  if (card === undefined || hostCell.parentElement === card) return () => {};
  const home = hostCell.parentNode;
  if (home === null) return () => {};
  const marker = hostCell.ownerDocument.createComment("dsh-providers-smart-ux");
  home.insertBefore(marker, hostCell);
  card.insertBefore(hostCell, card.firstChild);
  return () => {
    if (marker.parentNode !== null) {
      marker.parentNode.insertBefore(hostCell, marker);
      marker.remove();
    }
  };
}

export function shouldHideModelPicker(snapshot: Pick<RoutingContract, "mode">): boolean {
  return snapshot.mode === "smart";
}

/**
 * Accessible dock copy. Empty names stay hidden — never invent a placeholder.
 * The visible chip splits the kicker and the model name; this string stays the
 * `aria-label` so the FORGE-012 sentence is still announced as one phrase.
 */
export function formatTurnModelLabel(displayName: string): string | undefined {
  const name = displayName.trim();
  if (name.length === 0) return undefined;
  return `本轮模型：${name}`;
}

/** Optional folded id. Hidden when it would add nothing beyond the visible name. */
export function formatTurnModelDetail(
  selected: Pick<RouteLastSelected, "provider" | "model" | "displayName">,
): string | undefined {
  const provider = selected.provider.trim();
  const model = selected.model.trim();
  if (provider.length === 0 && model.length === 0) return undefined;
  const id = provider.length === 0 ? model : model.length === 0 ? provider : `${provider} / ${model}`;
  return id === selected.displayName.trim() ? undefined : id;
}

export function shouldShowTurnModelChip(
  snapshot: Pick<RoutingContract, "mode" | "lastSelected">,
): boolean {
  return snapshot.mode === "smart"
    && snapshot.lastSelected !== undefined
    && formatTurnModelLabel(snapshot.lastSelected.displayName) !== undefined;
}

/**
 * Latest-assistant weak chip copy.
 * Host has `conversation.chat.turnTail`, but chain `select` does not re-run
 * when `lastSelected` arrives, and V1 does not write Session decision events.
 * Do not stamp every tail with the current snapshot — that mislabels history.
 */
export function formatAssistantModelChip(displayName: string): string | undefined {
  const name = displayName.trim();
  if (name.length === 0) return undefined;
  return `模型：${name}`;
}

export function shouldBlockSmartSend(snapshot: Pick<RoutingContract, "mode" | "candidateCount">): boolean {
  return snapshot.mode === "smart" && isEmptyAuthorizedPool(snapshot.candidateCount);
}

export function wrapComposerSubmit(
  submit: () => void,
  options: {
    shouldBlock: () => boolean;
    onBlocked: () => void;
  },
): () => void {
  return () => {
    if (options.shouldBlock()) {
      options.onBlocked();
      return;
    }
    submit();
  };
}

const COMPOSER_EDIT = "[data-lexical-editor], [contenteditable='true'], textarea";
const IGNORE_EDIT = ".dshM-wrap, [data-dsh-xtz-ui-board-view], [data-dsh-xtz-ui-archive], [data-dsh-xtz-ui-board-active]";

function closestOf(target: EventTarget | null, selector: string): unknown {
  if (target === null || typeof target !== "object") return null;
  const closest = (target as { closest?: (query: string) => unknown }).closest;
  if (typeof closest !== "function") return null;
  return closest.call(target, selector);
}

function isComposerEdit(target: EventTarget | null): boolean {
  return closestOf(target, COMPOSER_EDIT) != null && closestOf(target, IGNORE_EDIT) == null;
}

function isEnterKey(event: Event): event is KeyboardEvent {
  if (!("key" in event)) return false;
  const key = (event as KeyboardEvent).key;
  return key === "Enter";
}

/**
 * Capture-phase Enter guard on the composer card that owns `root`.
 * Complements wrapping `inputActions.submit` (click send).
 */
export function installComposerEnterGuard(
  root: ParentNode,
  options: {
    shouldBlock: () => boolean;
    onBlocked: () => void;
  },
): () => void {
  const onKeyDown = (event: Event): void => {
    if (!isEnterKey(event)) return;
    if (event.defaultPrevented) return;
    if (event.shiftKey || event.isComposing || event.repeat) return;
    if (!options.shouldBlock()) return;
    if (!isComposerEdit(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    options.onBlocked();
  };
  root.addEventListener("keydown", onKeyDown, true);
  return () => {
    root.removeEventListener("keydown", onKeyDown, true);
  };
}
