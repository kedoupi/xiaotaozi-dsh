/** Tiny open/close store copied from dsh-web panel controllers. */

export type PanelOpen = {
  subscribe(listener: () => void): () => void;
  isOpen(): boolean;
  open(): void;
  close(): void;
  toggle(): void;
};

export function createPanelOpen(): PanelOpen {
  let open = false;
  const listeners = new Set<() => void>();
  const emit = (): void => {
    for (const listener of listeners) listener();
  };
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    isOpen: () => open,
    open() {
      if (open) return;
      open = true;
      emit();
    },
    close() {
      if (!open) return;
      open = false;
      emit();
    },
    toggle() {
      open = !open;
      emit();
    },
  };
}
