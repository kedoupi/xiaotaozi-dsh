import { normalizeAgentPresetCatalog, normalizeAgentPresetId, SET_AGENT_PRESET_ENDPOINT } from '../../agent-preset.ts';
import { SET_BOT_INSTRUCTION_ENDPOINT, displayBotInstruction } from '../../bot-instruction.ts';
import { SET_BOT_DISPLAY_NAME_ENDPOINT } from '../../bot-display-name.ts';
import { normalizeLastMessageError } from '../../last-message-error.ts';

export const WECOM_RPC_CHANNEL = '/wecom';

export const WECOM_ENDPOINTS = Object.freeze({
  status: 'connection.status',
  beginProvisioning: 'provision.begin',
  pollProvisioning: 'provision.poll',
  cancelProvisioning: 'provision.cancel',
  bindCredentials: 'bot.bind-credentials',
  reconnectBot: 'bot.reconnect',
  deleteBot: 'bot.delete',
  setWorkspace: 'bot.workspace.set',
  setAgentPreset: SET_AGENT_PRESET_ENDPOINT,
  setInstruction: SET_BOT_INSTRUCTION_ENDPOINT,
  setDisplayName: SET_BOT_DISPLAY_NAME_ENDPOINT,
});

const PROVISION_STATES = new Set(['starting', 'pending', 'refreshing', 'connecting', 'connected', 'failed', 'cancelled']);
const ACCOUNT_STATES = new Set(['connected', 'connecting', 'offline', 'error']);
const FORBIDDEN_ERROR_FIELDS = /(client[_-]?secret|secret[_-]?ref|device[_-]?code|app[_-]?secret|access[_-]?token|token)/i;
const QR_DATA_URL = /^data:image\/(?:png|webp);base64,[a-z\d+/]+={0,2}$/i;

type CodedError = Error & { code: string };

