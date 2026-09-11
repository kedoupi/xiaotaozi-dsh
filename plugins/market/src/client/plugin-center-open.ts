export type CenterTab = "installed" | "discover";
export type CenterLocation = {
  tab: CenterTab;
  query: string;
  tag: string;
  scrollTop: number;
  detail?: { kind: "capability" | "installed" | "catalog"; id: string };
};
export type CenterSnapshot = { open: boolean; location: CenterLocation };
export type PluginCenterCapability = "xiaotaozi" | "side-workbench" | "models" | "im";
export interface PluginCenterOpen {
  getSnapshot(): CenterSnapshot;
  subscribe(listener: () => void): () => void;
  open(location?: CenterLocation): void;
  close(): void;
  navigate(location: CenterLocation): void;
}

/** Copied in dsh-xtz-ui `plugin-center-open.ts`. Do not import across packages. */
export const PLUGIN_CENTER_OPEN_EVENT = "dsh-plugin-center-open";
export const PLUGIN_CENTER_CAPABILITIES = ["xiaotaozi", "side-workbench", "models", "im"] as const;

export function isPluginCenterCapability(value: unknown): value is PluginCenterCapability {
  return typeof value === "string" && (PLUGIN_CENTER_CAPABILITIES as readonly string[]).includes(value);
}

export function locationFromOpenEvent(detail: unknown): CenterLocation | undefined {
  if (detail === null || typeof detail !== "object") return undefined;
  const capability = "capability" in detail ? detail.capability : undefined;
  if (!isPluginCenterCapability(capability)) return undefined;
  return { tab: "installed", query: "", tag: "", scrollTop: 0, detail: { kind: "capability", id: capability } };
}

export function listenPluginCenterOpen(center: PluginCenterOpen, target: EventTarget): () => void {
  const onOpen = (event: Event): void => {
    const location = locationFromOpenEvent((event as CustomEvent).detail);
    if (location === undefined) return;
    center.open(location);
  };
  target.addEventListener(PLUGIN_CENTER_OPEN_EVENT, onOpen);
  return () => target.removeEventListener(PLUGIN_CENTER_OPEN_EVENT, onOpen);
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
    open(location) {
      if (location !== undefined) {
        publish({ open: true, location });
        return;
      }
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
