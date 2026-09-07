import { normalizeLastMessageError } from '../../last-message-error.ts';

const ACCOUNT_STATES = new Set(['connected', 'connecting', 'offline', 'error']);

type CodedError = Error & { code: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function read(value: unknown, key: string): unknown {
  return value == null ? undefined : (value as Record<string, unknown>)[key];
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

export const TOKEN_BOT_ENDPOINTS = Object.freeze({
  status: 'connection.status',
  bindCredentials: 'bot.bind-credentials',
  reconnectBot: 'bot.reconnect',
  deleteBot: 'bot.delete',
  setWorkspace: 'bot.workspace.set',
  setAgentPreset: 'bot.preset.set',
  setInstruction: 'bot.instruction.set',
  setDisplayName: 'bot.displayName.set',
});

export type CreateTokenChannelApiOptions = {
  normalizeBotExtension?(value: Record<string, unknown>): unknown;
};

export function createTokenChannelApi(
  channel: string,
  connectionSummary: string,
  {
    normalizeBotExtension = () => ({}),
  }: CreateTokenChannelApiOptions = {},
) {
  const unwrapRpcResult = (result: unknown) => {
    if (!isRecord(result) || typeof result.ok !== 'boolean') {
      throw new Error(`${channel} 服务返回了无法识别的响应`);
    }
    if (!result.ok) {
      const error = new Error(text(read(result.error, 'message'), `${channel} 操作失败`)) as CodedError;
      error.code = text(read(result.error, 'code'), `${channel.toUpperCase()}_RPC_ERROR`, 80);
      throw error;
    }
    return result.value;
  };

  const normalizeBot = (value: unknown) => {
    const botId = id(isRecord(value) ? value.botId : undefined);
    if (!isRecord(value) || !botId) return undefined;
    const connected = value.connected === true;
    const state = ACCOUNT_STATES.has(value.state as string) ? value.state : 'offline';
    const extension = normalizeBotExtension(value);
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
      agentPreset: typeof value.agentPreset === 'string' ? value.agentPreset : '',
      instruction: typeof value.instruction === 'string' ? value.instruction.slice(0, 8_000) : '',
      bot: {
        name: text(read(bot, 'name'), `${channel}机器人`, 100),
        username: text(read(bot, 'username'), '', 100),
        idMasked: text(read(bot, 'idMasked'), '机器人标识已安全保存', 140),
      },
      health: {
        summary: text(
          read(health, 'summary'),
          connected ? `${channel}${connectionSummary}运行正常` : `${channel}连接尚未就绪`,
        ),
        lastCheckedAt: timestamp(read(health, 'lastCheckedAt')),
      },
      error: isRecord(value.error) ? {
        code: text(value.error.code, `${channel.toUpperCase()}_ACCOUNT_ERROR`, 80),
        message: text(value.error.message, `${channel}连接尚未就绪`),
      } : null,
      lastMessageError: normalizeLastMessageError(value.lastMessageError),
      ...(isRecord(extension) ? extension : {}),
    };
  };

  const normalizeSnapshot = (value: unknown) => {
    const source = isRecord(read(value, 'snapshot')) ? read(value, 'snapshot') : value;
    if (!isRecord(source) || !Array.isArray(source.bots)) {
      throw new Error(`${channel} 服务没有返回有效的机器人列表`);
    }
    const bots = (source.bots as unknown[])
      .map(normalizeBot)
      .filter((bot): bot is NonNullable<ReturnType<typeof normalizeBot>> => Boolean(bot));
    return {
      revision: Number.isSafeInteger(source.revision) ? source.revision : 0,
      bots,
      agentPresetCatalog: source.agentPresetCatalog,
      totals: { configured: bots.length, connected: bots.filter((bot) => bot.connected).length },
    };
  };

  const presentError = (error: unknown) => ({
    code: text(read(error, 'code'), `${channel.toUpperCase()}_ERROR`, 80),
    message: text(read(error, 'message'), `${channel}操作失败，请稍后重试`),
  });

  return Object.freeze({ unwrapRpcResult, normalizeSnapshot, presentError });
}
