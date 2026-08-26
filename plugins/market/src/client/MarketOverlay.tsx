import { useEffect } from "react";
import { MarketPanel } from "./MarketPanel.tsx";
import { Icon } from "./icons.tsx";
import type { MarketKey } from "./locales.ts";

export function MarketOverlay({ t, onClose }: {
  t: (key: MarketKey) => string;
  onClose: () => void;
}): JSX.Element {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="dsh-market-overlay" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="dsh-market-dialog" role="dialog" aria-label={t("nav")}>
        <div className="dsh-market-dialog-head">
          <span className="dsh-market-dialog-mark"><Icon name="grid" size={18} /></span>
          <div className="dsh-market-dialog-titles">
            <span className="dsh-market-dialog-title">{t("nav")}</span>
            <span className="dsh-market-dialog-subtitle">{t("subtitle")}</span>
          </div>
          <button type="button" className="dsh-market-dialog-close" aria-label={t("close")} onClick={onClose}>
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
