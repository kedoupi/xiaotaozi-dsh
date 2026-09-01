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

export function restoreDialogFocus(
  previousFocus: DialogFocusTarget | null,
  fallbackFocus?: DialogFocusTarget | null,
): void {
  const target = previousFocus?.isConnected
    ? previousFocus
    : fallbackFocus?.isConnected
      ? fallbackFocus
      : null;
  target?.focus();
}

export function useDialogFocus<T extends HTMLElement>(
  onClose: () => void,
  initialFocus?: RefObject<HTMLElement | null>,
  fallbackFocus?: RefObject<HTMLElement | null>,
) {
  const dialogRef = useRef<T>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
      .filter((element) => element.tabIndex >= 0 && element.getAttribute("aria-hidden") !== "true" && !element.hidden);
    (initialFocus?.current ?? focusable()[0] ?? dialog).focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      restoreDialogFocus(previousFocus, fallbackFocus?.current);
    };
  }, [fallbackFocus, initialFocus]);

  return dialogRef;
}
