/** One workbench feature the Settings → 小桃子 page can toggle. */
export const FEATURE_KEYS = [
  "archive",
  "workbench",
  "workbenchFiles",
  "workbenchGit",
  "workbenchTerminal",
  "workbenchBrowser",
  "board",
  "gitGraph",
  "announceToAgent",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

/** Nested file / Git / terminal tabs under the right workbench. */
export const WORKBENCH_CHILDREN = [
  "workbenchFiles",
  "workbenchGit",
  "workbenchTerminal",
] as const satisfies readonly FeatureKey[];

export type HelloConfig = Record<FeatureKey, boolean>;

export const HELLO_CONFIG_DEFAULTS: HelloConfig = {
  archive: true,
  workbench: true,
  workbenchFiles: true,
  workbenchGit: true,
  workbenchTerminal: true,
  workbenchBrowser: false,
  board: true,
  gitGraph: true,
  announceToAgent: false,
};

/** Which features actually mount Host/UI surfaces. Unshipped stay off even if Config is true. */
export type FeatureShipped = Record<FeatureKey, boolean>;

export const FEATURE_SHIPPED: FeatureShipped = {
  archive: true,
  workbench: true,
  workbenchFiles: true,
  workbenchGit: true,
  workbenchTerminal: true,
  workbenchBrowser: false,
  board: true,
  gitGraph: true,
  announceToAgent: true,
};

export function isFeatureKey(value: string): value is FeatureKey {
  return (FEATURE_KEYS as readonly string[]).includes(value);
}

/** Keep only known boolean feature flags. Unknown keys are dropped. */
export function pickFeaturePatch(value: unknown): Partial<HelloConfig> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const patch: Partial<HelloConfig> = {};
  for (const key of FEATURE_KEYS) {
    const current = (value as Record<string, unknown>)[key];
    if (typeof current === "boolean") patch[key] = current;
  }
  return patch;
}

export function resolveHelloConfig(
  entry: Partial<HelloConfig> | undefined = {},
  overlay: Partial<HelloConfig> = {},
): HelloConfig {
  return { ...HELLO_CONFIG_DEFAULTS, ...pickFeaturePatch(entry), ...pickFeaturePatch(overlay) };
}

/**
 * Surfaces that should be mounted for this config.
 * Workbench children require the parent workbench flag.
 */
export function surfacesFor(
  config: HelloConfig,
  shipped: FeatureShipped = FEATURE_SHIPPED,
): FeatureKey[] {
  const surfaces: FeatureKey[] = [];
  if (shipped.archive && config.archive) surfaces.push("archive");
  if (shipped.workbench && config.workbench) {
    surfaces.push("workbench");
    for (const child of WORKBENCH_CHILDREN) {
      if (shipped[child] && config[child]) surfaces.push(child);
    }
  }
  if (shipped.board && config.board) surfaces.push("board");
  if (shipped.gitGraph && config.gitGraph) surfaces.push("gitGraph");
  if (shipped.announceToAgent && config.announceToAgent) surfaces.push("announceToAgent");
  return surfaces;
}
