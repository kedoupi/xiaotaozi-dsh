import type { Context } from "@deepseek-ai/cordis";
import { resolveMarketConfig, type MarketConfig } from "./config.ts";
import { loadIntents, saveIntents } from "./intents.ts";
import { registerMarketRoutes, type WebServer } from "./routes.ts";
import { loadSources, saveSources } from "./sources-store.ts";

export const name = "market";
export { Config } from "./schema.ts";
export type { MarketConfig };

type HostContext = Context & { webServer: WebServer };

/** Host entry. The panel browses the catalog and queues install intents under
 * `$DSH_HOME/plugins/market/`; the desktop shell owns pack download and apply. */
export function apply(ctx: Context, config?: Partial<MarketConfig>): void {
  const live = resolveMarketConfig(config);
  ctx.inject(["webServer"], (host) => {
    const web = (host as HostContext).webServer;
    ctx.effect(() => registerMarketRoutes(web, live, {
      readSources: () => loadSources(),
      writeSources: (sources) => saveSources(sources),
      readIntents: () => loadIntents(),
      writeIntents: (intents) => saveIntents(intents),
    }), "dsh-market host routes");
  });
}
