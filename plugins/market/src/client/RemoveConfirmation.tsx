import { useEffect, useRef } from "react";
import { trapDialogTab } from "./dialog-focus.ts";
import { Icon } from "./icons.tsx";
import type { MarketKey } from "./locales.ts";

export function RemoveConfirmation({ entry, t, trigger, confirmedFocus, onCancel, onConfirm }: {
  entry: { name: string };
  t: (key: MarketKey) => string;
  trigger: HTMLButtonElement | null;
  confirmedFocus: HTMLElement | null;
  onCancel: () => void;
  onConfirm: () => void;
}): JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(true);
  useEffect(() => {
    cancelRef.current?.focus({ preventScroll: true });
    if (typeof document === "undefined" || typeof document.addEventListener !== "function") return undefined;
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
        return;
      }
      if (event.key === "Tab" && dialogRef.current !== null) {
        event.stopPropagation();
        trapDialogTab(event, dialogRef.current);
      }
    };
    const keepFocusInside = (event: FocusEvent): void => {
      if (!restoreFocus.current || dialogRef.current?.contains(event.target as Node)) return;
      event.preventDefault();
      event.stopPropagation();
      (cancelRef.current ?? dialogRef.current)?.focus({ preventScroll: true });
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", keepFocusInside, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", keepFocusInside, true);
      const focusTarget = restoreFocus.current ? trigger : confirmedFocus;
      if (focusTarget?.isConnected === true) focusTarget.focus({ preventScroll: true });
    };
  }, [confirmedFocus, onCancel, trigger]);
  return (
    <div className="dsh-market-confirm-overlay">
      <div
        ref={dialogRef}
        className="dsh-market-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dsh-market-remove-title"
        aria-describedby="dsh-market-remove-description"
        tabIndex={-1}
      >
        <h3 id="dsh-market-remove-title">{t("removeConfirmTitle")}</h3>
        <p id="dsh-market-remove-description"><strong>{entry.name}</strong> {t("removeConfirmDescription")}</p>
        <div className="dsh-market-confirm-actions">
          <button ref={cancelRef} type="button" className="dsh-market-secondary dsh-market-confirm-cancel" onClick={onCancel}>
            {t("removeCancel")}
          </button>
          <button
            type="button"
            className="dsh-market-confirm-remove"
            onClick={() => {
              restoreFocus.current = false;
              onConfirm();
            }}
          >
            <Icon name="trash" size={15} />{t("removeConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
