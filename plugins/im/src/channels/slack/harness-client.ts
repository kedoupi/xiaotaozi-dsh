// @ts-nocheck
import { HarnessClient } from '../shared/harness-client.ts';

export class SlackHarnessClient extends HarnessClient {
  constructor(options) {
    super({
      ...options,
      rpcIdPrefix: 'slack',
      logPrefix: 'dsh-slack',
    });
  }
}
