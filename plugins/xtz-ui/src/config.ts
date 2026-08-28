/** One Xiaotaozi surface the Settings → 小桃子 page can toggle. */
export const FEATURE_KEYS = [
  "archive",
  "board",
  "gitGraph",
  "announceToAgent",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export type XtzUiConfig = Record<FeatureKey, boolean>;

export const XTZ_UI_CONFIG_DEFAULTS: XtzUiConfig = {
  archive: true,
  board: true,
  gitGraph: true,
  announceToAgent: false,
};

/** Which features actually mount Host/UI surfaces. Unshipped stay off even if Config is true. */
export type FeatureShipped = Record<FeatureKey, boolean>;

export const FEATURE_SHIPPED: FeatureShipped = {
  archive: true,
  board: true,
  gitGraph: true,
  announceToAgent: true,
};

export function isFeatureKey(value: string): value is FeatureKey {
  return (FEATURE_KEYS as readonly string[]).includes(value);
}

/** Keep only known boolean feature flags. Unknown keys are dropped. */
export function pickFeaturePatch(value: unknown): Partial<XtzUiConfig> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const patch: Partial<XtzUiConfig> = {};
  for (const key of FEATURE_KEYS) {
    const current = (value as Record<string, unknown>)[key];
    if (typeof current === "boolean") patch[key] = current;
  }
  return patch;
}

export function resolveXtzUiConfig(
  entry: Partial<XtzUiConfig> | undefined = {},
  overlay: Partial<XtzUiConfig> = {},
): XtzUiConfig {
  return { ...XTZ_UI_CONFIG_DEFAULTS, ...pickFeaturePatch(entry), ...pickFeaturePatch(overlay) };
}

/**
 * Surfaces that should be mounted for this config.
 */
export function surfacesFor(
  config: XtzUiConfig,
  shipped: FeatureShipped = FEATURE_SHIPPED,
): FeatureKey[] {
  const surfaces: FeatureKey[] = [];
  if (shipped.archive && config.archive) surfaces.push("archive");
  if (shipped.board && config.board) surfaces.push("board");
  if (shipped.gitGraph && config.gitGraph) surfaces.push("gitGraph");
  if (shipped.announceToAgent && config.announceToAgent) surfaces.push("announceToAgent");
  return surfaces;
}
