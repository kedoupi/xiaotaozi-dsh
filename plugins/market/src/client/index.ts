import { createElement } from "react";
import { createRoot } from "react-dom/client";
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-slots";
import { MARKET_LOCALE_NAMESPACE } from "../names.ts";
import { en, zh, type MarketKey } from "./locales.ts";
import { marketCss } from "./market-css.ts";
import { MarketOverlay } from "./MarketOverlay.tsx";
import { mountMarketEntry } from "./sidebar-entry.ts";

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface LocaleNamespaceMap {
    "market.panel": MarketKey;
  }
}

export const name = "market";
export const inject = ["locale", "slots"];

function ensureStyles(): () => void {
  const existing = document.querySelector('style[data-plugin-css="dsh-market"]');
  if (existing !== null) return () => {};
  const node = document.createElement("style");
  node.dataset.pluginCss = "dsh-market";
  node.textContent = marketCss;
  document.head.append(node);
  return () => node.remove();
}

function overlayOpener(t: (key: MarketKey) => string): { open: () => void; dispose: () => void } {
  let close: (() => void) | undefined;
  const open = (): void => {
    if (close !== undefined) return;
    const host = document.createElement("div");
    host.dataset.plugin = "dsh-market";
    document.body.append(host);
    const root = createRoot(host);
    close = () => {
      close = undefined;
      root.unmount();
      host.remove();
    };
    root.render(createElement(MarketOverlay, { t, onClose: () => close?.() }));
  };
  return { open, dispose: () => close?.() };
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ensureStyles(), "dsh-market css");
  ctx.effect(() => ctx.locale.register(MARKET_LOCALE_NAMESPACE, { zh, en }), "dsh-market copy");
  const t = ctx.locale.bind(MARKET_LOCALE_NAMESPACE) as (key: MarketKey) => string;
  ctx.effect(() => {
    const overlay = overlayOpener(t);
    const offEntry = mountMarketEntry(document, () => t("nav"), overlay.open);
    return () => {
      offEntry();
      overlay.dispose();
    };
  }, "dsh-market sidebar entry");
}
