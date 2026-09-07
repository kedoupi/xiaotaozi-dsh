import {
  TOKEN_BOT_ENDPOINTS,
  createTokenBotRpcHandler,
} from '../shared/rpc.ts';
import { resolveRpcAuthority } from '../../../rpc-authority.ts';
import { normalizeTelegramAccessPolicy } from '../../../channels/telegram/config-store.ts';

type TelegramController = {
  setAccessPolicy: (botId: unknown, policy: unknown) => unknown;
  status: () => unknown;
  bindCredentials: (payload: unknown) => unknown;
  reconnectBot: (botId: unknown) => unknown;
  deleteBot: (botId: unknown) => unknown;
};
type RpcContext = {
  connection?: {
    rpc?: {
      handle?: (channel: unknown, handler: unknown, options?: unknown) => unknown;
    };
  };
};

export const TELEGRAM_RPC_CHANNEL = '/telegram';
export const TELEGRAM_ENDPOINTS = Object.freeze({
  ...TOKEN_BOT_ENDPOINTS,
  setAccessPolicy: 'bot.access-policy.set',
});
export const TELEGRAM_RPC_ENDPOINTS = Object.freeze(Object.values(TELEGRAM_ENDPOINTS));

export function createTelegramRpcHandler(controller: TelegramController | null | undefined) {
  if (typeof controller?.setAccessPolicy !== 'function') {
    throw new TypeError('A complete Telegram controller is required (setAccessPolicy)');
  }
  const botController = controller as TelegramController;
  const sharedHandler = createTokenBotRpcHandler(botController, { channel: 'Telegram' });
  return async (endpoint: unknown, payload: unknown, signal?: AbortSignal | null) => {
    if (endpoint !== TELEGRAM_ENDPOINTS.setAccessPolicy) {
      return sharedHandler(endpoint, payload, signal);
    }
    if (signal?.aborted) {
      return { ok: false, error: { code: 'cancelled', message: 'The request was cancelled.' } };
    }
    const body = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as Record<string, unknown> : null;
    const keys = body ? Object.keys(body) : [];
    if (keys.length !== 3 || !keys.every((key) => (
      ['botId', 'accessMode', 'allowedUsers'].includes(key)
    )) || typeof body?.botId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(body.botId)) {
      return {
        ok: false,
        error: { code: 'bad-request', message: 'bot.access-policy.set requires a valid policy.' },
      };
    }
    let accessPolicy;
    try {
      accessPolicy = normalizeTelegramAccessPolicy(body);
    } catch {
      return {
        ok: false,
        error: { code: 'bad-request', message: '请输入有效的 Telegram 访问模式和数字 User ID。' },
      };
    }
    try {
      const value = await botController.setAccessPolicy(body.botId, accessPolicy);
      return signal?.aborted
        ? { ok: false, error: { code: 'cancelled', message: 'The request was cancelled.' } }
        : { ok: true, value };
    } catch {
      return signal?.aborted
        ? { ok: false, error: { code: 'cancelled', message: 'The request was cancelled.' } }
        : {
            ok: false,
            error: { code: 'telegram-operation-failed', message: 'Telegram 操作失败，请稍后重试。' },
          };
    }
  };
}

export function installTelegramRpc(
  ctx: RpcContext | null | undefined,
  controller: TelegramController | null | undefined,
  authority?: unknown,
) {
  if (!ctx?.connection?.rpc || typeof ctx.connection.rpc.handle !== 'function') {
    throw new TypeError('DSH Host Connection RPC is required');
  }
  return ctx.connection.rpc.handle(
    TELEGRAM_RPC_CHANNEL,
    createTelegramRpcHandler(controller),
    { authority: resolveRpcAuthority(authority) },
  );
}
