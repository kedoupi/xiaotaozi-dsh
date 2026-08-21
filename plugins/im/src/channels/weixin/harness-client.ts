// @ts-nocheck
import {
  HarnessClient as SharedHarnessClient,
} from '../shared/harness-client.ts';

export {
  HarnessInteractionError,
  HarnessReplyTracker,
  HarnessRpcError,
} from '../shared/harness-client.ts';

export class HarnessClient extends SharedHarnessClient {
  constructor(options) {
    super({
      ...options,
      rpcIdPrefix: 'weixin',
      logPrefix: 'dsh-weixin',
    });
  }
}