type ProvisioningResult = {
  attemptId: string;
  status: string;
  expiresAt: number;
  pollIntervalMs: number;
  qrRevision: number;
  qrCodeDataUrl?: string;
  botId?: string;
  error?: { code: string; message: string };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function read(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function text(value: unknown, fallback: string, max = 240) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback;
}

function id(value: unknown) {
  const result = text(value, '', 128);
  return /^[a-z\d_-]+$/i.test(result) ? result : undefined;
}

function timestamp(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? undefined : parsed;
}

function normalizeTestMessage(value: unknown) {
  if (!isRecord(value)) return null;
  if (value.sent === true) return { sent: true };
  if (value.sent !== false) return null;
  const code = value.code === 'test-target-unavailable'
    ? 'test-target-unavailable'
    : 'test-message-failed';
  return { sent: false, code };
}

function safeErrorCode(value: unknown, fallback: string) {
  const code = text(value, '', 80);
  return code && /^[a-z][a-z\d_.:-]*$/i.test(code) && !FORBIDDEN_ERROR_FIELDS.test(code)
    ? code
    : fallback;
}

function sanitizeMessage(value: unknown, fallback: string) {
  const message = text(value, fallback, 480);
  if (FORBIDDEN_ERROR_FIELDS.test(message)) return fallback;
  return message.replace(/([=:]\s*)[^\s,;，。]+/g, '$1••••••').slice(0, 240);
}

export function unwrapRpcResult(result: unknown) {
  if (!isRecord(result) || typeof result.ok !== 'boolean') throw new Error('企业微信服务返回了无法识别的响应');
  if (!result.ok) {
    const error = new Error(sanitizeMessage(read(result.error, 'message'), '企业微信操作失败')) as CodedError;
    error.code = safeErrorCode(read(result.error, 'code'), 'WECOM_RPC_ERROR');
    throw error;
  }
  return result.value;
}

export function safeQrSource(value: unknown) {
  return typeof value === 'string' && value.length <= 2 * 1024 * 1024 && QR_DATA_URL.test(value)
    ? value : undefined;
}

export function normalizeProvisioning(value: unknown, now = Date.now()) {
  const source = isRecord(read(value, 'provisioning')) ? read(value, 'provisioning') : value;
  if (!isRecord(source)) throw new Error('企业微信服务没有返回扫码绑定进度');
  const attemptId = id(source.attemptId);
  if (!attemptId) throw new Error('企业微信扫码服务没有返回有效的绑定任务');
  const reported = text(source.status, 'failed', 32);
  const result: ProvisioningResult = {
    attemptId,
    status: PROVISION_STATES.has(reported) ? reported : 'failed',
    expiresAt: timestamp(source.expiresAt) ?? now + 5 * 60_000,
    pollIntervalMs: Math.min(10_000, Math.max(500, Number(source.pollIntervalMs) || 1_000)),
    qrRevision: Number.isSafeInteger(source.qrRevision) ? source.qrRevision as number : 0,
  };
  const qrCodeDataUrl = safeQrSource(source.qrCodeDataUrl);
  if (qrCodeDataUrl) result.qrCodeDataUrl = qrCodeDataUrl;
  const botId = id(source.botId);
  if (botId) result.botId = botId;
  if (isRecord(source.error)) result.error = {
    code: safeErrorCode(source.error.code, 'WECOM_PROVISION_FAILED'),
    message: sanitizeMessage(source.error.message, '企业微信机器人没有接入完成'),
  };
  return result;
}

function normalizeBot(value: unknown) {
  const botId = id(isRecord(value) ? value.botId : undefined);
  if (!isRecord(value) || !botId) return undefined;
  const connected = value.connected === true;
  const state = typeof value.state === 'string' && ACCOUNT_STATES.has(value.state)
    ? value.state
    : 'offline';
  const bot = read(value, 'bot');
  const health = read(value, 'health');
  return {
    botId,
    connected,
    state: connected ? 'connected' : state,
    workspaceId: typeof value.workspaceId === 'string' ? value.workspaceId : null,
    workspaceTitle: typeof value.workspaceTitle === 'string' ? value.workspaceTitle : null,
    workspace: typeof value.workspace === 'string' ? value.workspace : null,
    workspacePending: value.workspacePending === true,
    agentPreset: normalizeAgentPresetId(value.agentPreset),
    instruction: displayBotInstruction(value.instruction),
    bot: {
      name: text(read(bot, 'name'), '企业微信机器人', 100),
      appIdMasked: text(read(bot, 'appIdMasked'), '应用标识已安全保存', 140),
    },
    health: {
      summary: text(read(health, 'summary'), connected ? '企业微信 WebSocket 长连接运行正常' : '企业微信连接尚未就绪'),
      lastCheckedAt: timestamp(read(health, 'lastCheckedAt')),
    },
    error: isRecord(value.error) ? {
      code: safeErrorCode(value.error.code, 'WECOM_ACCOUNT_ERROR'),
      message: sanitizeMessage(value.error.message, '企业微信连接尚未就绪'),
    } : null,
    lastMessageError: normalizeLastMessageError(value.lastMessageError),
  };
}

export function normalizeSnapshot(value: unknown) {
  const source = isRecord(read(value, 'snapshot')) ? read(value, 'snapshot') : value;
  if (!isRecord(source) || !Array.isArray(source.bots)) throw new Error('企业微信服务没有返回有效的机器人列表');
  const bots = (source.bots as unknown[])
    .map(normalizeBot)
    .filter((bot): bot is NonNullable<ReturnType<typeof normalizeBot>> => Boolean(bot));
  return {
    revision: Number.isSafeInteger(source.revision) ? source.revision as number : 0,
    bots,
    totals: { configured: bots.length, connected: bots.filter((bot) => bot.connected).length },
    provisioning: source.provisioning ? normalizeProvisioning(source.provisioning) : null,
    testMessage: normalizeTestMessage(source.testMessage),
    agentPresetCatalog: normalizeAgentPresetCatalog(source.agentPresetCatalog),
  };
}

export function presentError(error: unknown) {
  return {
    code: safeErrorCode(read(error, 'code'), 'WECOM_ERROR'),
    message: sanitizeMessage(read(error, 'message'), '企业微信操作失败，请稍后重试'),
  };
}

export function formatRemaining(milliseconds: unknown) {
  const seconds = Math.max(0, Math.ceil(Number(milliseconds) / 1_000) || 0);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
