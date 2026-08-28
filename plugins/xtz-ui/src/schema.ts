import Schema from "@deepseek-ai/schemastery";
import { XTZ_UI_CONFIG_DEFAULTS, type XtzUiConfig } from "./config.ts";

/** Host-only Schemastery schema. Do not import this from `src/client`. */
export const Config: Schema<XtzUiConfig> = Schema.object({
  archive: Schema.boolean().default(XTZ_UI_CONFIG_DEFAULTS.archive),
  board: Schema.boolean().default(XTZ_UI_CONFIG_DEFAULTS.board),
  gitGraph: Schema.boolean().default(XTZ_UI_CONFIG_DEFAULTS.gitGraph),
  announceToAgent: Schema.boolean().default(XTZ_UI_CONFIG_DEFAULTS.announceToAgent),
});

export type Config = XtzUiConfig;
