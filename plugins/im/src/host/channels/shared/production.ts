import { unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { createTokenConnectionSupervisor } from "./connection-supervisor.ts";
import { createHarnessCommandExecutor } from "../../../command-executor.ts";
import { createHarnessSessionExecutors } from "../../../session-coordinator.ts";
import {
  BotWorkspaceStore,
  createBotWorkspaceScope,
  createWorkspaceAwareController,
  observeBotWorkspaceRemovals,
} from "../../../channels/shared/bot-workspace-store.ts";
import { listAgentPresetCatalog } from "../../../channels/shared/agent-preset.ts";
import { HarnessClient } from "../../../channels/shared/harness-client.ts";
import { maskPlatformId } from "../../../channels/shared/token-config-store.ts";
import {
  followSourceName,
  preloadFollowSources,
  registerFollowSource,
} from "../../../channels/shared/session-follow.ts";

type CodedError = { code?: unknown };
type ProductionLogger = {
  error?: (...args: unknown[]) => unknown;
  warn?: (...args: unknown[]) => unknown;
  info?: (...args: unknown[]) => unknown;
  debug?: (...args: unknown[]) => unknown;
};
type ProductionContext = {
  credentials?: unknown;
  webServer?: { port?: unknown } | null;
  logger?: ((name: string) => ProductionLogger) | ProductionLogger;
};
type ProductionConfig = {
  dshHome?: string;
  dataDir?: string;
  configPath?: string;
  botsDir?: string;
  workspacesPath?: string;
  workspace?: string;
  agentPreset?: unknown;
  harnessBaseUrl?: string | URL;
  dshBin?: string;
  replyTimeoutMs?: number;
  connectTimeoutMs?: number;
  retryDelaysMs?: unknown;
  healthyIntervalMs?: number;
};
type ProductionInternals = {
  ConfigStore?: any;
  StateStore?: any;
  HarnessClient?: any;
  Controller?: any;
  Runtime?: any;
  createConnectionSupervisor?: any;
  WorkspaceStore?: any;
  workspaces?: any;
  commandExecutor?: any;
  controlExecutor?: any;
  sessionMaintenanceExecutor?: any;
  fileIngressExecutor?: any;
  inspectToken?: any;
};
type ProductionDefinitions = {
  channel: string;
  ConfigStore: any;
  StateStore: any;
  Controller: any;
  Runtime: any;
  runtimeOptions?: (config: ProductionConfig) => any;
  followDetail?: (bot: unknown) => unknown;
};
type ProductionWorkspaces = {
  reconcile: (ids: unknown) => unknown;
  ensure: (botId: unknown, options?: unknown) => unknown;
  displayNameFor: (botId: unknown) => unknown;
  projectFor: (botId: unknown) => unknown;
  generationFor: (botId: unknown) => unknown;
  setProjectCatalog: (catalog: (options: any) => unknown) => unknown;
  reconcileProjects: (options: unknown) => unknown;
};
type BotState = {
  clearSessions: () => unknown;
  remove?: () => unknown;
};
type ConfiguredBot = { botId: string; platformId?: unknown };
type LoadedConfigStore = {
  list: () => ConfiguredBot[];
  get?: (botId: unknown) => ConfiguredBot | null | undefined;
  remove?: unknown;
};

export function harnessOrigin(
  webServer: { port?: unknown } | null | undefined,
  configured: unknown,
) {
  if (configured !== undefined) return new URL(configured as string | URL);
  const port = webServer?.port;
  if (!Number.isInteger(port) || (port as number) < 1 || (port as number) > 65_535) {
    throw new Error(
      "dsh-im token channel requires an initialized DSH webServer port",
    );
  }
  return new URL(`http://127.0.0.1:${port}`);
}

export function pluginPaths(config: ProductionConfig, channel: string) {
  const dshHome = resolve(
    config.dshHome ?? process.env.DSH_HOME ?? join(homedir(), ".dsh"),
  );
  const root = resolve(
    config.dataDir ?? join(dshHome, "integrations", `dsh-${channel}`),
  );
  return {
    config: resolve(config.configPath ?? join(root, "config.json")),
    bots: resolve(config.botsDir ?? join(root, "bots")),
    workspaces: resolve(config.workspacesPath ?? join(root, "workspaces.json")),
  };
}

export async function createTokenProductionController(
  ctx: unknown,
  config: unknown,
  internals: unknown,
  definitions: ProductionDefinitions,
) {
  const context = ctx as ProductionContext;
  const pluginConfig = (config ?? {}) as ProductionConfig;
  const extra = (internals ?? {}) as ProductionInternals;
  const {
    channel,
    ConfigStore,
    StateStore,
    Controller,
    Runtime,
    runtimeOptions,
  } = definitions;
  if (!context?.credentials)
    throw new TypeError(`dsh-im ${channel} requires ctx.credentials`);
  if (!context?.webServer)
    throw new TypeError(`dsh-im ${channel} requires ctx.webServer`);

  const ResolvedConfigStore = extra.ConfigStore ?? ConfigStore;
  const ResolvedStateStore = extra.StateStore ?? StateStore;
  const ResolvedHarness = extra.HarnessClient ?? HarnessClient;
  const ResolvedController = extra.Controller ?? Controller;
  const ResolvedRuntime = extra.Runtime ?? Runtime;
  const channelRuntimeOptions =
    typeof runtimeOptions === "function" ? runtimeOptions(pluginConfig) : {};
  if (
    !channelRuntimeOptions ||
    typeof channelRuntimeOptions !== "object" ||
    Array.isArray(channelRuntimeOptions)
  ) {
    throw new TypeError(
      `dsh-im ${channel} runtimeOptions must return an object`,
    );
  }
  const createSupervisor =
    extra.createConnectionSupervisor ?? createTokenConnectionSupervisor;
  const logger: ProductionLogger =
    typeof context.logger === "function"
      ? context.logger(`dsh-im:${channel}`)
      : (context.logger ?? console);
  const agentPresetCatalog = () => listAgentPresetCatalog(context);
  const paths = pluginPaths(pluginConfig, channel);
  const configStore = await new ResolvedConfigStore(paths.config).load() as LoadedConfigStore;
  const defaultWorkspace = resolve(pluginConfig.workspace ?? process.cwd());
  const WorkspaceStore = extra.WorkspaceStore ?? BotWorkspaceStore;
  const workspaces = (
    extra.workspaces ??
    (await new (WorkspaceStore as any)(paths.workspaces, { defaultWorkspace }).load())
  ) as ProductionWorkspaces;
  const configuredBots = configStore.list();
  await workspaces.reconcile(configuredBots.map((bot) => bot.botId));
  await Promise.all(
    configuredBots.map((bot) =>
      workspaces.ensure(bot.botId, {
        defaultAgentPreset: pluginConfig.agentPreset,
      }),
    ),
  );
  const observedConfigStore =
    typeof configStore.remove === "function"
      ? observeBotWorkspaceRemovals(configStore, { workspaces })
      : configStore;
  const stateStores = new Map<string, BotState>();
  const followUnregisters = new Map<string, () => void>();
  const statePath = (botId: string) => resolve(paths.bots, botId, "state.json");
  const stateFor = async (botId: string) => {
    let state = stateStores.get(botId);
    if (!state) {
      state = await new ResolvedStateStore(statePath(botId)).load() as BotState;
      stateStores.set(botId, state);
      const bot =
        typeof configStore.get === "function" ? configStore.get(botId) : null;
      followUnregisters.set(
        botId,
        registerFollowSource({
          channel,
          botId,
          state,
          name: () =>
            workspaces.displayNameFor(botId) ||
            followSourceName(configStore.get?.(botId)),
          detail: () => {
            const current = configStore.get?.(botId);
            if (typeof definitions.followDetail === "function")
              return definitions.followDetail(current) || "";
            return current?.platformId
              ? maskPlatformId(current.platformId, "")
              : "";
          },
          project: () => workspaces.projectFor(botId),
          generation: () => workspaces.generationFor(botId),
          locateSession: (sessionId: unknown) => harness.locateProjectSession(sessionId),
        }) as () => void,
      );
    }
    return state;
  };
  await preloadFollowSources(configuredBots, (bot: ConfiguredBot) => stateFor(bot.botId));
  const commandExecutor = createHarnessCommandExecutor(context as any, extra.commandExecutor);
  const {
    controlExecutor,
    sessionMaintenanceExecutor,
    fileIngressExecutor,
  } = createHarnessSessionExecutors(context, {
    controlExecutor: extra.controlExecutor,
    sessionMaintenanceExecutor: extra.sessionMaintenanceExecutor,
    fileIngressExecutor: extra.fileIngressExecutor,
  }) as {
    controlExecutor?: unknown;
    sessionMaintenanceExecutor?: unknown;
    fileIngressExecutor?: unknown;
  };
  const harness = new ResolvedHarness({
    baseUrl: harnessOrigin(context.webServer, pluginConfig.harnessBaseUrl),
    workspace: defaultWorkspace,
    ...(pluginConfig.agentPreset == null ? {} : { agentPreset: pluginConfig.agentPreset }),
    autostart: false,
    dshBin: pluginConfig.dshBin ?? "dsh",
    rpcIdPrefix: channel,
    logPrefix: `dsh-${channel}`,
    ...(commandExecutor ? { commandExecutor } : {}),
    ...(controlExecutor ? { controlExecutor } : {}),
    ...(sessionMaintenanceExecutor ? { sessionMaintenanceExecutor } : {}),
    ...(fileIngressExecutor ? { fileIngressExecutor } : {}),
  });
  workspaces.setProjectCatalog((options) => harness.listProjects(options));
  try {
    await workspaces.reconcileProjects({
      clearSessions: async (botId: string) => {
        const state = await stateFor(botId);
        await state.clearSessions();
      },
    });
  } catch (error) {
    // A transient catalog failure must not bind or unbind anything; the next
    // decorated controller result reconciles again.
    if ((error as CodedError)?.code !== "workspace-catalog-unavailable") throw error;
    logger.warn?.(
      "dsh-im: project catalog unavailable at startup; keeping stored bindings",
    );
  }
  const coreController = new ResolvedController({
    credentials: context.credentials,
    configStore: observedConfigStore,
    logger,
    ...(extra.inspectToken ? { inspectToken: extra.inspectToken } : {}),
    createRuntime: async ({
      botId,
      config: botConfig,
      token,
    }: {
      botId: string;
      config: unknown;
      token: unknown;
    }) => {
      const state = await stateFor(botId);
      await workspaces.ensure(botId, {
        defaultAgentPreset: pluginConfig.agentPreset,
      });
      const workspaceScope = createBotWorkspaceScope(harness, {
        botId,
        workspaces: workspaces as any,
        state,
        agentPresetCatalog,
      });
      return new ResolvedRuntime({
        ...channelRuntimeOptions,
        config: botConfig,
        token,
        harness: workspaceScope.harness,
        state: workspaceScope.state,
        replyTimeoutMs: pluginConfig.replyTimeoutMs ?? 600_000,
        connectTimeoutMs: pluginConfig.connectTimeoutMs ?? 20_000,
        logger: {
          error: (...args: unknown[]) => logger.error?.(`[${botId}]`, ...args),
          warn: (...args: unknown[]) => logger.warn?.(`[${botId}]`, ...args),
          info: (...args: unknown[]) => logger.info?.(`[${botId}]`, ...args),
          debug: (...args: unknown[]) => logger.debug?.(`[${botId}]`, ...args),
        },
      });
    },
    deleteState: async ({ botId }: { botId: string }) => {
      followUnregisters.get(botId)?.();
      followUnregisters.delete(botId);
      const state = stateStores.get(botId);
      stateStores.delete(botId);
      if (state && typeof state.remove === "function") {
        await state.remove();
      } else {
        try {
          await unlink(statePath(botId));
        } catch (error) {
          if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw error;
        }
      }
    },
  });
  const controller = createWorkspaceAwareController(coreController, {
    workspaces,
    stateFor,
    agentPresetCatalog,
  }) as { close: () => unknown };
  const supervisor = createSupervisor({
    channel,
    controller,
    harness,
    logger,
    retryDelaysMs: pluginConfig.retryDelaysMs,
    healthyIntervalMs: pluginConfig.healthyIntervalMs,
  } as any).start();
  return {
    controller,
    ready: supervisor.ready,
    async close() {
      for (const unregister of followUnregisters.values()) unregister();
      followUnregisters.clear();
      await supervisor.close();
      await controller.close();
      harness.stopManagedProcess();
    },
  };
}
