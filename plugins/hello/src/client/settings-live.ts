import { FEATURE_SHIPPED, HELLO_CONFIG_DEFAULTS, surfacesFor, type FeatureShipped, type HelloConfig } from "../config.ts";
import { HELLO_SETTINGS_ROUTE } from "../names.ts";

export interface SettingsSnapshot {
  config: HelloConfig;
  shipped: FeatureShipped;
  surfaces: ReturnType<typeof surfacesFor>;
}

const listeners = new Set<() => void>();
let snapshot: SettingsSnapshot = {
  config: HELLO_CONFIG_DEFAULTS,
  shipped: FEATURE_SHIPPED,
  surfaces: surfacesFor(HELLO_CONFIG_DEFAULTS, FEATURE_SHIPPED),
};

export function getSettingsSnapshot(): SettingsSnapshot {
  return snapshot;
}

export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(next: SettingsSnapshot): SettingsSnapshot {
  snapshot = next;
  for (const listener of listeners) listener();
  return snapshot;
}

interface SettingsPayload {
  ok?: boolean;
  config?: HelloConfig;
  shipped?: FeatureShipped;
  surfaces?: ReturnType<typeof surfacesFor>;
}

function fromPayload(payload: SettingsPayload): SettingsSnapshot {
  const config = payload.config ?? snapshot.config;
  const shipped = payload.shipped ?? snapshot.shipped;
  return {
    config,
    shipped,
    surfaces: payload.surfaces ?? surfacesFor(config, shipped),
  };
}

export async function loadSettingsLive(): Promise<SettingsSnapshot> {
  const response = await fetch(HELLO_SETTINGS_ROUTE, { cache: "no-store" });
  const payload = await response.json() as SettingsPayload;
  if (payload.ok === false) throw new Error("settings load failed");
  return emit(fromPayload(payload));
}

export async function patchSettingsLive(patch: Partial<HelloConfig>): Promise<SettingsSnapshot> {
  const response = await fetch(HELLO_SETTINGS_ROUTE, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  const payload = await response.json() as SettingsPayload;
  if (payload.ok === false) throw new Error("settings save failed");
  return emit(fromPayload(payload));
}
