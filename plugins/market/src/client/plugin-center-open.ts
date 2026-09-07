export type CenterTab = "installed" | "discover";
export type CenterLocation = {
  tab: CenterTab;
  query: string;
  tag: string;
  scrollTop: number;
  detail?: { kind: "capability" | "installed" | "catalog"; id: string };
};
export type CenterSnapshot = { open: boolean; location: CenterLocation };
export interface PluginCenterOpen {
  getSnapshot(): CenterSnapshot;
  subscribe(listener: () => void): () => void;
  open(): void;
  close(): void;
  navigate(location: CenterLocation): void;
}

export function createPluginCenterOpen(): PluginCenterOpen {
  const initial = (): CenterLocation => ({ tab: "installed", query: "", tag: "", scrollTop: 0 });
  let snapshot: CenterSnapshot = { open: false, location: initial() };
  const listeners = new Set<() => void>();
  const publish = (next: CenterSnapshot): void => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    open() {
      if (!snapshot.open) publish({ open: true, location: initial() });
    },
    close() {
      if (snapshot.open) publish({ ...snapshot, open: false });
    },
    navigate(location) {
      publish({ ...snapshot, location });
    },
  };
}
