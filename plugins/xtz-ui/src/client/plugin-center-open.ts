/** Copied in dsh-market `plugin-center-open.ts`. Do not import across packages. */
export const PLUGIN_CENTER_OPEN_EVENT = "dsh-plugin-center-open";

export type PluginCenterCapability = "xiaotaozi" | "side-workbench" | "models" | "im";

export function requestPluginCenterOpen(
  capability: PluginCenterCapability,
  dispatch: (event: Event) => void = (event) => {
    if (typeof document === "undefined") return;
    document.dispatchEvent(event);
  },
): void {
  dispatch(new CustomEvent(PLUGIN_CENTER_OPEN_EVENT, { detail: { capability } }));
}
