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

/**
 * Coalesce bursts of calls into one `run` per scheduler tick. Mutation
 * observers fire once per mutation batch; a settings-page render produces
 * many batches back to back, and each used to replay the full hide scan.
 * @param run - the work to run once per burst.
 * @param schedule - the deferral primitive (`queueMicrotask` by default; injectable for tests).
 * @returns a trigger that requests one deferred `run`.
 */
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
  let disposed = false;
  const scheduleHide = coalesce(() => {
    if (!disposed) hide();
  });
  const observer = new MutationObserver(scheduleHide);
  observer.observe(doc.body, { childList: true, subtree: true });
  return () => {
    disposed = true;
    observer.disconnect();
  };
}
