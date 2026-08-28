import { createElement, type ReactNode } from "react";
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import { APP_ICON } from "./logo.ts";

/** Host slot ids from dsh-client-ui-sidebar / session-log-export / settings-general. */
export const BRAND_MARK_SLOT = "sidebar.brand.mark";
export const BRAND_NAME_SLOT = "sidebar.brand.name";
export const HERO_MARK_SLOT = "conversation.hero.brand.mark";
export const SESSION_LOG_SLOT = "conversation.session.header.utilities";
export const SESSION_LOG_ID = "session-log-download";
export const OPEN_DOC_SLOT = "settings.action";
export const OPEN_DOC_ID = "open-document";
/** Lowest number wins on single slots. Official brand is priority 0. */
export const SHADOW_PRIORITY = -1;

function Hidden(): null {
  return null;
}

function BrandMark(props: { size?: number; className?: string }): ReactNode {
  const size = props.size ?? 24;
  return createElement("img", {
    src: APP_ICON,
    className: props.className,
    width: size,
    height: size,
    alt: "",
    style: { display: "block", borderRadius: Math.round(size / 4) },
  });
}

function BrandName(): ReactNode {
  return createElement("span", { style: { fontWeight: 600, letterSpacing: "-0.02em" } }, "小桃子DSH");
}

/** Occupy host chrome slots. Same id as the shipped occupant replaces that cell. */
export function registerChrome(ctx: ClientContext): void {
  ctx.slots.inject(BRAND_MARK_SLOT, () => ctx.slots.register(
    { name: BRAND_MARK_SLOT, priority: SHADOW_PRIORITY },
    BrandMark,
  ));
  ctx.slots.inject(BRAND_NAME_SLOT, () => ctx.slots.register(
    { name: BRAND_NAME_SLOT, priority: SHADOW_PRIORITY },
    BrandName,
  ));
  ctx.slots.inject(HERO_MARK_SLOT, () => ctx.slots.register(
    { name: HERO_MARK_SLOT, priority: SHADOW_PRIORITY },
    BrandMark,
  ));
  ctx.slots.inject(SESSION_LOG_SLOT, () => ctx.slots.register(
    { name: SESSION_LOG_SLOT, id: SESSION_LOG_ID, priority: SHADOW_PRIORITY },
    Hidden,
  ));
  ctx.slots.inject(OPEN_DOC_SLOT, () => ctx.slots.register(
    { name: OPEN_DOC_SLOT, id: OPEN_DOC_ID, priority: SHADOW_PRIORITY },
    Hidden,
  ));
}
