import { createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";

const COLUMN = '[data-pane="conversation"], [class*="centerCol"]';
const ACTIVATE = "dsh-hello-panel-activate";
const SIDEBAR_ROW = '[class*="sessionRow"], [class*="projectRow"], [class*="searchResultRow"], [class*="searchResultWorkspace"], [class*="newSession"]';

export function mountCenterPanel(options: {
  viewAttr: string;
  activeAttr: string;
  otherActiveAttr?: string;
  panelName: string;
  viewClass: string;
  plugin: string;
  isOpen(): boolean;
  subscribe(listener: () => void): () => void;
  close(): void;
  render(): ReactElement;
}): () => void {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;
  const ensure = (): void => {
    if (container !== undefined) {
      if (container.isConnected) return;
      root?.unmount();
      root = undefined;
      container.remove();
      container = undefined;
    }
    const column = document.querySelector<HTMLElement>(COLUMN);
    if (column === null) return;
    container = document.createElement("div");
    container.setAttribute(options.viewAttr, "");
    container.dataset.dshPlugin = options.plugin;
    container.className = options.viewClass;
    column.append(container);
    root = createRoot(container);
    root.render(createElement(() => options.render()));
  };
  const wait = new MutationObserver(() => {
    ensure();
  });
  wait.observe(document.body, { childList: true, subtree: true });
  const apply = (): void => {
    if (options.isOpen()) {
      if (options.otherActiveAttr !== undefined) document.documentElement.removeAttribute(options.otherActiveAttr);
      document.documentElement.setAttribute(options.activeAttr, "");
      document.dispatchEvent(new CustomEvent(ACTIVATE, { detail: options.panelName }));
    } else {
      document.documentElement.removeAttribute(options.activeAttr);
    }
  };
  const onOther = (event: Event): void => {
    if ((event as CustomEvent).detail !== options.panelName && options.isOpen()) options.close();
  };
  const onSidebar = (event: MouseEvent): void => {
    if (!options.isOpen()) return;
    const target = event.target as HTMLElement | null;
    if (target !== null && target.closest(SIDEBAR_ROW) !== null) options.close();
  };
  document.addEventListener("click", onSidebar, true);
  document.addEventListener(ACTIVATE, onOther);
  const off = options.subscribe(apply);
  apply();
  ensure();
  return () => {
    document.removeEventListener("click", onSidebar, true);
    document.removeEventListener(ACTIVATE, onOther);
    wait.disconnect();
    off();
    document.documentElement.removeAttribute(options.activeAttr);
    root?.unmount();
    container?.remove();
  };
}
