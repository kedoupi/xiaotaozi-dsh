import { useEffect, useRef } from "react";
import { trapDialogTab } from "./dialog-focus.ts";
import { MarketPanel } from "./MarketPanel.tsx";
import { Icon } from "./icons.tsx";
import type { MarketKey } from "./locales.ts";

export function MarketOverlay({ t, onClose }: {
  t: (key: MarketKey) => string;
  onClose: () => void;
}): JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (closeRef.current ?? dialogRef.current)?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected === true) previousFocus.focus({ preventScroll: true });
    };
  }, [onClose]);
  return (
    <div className="dsh-market-overlay" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        ref={dialogRef}
        className="dsh-market-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dsh-market-dialog-title"
        aria-describedby="dsh-market-dialog-subtitle"
        tabIndex={-1}
        onKeyDown={(event) => trapDialogTab(event, event.currentTarget)}
      >
        <div className="dsh-market-dialog-head">
          <span className="dsh-market-dialog-mark"><Icon name="grid" size={18} /></span>
          <div className="dsh-market-dialog-titles">
            <span id="dsh-market-dialog-title" className="dsh-market-dialog-title">{t("nav")}</span>
            <span id="dsh-market-dialog-subtitle" className="dsh-market-dialog-subtitle">{t("subtitle")}</span>
          </div>
          <button ref={closeRef} type="button" className="dsh-market-dialog-close" aria-label={t("close")} onClick={onClose}>
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="dsh-market-dialog-body">
          <MarketPanel t={t} />
        </div>
      </div>
    </div>
  );
}
