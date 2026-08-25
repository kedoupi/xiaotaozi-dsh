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

/** Web-server service key candidates, newest first (matches agent-teams). */
const WEB_SERVER_KEYS = ["webServer", "httpServer"] as const;

interface WebServerLike {
  register(route: {
    kind: "exact";
    path: string;
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
  }): () => void;
}

interface WorkspaceServiceLike {
  list(): readonly { path: string }[];
}

function workspaceRoots(ctx: Context): readonly string[] | undefined {
  const service = (ctx.get("workspaceRegistry") ?? ctx.get("workspace")) as WorkspaceServiceLike | undefined;
  if (service === undefined || typeof service.list !== "function") return undefined;
  try {
    return service.list()
      .map((workspace) => workspace.path)
      .filter((path): path is string => typeof path === "string" && path !== "");
  } catch {
    return undefined;
  }
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

  // The status route needs the web server, which headless profiles do not
  // mount; under concurrent activation it may also bind after this plugin.
  // Mirror agent-teams: accept both the renamed `webServer` and the published
  // rc.1 `httpServer` service keys, try now, then retry on service binding.
  let webRegistered = false;
  const registerWebSurface = (): void => {
    if (webRegistered) return;
    const webServer = (ctx.get(WEB_SERVER_KEYS[0]) ?? ctx.get(WEB_SERVER_KEYS[1])) as WebServerLike | undefined;
    if (webServer === undefined) return;
    webRegistered = true;
    ctx.effect(() => registerNoemaStatusRoute(
      webServer,
      manager,
      () => settingsSource(),
      () => settingsWriter,
      importService,
      () => workspaceRoots(ctx),
    ), "memory: status route");
  };
  registerWebSurface();
  ctx.on("internal/service", (name) => {
    if (WEB_SERVER_KEYS.includes(name as (typeof WEB_SERVER_KEYS)[number])) registerWebSurface();
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
