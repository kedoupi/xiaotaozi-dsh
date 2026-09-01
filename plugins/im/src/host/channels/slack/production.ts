// @ts-nocheck
import { unlink } from 'node:fs/promises';
import { resolve } from 'node:path';

import { maskSlackBotId, SlackConfigStore } from '../../../channels/slack/config-store.ts';
import { SlackController } from '../../../channels/slack/slack-controller.ts';
import { SlackRuntime } from '../../../channels/slack/slack-runtime.ts';
import { ConversationStateStore } from '../../../channels/shared/conversation-state-store.ts';
import { HarnessClient } from '../../../channels/shared/harness-client.ts';
import {
  BotWorkspaceStore,
  createBotWorkspaceScope,
  createWorkspaceAwareController,
  observeBotWorkspaceRemovals,
} from '../../../channels/shared/bot-workspace-store.ts';
import { listAgentPresetCatalog } from '../../../channels/shared/agent-preset.ts';
import { createTokenConnectionSupervisor } from '../shared/connection-supervisor.ts';
import { harnessOrigin, pluginPaths } from '../shared/production.ts';
import {
  followSourceName,
  preloadFollowSources,
  registerFollowSource,
} from '../../../channels/shared/session-follow.ts';
import { createHarnessCommandExecutor } from '../../../command-executor.ts';
import { createHarnessSessionExecutors } from '../../../session-coordinator.ts';

export async function createProductionController(ctx, config = {}, internals = {}) {
  if (!ctx?.credentials) throw new TypeError('dsh-im slack requires ctx.credentials');
  if (!ctx?.webServer) throw new TypeError('dsh-im slack requires ctx.webServer');

  const ResolvedConfigStore = internals.ConfigStore ?? SlackConfigStore;
  const ResolvedStateStore = internals.StateStore ?? ConversationStateStore;
  const ResolvedHarness = internals.HarnessClient ?? HarnessClient;
  const ResolvedController = internals.Controller ?? SlackController;
  const ResolvedRuntime = internals.Runtime ?? SlackRuntime;
  const createSupervisor = internals.createConnectionSupervisor ?? createTokenConnectionSupervisor;
  const logger = typeof ctx.logger === 'function'
    ? ctx.logger('dsh-im:slack') : (ctx.logger ?? console);
  const agentPresetCatalog = () => listAgentPresetCatalog(ctx);
  const paths = pluginPaths(config, 'slack');
  const configStore = await new ResolvedConfigStore(paths.config).load();
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
      state = await new ResolvedStateStore(statePath(botId)).load();
      stateStores.set(botId, state);
      followUnregisters.set(botId, registerFollowSource({
        channel: 'slack',
        botId,
        state,
        name: () => workspaces.displayNameFor(botId)
          || followSourceName(configStore.get?.(botId))
          || 'Slack',
        detail: () => {
          const current = configStore.get?.(botId);
          return current?.platformId ? maskSlackBotId(current.platformId) : '';
        },
        project: () => workspaces.projectFor(botId),
        locateSession: (sessionId) => harness.locateProjectSession(sessionId),
      }));
    }
    return state;
  };
  const commandExecutor = createHarnessCommandExecutor(ctx, internals.commandExecutor);
  const { controlExecutor, sessionMaintenanceExecutor, fileIngressExecutor } = createHarnessSessionExecutors(ctx, {
    controlExecutor: internals.controlExecutor,
    sessionMaintenanceExecutor: internals.sessionMaintenanceExecutor,
    fileIngressExecutor: internals.fileIngressExecutor,
  });
  const harness = new ResolvedHarness({
    baseUrl: harnessOrigin(ctx.webServer, config.harnessBaseUrl),
    workspace: defaultWorkspace,
    ...(config.agentPreset == null ? {} : { agentPreset: config.agentPreset }),
    autostart: false,
    dshBin: config.dshBin ?? 'dsh',
    rpcIdPrefix: 'slack',
    logPrefix: 'dsh-slack',
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
  const coreController = new ResolvedController({
    credentials: ctx.credentials,
    configStore: observedConfigStore,
    logger,
    ...(internals.inspectCredentials ? { inspectCredentials: internals.inspectCredentials } : {}),
    createRuntime: async ({ botId, config: botConfig, botToken, appToken }) => {
      const state = await stateFor(botId);
      await workspaces.ensure(botId, {
        defaultAgentPreset: config.agentPreset,
      });
      const workspaceScope = createBotWorkspaceScope(harness, { botId, workspaces, state, agentPresetCatalog });
      return new ResolvedRuntime({
        config: botConfig,
        botToken,
        appToken,
        harness: workspaceScope.harness,
        state: workspaceScope.state,
        replyTimeoutMs: config.replyTimeoutMs ?? 600_000,
        connectTimeoutMs: config.connectTimeoutMs ?? 20_000,
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
  await preloadFollowSources(configuredBots, (bot) => stateFor(bot.botId));
  const supervisor = createSupervisor({
    channel: 'slack',
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
