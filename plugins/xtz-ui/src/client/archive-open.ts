/** Copied contract: session menu and Xiaotaozi settings both open the archive page. */
export const XTZ_UI_ARCHIVE_OPEN_EVENT = "dsh-xtz-ui-archive-open";

const listeners = new Set<() => void>();
let pending = false;

export function requestArchivePage(
  dispatch: (event: Event) => void = (event) => {
    if (typeof document === "undefined") return;
    document.dispatchEvent(event);
  },
): void {
  pending = true;
  dispatch(new CustomEvent(XTZ_UI_ARCHIVE_OPEN_EVENT));
  for (const listener of listeners) listener();
}

export function takeArchiveOpenRequest(): boolean {
  if (!pending) return false;
  pending = false;
  return true;
}

export function subscribeArchiveOpen(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetArchiveOpenRequest(): void {
  pending = false;
}
