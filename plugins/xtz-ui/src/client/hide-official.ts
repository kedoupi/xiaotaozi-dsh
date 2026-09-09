import { requestPluginCenterOpen } from "./plugin-center-open.ts";

export function compactSettingsLabel(text: string): string {
  return text.replace(/\s+/g, "").trim();
}

export function isModelsSettingsLabel(text: string): boolean {
  return ["模型", "Models"].includes(compactSettingsLabel(text));
}

export function isPluginsSettingsLabel(text: string): boolean {
  return ["插件", "Plugins"].includes(compactSettingsLabel(text));
}

export function isObsoleteSettingsLabel(text: string): boolean {
  return isModelsSettingsLabel(text) || isPluginsSettingsLabel(text);
}

export type StaleSettingsAction = "redirect-models" | "transfer-safe";

export function staleSettingsAction(label: string): StaleSettingsAction {
  return isModelsSettingsLabel(label) ? "redirect-models" : "transfer-safe";
}

export interface HideOfficialHooks {
  redirectModels?(): void;
  closeSettings?(dialog: HTMLElement): void;
}

const CLOSE_BUTTON = 'button[aria-label="关闭"], button[aria-label="Close"], button[aria-label="Close settings"]';

export function closeSettingsDialog(dialog: HTMLElement): void {
  const root = typeof dialog.closest === "function" ? (dialog.closest("dialog") ?? dialog) : dialog;
  if (typeof HTMLDialogElement !== "undefined" && root instanceof HTMLDialogElement) {
    root.close();
    return;
  }
  const closer = dialog.querySelector<HTMLElement>(CLOSE_BUTTON);
  if (closer !== null) {
    closer.click();
    return;
  }
  if (typeof KeyboardEvent === "undefined") return;
  dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
}

/** Coalesce a burst of observed renders into one deferred scan. */
export function coalesce(run: () => void, schedule: (callback: () => void) => void = queueMicrotask): () => void {
  let scheduled = false;
  return () => {
    if (scheduled) return;
    scheduled = true;
    schedule(() => {
      scheduled = false;
      run();
    });
  };
}

/**
 * DSH 0.1.2-rc.1 compatibility: [role="dialog"][aria-modal="true"],
 * [class*="navList"] direct buttons, [class*="navLabel"], [class*="options"]
 * and aria-current="true". Recheck these selectors/timing on DSH upgrades;
 * remove this adapter when DSH offers a formal section suppression API.
 *
 * Official Models as aria-current: close Settings and open Plugin Center
 * models once per activation — do not click Advanced. Plugins stays hidden
 * and still transfers to Advanced/General so later Settings visits remain usable.
 */
export function hideOfficialSettings(doc: Document = document, hooks?: HideOfficialHooks): () => void {
  const redirectModels = hooks?.redirectModels ?? (() => requestPluginCenterOpen("models"));
  const closeSettings = hooks?.closeSettings ?? closeSettingsDialog;
  type Original = { hidden: boolean; display: string; ariaHidden: string | null; tabIndex: number; tabAttribute: string | null };
  const originals = new Map<HTMLElement, Original>();
  const suppressed = new Map<HTMLElement, HTMLElement>();
  const transfers = new Map<HTMLElement, { stale: HTMLElement; target: HTMLElement }>();
  let redirectedModels = false;
  let disposed = false;

  function hide(node: HTMLElement) {
    if (!originals.has(node)) originals.set(node, {
      hidden: node.hidden, display: node.style.display, ariaHidden: node.getAttribute("aria-hidden"),
      tabIndex: node.tabIndex, tabAttribute: node.getAttribute("tabindex"),
    });
    if (!node.hidden) node.hidden = true;
    if (node.style.display !== "none") node.style.display = "none";
    if (node.getAttribute("aria-hidden") !== "true") node.setAttribute("aria-hidden", "true");
    if (node.tabIndex !== -1) node.tabIndex = -1;
  }
  function restore(node: HTMLElement) {
    const original = originals.get(node);
    if (!original) return;
    if (node.isConnected) {
      node.hidden = original.hidden;
      node.style.display = original.display;
      if (original.ariaHidden === null) node.removeAttribute("aria-hidden");
      else node.setAttribute("aria-hidden", original.ariaHidden);
      node.tabIndex = original.tabIndex;
      if (original.tabAttribute === null) node.removeAttribute("tabindex");
      else node.setAttribute("tabindex", original.tabAttribute);
    }
    originals.delete(node);
  }
  const label = (button: HTMLElement) => button.querySelector('[class*="navLabel"]')?.textContent?.replace(/\s+/g, "").trim() ?? "";
  const visible = (button: HTMLElement) => !button.hidden && button.style.display !== "none" && button.getAttribute("aria-hidden") !== "true";
  function scan() {
    for (const dialog of doc.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')) {
      const nav = dialog.querySelector<HTMLElement>('[class*="navList"]');
      if (!nav) continue;
      const buttons = Array.from(nav.querySelectorAll<HTMLElement>(":scope > button"));
      const obsolete = buttons.filter(button => isObsoleteSettingsLabel(label(button)));
      for (const button of obsolete) hide(button);
      const stale = obsolete.find(button => button.getAttribute("aria-current") === "true");
      if (stale) {
        const options = dialog.querySelector<HTMLElement>('[class*="options"]');
        const previous = suppressed.get(dialog);
        if (previous && previous !== options) restore(previous);
        if (options) { hide(options); suppressed.set(dialog, options); }
        const last = transfers.get(dialog);
        if (staleSettingsAction(label(stale)) === "redirect-models") {
          if (!redirectedModels) {
            redirectedModels = true;
            closeSettings(dialog);
            redirectModels();
          }
        } else {
          const target = buttons.find(button => visible(button) && ["高级", "Advanced"].includes(label(button)))
            ?? buttons.find(button => visible(button) && ["通用设置", "General"].includes(label(button)));
          if (target && (last?.stale !== stale || last.target !== target)) {
            transfers.set(dialog, { stale, target });
            target.click();
          }
        }
      } else if (buttons.some(button => visible(button) && button.getAttribute("aria-current") === "true")) {
        const options = suppressed.get(dialog);
        if (options) restore(options);
        suppressed.delete(dialog);
        transfers.delete(dialog);
      }
    }
  }
  const scheduleScan = coalesce(() => { if (!disposed) scan(); });
  const observer = new MutationObserver(scheduleScan);
  observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-current"] });
  scan();
  return () => {
    disposed = true;
    observer.disconnect();
    for (const node of originals.keys()) restore(node);
    suppressed.clear();
    transfers.clear();
  };
}
