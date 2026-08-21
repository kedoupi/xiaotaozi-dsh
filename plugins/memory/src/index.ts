import type { Context } from "@deepseek-ai/cordis";
import type { IncomingMessage, ServerResponse } from "node:http";
import { memoryGuidanceText, NOEMA_GUIDANCE_SECTION } from "./guidance.ts";
import { MemoryImportService } from "./import-service.ts";
import { PLUGIN_NAME, NOEMA_TOOL_NAMES } from "./names.ts";
import { NoemaServerManager } from "./server-manager.ts";
import { Config, installNoemaMemorySettings, resolveNoemaMemorySettings, type NoemaMemorySettings } from "./settings.ts";
import { registerNoemaStatusRoute } from "./status-route.ts";
import { registerMemoryTools } from "./tools.ts";

export const name = PLUGIN_NAME;
export const inject = ["tools"];
export { Config };
export type { NoemaMemorySettings };
export { NOEMA_TOOL_NAMES };

type Logger = { info(message: string): void; warn(message: string): void };

type HostContext = Context & {
  tools: { register(tool: unknown): void };
  logger?: Logger;
};

interface WebServerLike {
  register(route: {
    kind: "exact";
    path: string;
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
  }): () => void;
}

export async function apply(ctx: Context, config?: Partial<NoemaMemorySettings>): Promise<() => Promise<void>> {
  const host = ctx as HostContext;
  const entry = config ?? {};
  let settingsSource = () => resolveNoemaMemorySettings(entry);
  let settingsWriter: ((patch: Partial<NoemaMemorySettings>) => Promise<void>) | undefined;

  await installNoemaMemorySettings(entry, {
    setSource: (source) => {
      settingsSource = source;
    },
    setWriter: (writer) => {
      settingsWriter = writer;
    },
  });

  const logger = host.logger;
  const manager = new NoemaServerManager(() => settingsSource(), logger);
  const importService = new MemoryImportService(manager, () => settingsSource(), logger);
  registerMemoryTools(host as unknown as Parameters<typeof registerMemoryTools>[0], manager, () => settingsSource(), importService);

  ctx.inject(["systemPrompt"], (promptCtx) => {
    const systemPrompt = (promptCtx as Context & {
      systemPrompt: { section: (spec: { name: string; order: number; text: () => string }) => void };
    }).systemPrompt;
    systemPrompt.section({
      name: NOEMA_GUIDANCE_SECTION.name,
      order: NOEMA_GUIDANCE_SECTION.order,
      text: () => memoryGuidanceText(settingsSource()),
    });
  });

  ctx.inject(["webServer"], (webCtx) => {
    const webServer = (webCtx as Context & { webServer: WebServerLike }).webServer;
    return registerNoemaStatusRoute(
      webServer,
      manager,
      () => settingsSource(),
      () => settingsWriter,
      importService,
    );
  });

  const initial = settingsSource();
  if (initial.enabled && initial.autoStart) {
    manager.ensureRunning().catch((error: unknown) => {
      logger?.warn(`dsh-memory: ${error instanceof Error ? error.message : String(error)}`);
    });
  }
  manager.startKeepAlive();
  if (initial.enabled && initial.importEnabled && initial.importOnStartup) {
    importService.run({}).catch((error: unknown) => {
      logger?.warn(`dsh-memory startup import: ${error instanceof Error ? error.message : String(error)}`);
    });
  }
  logger?.info(`dsh-memory mounted (${NOEMA_TOOL_NAMES.length} memory tools; ${initial.enabled ? "enabled" : "disabled"})`);

  return async () => {
    await manager.dispose();
  };
}
