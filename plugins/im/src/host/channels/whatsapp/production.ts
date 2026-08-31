// @ts-nocheck
import { rm, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { maskWhatsappAccount, WhatsappConfigStore } from '../../../channels/whatsapp/config-store.ts';
import { ConversationStateStore } from '../../../channels/shared/conversation-state-store.ts';
import { HarnessClient } from '../../../channels/shared/harness-client.ts';
import { WhatsappController } from '../../../channels/whatsapp/whatsapp-controller.ts';
import { WhatsappRuntime } from '../../../channels/whatsapp/whatsapp-runtime.ts';
import { createWhatsappWebSession } from '../../../channels/whatsapp/whatsapp-web-session.ts';
import {
  BotWorkspaceStore,
  createBotWorkspaceScope,
  createWorkspaceAwareController,
  observeBotWorkspaceRemovals,
} from '../../../channels/shared/bot-workspace-store.ts';
import { listAgentPresetCatalog } from '../../../channels/shared/agent-preset.ts';
import {
  followLocateSession,
  followSourceName,
  preloadFollowSources,
  registerFollowSource,
} from '../../../channels/shared/session-follow.ts';
import { createTokenConnectionSupervisor } from '../shared/connection-supervisor.ts';
import { createHarnessCommandExecutor } from '../../../command-executor.ts';
import { createHarnessSessionExecutors } from '../../../session-coordinator.ts';

const AUTH_DIRECTORY_PATTERN = /^[a-f0-9-]{36}$/;

function harnessOrigin(webServer, configured) {
  if (configured !== undefined) return new URL(configured);
  const port = webServer?.port;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('dsh-im WhatsApp requires an initialized DSH webServer port');
  }
  return new URL(`http://127.0.0.1:${port}`);
}

function pluginPaths(config) {
  const dshHome = resolve(config.dshHome ?? process.env.DSH_HOME ?? join(homedir(), '.dsh'));
  const root = resolve(config.dataDir ?? join(dshHome, 'integrations', 'dsh-whatsapp'));
  const authRoot = resolve(config.authDir ?? join(root, 'auth'));
  const authPath = (name) => {
    if (!AUTH_DIRECTORY_PATTERN.test(name ?? '')) throw new TypeError('Invalid WhatsApp auth directory');
    return resolve(authRoot, name);
  };
  return {
    config: resolve(config.configPath ?? join(root, 'config.json')),
    bots: resolve(config.botsDir ?? join(root, 'bots')),
    workspaces: resolve(config.workspacesPath ?? join(root, 'workspaces.json')),
    authPath,
  };
}

export async function createProductionController(ctx, config = {}, internals = {}) {
  if (!ctx?.webServer) throw new TypeError('dsh-im WhatsApp requires ctx.webServer');
  const logger = typeof ctx.logger === 'function'
    ? ctx.logger('dsh-im:whatsapp') : (ctx.logger ?? console);
  const agentPresetCatalog = () => listAgentPresetCatalog(ctx);
  const ConfigStore = internals.ConfigStore ?? WhatsappConfigStore;
  const StateStore = internals.StateStore ?? ConversationStateStore;
  const Harness = internals.HarnessClient ?? HarnessClient;
  const Controller = internals.Controller ?? WhatsappController;
  const Runtime = internals.Runtime ?? WhatsappRuntime;
  const createSession = internals.createSession ?? createWhatsappWebSession;
  const createSupervisor = internals.createConnectionSupervisor ?? createTokenConnectionSupervisor;
  const paths = pluginPaths(config);
  const configStore = await new ConfigStore(paths.config).load();
  const defaultWorkspace = resolve(config.workspace ?? process.cwd());
  const WorkspaceStore = internals.WorkspaceStore ?? BotWorkspaceStore;
  const workspaces = internals.workspaces
    ?? await new WorkspaceStore(paths.workspaces, { defaultWorkspace }).load();
  const configuredBots = configStore.list();
  await workspaces.reconcile(configuredBots.map((bot) => bot.botId));
  await Promise.all(configuredBots.map((bot) => workspaces.ensure(bot.botId, {
    defaultAgentPreset: config.agentPreset,
  })));
  const observedConfigStore = typeof configStore.remove === 'function'
    ? observeBotWorkspaceRemovals(configStore, { workspaces })
    : configStore;
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
        channel: 'whatsapp',
        botId,
        state,
        name: () => workspaces.displayNameFor(botId) || followSourceName(configStore.get?.(botId)),
        detail: () => {
          const current = configStore.get?.(botId);
          return current?.accountJid ? maskWhatsappAccount(current.accountJid) : '';
        },
        workspace: () => workspaces.workspaceFor(botId),
        locateSession: async (sessionId) => followLocateSession(harness)(sessionId),
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
    rpcIdPrefix: 'whatsapp',
    logPrefix: 'dsh-whatsapp',
    ...(commandExecutor ? { commandExecutor } : {}),
    ...(controlExecutor ? { controlExecutor } : {}),
    ...(sessionMaintenanceExecutor ? { sessionMaintenanceExecutor } : {}),
    ...(fileIngressExecutor ? { fileIngressExecutor } : {}),
  });
  const coreController = new Controller({
    configStore: observedConfigStore,
    authPath: paths.authPath,
    createSession,
    logger,
    createRuntime: async ({ botId, config: botConfig, authDir }) => {
      const state = await stateFor(botId);
      await workspaces.ensure(botId, {
        defaultAgentPreset: config.agentPreset,
        confirmWorkspace: false,
      });
      const workspaceScope = createBotWorkspaceScope(harness, { botId, workspaces, state, agentPresetCatalog });
      return new Runtime({
        config: botConfig,
        authDir,
        harness: workspaceScope.harness,
        state: workspaceScope.state,
        replyTimeoutMs: config.replyTimeoutMs ?? 600_000,
        connectTimeoutMs: config.connectTimeoutMs ?? 30_000,
        createSession,
        logger: {
          error: (...args) => logger.error?.(`[${botId}]`, ...args),
          warn: (...args) => logger.warn?.(`[${botId}]`, ...args),
          info: (...args) => logger.info?.(`[${botId}]`, ...args),
          debug: (...args) => logger.debug?.(`[${botId}]`, ...args),
        },
      });
    },
    deleteAuth: (authDirectory) => rm(paths.authPath(authDirectory), {
      recursive: true,
      force: true,
    }),
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
    channel: 'whatsapp',
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
