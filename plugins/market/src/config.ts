export interface MarketConfig {
  /** Official signed market index. The desktop shell verifies and applies packs. */
  indexUrl: string;
  officialLabel: string;
  /** Allow users to register extra market sources from the panel. */
  allowThirdPartySources: boolean;
}

export const MARKET_CONFIG_DEFAULTS: MarketConfig = {
  indexUrl: "https://s.xiaotaozi.cc/dsh/packs/market.json",
  officialLabel: "小桃子市场",
  allowThirdPartySources: true,
};

export function pickConfigPatch(value: unknown): Partial<MarketConfig> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const patch: Partial<MarketConfig> = {};
  if (typeof record.indexUrl === "string" && record.indexUrl !== "") patch.indexUrl = record.indexUrl;
  if (typeof record.officialLabel === "string" && record.officialLabel !== "") patch.officialLabel = record.officialLabel;
  if (typeof record.allowThirdPartySources === "boolean") patch.allowThirdPartySources = record.allowThirdPartySources;
  return patch;
}

export function resolveMarketConfig(entry: Partial<MarketConfig> | undefined = {}): MarketConfig {
  return { ...MARKET_CONFIG_DEFAULTS, ...pickConfigPatch(entry) };
}
