function text(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

export function normalizeLastMessageError(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as {
    code?: unknown;
    reason?: unknown;
    message?: unknown;
    referenceId?: unknown;
    at?: unknown;
  };
  const code = text(record.code, 64);
  const reason = text(record.reason, 64);
  const message = text(record.message, 500);
  const referenceId = text(record.referenceId, 40);
  const at = Number.isFinite(record.at) ? record.at as number : null;
  return code && reason && message && referenceId && at !== null
    ? { code, reason, message, referenceId, at }
    : null;
}
