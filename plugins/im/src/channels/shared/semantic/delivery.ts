export const DELIVERY_RECEIPT_SCHEMA_VERSION = 1;

const ARTIFACT_OUTCOMES = new Set(['sent', 'rejected', 'failed', 'unknown']);
const DELIVERY_OUTCOMES = new Set(['sent', 'failed', 'unknown']);
const TEXT_FORMATS = new Set(['plain', 'markdown']);
const REJECTED_ARTIFACT_ERRORS = new Set([
  'artifact-changed',
  'artifact-context-required',
  'artifact-empty',
  'artifact-invalid',
  'artifact-not-file',
  'artifact-permission-required',
  'artifact-provider-rejected',
  'artifact-too-large',
  'artifact-unavailable',
]);

type ProviderMessageSource = {
  providerMessageIds?: unknown;
  message_id?: unknown;
  messageId?: unknown;
  id?: unknown;
  ts?: unknown;
  message?: {
    message_id?: unknown;
    messageId?: unknown;
    id?: unknown;
    ts?: unknown;
  };
  key?: { id?: unknown };
  data?: { message_id?: unknown };
  body?: { msgid?: unknown; message_id?: unknown };
};

type TextDeliveryBlock = {
  kind?: unknown;
  text?: unknown;
  format?: unknown;
};

type ArtifactResult = {
  artifactId?: unknown;
  outcome?: unknown;
  reason?: unknown;
};

type DeliveryReceipt = {
  schemaVersion?: unknown;
  providerMessageIds?: unknown;
  deliveryOutcome?: unknown;
  reason?: unknown;
  artifacts?: unknown;
};

type DeliveryReceiptInput = {
  deliveryId?: unknown;
  presentation?: unknown;
  providerMessageIds?: unknown;
  artifacts?: unknown;
  deliveryOutcome?: unknown;
  reason?: unknown;
};

type ArtifactFailureInput = {
  artifactId?: unknown;
  deliveryId?: unknown;
  error?: unknown;
  presentation?: unknown;
  providerMessageIds?: unknown;
};

type MergeReceiptsInput = {
  deliveryId?: unknown;
  presentation?: unknown;
  receipts?: unknown;
};

export function providerMessageIdsFor(value: unknown) {
  if (!value || typeof value !== 'object') return [];
  const source = value as ProviderMessageSource;
  const ids = Array.isArray(source.providerMessageIds)
    ? source.providerMessageIds
      .filter((candidate) => (
        (typeof candidate === 'string' && candidate.trim())
          || Number.isSafeInteger(candidate)
      ))
      .map(String)
    : [];
  const candidates = [
    source.message_id,
    source.messageId,
    source.id,
    source.ts,
    source.message?.message_id,
    source.message?.messageId,
    source.message?.id,
    source.message?.ts,
    source.key?.id,
    source.data?.message_id,
    source.body?.msgid,
    source.body?.message_id,
  ];
  const id = candidates.find((candidate) => (
    (typeof candidate === 'string' && candidate.trim())
      || Number.isSafeInteger(candidate)
  ));
  if (id !== undefined) ids.push(String(id));
  return [...new Set(ids)];
}

