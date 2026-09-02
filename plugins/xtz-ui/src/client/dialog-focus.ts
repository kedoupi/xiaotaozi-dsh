import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

interface DialogFocusTarget {
  isConnected: boolean;
  focus: () => void;
}

export interface DialogStack<T> {
  register: (dialog: T) => () => void;
  isTop: (dialog: T) => boolean;
}

export function createDialogStack<T>(): DialogStack<T> {
  const entries: { dialog: T }[] = [];
  return {
    register(dialog) {
      const entry = { dialog };
      entries.push(entry);
      return () => {
        const index = entries.indexOf(entry);
        if (index >= 0) entries.splice(index, 1);
      };
    },
    isTop(dialog) {
      return entries.at(-1)?.dialog === dialog;
    },
  };
}

interface DialogKeyEvent {
  key: string;
  shiftKey: boolean;
  preventDefault: () => void;
  stopPropagation: () => void;
}

interface DialogKeyScope {
  close: () => void;
  focusable: () => DialogFocusTarget[];
  activeElement: () => unknown;
  contains: (target: unknown) => boolean;
  focusDialog: () => void;
}

interface DialogKeyTarget {
  addKeyListener: (listener: (event: DialogKeyEvent) => void) => void;
  removeKeyListener: (listener: (event: DialogKeyEvent) => void) => void;
}

export function handleDialogKey<T>(
  event: DialogKeyEvent,
  stack: DialogStack<T>,
  dialog: T,
  scope: DialogKeyScope,
): boolean {
  if (!stack.isTop(dialog)) return false;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    scope.close();
    return true;
  }
  if (event.key !== "Tab") return false;

  const items = scope.focusable();
  if (items.length === 0) {
    event.preventDefault();
    scope.focusDialog();
    return true;
  }

  const first = items[0];
  const last = items[items.length - 1];
  const active = scope.activeElement();
  if (!scope.contains(active)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
  return true;
}

export function registerDialogKeys<T>(
  target: DialogKeyTarget,
  stack: DialogStack<T>,
  dialog: T,
  scope: DialogKeyScope,
): () => void {
  const unregisterDialog = stack.register(dialog);
  const listener = (event: DialogKeyEvent): void => {
    handleDialogKey(event, stack, dialog, scope);
  };
  let registered = true;
  target.addKeyListener(listener);
  return () => {
    if (!registered) return;
    registered = false;
    target.removeKeyListener(listener);
    unregisterDialog();
  };
}

export function focusDialogInitial(
  initialFocus: DialogFocusTarget | null | undefined,
  focusable: readonly DialogFocusTarget[],
  dialog: DialogFocusTarget,
): void {
  (initialFocus ?? focusable[0] ?? dialog).focus();
}

export function restoreDialogFocus(
  previousFocus: DialogFocusTarget | null,
  fallbackFocus?: DialogFocusTarget | null,
  preferredFocus?: DialogFocusTarget | null,
): void {
  const target =
    preferredFocus !== undefined
      ? preferredFocus?.isConnected
        ? preferredFocus
        : fallbackFocus?.isConnected
          ? fallbackFocus
          : null
      : previousFocus?.isConnected
        ? previousFocus
        : fallbackFocus?.isConnected
          ? fallbackFocus
          : null;
  target?.focus();
}

const dialogStack = createDialogStack<HTMLElement>();

export function useDialogFocus<T extends HTMLElement>(
  onClose: () => void,
  initialFocus?: RefObject<HTMLElement | null>,
  fallbackFocus?: RefObject<HTMLElement | null>,
  restoreFocus?: RefObject<HTMLElement | null>,
) {
  const dialogRef = useRef<T>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const preferredFocus = restoreFocus?.current;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusable = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) =>
          element.tabIndex >= 0 &&
          element.getAttribute("aria-hidden") !== "true" &&
          !element.hidden,
      );
    const unregister = registerDialogKeys(
      {
        addKeyListener: (listener) =>
          document.addEventListener("keydown", listener, true),
        removeKeyListener: (listener) =>
          document.removeEventListener("keydown", listener, true),
      },
      dialogStack,
      dialog,
      {
        close: () => closeRef.current(),
        focusable,
        activeElement: () => document.activeElement,
        contains: (target) => target instanceof Node && dialog.contains(target),
        focusDialog: () => dialog.focus(),
      },
    );
    focusDialogInitial(initialFocus?.current, focusable(), dialog);

    return () => {
      unregister();
      restoreDialogFocus(
        previousFocus,
        fallbackFocus?.current,
        preferredFocus,
      );
    };
  }, [fallbackFocus, initialFocus, restoreFocus]);

  return dialogRef;
}
