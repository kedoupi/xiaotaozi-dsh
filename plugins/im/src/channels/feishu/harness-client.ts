import {
  HarnessClient as SharedHarnessClient,
  type HarnessClientInit,
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
  constructor(options: HarnessClientInit) {
    super({
      ...options,
      rpcIdPrefix: 'feishu',
      logPrefix: 'dsh-feishu',
    });
  }
}
