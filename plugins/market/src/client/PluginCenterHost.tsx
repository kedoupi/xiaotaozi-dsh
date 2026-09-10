import { useCallback, useEffect, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Context as ClientContext } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type { PropsRenderSlots } from "@deepseek-ai/dsh-client-ui-slots";
import { DETAIL_SLOT } from "./plugin-center-contract.ts";
import type { PluginCenterOpen } from "./plugin-center-open.ts";
import type { MarketKey } from "./locales.ts";
import { mountPluginCenter } from "./plugin-center-mount.ts";

export type CenterPageFace = PropsRenderSlots<typeof DETAIL_SLOT> & {
  ctx: ClientContext;
  center: PluginCenterOpen;
  t: (key: MarketKey) => string;
  onClose: () => void;
};
export type PluginCenterHostProps = Omit<CenterPageFace, "onClose"> & {
  renderPage: (props: CenterPageFace) => ReactNode;
};

const MODAL_SELECTOR = 'dialog, [role="dialog"], [role="alertdialog"], [aria-modal="true"]';

function foreignModalOpen(portal: HTMLElement | null, root: ParentNode = document): boolean {
  if (typeof root.querySelectorAll !== "function") return false;
  for (const node of Array.from(root.querySelectorAll(MODAL_SELECTOR))) {
    if (portal !== null && (node === portal || portal.contains(node))) continue;
    const getAttribute = (node as { getAttribute?: (name: string) => string | null }).getAttribute;
    if (typeof getAttribute === "function" && getAttribute.call(node, "aria-hidden") === "true") continue;
    return true;
  }
  return false;
}

export function registerPluginCenter(ctx: ClientContext,
  face: Pick<PluginCenterHostProps, "center" | "t" | "renderPage">): () => void {
  return ctx.slots.inject("shell.overlay", () => ctx.slots.register({
    name: "shell.overlay", id: "plugin-center", order: 55,
    children: { [DETAIL_SLOT]: { kind: "keyed", scope: "root" } },
    inject: () => ({ ctx, ...face }),
  }, PluginCenterHost));
}

export function PluginCenterHost({ ctx, center, t, renderSlot, renderPage }: PluginCenterHostProps): ReactNode {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  // Subscribe the adapter first: capture/restore focus before a synchronous
  // external-store render can focus or remove the portal's DOM.
  useEffect(() => mountPluginCenter({ doc: document, center, onAnchor: setAnchor }), [center]);
  const state = useSyncExternalStore(center.subscribe, center.getSnapshot, center.getSnapshot);
  useLayoutEffect(() => {
    if (state.open) anchor?.querySelector<HTMLElement>("h1")?.focus();
  }, [state.open, anchor]);
  const onClose = useCallback(() => {
    center.close();
    const opener = document.querySelector<HTMLElement>("[data-dsh-market-entry]");
    if (opener?.isConnected && document.activeElement !== opener) opener.focus();
  }, [center]);
  useEffect(() => {
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing || !center.getSnapshot().open) return;
      if (document.activeElement?.closest('dialog, [role="dialog"], [role="alertdialog"]')) return;
      if (foreignModalOpen(anchor)) return;
      event.preventDefault();
      const location = center.getSnapshot().location;
      if (location.detail !== undefined) {
        center.navigate({ ...location, detail: undefined });
        return;
      }
      onClose();
    };
    // Bubble at window so nested React dialogs get first refusal.
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [anchor, center, onClose]);
  return !state.open || anchor === null ? null : createPortal(
    renderPage({ ctx, center, t, renderSlot, onClose }), anchor,
  );
}
