import { createElement } from "react";
import type { Context as ClientContext } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-client-ui-slots";
import { MARKET_LOCALE_NAMESPACE } from "../names.ts";
import { en, zh, type MarketKey } from "./locales.ts";
import { marketCss } from "./market-css.ts";
import { PluginCenter } from "./PluginCenter.tsx";
import { createPluginCenterOpen, listenPluginCenterOpen } from "./plugin-center-open.ts";
import { registerPluginCenter } from "./PluginCenterHost.tsx";
import { mountMarketEntry } from "./sidebar-entry.ts";

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface LocaleNamespaceMap {
    "market.panel": MarketKey;
  }
}

export const name = "market";
export const inject = ["locale", "slots", "remote.pluginInventory"];

function ensureStyles(): () => void {
  const existing = document.querySelector('style[data-plugin-css="dsh-market"]');
  if (existing !== null) return () => {};
  const node = document.createElement("style");
  node.dataset.pluginCss = "dsh-market";
  node.textContent = marketCss;
  document.head.append(node);
  return () => node.remove();
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ensureStyles(), "dsh-market css");
  ctx.effect(() => ctx.locale.register(MARKET_LOCALE_NAMESPACE, { zh, en }), "dsh-market copy");
  const t = ctx.locale.bind(MARKET_LOCALE_NAMESPACE) as (key: MarketKey) => string;
  const center = createPluginCenterOpen();
  registerPluginCenter(ctx, { center, t, renderPage: props => createElement(PluginCenter, props) });
  ctx.effect(() => mountMarketEntry(document, () => t("nav"), () => center.open(), center),
    "dsh-market plugin center entry");
  ctx.effect(() => listenPluginCenterOpen(center, document), "dsh-market open-from-event");
}
