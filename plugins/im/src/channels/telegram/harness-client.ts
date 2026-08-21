// @ts-nocheck
import { HarnessClient } from '../shared/harness-client.ts';

export class TelegramHarnessClient extends HarnessClient {
  constructor(options) {
    super({
      ...options,
      rpcIdPrefix: 'telegram',
      logPrefix: 'dsh-telegram',
    });
  }
}
