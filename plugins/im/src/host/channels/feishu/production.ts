// @ts-nocheck
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { unlink } from 'node:fs/promises';
import * as Lark from '@larksuiteoapi/node-sdk';
import { createConnectionSupervisor } from './connection-supervisor.ts';
import { createHarnessCommandExecutor } from '../../../command-executor.ts';
import { createHarnessSessionExecutors } from '../../../session-coordinator.ts';
import { verifyFeishuApp } from '../../../channels/feishu/feishu-app.ts';
import { FeishuRuntime } from '../../../channels/feishu/feishu-runtime.ts';
import { HarnessClient } from '../../../channels/feishu/harness-client.ts';
import {
  LEGACY_FEISHU_SECRET_REF,
  PluginConfigStore,
} from '../../../channels/feishu/plugin-config-store.ts';
import { MultiBotDshFeishuController } from '../../../channels/feishu/multi-bot-controller.ts';
import { StateStore } from '../../../channels/feishu/state-store.ts';
import {
  BotWorkspaceStore,
  createBotWorkspaceScope,
  createWorkspaceAwareController,
  observeBotWorkspaceRemovals,
} from '../../../channels/shared/bot-workspace-store.ts';
import { listAgentPresetCatalog } from '../../../channels/shared/agent-preset.ts';
import {
  followSourceName,
  preloadFollowSources,
  registerFollowSource,
} from '../../../channels/shared/session-follow.ts';
import HttpsProxyAgent from 'https-proxy-agent';

function maskedFeishuAppId(appId) {
  const value = typeof appId === 'string' ? appId.trim() : '';
  if (!value) return '';
  return value.length > 12 ? `${value.slice(0, 8)}••••${value.slice(-4)}` : `${value.slice(0, 3)}•••`;
}

