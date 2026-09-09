import type { RouteLastSelected, RoutingContract } from "../router/contract.ts";
import {
  EMPTY_POOL_GUIDE,
  isEmptyAuthorizedPool,
} from "../router/empty-pool.ts";

/** Host composer model seat. Lowest number wins on single slots. */
export const MODEL_SEAT_SLOT = "conversation.input.model";
/** Supported session-scoped list seat inside the actual RC1 composer card. */
export const SMART_DOCK_SLOT = "conversation.input.left";
export const SMART_DOCK_ID = "providers-smart-ux";
export const SHADOW_PRIORITY = -1;
/**
 * Additive list order; unrelated dock Todo / Goal / Queue seats are untouched.
 * List cells use `order` + a unique `id`. `priority` is a shadowing rank and
 * must stay on the single model seat only.
 */
export const SMART_DOCK_ORDER = 80;

/** Layout applies only to our own content, never a Host slot cell or parent. */
export const SMART_UX_DOCK_LAYOUT = {
  boxSizing: "border-box",
  width:
    "min(100%, var(--dsh-chat-content-width, var(--dsh-composer-card-max-width, 100%)))",
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

export function shouldHideModelPicker(
  snapshot: Pick<RoutingContract, "mode">,
): boolean {
  return snapshot.mode === "smart";
}

/**
 * Accessible dock copy. Empty names stay hidden — never invent a placeholder.
 * The visible chip splits the kicker and the model name; this string stays the
 * `aria-label` so the FORGE-012 sentence is still announced as one phrase.
 */
export function formatTurnModelLabel(
  displayName: string,
  attribution?: RoutingContract["attribution"],
): string | undefined {
  const name = displayName.trim();
  if (name.length === 0) return undefined;
  return `${attribution === "session" ? "上次模型" : "历史模型"}：${name}`;
}

/** Optional folded id. Hidden when it would add nothing beyond the visible name. */
export function formatTurnModelDetail(
  selected: Pick<RouteLastSelected, "provider" | "model" | "displayName">,
): string | undefined {
  const provider = selected.provider.trim();
  const model = selected.model.trim();
  if (provider.length === 0 && model.length === 0) return undefined;
  const id =
    provider.length === 0
      ? model
      : model.length === 0
        ? provider
        : `${provider} / ${model}`;
  return id === selected.displayName.trim() ? undefined : id;
}

export function shouldShowTurnModelChip(
  snapshot: Pick<RoutingContract, "mode" | "lastSelected">,
): boolean {
  return (
    snapshot.mode === "smart" &&
    snapshot.lastSelected !== undefined &&
    formatTurnModelLabel(snapshot.lastSelected.displayName) !== undefined
  );
}

/**
 * Latest-assistant weak chip copy.
 * Host has `conversation.chat.turnTail`, but chain `select` does not re-run
 * when `lastSelected` arrives, and V1 does not write Session decision events.
 * Do not stamp every tail with the current snapshot — that mislabels history.
 */
export function formatAssistantModelChip(
  displayName: string,
): string | undefined {
  const name = displayName.trim();
  if (name.length === 0) return undefined;
  return `模型：${name}`;
}

export function shouldBlockSmartSend(
  snapshot: Pick<RoutingContract, "mode" | "candidateCount">,
): boolean {
  return (
    snapshot.mode === "smart" && isEmptyAuthorizedPool(snapshot.candidateCount)
  );
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
const IGNORE_EDIT = ".dshM-wrap, [data-dsh-xtz-ui-archive]";

function matchesClosest(target: EventTarget | null, selector: string): boolean {
  if (target === null || typeof target !== "object") return false;
  const closest = (target as { closest?: (query: string) => unknown }).closest;
  if (typeof closest !== "function") return false;
  return closest.call(target, selector) != null;
}

function isComposerEdit(target: EventTarget | null): boolean {
  return (
    matchesClosest(target, COMPOSER_EDIT) &&
    !matchesClosest(target, IGNORE_EDIT)
  );
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
