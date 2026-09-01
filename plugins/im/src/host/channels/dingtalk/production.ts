// @ts-nocheck
import { unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { DingtalkConfigStore, maskDingtalkClientId } from '../../../channels/dingtalk/config-store.ts';
import { DingtalkDeviceAuth } from '../../../channels/dingtalk/device-auth.ts';
import { DingtalkController } from '../../../channels/dingtalk/dingtalk-controller.ts';
import { DingtalkRuntime } from '../../../channels/dingtalk/dingtalk-runtime.ts';
import { HarnessClient } from '../../../channels/dingtalk/harness-client.ts';
import { DingtalkStateStore } from '../../../channels/dingtalk/state-store.ts';
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
import { createTokenConnectionSupervisor } from '../shared/connection-supervisor.ts';
import { createHarnessCommandExecutor } from '../../../command-executor.ts';
import { createHarnessSessionExecutors } from '../../../session-coordinator.ts';

function harnessOrigin(webServer, configured) {
  if (configured !== undefined) return new URL(configured);
  const port = webServer?.port;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('dsh-dingtalk requires an initialized DSH webServer port');
  }
  return new URL(`http://127.0.0.1:${port}`);
}

function pluginPaths(config) {
  const dshHome = resolve(config.dshHome ?? process.env.DSH_HOME ?? join(homedir(), '.dsh'));
  const root = resolve(config.dataDir ?? join(dshHome, 'integrations', 'dsh-dingtalk'));
  return {
    root,
    config: resolve(config.configPath ?? join(root, 'config.json')),
    bots: resolve(config.botsDir ?? join(root, 'bots')),
    workspaces: resolve(config.workspacesPath ?? join(root, 'workspaces.json')),
  };
}

export async function createProductionController(ctx, config = {}, internals = {}) {
  if (!ctx?.credentials) throw new TypeError('dsh-dingtalk requires ctx.credentials');
  if (!ctx?.webServer) throw new TypeError('dsh-dingtalk requires ctx.webServer');

  const ConfigStore = internals.ConfigStore ?? DingtalkConfigStore;
  const DeviceAuth = internals.DeviceAuth ?? DingtalkDeviceAuth;
  const StateStore = internals.StateStore ?? DingtalkStateStore;
  const Harness = internals.HarnessClient ?? HarnessClient;
  const Controller = internals.Controller ?? DingtalkController;
  const Runtime = internals.Runtime ?? DingtalkRuntime;
  const createSupervisor = internals.createConnectionSupervisor ?? createTokenConnectionSupervisor;
  const logger = typeof ctx.logger === 'function'
    ? ctx.logger('dsh-dingtalk')
    : (ctx.logger ?? console);
  const agentPresetCatalog = () => listAgentPresetCatalog(ctx);
  const paths = pluginPaths(config);
  const configStore = await new ConfigStore(paths.config).load();
  const defaultWorkspace = resolve(config.workspace ?? process.cwd());
  const WorkspaceStore = internals.WorkspaceStore ?? BotWorkspaceStore;
  const workspaces = internals.workspaces
    ?? await new WorkspaceStore(paths.workspaces, { defaultWorkspace }).load();
  const canListConfiguredBots = typeof configStore.list === 'function';
  const configuredBots = canListConfiguredBots ? configStore.list() : [];
  if (canListConfiguredBots) {
    await workspaces.reconcile(configuredBots.map((bot) => bot.botId));
  }
  await Promise.all(configuredBots.map((bot) => workspaces.ensure(bot.botId, {
    defaultAgentPreset: config.agentPreset,
  })));
  const observedConfigStore = typeof configStore.remove === 'function'
    ? observeBotWorkspaceRemovals(configStore, { workspaces })
    : configStore;
  const deviceAuth = internals.deviceAuth ?? new DeviceAuth({
    baseUrl: config.registrationBaseUrl,
  });
  const stateStores = new Map();
  const followUnregisters = new Map();

  const statePath = (botId) => resolve(paths.bots, botId, 'state.json');
  const stateFor = async (botId) => {
    let state = stateStores.get(botId);
    if (!state) {
      state = await new StateStore(statePath(botId)).load();
      stateStores.set(botId, state);
      const bot = typeof configStore.get === 'function' ? configStore.get(botId) : null;
      followUnregisters.set(botId, registerFollowSource({
        channel: 'dingtalk',
        botId,
        state,
        name: () => workspaces.displayNameFor(botId)
          || followSourceName(configStore.get?.(botId))
          || '钉钉机器人',
        detail: () => {
          const current = configStore.get?.(botId);
          return current?.clientId ? maskDingtalkClientId(current.clientId) : '';
        },
        project: () => workspaces.projectFor(botId),
        generation: () => workspaces.generationFor(botId),
        locateSession: (sessionId) => harness.locateProjectSession(sessionId),
      }));
    }
    return state;
  };
  await preloadFollowSources(configuredBots, (bot) => stateFor(bot.botId));
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
        const state = await stateFor(botId);
        await state.clearSessions();
      },
    });
  } catch (error) {
    // A transient catalog failure must not bind or unbind anything; the next
    // decorated controller result reconciles again.
    if (error?.code !== 'workspace-catalog-unavailable') throw error;
    logger.warn?.('dsh-im: project catalog unavailable at startup; keeping stored bindings');
  }
  const coreController = new Controller({
    deviceAuth,
    credentials: ctx.credentials,
    configStore: observedConfigStore,
    logger,
    createRuntime: async ({ botId, config: botConfig, clientSecret }) => {
      const state = await stateFor(botId);
      await workspaces.ensure(botId, {
        defaultAgentPreset: config.agentPreset,
      });
      const workspaceScope = createBotWorkspaceScope(harness, { botId, workspaces, state, agentPresetCatalog });
      return new Runtime({
        config: botConfig,
        clientSecret,
        harness: workspaceScope.harness,
        state: workspaceScope.state,
        replyTimeoutMs: config.replyTimeoutMs ?? 600_000,
        maxMessageChars: config.maxMessageChars ?? 4_000,
        connectTimeoutMs: config.connectTimeoutMs ?? 15_000,
        logger: {
          error: (...args) => logger.error?.(`[${botId}]`, ...args),
          warn: (...args) => logger.warn?.(`[${botId}]`, ...args),
          info: (...args) => logger.info?.(`[${botId}]`, ...args),
          debug: (...args) => logger.debug?.(`[${botId}]`, ...args),
        },
      });
    },
    deleteState: async ({ botId }) => {
      followUnregisters.get(botId)?.();
      followUnregisters.delete(botId);
      const state = stateStores.get(botId);
      stateStores.delete(botId);
      if (state && typeof state.remove === 'function') {
        await state.remove();
      } else {
        try {
          await unlink(statePath(botId));
        } catch (error) {
          if (error?.code !== 'ENOENT') throw error;
        }
      }
    },
  });
  const controller = createWorkspaceAwareController(coreController, { workspaces, stateFor, agentPresetCatalog });
  const supervisor = createSupervisor({
    channel: 'dingtalk',
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
    },
  };
}
