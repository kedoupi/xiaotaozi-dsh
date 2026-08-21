// @ts-nocheck
import { HarnessClient } from '../shared/harness-client.ts';

export class QqHarnessClient extends HarnessClient {
  constructor(options) {
    super({
      ...options,
      rpcIdPrefix: 'qq',
      logPrefix: 'dsh-qq',
    });
  }
}
