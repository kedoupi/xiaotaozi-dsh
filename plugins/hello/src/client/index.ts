import { createElement } from "react";
import { createRoot } from "react-dom/client";
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client";
import type {} from "@deepseek-ai/dsh-client-ui-theme/client";
import { nextNotice, NOTICES, readDismissed } from "../notices.ts";
import { registerChrome } from "./chrome.ts";
import { hideOfficialModels } from "./hide-official.ts";
import { NoticeHost } from "./NoticeHost.tsx";
import { applyPeachTheme } from "./peach.ts";
import { css } from "./styles.ts";

export const inject = ["locale", "slots", "theme"];

function ensureStyles(): () => void {
  const existing = document.querySelector('style[data-plugin-css="dsh-hello"]');
  if (existing !== null) return () => {};
  const node = document.createElement("style");
  node.dataset.pluginCss = "dsh-hello";
  node.textContent = css;
  document.head.append(node);
  return () => node.remove();
}

function localeOf(ctx: ClientContext): "zh" | "en" {
  return ctx.locale.getLocale().active === "en" ? "en" : "zh";
}

function mountNotices(locale: "zh" | "en"): () => void {
  if (typeof localStorage === "undefined") return () => {};
  if (nextNotice(NOTICES, readDismissed(localStorage)) === undefined) return () => {};
  const host = document.createElement("div");
  host.dataset.plugin = "dsh-hello";
  document.body.append(host);
  const root = createRoot(host);
  const done = () => {
    root.unmount();
    host.remove();
  };
  root.render(createElement(NoticeHost, {
    notices: NOTICES,
    locale,
    storage: localStorage,
    onDone: done,
  }));
  return done;
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ensureStyles(), "dsh-hello css");
  ctx.effect(() => applyPeachTheme(ctx.theme), "dsh-hello peach tokens");
  registerChrome(ctx);
  ctx.effect(() => hideOfficialModels(), "dsh-hello hide official Models");
  ctx.effect(() => mountNotices(localeOf(ctx)), "dsh-hello notices");
}
