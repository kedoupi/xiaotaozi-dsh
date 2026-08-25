/**
 * Hide the host's duplicate Models nav cell and the official Models form.
 * Official and dsh-providers both register `settings.section` id `models`.
 * Keep the last matching nav button (providers loads after the host).
 */

export const MODELS_NAV_LABELS = ["模型", "Models"] as const;

export function isModelsNavLabel(text: string): boolean {
  const compact = text.replace(/\s+/g, "").trim();
  return MODELS_NAV_LABELS.some((label) => compact === label || compact.endsWith(label));
}

export function hideOfficialModels(doc: Document = document): () => void {
  const hide = (): void => {
    const cells = Array.from(doc.querySelectorAll<HTMLElement>("[class*=\"navList\"] > button")).filter((button) =>
      isModelsNavLabel(button.textContent ?? ""),
    );
    for (const extra of cells.slice(0, -1)) extra.style.display = "none";
    const ours = doc.querySelector(".dshM-wrap");
    const parent = ours?.parentElement;
    if (ours instanceof HTMLElement && parent != null) {
      ours.style.zIndex = "2";
      ours.style.pointerEvents = "auto";
      for (const child of Array.from(parent.children)) {
        if (child !== ours && child instanceof HTMLElement) {
          child.style.display = "none";
          child.style.pointerEvents = "none";
          child.setAttribute("aria-hidden", "true");
        }
      }
    }
  };
  hide();
  const observer = new MutationObserver(hide);
  observer.observe(doc.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}
