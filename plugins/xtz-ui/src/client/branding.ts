import { APP_ICON } from "./logo.ts";

interface BrandingObserver {
  observe(target: Node, options: MutationObserverInit): void;
  disconnect(): void;
}

type CreateBrandingObserver = (callback: () => void) => BrandingObserver;

const NOOP_OBSERVER: BrandingObserver = {
  observe(): void {},
  disconnect(): void {},
};
const PRODUCT_TITLE = "小桃子DSH";

/** The official web shell owns document.title and the favicon; there is no client slot
 *  for them. Set both to the xtz-ui 3D portrait, keep the title when the shell updates
 *  route metadata, and restore the official values when the plugin is disposed. */
export function applyBrowserBranding(
  doc: Document = document,
  createObserver?: CreateBrandingObserver,
): () => void {
  const priorTitle = doc.title;
  const priorIcon = doc.querySelector('link[rel="icon"]');
  const icon = doc.createElement("link");
  const keepTitle = (): void => {
    if (doc.title !== PRODUCT_TITLE) doc.title = PRODUCT_TITLE;
  };
  const Observer = doc.defaultView?.MutationObserver;
  const observer = createObserver !== undefined
    ? createObserver(keepTitle)
    : Observer !== undefined
      ? new Observer(keepTitle)
      : NOOP_OBSERVER;
  icon.rel = "icon";
  icon.type = "image/jpeg";
  icon.href = APP_ICON;
  keepTitle();
  observer.observe(doc.head, { childList: true, subtree: true, characterData: true });
  priorIcon?.remove();
  doc.head.append(icon);
  return () => {
    observer.disconnect();
    doc.title = priorTitle;
    icon.remove();
    if (priorIcon !== null) doc.head.append(priorIcon);
  };
}
