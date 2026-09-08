import { normalizeAgentPresetCatalog, normalizeAgentPresetId, SET_AGENT_PRESET_ENDPOINT } from '../../agent-preset.ts';
import { SET_BOT_INSTRUCTION_ENDPOINT, displayBotInstruction } from '../../bot-instruction.ts';
import { SET_BOT_DISPLAY_NAME_ENDPOINT } from '../../bot-display-name.ts';
import { normalizeLastMessageError } from '../../last-message-error.ts';

export const WHATSAPP_RPC_CHANNEL = '/whatsapp';

export const WHATSAPP_ENDPOINTS = Object.freeze({
  status: 'connection.status',
  beginProvisioning: 'provision.begin',
  pollProvisioning: 'provision.poll',
  cancelProvisioning: 'provision.cancel',
  reconnectBot: 'bot.reconnect',
  deleteBot: 'bot.delete',
  setAccessPolicy: 'bot.access-policy.set',
  setWorkspace: 'bot.workspace.set',
  setAgentPreset: SET_AGENT_PRESET_ENDPOINT,
  setInstruction: SET_BOT_INSTRUCTION_ENDPOINT,
  setDisplayName: SET_BOT_DISPLAY_NAME_ENDPOINT,
});

const PROVISION_STATES = new Set(['starting', 'pending', 'connecting', 'connected', 'failed', 'cancelled']);
const BOT_STATES = new Set(['connected', 'connecting', 'offline', 'error']);
const QR_DATA_URL = /^data:image\/(?:png|webp);base64,[a-z\d+/]+={0,2}$/i;
const ACCESS_MODES = new Set(['self-only', 'private-allowlist', 'open']);

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

export function unwrapRpcResult(result: unknown) {
  if (!isRecord(result) || typeof result.ok !== 'boolean') {
    throw new Error('WhatsApp 服务返回了无法识别的响应');
  }
  if (!result.ok) {
    const error = new Error(text(read(result.error, 'message'), 'WhatsApp 操作失败')) as CodedError;
    error.code = text(read(result.error, 'code'), 'WHATSAPP_RPC_ERROR', 80);
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
  if (!isRecord(source)) throw new Error('WhatsApp 服务没有返回扫码进度');
  const attemptId = id(source.attemptId);
  if (!attemptId) throw new Error('WhatsApp 服务没有返回有效的扫码任务');
  const reported = text(source.status, 'failed', 32);
  const result: ProvisioningResult = {
    attemptId,
    status: PROVISION_STATES.has(reported) ? reported : 'failed',
    expiresAt: timestamp(source.expiresAt) ?? now + 60_000,
    pollIntervalMs: Math.min(5_000, Math.max(500, Number(source.pollIntervalMs) || 1_000)),
    qrRevision: Number.isSafeInteger(source.qrRevision) ? source.qrRevision as number : 0,
  };
  const qrCodeDataUrl = safeQrSource(source.qrCodeDataUrl);
  if (qrCodeDataUrl) result.qrCodeDataUrl = qrCodeDataUrl;
  const botId = id(source.botId);
  if (botId) result.botId = botId;
  if (isRecord(source.error)) result.error = {
    code: text(source.error.code, 'WHATSAPP_PROVISION_FAILED', 80),
    message: text(source.error.message, 'WhatsApp 没有接入完成'),
  };
  return result;
}

function normalizeBot(value: unknown) {
  const botId = id(isRecord(value) ? value.botId : undefined);
  if (!isRecord(value) || !botId) return undefined;
  const connected = value.connected === true;
  const state = BOT_STATES.has(value.state as string) ? value.state as string : 'offline';
  const accessPolicy = isRecord(value.accessPolicy) ? value.accessPolicy : undefined;
  const accessMode = accessPolicy?.accessMode;
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
    accessPolicy: {
      accessMode: typeof accessMode === 'string' && ACCESS_MODES.has(accessMode)
        ? accessMode
        : 'self-only',
      allowedNumbers: Array.isArray(accessPolicy?.allowedNumbers)
        ? [...new Set((accessPolicy.allowedNumbers as unknown[]).filter((entry): entry is string => (
            typeof entry === 'string' && /^[1-9]\d{4,14}$/.test(entry)
          )))]
        : [],
    },
    bot: {
      name: text(read(bot, 'name'), 'WhatsApp机器人', 100),
      idMasked: text(read(bot, 'idMasked'), 'WhatsApp账号', 140),
    },
    health: {
      summary: text(read(health, 'summary'), connected
        ? 'WhatsApp Web 关联设备运行正常' : 'WhatsApp 连接尚未就绪'),
      lastCheckedAt: timestamp(read(health, 'lastCheckedAt')),
    },
    error: isRecord(value.error) ? {
      code: text(value.error.code, 'WHATSAPP_ACCOUNT_ERROR', 80),
      message: text(value.error.message, 'WhatsApp 连接尚未就绪'),
    } : null,
    lastMessageError: normalizeLastMessageError(value.lastMessageError),
  };
}

export function normalizeSnapshot(value: unknown) {
  const source = isRecord(read(value, 'snapshot')) ? read(value, 'snapshot') : value;
  if (!isRecord(source) || !Array.isArray(source.bots)) {
    throw new Error('WhatsApp 服务没有返回有效的机器人列表');
  }
  const bots = (source.bots as unknown[])
    .map(normalizeBot)
    .filter((bot): bot is NonNullable<ReturnType<typeof normalizeBot>> => Boolean(bot));
  return {
    revision: Number.isSafeInteger(source.revision) ? source.revision as number : 0,
    bots,
    totals: { configured: bots.length, connected: bots.filter((bot) => bot.connected).length },
    provisioning: source.provisioning ? normalizeProvisioning(source.provisioning) : null,
    agentPresetCatalog: normalizeAgentPresetCatalog(source.agentPresetCatalog),
  };
}

export function presentError(error: unknown) {
  return {
    code: text(read(error, 'code'), 'WHATSAPP_ERROR', 80),
    message: text(read(error, 'message'), 'WhatsApp 操作失败，请稍后重试'),
  };
}

export function formatRemaining(milliseconds: unknown) {
  const seconds = Math.max(0, Math.ceil(Number(milliseconds) / 1_000) || 0);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
