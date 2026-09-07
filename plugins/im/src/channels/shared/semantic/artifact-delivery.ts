import {
  materializeOutboundArtifact,
  releaseOutboundArtifact,
} from './artifact.ts';
import {
  createArtifactFailureReceipt,
  createDeliveryReceipt,
  mergeDeliveryReceipts,
  providerMessageIdsFor,
} from './delivery.ts';

type CodedError = { code?: unknown; name?: unknown };
type Abortable = {
  aborted?: unknown;
  throwIfAborted: () => void;
};
type MaterializedFile = {
  mediaType?: string;
  deliveryKey?: unknown;
  artifactId?: unknown;
};
type OutboundArtifact = {
  artifactId?: unknown;
  deliveryKey?: unknown;
};
type DeliveryReceipt = {
  deliveryOutcome?: unknown;
  deliveryId?: unknown;
  artifacts?: Array<{ outcome?: unknown }>;
};
type SendFn = (file: unknown) => unknown;
type FailureHandler = (artifact: unknown, error: unknown) => unknown;
type FailureNoticeFn = (artifact: unknown, error: unknown, failure: unknown) => unknown;
type DeliveryLogger = { warn?: (message: string) => unknown };
type SendMaterializedOptions = {
  sendFile?: SendFn;
  sendImage?: SendFn;
  signal?: Abortable | null;
};
type DeliverOutboundArtifactsOptions = {
  artifacts?: OutboundArtifact[];
  baseReceipt?: DeliveryReceipt | null;
  deliveryId?: unknown;
  aggregatePresentation?: unknown;
  alwaysMerge?: boolean;
  channelKey?: unknown;
  signal?: Abortable | null;
  sendFile?: SendFn;
  sendImage?: SendFn;
  sendFailureNotice?: FailureNoticeFn;
  onFailure?: FailureHandler;
  logger?: DeliveryLogger;
};

function unavailableError() {
  const error = new Error('Native file delivery is unavailable') as Error & { code: string };
  error.code = 'artifact-provider-unavailable';
  return error;
}

function isAbort(error: unknown, signal?: Abortable | null) {
  const value = error as CodedError | undefined;
  return Boolean(signal?.aborted)
    || value?.name === 'AbortError'
    || value?.code === 'ABORT_ERR';
}

function providerIds(value: unknown) {
  if (Array.isArray(value)) {
    return [...new Set(value
      .filter((candidate) => (
        (typeof candidate === 'string' && candidate.trim())
          || Number.isSafeInteger(candidate)
      ))
      .map(String))];
  }
  return providerMessageIdsFor(value);
}

async function sendMaterializedArtifact(file: MaterializedFile, {
  sendFile,
  sendImage,
  signal,
}: SendMaterializedOptions) {
  if (file.mediaType?.startsWith('image/') && typeof sendImage === 'function') {
    try {
      return {
        presentation: 'image',
        result: await sendImage(file),
      };
    } catch (error) {
      if (isAbort(error, signal) || (error as CodedError | undefined)?.code === 'artifact-delivery-uncertain') {
        throw error;
      }
    }
  }
  signal?.throwIfAborted();
  if (typeof sendFile !== 'function') throw unavailableError();
  return {
    presentation: 'file',
    result: await sendFile(file),
  };
}

/**
 * Deliver registered artifacts with one shared image-first policy while keeping
 * provider protocol details inside the channel-supplied send closures.
 */
export async function deliverOutboundArtifacts({
  artifacts = [],
  baseReceipt = null,
  deliveryId,
  aggregatePresentation,
  alwaysMerge = false,
  channelKey,
  signal,
  sendFile,
  sendImage,
  sendFailureNotice,
  onFailure,
  logger,
}: DeliverOutboundArtifactsOptions) {
  const receipts: unknown[] = baseReceipt ? [baseReceipt] : [];
  let userVisible = baseReceipt != null && baseReceipt.deliveryOutcome !== 'failed';
  let failureNoticeVisible = false;
  let artifactsSent = 0;
  let artifactSendErrors = 0;

  let artifactIndex = 0;
  try {
    while (artifactIndex < artifacts.length) {
      const artifact = artifacts[artifactIndex];
      artifactIndex += 1;
      try {
        signal?.throwIfAborted();
        const file = await materializeOutboundArtifact(artifact, { signal }) as MaterializedFile;
        signal?.throwIfAborted();
        const sent = await sendMaterializedArtifact(file, {
          sendFile,
          sendImage,
          signal,
        });
        signal?.throwIfAborted();
        receipts.push(createDeliveryReceipt({
          deliveryId: file.deliveryKey,
          presentation: `${channelKey}-${sent.presentation}`,
          providerMessageIds: providerIds(sent.result),
          artifacts: [{ artifactId: file.artifactId, outcome: 'sent' }],
        }));
        artifactsSent += 1;
        userVisible = true;
      } catch (error) {
        if (isAbort(error, signal)) throw error;
        artifactSendErrors += 1;
        const failure = typeof onFailure === 'function'
          ? await onFailure(artifact, error) as { referenceId?: unknown } | null
          : null;
        const reference = typeof failure?.referenceId === 'string'
          ? ` [${failure.referenceId}]`
          : '';
        logger?.warn?.(
          `[dsh-im:${channelKey}] result artifact delivery failed${reference} (${(error as CodedError | undefined)?.code ?? 'unknown'})`,
        );
        let messageIds: string[] = [];
        if (typeof sendFailureNotice === 'function') {
          try {
            signal?.throwIfAborted();
            const notice = await sendFailureNotice(artifact, error, failure);
            signal?.throwIfAborted();
            messageIds = providerIds(notice);
            failureNoticeVisible = true;
          } catch (noticeError) {
            if (isAbort(noticeError, signal)) throw noticeError;
            logger?.warn?.(
              `[dsh-im:${channelKey}] unable to send the safe artifact failure notice`,
            );
          }
        }
        const failureReceipt = createArtifactFailureReceipt({
          artifactId: artifact?.artifactId ?? 'unknown',
          deliveryId: artifact?.deliveryKey ?? artifact?.artifactId ?? 'unknown',
          error,
          providerMessageIds: messageIds,
        });
        receipts.push(failureReceipt);
        if (failureNoticeVisible || failureReceipt.artifacts[0]?.outcome === 'unknown') {
          userVisible = true;
        }
      } finally {
        releaseOutboundArtifact(artifact);
      }
    }
  } finally {
    while (artifactIndex < artifacts.length) {
      releaseOutboundArtifact(artifacts[artifactIndex]);
      artifactIndex += 1;
    }
  }

  let receipt = null;
  if (receipts.length === 1 && !alwaysMerge) {
    [receipt] = receipts;
  } else if (receipts.length > 0) {
    receipt = mergeDeliveryReceipts({
      deliveryId: deliveryId
        ?? baseReceipt?.deliveryId
        ?? artifacts[0]?.deliveryKey,
      presentation: aggregatePresentation
        ?? `${channelKey}-${baseReceipt ? 'text-and-files' : 'files'}`,
      receipts,
    });
  }

  return {
    receipt,
    userVisible,
    failureNoticeVisible,
    artifactsSent,
    artifactSendErrors,
  };
}
