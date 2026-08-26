import Schema from "@deepseek-ai/schemastery";
import { HELLO_CONFIG_DEFAULTS, type HelloConfig } from "./config.ts";

/** Host-only Schemastery schema. Do not import this from `src/client`. */
export const Config: Schema<HelloConfig> = Schema.object({
  archive: Schema.boolean().default(HELLO_CONFIG_DEFAULTS.archive),
  workbench: Schema.boolean().default(HELLO_CONFIG_DEFAULTS.workbench),
  workbenchFiles: Schema.boolean().default(HELLO_CONFIG_DEFAULTS.workbenchFiles),
  workbenchGit: Schema.boolean().default(HELLO_CONFIG_DEFAULTS.workbenchGit),
  workbenchTerminal: Schema.boolean().default(HELLO_CONFIG_DEFAULTS.workbenchTerminal),
  workbenchBrowser: Schema.boolean().default(HELLO_CONFIG_DEFAULTS.workbenchBrowser),
  board: Schema.boolean().default(HELLO_CONFIG_DEFAULTS.board),
  gitGraph: Schema.boolean().default(HELLO_CONFIG_DEFAULTS.gitGraph),
  announceToAgent: Schema.boolean().default(HELLO_CONFIG_DEFAULTS.announceToAgent),
});

export type Config = HelloConfig;
