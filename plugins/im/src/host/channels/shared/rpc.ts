import { resolveRpcAuthority } from '../../../rpc-authority.ts';
import { publicConnectionTestResult } from '../../../channels/shared/connection-test.ts';
import {
  publicWorkspaceError,
  SET_WORKSPACE_ENDPOINT,
  validWorkspacePayload,
} from './workspace-rpc.ts';
import {
  SET_AGENT_PRESET_ENDPOINT,
  publicAgentPresetError,
  validAgentPresetPayload,
} from './agent-preset-rpc.ts';
import {
  SET_BOT_INSTRUCTION_ENDPOINT,
  publicBotInstructionError,
  validBotInstructionPayload,
} from './bot-instruction-rpc.ts';
import {
  SET_BOT_DISPLAY_NAME_ENDPOINT,
  publicBotDisplayNameError,
  validBotDisplayNamePayload,
} from './bot-display-name-rpc.ts';

export const TOKEN_BOT_ENDPOINTS = Object.freeze({
  status: 'connection.status',
  bindCredentials: 'bot.bind-credentials',
  reconnectBot: 'bot.reconnect',
  deleteBot: 'bot.delete',
  setWorkspace: SET_WORKSPACE_ENDPOINT,
  setAgentPreset: SET_AGENT_PRESET_ENDPOINT,
  setInstruction: SET_BOT_INSTRUCTION_ENDPOINT,
  setDisplayName: SET_BOT_DISPLAY_NAME_ENDPOINT,
});

const ENDPOINTS = Object.freeze(Object.values(TOKEN_BOT_ENDPOINTS));
const FORBIDDEN_PUBLIC_KEYS = new Set([
  'token', 'botToken', 'tokenRef', 'platformId', 'secret', 'secretRef',
]);
const TELEGRAM_NETWORK_ERRORS = new Set([
  'telegram-transport-error',
  'telegram-timeout',
  'telegram-response-invalid',
]);

type CodedError = { code?: unknown; message?: unknown };
type TokenBotSnapshot = {
  bots?: Array<{ botId?: unknown; connected?: unknown } | null | undefined>;
};
type TokenBotController = {
  status: () => unknown;
  bindCredentials: (payload: unknown) => unknown;
  reconnectBot: (botId: unknown) => unknown;
  deleteBot: (botId: unknown) => unknown;
  sendConnectionTest?: (botId: unknown) => unknown;
  updateWorkspace?: (botId: unknown, workspaceId: unknown) => unknown;
  updateAgentPreset?: (botId: unknown, agentPreset: unknown) => unknown;
  updateInstruction?: (botId: unknown, instruction: unknown) => unknown;
  updateDisplayName?: (botId: unknown, name: unknown) => unknown;
};
type TokenBotRpcHandlerOptions = { channel: string };
type TokenBotRpcInstallOptions = {
  channel: string;
  rpcChannel: unknown;
  authority?: unknown;
};
type RpcContext = {
  connection?: {
    rpc?: {
      handle?: (channel: unknown, handler: unknown, options?: unknown) => unknown;
    };
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: unknown, allowed: string[]) {
  return isRecord(value) && Object.keys(value).every((key) => allowed.includes(key));
}

function validId(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function validToken(value: unknown) {
  return typeof value === 'string' && value.trim().length >= 20 && value.length <= 4_096;
}

function payloadFailure(endpoint: unknown, payload: unknown) {
  if (!isRecord(payload)) return 'Payload must be an object.';
  if (endpoint === TOKEN_BOT_ENDPOINTS.status) {
    return exactKeys(payload, []) ? null : 'connection.status does not accept fields.';
  }
  if (endpoint === TOKEN_BOT_ENDPOINTS.bindCredentials) {
    return exactKeys(payload, ['token']) && validToken(payload.token)
      ? null : 'bot.bind-credentials requires a Bot Token.';
  }
  if (endpoint === TOKEN_BOT_ENDPOINTS.reconnectBot) {
    return exactKeys(payload, ['botId', 'sendTest']) && validId(payload.botId)
      && (payload.sendTest === undefined || typeof payload.sendTest === 'boolean')
      ? null : 'bot.reconnect requires a botId.';
  }
  if (endpoint === TOKEN_BOT_ENDPOINTS.deleteBot) {
    return exactKeys(payload, ['botId', 'confirm']) && validId(payload.botId) && payload.confirm === true
      ? null : 'bot.delete requires a botId and confirm=true.';
  }
  if (endpoint === TOKEN_BOT_ENDPOINTS.setWorkspace) {
    return validWorkspacePayload(payload)
      ? null : '请选择一个已有项目。';
  }
  if (endpoint === TOKEN_BOT_ENDPOINTS.setAgentPreset) {
    return validAgentPresetPayload(payload)
      ? null : '请选择 Agent Preset。';
  }
  if (endpoint === TOKEN_BOT_ENDPOINTS.setInstruction) {
    return validBotInstructionPayload(payload)
      ? null : '请填写机器人职责。';
  }
  if (endpoint === TOKEN_BOT_ENDPOINTS.setDisplayName) {
    return validBotDisplayNamePayload(payload)
      ? null : '请填写机器人名称。';
  }
  return 'Unknown bot endpoint.';
}

function sanitizePublic(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizePublic);
  if (!isRecord(value)) return value;
  const safe: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (!FORBIDDEN_PUBLIC_KEYS.has(key)) safe[key] = sanitizePublic(child);
  }
  return safe;
}

