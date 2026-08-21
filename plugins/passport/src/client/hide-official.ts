/**
 * Hide the host's official Models nav cell.
 *
 * Official and this plugin both register `settings.section` id `models`; the
 * shell lists both occupants. This plugin loads later, so we keep the last
 * matching cell.
 *
 * Known host coupling, not a stable API: selectors (`[class*="navList"]`,
 * `.dshM-wrap`) and the MutationObserver on `document.body` will miss if the
 * host restyles the settings overlay. Do not copy the official Models form
 * as a fallback; fix the occupancy (slot id / load order) when the host
 * offers one.
 */
export function hideOfficialModels(label: string): () => void {
  const hide = (): void => {
    const cells = Array.from(document.querySelectorAll<HTMLElement>('[class*="navList"] > button')).filter((button) => {
      const text = (button.textContent ?? "").replace(/\s+/g, "").trim();
      return text === label || text.endsWith(label);
    });
    for (const extra of cells.slice(0, -1)) extra.style.display = "none";
    const ours = document.querySelector(".dshM-wrap");
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
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}