function webSocketProxyUrl(env) {
  for (const key of ['https_proxy', 'HTTPS_PROXY', 'http_proxy', 'HTTP_PROXY']) {
    const value = env?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

export function createFeishuWebSocketAgent(
  env,
  createAgent = (url) => {
    const Ctor = HttpsProxyAgent.HttpsProxyAgent ?? HttpsProxyAgent.default ?? HttpsProxyAgent;
    return new Ctor(url);
  },
) {
  const proxyUrl = webSocketProxyUrl(env);
  return proxyUrl ? createAgent(proxyUrl) : undefined;
}

function harnessOrigin(webServer, configured) {
  if (configured !== undefined) return new URL(configured);
  const port = webServer?.port;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('dsh-feishu requires an initialized DSH webServer port');
  }
  // Even when DSH listens on all interfaces, its own plugin talks through the
  // loopback authority accepted by Connection's request-trust fence.
  return new URL(`http://127.0.0.1:${port}`);
}

function pluginPaths(config) {
  const dshHome = resolve(config.dshHome
    ?? process.env.DSH_HOME
    ?? join(homedir(), '.dsh'));
  const root = resolve(config.dataDir ?? join(dshHome, 'integrations', 'dsh-feishu'));
  return {
    root,
    config: resolve(config.configPath ?? join(root, 'config.json')),
    legacyState: resolve(config.statePath ?? join(root, 'state.json')),
    bots: resolve(config.botsDir ?? join(root, 'bots')),
    workspaces: resolve(config.workspacesPath ?? join(root, 'workspaces.json')),
  };
}

/**
 * Assemble the production controller from DSH Host services and local plugin
 * classes. No bridge process or environment App credentials are required.
 */
export async function createProductionController(ctx, config = {}, internals = {}) {
  if (!ctx?.credentials) throw new TypeError('dsh-feishu requires ctx.credentials');
  if (!ctx?.webServer) throw new TypeError('dsh-feishu requires ctx.webServer');

  const lark = internals.lark ?? Lark;
  const Controller = internals.Controller ?? MultiBotDshFeishuController;
  const ConfigStore = internals.ConfigStore ?? PluginConfigStore;
  const SessionStateStore = internals.StateStore ?? StateStore;
  const Harness = internals.HarnessClient ?? HarnessClient;
  const Runtime = internals.FeishuRuntime ?? FeishuRuntime;
  const verify = internals.verifyFeishuApp ?? verifyFeishuApp;
  const verifyApp = (options) => verify({
    ...options,
    httpInstance: lark.defaultHttpInstance,
  });
  const createSupervisor = internals.createConnectionSupervisor ?? createConnectionSupervisor;
  const logger = typeof ctx.logger === 'function'
    ? ctx.logger('dsh-feishu')
    : (ctx.logger ?? console);
  const agentPresetCatalog = () => listAgentPresetCatalog(ctx);
  const paths = pluginPaths(config);
  const configStore = await new ConfigStore(paths.config).load();
  const defaultWorkspace = resolve(config.workspace ?? process.cwd());
  const WorkspaceStore = internals.WorkspaceStore ?? BotWorkspaceStore;
  const workspaces = internals.workspaces
    ?? await new WorkspaceStore(paths.workspaces, { defaultWorkspace }).load();
  const canListConfiguredBots = typeof configStore.list === 'function';
  const listConfiguredBots = () => canListConfiguredBots ? configStore.list() : [];
  const configuredBots = listConfiguredBots();
  if (canListConfiguredBots) {
    await workspaces.reconcile(configuredBots.map((bot) => bot.id));
  }
  await Promise.all(configuredBots.map((bot) => workspaces.ensure(bot.id, {
    defaultAgentPreset: config.agentPreset,
  })));
  const observedConfigStore = typeof configStore.removeBot === 'function'
    ? observeBotWorkspaceRemovals(configStore, {
        workspaces,
        method: 'removeBot',
        botIdFromRemoved: (removed) => removed.id,
      })
    : configStore;
  // State is lazy per bot. A corrupt legacy file can therefore fail only the
  // migrated bot and cannot prevent healthy v2 bots from starting.
  const stateStores = new Map();
  const followUnregisters = new Map();
  const statePathFor = (botConfig) => !botConfig.id
    || !botConfig.secretRef
    || botConfig.secretRef === LEGACY_FEISHU_SECRET_REF
    ? paths.legacyState
    : resolve(paths.bots, botConfig.id, 'state.json');
  const stateFor = async (botConfig) => {
    const stateKey = botConfig.id ?? '__legacy__';
    let state = stateStores.get(stateKey);
    if (!state) {
      state = await new SessionStateStore(statePathFor(botConfig)).load();
      stateStores.set(stateKey, state);
      followUnregisters.set(stateKey, registerFollowSource({
        channel: 'feishu',
        botId: stateKey,
        state,
        name: () => {
          const current = listConfiguredBots().find((bot) => (bot.id ?? '__legacy__') === stateKey) ?? botConfig;
          return workspaces.displayNameFor(stateKey) || followSourceName(current);
        },
        detail: () => {
          const current = listConfiguredBots().find((bot) => (bot.id ?? '__legacy__') === stateKey) ?? botConfig;
          return maskedFeishuAppId(current.appId);
        },
        project: () => workspaces.projectFor(stateKey),
        generation: () => workspaces.generationFor(stateKey),
        locateSession: (sessionId) => harness.locateProjectSession(sessionId),
      }));
    }
    return state;
  };
  await preloadFollowSources(configuredBots, (bot) => stateFor(bot));
  const stateForBotId = async (botId) => {
    const botConfig = listConfiguredBots().find((bot) => bot.id === botId);
    if (!botConfig) throw new Error('Unknown Feishu bot');
    return stateFor(botConfig);
  };
  const commandExecutor = createHarnessCommandExecutor(ctx, internals.commandExecutor);
  const { controlExecutor, sessionMaintenanceExecutor, fileIngressExecutor } = createHarnessSessionExecutors(ctx, {
    controlExecutor: internals.controlExecutor,
    sessionMaintenanceExecutor: internals.sessionMaintenanceExecutor,
    fileIngressExecutor: internals.fileIngressExecutor,
  });
  const harness = new Harness({
    baseUrl: harnessOrigin(ctx.webServer, config.harnessBaseUrl),
    workspace: defaultWorkspace,
    ...(config.agentPreset == null ? {} : { agentPreset: config.agentPreset }),
    // This plugin is already hosted by a running DSH process. Starting a
    // second DSH would create a competing server and lifecycle.
    autostart: false,
    dshBin: config.dshBin ?? 'dsh',
    ...(commandExecutor ? { commandExecutor } : {}),
    ...(controlExecutor ? { controlExecutor } : {}),
    ...(sessionMaintenanceExecutor ? { sessionMaintenanceExecutor } : {}),
    ...(fileIngressExecutor ? { fileIngressExecutor } : {}),
  });
  workspaces.setProjectCatalog((options) => harness.listProjects(options));
  try {
    await workspaces.reconcileProjects({
      clearSessions: async (botId) => {
        const state = await stateForBotId(botId);
        await state.clearSessions();
      },
    });
  } catch (error) {
    // A transient catalog failure must not bind or unbind anything; the next
    // decorated controller result reconciles again.
    if (error?.code !== 'workspace-catalog-unavailable') throw error;
    logger.warn?.('dsh-im: project catalog unavailable at startup; keeping stored bindings');
  }
  const proxyEnv = internals.proxyEnv ?? process.env;
  const wsAgent = createFeishuWebSocketAgent(proxyEnv, internals.createProxyAgent);

  const coreController = new Controller({
    registerApp: (options) => lark.registerApp(options),
    verifyApp,
    credentials: ctx.credentials,
    configStore: observedConfigStore,
    createRuntime: async ({ botId, config: botConfig, appSecret, repair }) => {
      const state = await stateFor(botConfig);
      const id = botId ?? botConfig.id ?? botConfig.appId;
      await workspaces.ensure(id, {
        defaultAgentPreset: config.agentPreset,
      });
      const workspaceScope = createBotWorkspaceScope(harness, { botId: id, workspaces, state, agentPresetCatalog });
      return new Runtime({
        lark,
        botId: id,
        repair,
        appId: botConfig.appId,
        appSecret,
        domain: botConfig.domain,
        botOpenId: botConfig.botOpenId,
        groupResponseMode: botConfig.groupResponseMode,
        ownerOpenIds: botConfig.ownerOpenIds ?? [botConfig.ownerOpenId],
        harness: workspaceScope.harness,
        state: workspaceScope.state,
        replyTimeoutMs: config.replyTimeoutMs ?? 600_000,
        connectTimeoutMs: config.connectTimeoutMs ?? 15_000,
        ...(wsAgent ? { wsAgent } : {}),
        logger: {
          error: (...args) => logger.error?.(`[${botId ?? botConfig.id}]`, ...args),
          warn: (...args) => logger.warn?.(`[${botId ?? botConfig.id}]`, ...args),
          info: (...args) => logger.info?.(`[${botId ?? botConfig.id}]`, ...args),
          debug: (...args) => logger.debug?.(`[${botId ?? botConfig.id}]`, ...args),
        },
      });
    },
    deleteState: async ({ botId, config: botConfig }) => {
      const stateKey = botConfig?.id ?? '__legacy__';
      followUnregisters.get(stateKey)?.();
      followUnregisters.delete(stateKey);
      const state = stateStores.get(stateKey);
      stateStores.delete(stateKey);
      if (state && typeof state.remove === 'function') {
        await state.remove();
      } else {
        try {
          await unlink(statePathFor(botConfig));
        } catch (error) {
          if (error?.code !== 'ENOENT') throw error;
        }
      }
    },
  });
  const controller = createWorkspaceAwareController(coreController, {
    workspaces,
    stateFor: stateForBotId,
    agentPresetCatalog,
  });

  const supervisor = createSupervisor({
    controller,
    harness,
    logger,
    retryDelaysMs: config.retryDelaysMs,
    healthyIntervalMs: config.healthyIntervalMs,
  }).start();
  return {
    controller,
    ready: supervisor.ready,
    async close() {
      for (const unregister of followUnregisters.values()) unregister();
      followUnregisters.clear();
      await supervisor.close();
      await controller.close();
      harness.stopManagedProcess();
      wsAgent?.destroy?.();
    },
  };
}
