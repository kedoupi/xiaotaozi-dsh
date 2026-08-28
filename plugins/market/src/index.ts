import type { Context } from "@deepseek-ai/cordis";
import { resolveMarketConfig, type MarketConfig } from "./config.ts";
import { loadIntents, saveIntents } from "./intents.ts";
import { spawnDshPluginMutate } from "./plugin-mutate.ts";
import { readProfileDependencies } from "./profile-deps.ts";
import { registerMarketRoutes, type WebServer } from "./routes.ts";
import { loadSources, saveSources } from "./sources-store.ts";
import { pluginTrace } from "./trace.ts";

export const name = "market";
export { Config } from "./schema.ts";
export type { MarketConfig };

type HostContext = Context & { webServer: WebServer };

/** Host entry. The panel lists MARKET_PLUGINS and installs them into the
 * current DSH_HOME web profile via `dsh plugin --profile web`. */
export function apply(ctx: Context, config?: Partial<MarketConfig>): void {
  const live = resolveMarketConfig(config);
  pluginTrace("mounted");
  ctx.inject(["webServer"], (host) => {
    const web = (host as HostContext).webServer;
    ctx.effect(() => registerMarketRoutes(web, live, {
      readSources: () => loadSources(),
      writeSources: (sources) => saveSources(sources),
      readIntents: () => loadIntents(),
      writeIntents: (intents) => saveIntents(intents),
      readDependencies: () => readProfileDependencies(),
      mutatePlugin: spawnDshPluginMutate,
    }), "dsh-market host routes");
  });
}
