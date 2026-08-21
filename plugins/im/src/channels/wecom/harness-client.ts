// @ts-nocheck
import { HarnessClient } from '../shared/harness-client.ts';

export class WecomHarnessClient extends HarnessClient {
  constructor(options) {
    super({
      ...options,
      rpcIdPrefix: 'wecom',
      logPrefix: 'dsh-wecom',
    });
  }
}