function requiredString(value: unknown, name: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

export function createTextDeliveryBlock(value: unknown, format = 'plain') {
  const block = (typeof value === 'string'
    ? { kind: 'text', text: value, format }
    : value) as TextDeliveryBlock | null | undefined;
  if (!block || typeof block !== 'object' || Array.isArray(block)
    || block.kind !== 'text' || typeof block.text !== 'string' || !block.text.trim()) {
    throw new TypeError('text delivery block must contain non-empty text');
  }
  if (!TEXT_FORMATS.has(block.format as string)) {
    throw new TypeError('text delivery format must be plain or markdown');
  }
  return Object.freeze({
    kind: 'text' as const,
    text: block.text,
    format: block.format as string,
  });
}

function providerIds(values: unknown) {
  if (!Array.isArray(values)) throw new TypeError('providerMessageIds must be an array');
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const id = requiredString(value, 'providerMessageId');
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return Object.freeze(ids);
}

function artifactResults(values: unknown) {
  if (!Array.isArray(values)) throw new TypeError('artifacts must be an array');
  return Object.freeze(values.map((value) => {
    const result = value as ArtifactResult | null | undefined;
    if (!result || typeof result !== 'object') {
      throw new TypeError('artifact result must be an object');
    }
    const artifactId = requiredString(result.artifactId, 'artifactId');
    if (!ARTIFACT_OUTCOMES.has(result.outcome as string)) {
      throw new TypeError('artifact outcome must be sent, rejected, failed, or unknown');
    }
    const reason = result.reason === undefined
      ? undefined
      : requiredString(result.reason, 'artifact reason');
    return Object.freeze({
      artifactId,
      outcome: result.outcome as string,
      ...(reason === undefined ? {} : { reason }),
    });
  }));
}

export function artifactOutcomeForError(error: unknown) {
  const code = typeof error === 'string' ? error : (error as { code?: unknown } | undefined)?.code;
  if (code === 'artifact-delivery-uncertain') return 'unknown';
  if (typeof code === 'string' && REJECTED_ARTIFACT_ERRORS.has(code)) return 'rejected';
  return 'failed';
}

export function createDeliveryReceipt({
  deliveryId,
  presentation,
  providerMessageIds = [],
  artifacts = [],
  deliveryOutcome,
  reason,
}: DeliveryReceiptInput) {
  if (deliveryOutcome !== undefined && !DELIVERY_OUTCOMES.has(deliveryOutcome as string)) {
    throw new TypeError('deliveryOutcome must be sent, failed, or unknown');
  }
  const normalizedReason = reason === undefined
    ? undefined
    : requiredString(reason, 'delivery reason');
  return Object.freeze({
    schemaVersion: DELIVERY_RECEIPT_SCHEMA_VERSION,
    deliveryId: requiredString(deliveryId, 'deliveryId'),
    presentation: requiredString(presentation, 'presentation'),
    providerMessageIds: providerIds(providerMessageIds),
    ...(deliveryOutcome === undefined ? {} : { deliveryOutcome }),
    ...(normalizedReason === undefined ? {} : { reason: normalizedReason }),
    artifacts: artifactResults(artifacts),
  });
}

export function createArtifactFailureReceipt({
  artifactId,
  deliveryId,
  error,
  presentation = 'text-fallback',
  providerMessageIds = [],
}: ArtifactFailureInput) {
  const code = typeof error === 'string' ? error : (error as { code?: unknown } | undefined)?.code;
  const reason = typeof code === 'string' && code
    ? code
    : 'artifact-provider-failed';
  return createDeliveryReceipt({
    deliveryId,
    presentation,
    providerMessageIds,
    artifacts: [{
      artifactId,
      outcome: artifactOutcomeForError(error),
      reason,
    }],
  });
}

export function mergeDeliveryReceipts({ deliveryId, presentation, receipts }: MergeReceiptsInput) {
  if (!Array.isArray(receipts) || receipts.length === 0) {
    throw new TypeError('receipts must contain at least one delivery receipt');
  }
  const messageIds: string[] = [];
  const artifacts = new Map<string, unknown>();
  let deliveryOutcome: unknown;
  let reason: unknown;
  for (const value of receipts) {
    const receipt = value as DeliveryReceipt | null | undefined;
    if (!receipt || receipt.schemaVersion !== DELIVERY_RECEIPT_SCHEMA_VERSION) {
      throw new TypeError('receipt must use DeliveryReceipt schema version 1');
    }
    messageIds.push(...(receipt.providerMessageIds as string[] ?? []));
    if (deliveryOutcome === undefined && receipt.deliveryOutcome !== undefined) {
      deliveryOutcome = receipt.deliveryOutcome;
      reason = receipt.reason;
    }
    for (const artifact of (receipt.artifacts as ArtifactResult[] | undefined) ?? []) {
      artifacts.set(artifact.artifactId as string, artifact);
    }
  }
  return createDeliveryReceipt({
    deliveryId,
    presentation,
    providerMessageIds: messageIds,
    deliveryOutcome,
    reason,
    artifacts: [...artifacts.values()],
  });
}
