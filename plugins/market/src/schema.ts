import Schema from "@deepseek-ai/schemastery";
import { MARKET_CONFIG_DEFAULTS, type MarketConfig } from "./config.ts";

/** Host-only Schemastery schema. Do not import this from `src/client`. */
export const Config: Schema<MarketConfig> = Schema.object({
  indexUrl: Schema.string().default(MARKET_CONFIG_DEFAULTS.indexUrl),
  officialLabel: Schema.string().default(MARKET_CONFIG_DEFAULTS.officialLabel),
  allowThirdPartySources: Schema.boolean().default(MARKET_CONFIG_DEFAULTS.allowThirdPartySources),
});

export type Config = MarketConfig;
