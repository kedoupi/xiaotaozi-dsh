// @ts-nocheck
import { DiscordConfigStore } from '../../../channels/discord/config-store.ts';
import { DiscordController } from '../../../channels/discord/discord-controller.ts';
import { DiscordHarnessClient } from '../../../channels/discord/harness-client.ts';
import { DiscordRuntime } from '../../../channels/discord/discord-runtime.ts';
import { DiscordStateStore } from '../../../channels/discord/state-store.ts';
import { createTokenProductionController } from '../shared/production.ts';

export function createProductionController(ctx, config = {}, internals = {}) {
  return createTokenProductionController(ctx, config, internals, {
    channel: 'discord',
    ConfigStore: DiscordConfigStore,
    StateStore: DiscordStateStore,
    HarnessClient: DiscordHarnessClient,
    Controller: DiscordController,
    Runtime: DiscordRuntime,
  });
}
