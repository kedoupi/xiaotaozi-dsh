export type InventoryEntry = {
  moduleName: string;
  enabled: boolean;
  fiberPhase: "pending" | "loading" | "active" | "failed" | "unloading" | null;
};
export type InventoryRemote = {
  pluginInventory: {
    list(): Promise<
      | { ok: true; value: { entries: readonly InventoryEntry[] } }
      | { ok: false; error: { code: string; message: string } }
    >;
  };
};

export async function loadPluginInventory(
  remote: InventoryRemote | undefined,
): Promise<readonly InventoryEntry[] | undefined> {
  try {
    const result = await remote?.pluginInventory.list();
    return result?.ok === true ? result.value.entries : undefined;
  } catch {
    return undefined;
  }
}

export type RuntimeState = "running" | "loading" | "error" | "disabled" | "unknown";

export function runtimeStateFor(
  packageName: string,
  inventory: readonly InventoryEntry[] | undefined,
): RuntimeState {
  const rows = inventory?.filter(row =>
    row.moduleName === packageName || row.moduleName.startsWith(`${packageName}/`),
  );
  if (rows === undefined || rows.length === 0) return "unknown";
  const enabled = rows.filter(row => row.enabled);
  if (enabled.length === 0) return "disabled";
  if (enabled.some(row => row.fiberPhase === "failed")) return "error";
  if (enabled.some(row => row.fiberPhase === "pending" || row.fiberPhase === "loading" || row.fiberPhase === "unloading")) return "loading";
  if (enabled.every(row => row.fiberPhase === "active")) return "running";
  return "unknown";
}
