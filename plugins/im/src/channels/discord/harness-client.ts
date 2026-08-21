// @ts-nocheck
import { HarnessClient } from '../shared/harness-client.ts';

export class DiscordHarnessClient extends HarnessClient {
  constructor(options) {
    super({
      ...options,
      rpcIdPrefix: 'discord',
      logPrefix: 'dsh-discord',
    });
  }
}
