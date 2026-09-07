import type { PluginCenterOpen } from "./plugin-center-open.ts";

// DSH 0.1.2-rc.1 center column and xtz-ui's shared panel activation contract.
const COLUMN = '[data-pane="conversation"], [class*="centerCol"]';
const ACTIVATE = "dsh-xtz-ui-panel-activate";
const ACTIVE = "data-dsh-plugin-center-active";
const SIDEBAR_ROW = '[class*="sessionRow"], [class*="projectRow"], [class*="searchResultRow"], [class*="searchResultWorkspace"], [class*="newSession"]';

export function mountPluginCenter({ doc, center, onAnchor }: {
  doc: Document;
  center: PluginCenterOpen;
  onAnchor: (anchor: HTMLElement | null) => void;
}): () => void {
  let anchor: HTMLElement | null = null;
  let opener: HTMLElement | null = null;
  let open = false;
  let disposed = false;
  const ensure = (): void => {
    if (disposed || anchor?.isConnected) return;
    if (anchor !== null) {
      anchor.remove();
      anchor = null;
      onAnchor(null);
    }
    const column = doc.querySelector<HTMLElement>(COLUMN);
    if (column === null) return;
    anchor = doc.createElement("div");
    anchor.setAttribute("data-dsh-plugin-center-view", "");
    column.append(anchor);
    onAnchor(anchor);
  };
  const apply = (): void => {
    const nextOpen = center.getSnapshot().open;
    if (nextOpen === open) return;
    open = nextOpen;
    if (open) {
      // Capture before the marker/portal changes focus; the sidebar may replace it later.
      opener = doc.querySelector<HTMLElement>("[data-dsh-market-entry]");
      doc.documentElement.setAttribute(ACTIVE, "");
      doc.dispatchEvent(new CustomEvent(ACTIVATE, { detail: "plugin-center" }));
    } else {
      doc.documentElement.removeAttribute(ACTIVE);
      if (anchor?.contains(doc.activeElement)) {
        const current = doc.querySelector<HTMLElement>("[data-dsh-market-entry]");
        if (current !== opener) opener = current;
        if (opener?.isConnected) opener.focus();
      }
      opener = null;
    }
  };
  const onOther = (event: Event): void => {
    if ((event as CustomEvent).detail !== "plugin-center") center.close();
  };
  const onSidebar = (event: MouseEvent): void => {
    const target = event.target as Element | null;
    if (target?.closest?.(SIDEBAR_ROW) != null) center.close();
  };
  const observer = new MutationObserver(ensure);
  observer.observe(doc.body, { childList: true, subtree: true });
  doc.addEventListener(ACTIVATE, onOther);
  doc.addEventListener("click", onSidebar, true);
  const unsubscribe = center.subscribe(apply);
  ensure();
  apply();
  return () => {
    disposed = true;
    observer.disconnect();
    unsubscribe();
    doc.removeEventListener(ACTIVATE, onOther);
    doc.removeEventListener("click", onSidebar, true);
    doc.documentElement.removeAttribute(ACTIVE);
    anchor?.remove();
    anchor = null;
    opener = null;
    onAnchor(null);
  };
}
