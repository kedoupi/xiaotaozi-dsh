import {
  HarnessClient as SharedHarnessClient,
  type HarnessClientInit,
} from '../shared/harness-client.ts';

export {
  HarnessInteractionError,
  HarnessReplyTracker,
  HarnessRpcError,
} from '../shared/harness-client.ts';

export class HarnessClient extends SharedHarnessClient {
  constructor(options: HarnessClientInit) {
    super({
      ...options,
      rpcIdPrefix: 'weixin',
      logPrefix: 'dsh-weixin',
    });
  }
}
