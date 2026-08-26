// @ts-nocheck
import {
  HarnessClient as SharedHarnessClient,
} from '../shared/harness-client.ts';

export {
  HarnessInteractionError,
  HarnessReplyTracker,
  HarnessRpcError,
  HarnessTransportError,
  HarnessTurnError,
  harnessFailureUserMessage,
  harnessRpcUserMessage,
  harnessTurnUserMessage,
} from '../shared/harness-client.ts';

export class HarnessClient extends SharedHarnessClient {
  constructor(options) {
    super({
      ...options,
      rpcIdPrefix: 'feishu',
      logPrefix: 'dsh-feishu',
    });
  }
}
