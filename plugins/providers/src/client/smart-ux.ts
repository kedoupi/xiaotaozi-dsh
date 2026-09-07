import type { RoutingContract } from "../router/contract.ts";
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

export function shouldHideModelPicker(snapshot: Pick<RoutingContract, "mode">): boolean {
  return snapshot.mode === "smart";
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