function operationError(channel: string, error: unknown) {
  const workspaceError = publicWorkspaceError(error);
  if (workspaceError) return workspaceError;
  const presetError = publicAgentPresetError(error);
  if (presetError) return presetError;
  const instructionError = publicBotInstructionError(error);
  if (instructionError) return instructionError;
  const displayNameError = publicBotDisplayNameError(error);
  if (displayNameError) return displayNameError;
  const coded = error as CodedError;
  if (coded?.code === 'webhook-configured') {
    return { code: 'webhook-configured', message: coded.message };
  }
  if (coded?.code === 'telegram-401' || coded?.code === 'discord-401') {
    return { code: 'invalid-token', message: `${channel} Bot Token 无效，请重新填写。` };
  }
  if (channel === 'Telegram' && TELEGRAM_NETWORK_ERRORS.has(coded?.code as string)) {
    return {
      code: 'telegram-network-error',
      message: '无法访问 Telegram Bot API。请检查网络或代理设置；Node.js 22.21+ 可设置 NODE_USE_ENV_PROXY=1，并配置 HTTPS_PROXY、HTTP_PROXY 和 NO_PROXY，然后重启 dsh web。',
    };
  }
  if (coded?.code === 'discord-intents') {
    return { code: 'discord-intents', message: coded.message };
  }
  return { code: `${channel.toLowerCase()}-operation-failed`, message: `${channel} 操作失败，请稍后重试。` };
}

function codedError(message: string, code: string) {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

export function createTokenBotRpcHandler(
  controller: TokenBotController | null | undefined,
  { channel }: TokenBotRpcHandlerOptions,
) {
  for (const method of ['status', 'bindCredentials', 'reconnectBot', 'deleteBot'] as const) {
    if (typeof controller?.[method] !== 'function') {
      throw new TypeError(`A complete ${channel} controller is required (${method})`);
    }
  }
  const botController = controller as TokenBotController;
  return async (endpoint: unknown, payload: unknown, signal?: AbortSignal | null) => {
    if (signal?.aborted) {
      return { ok: false, error: { code: 'cancelled', message: 'The request was cancelled.' } };
    }
    if (!(ENDPOINTS as readonly string[]).includes(endpoint as string)) {
      return { ok: false, error: { code: 'bad-request', message: `Unknown ${channel} endpoint.` } };
    }
    const invalid = payloadFailure(endpoint, payload);
    if (invalid) {
      const code = endpoint === TOKEN_BOT_ENDPOINTS.setWorkspace ? 'invalid-payload' : 'bad-request';
      return { ok: false, error: { code, message: invalid } };
    }
    const body = payload as Record<string, unknown>;
    try {
      let value: unknown;
      if (endpoint === TOKEN_BOT_ENDPOINTS.status) value = await botController.status();
      else if (endpoint === TOKEN_BOT_ENDPOINTS.bindCredentials) {
        value = await botController.bindCredentials(payload);
      } else if (endpoint === TOKEN_BOT_ENDPOINTS.reconnectBot) {
        value = await botController.reconnectBot(body.botId);
        if (signal?.aborted) {
          return { ok: false, error: { code: 'cancelled', message: 'The request was cancelled.' } };
        }
        if (body.sendTest === true) {
          let testError = null;
          try {
            const snapshot = value as TokenBotSnapshot;
            if (snapshot?.bots?.find((bot) => bot?.botId === body.botId)?.connected !== true) {
              throw codedError('Bot is not connected', 'test-target-unavailable');
            }
            if (typeof botController.sendConnectionTest !== 'function') {
              throw codedError('Connection test is unavailable', 'test-target-unavailable');
            }
            await botController.sendConnectionTest(body.botId);
          } catch (error) {
            testError = error;
          }
          value = { ...(value as object), testMessage: publicConnectionTestResult(testError) };
        }
      } else if (endpoint === TOKEN_BOT_ENDPOINTS.setWorkspace) {
        if (typeof botController.updateWorkspace !== 'function') throw new Error('Workspace update is unavailable');
        value = await botController.updateWorkspace(body.botId, body.workspaceId);
      } else if (endpoint === TOKEN_BOT_ENDPOINTS.setAgentPreset) {
        if (typeof botController.updateAgentPreset !== 'function') throw new Error('Agent Preset update is unavailable');
        value = await botController.updateAgentPreset(body.botId, body.agentPreset);
      } else if (endpoint === TOKEN_BOT_ENDPOINTS.setInstruction) {
        if (typeof botController.updateInstruction !== 'function') throw new Error('Bot instruction update is unavailable');
        value = await botController.updateInstruction(body.botId, body.instruction);
      } else if (endpoint === TOKEN_BOT_ENDPOINTS.setDisplayName) {
        if (typeof botController.updateDisplayName !== 'function') throw new Error('Bot display name update is unavailable');
        value = await botController.updateDisplayName(body.botId, body.name);
      } else {
        value = await botController.deleteBot(body.botId);
      }
      return signal?.aborted
        ? { ok: false, error: { code: 'cancelled', message: 'The request was cancelled.' } }
        : { ok: true, value: sanitizePublic(value) };
    } catch (error) {
      return signal?.aborted
        ? { ok: false, error: { code: 'cancelled', message: 'The request was cancelled.' } }
        : { ok: false, error: operationError(channel, error) };
    }
  };
}

export function installTokenBotRpc(
  ctx: RpcContext | null | undefined,
  controller: TokenBotController | null | undefined,
  { channel, rpcChannel, authority }: TokenBotRpcInstallOptions,
) {
  if (!ctx?.connection?.rpc || typeof ctx.connection.rpc.handle !== 'function') {
    throw new TypeError('DSH Host Connection RPC is required');
  }
  return ctx.connection.rpc.handle(
    rpcChannel,
    createTokenBotRpcHandler(controller, { channel }),
    { authority: resolveRpcAuthority(authority) },
  );
}
