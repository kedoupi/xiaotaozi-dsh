// Browser-side client for the dsh-wecom-office loopback route.
// The route path and the small action set are the stable internal contract
// between dsh-im and dsh-wecom-office; each package validates its own side.

export const OFFICE_STATUS_ROUTE = '/_dsh/dsh-wecom-office/status';

const OFFICE_UNAVAILABLE = '企业微信办公服务暂时不可用，请稍后重试。';
const OFFICE_FAILED = '企业微信办公操作失败，请稍后重试。';
const FORBIDDEN_FIELDS = /(client[_-]?secret|secret[_-]?ref|app[_-]?secret|access[_-]?token|remote[_-]?bot[_-]?id|token|secret)/i;
const SAFE_ERROR_CODE = /^[a-z][a-z\d_.:-]*$/i;

export interface OfficePublicError {
  code: string;
  message: string;
}

export interface OfficeStatus {
  ok: boolean;
  cliInstalled: boolean;
  mainStatus: string;
  activeBotId: string | null;
  authorized: boolean;
  allowWrite: boolean;
  cliPath: string;
  configDir: string;
  cliVersion?: string;
  lastError?: OfficePublicError;
}

export type OfficeAction = 'status' | 'activate' | 'configure';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown, fallback: string, max = 240): string {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback;
}

function safeErrorCode(value: unknown): string {
  const code = text(value, '', 80);
  return code && SAFE_ERROR_CODE.test(code) && !FORBIDDEN_FIELDS.test(code) ? code : 'OFFICE_ERROR';
}

function cleanPublicError(value: unknown): OfficePublicError | undefined {
  if (!isRecord(value)) return undefined;
  const message = text(value.message, '', 240);
  if (!message) return undefined;
  return {
    code: safeErrorCode(value.code),
    message: FORBIDDEN_FIELDS.test(message) ? OFFICE_FAILED : message,
  };
}

export function officeErrorMessage(error: unknown): string {
  const message = text(isRecord(error) ? error.message : undefined, '', 240);
  if (!message || FORBIDDEN_FIELDS.test(message)) return OFFICE_FAILED;
  return message;
}

// Keeps only the fields the browser is allowed to see. Bot secrets, raw
// remote ids, bot lists and any other server fields are dropped here.
export function normalizeOfficeStatus(value: unknown): OfficeStatus {
  if (!isRecord(value) || typeof value.cliInstalled !== 'boolean' || typeof value.mainStatus !== 'string') {
    throw new Error('企业微信办公服务返回了无法识别的响应');
  }
  const status: OfficeStatus = {
    ok: value.ok === true,
    cliInstalled: value.cliInstalled,
    mainStatus: value.mainStatus.slice(0, 40),
    activeBotId: text(value.activeBotId, '', 128) || null,
    authorized: value.authorized === true,
    allowWrite: value.allowWrite === true,
    cliPath: text(value.cliPath, '', 240),
    configDir: text(value.configDir, '', 240),
  };
  if (typeof value.cliVersion === 'string' && value.cliVersion.trim()) {
    status.cliVersion = value.cliVersion.trim().slice(0, 80);
  }
  const lastError = cleanPublicError(value.lastError);
  if (lastError) status.lastError = lastError;
  return status;
}

function officeRequestError(body: unknown): Error & { code: string } {
  const cleaned = isRecord(body) ? cleanPublicError(body.lastError) : undefined;
  const error = new Error(
    cleaned ? cleaned.message : (() => {
      const fallback = isRecord(body) ? officeErrorMessage({ message: body.error }) : OFFICE_FAILED;
      return fallback === OFFICE_FAILED ? OFFICE_UNAVAILABLE : fallback;
    })(),
  ) as Error & { code: string };
  error.code = cleaned ? cleaned.code : 'OFFICE_UNAVAILABLE';
  return error;
}

export async function callOffice(
  action: OfficeAction,
  payload: Record<string, unknown> = {},
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<OfficeStatus> {
  let response: Response;
  try {
    response = await fetchImpl(OFFICE_STATUS_ROUTE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, ...payload, imAvailableHint: true }),
    });
  } catch {
    throw new Error(OFFICE_UNAVAILABLE);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(OFFICE_UNAVAILABLE);
  }
  try {
    return normalizeOfficeStatus(body);
  } catch {
    throw officeRequestError(body);
  }
}
