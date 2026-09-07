import { resolveRpcAuthority } from '../../../rpc-authority.ts';
import { publicConnectionTestResult } from '../../../channels/shared/connection-test.ts';
import {
  publicWorkspaceError,
  SET_WORKSPACE_ENDPOINT,
  validWorkspacePayload,
} from '../shared/workspace-rpc.ts';
import {
  SET_AGENT_PRESET_ENDPOINT,
  publicAgentPresetError,
  validAgentPresetPayload,
} from '../shared/agent-preset-rpc.ts';
import {
  SET_BOT_INSTRUCTION_ENDPOINT,
  publicBotInstructionError,
  validBotInstructionPayload,
} from '../shared/bot-instruction-rpc.ts';
import {
  SET_BOT_DISPLAY_NAME_ENDPOINT,
  publicBotDisplayNameError,
  validBotDisplayNamePayload,
} from '../shared/bot-display-name-rpc.ts';

export const SLACK_RPC_CHANNEL = '/slack';
export const SLACK_ENDPOINTS = Object.freeze({
  status: 'connection.status',
  bindCredentials: 'bot.bind-credentials',
  reconnectBot: 'bot.reconnect',
  deleteBot: 'bot.delete',
  setWorkspace: SET_WORKSPACE_ENDPOINT,
  setAgentPreset: SET_AGENT_PRESET_ENDPOINT,
  setInstruction: SET_BOT_INSTRUCTION_ENDPOINT,
  setDisplayName: SET_BOT_DISPLAY_NAME_ENDPOINT,
});
export const SLACK_RPC_ENDPOINTS = Object.freeze(Object.values(SLACK_ENDPOINTS));

const FORBIDDEN_PUBLIC_KEYS = new Set([
  'token', 'botToken', 'appToken', 'botTokenRef', 'appTokenRef',
  'tokenRef', 'platformId', 'secret', 'secretRef',
]);

type CodedError = { code?: unknown; message?: unknown };
type SlackSnapshot = {
  bots?: Array<{ botId?: unknown; connected?: unknown } | null | undefined>;
};
type SlackControllerLike = {
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
  return typeof value === 'string' && /^slack_[a-f0-9]{24}$/.test(value);
}

function validBotToken(value: unknown) {
  return typeof value === 'string' && /^xoxb-[A-Za-z0-9-]{16,}$/.test(value.trim())
    && value.length <= 4_096;
}

function validAppToken(value: unknown) {
  return typeof value === 'string' && /^xapp-[A-Za-z0-9-]{16,}$/.test(value.trim())
    && value.length <= 4_096;
}

function payloadFailure(endpoint: unknown, payload: unknown) {
  if (!isRecord(payload)) return 'Payload must be an object.';
  if (endpoint === SLACK_ENDPOINTS.status) {
    return exactKeys(payload, []) ? null : 'connection.status does not accept fields.';
  }
  if (endpoint === SLACK_ENDPOINTS.bindCredentials) {
    return exactKeys(payload, ['botToken', 'appToken'])
      && validBotToken(payload.botToken) && validAppToken(payload.appToken)
      ? null : 'bot.bind-credentials requires xoxb Bot Token and xapp App Token.';
  }
  if (endpoint === SLACK_ENDPOINTS.reconnectBot) {
    return exactKeys(payload, ['botId', 'sendTest']) && validId(payload.botId)
      && (payload.sendTest === undefined || typeof payload.sendTest === 'boolean')
      ? null : 'bot.reconnect requires a botId.';
  }
  if (endpoint === SLACK_ENDPOINTS.deleteBot) {
    return exactKeys(payload, ['botId', 'confirm']) && validId(payload.botId) && payload.confirm === true
      ? null : 'bot.delete requires a botId and confirm=true.';
  }
  if (endpoint === SLACK_ENDPOINTS.setWorkspace) {
    return validWorkspacePayload(payload)
      ? null : '请选择一个已有项目。';
  }
  if (endpoint === SLACK_ENDPOINTS.setAgentPreset) {
    return validAgentPresetPayload(payload)
      ? null : '请选择 Agent Preset。';
  }
  if (endpoint === SLACK_ENDPOINTS.setInstruction) {
    return validBotInstructionPayload(payload)
      ? null : '请填写机器人职责。';
  }
  if (endpoint === SLACK_ENDPOINTS.setDisplayName) {
    return validBotDisplayNamePayload(payload)
      ? null : '请填写机器人名称。';
  }
  return 'Unknown Slack endpoint.';
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

function codedError(message: string, code: string) {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

function operationError(error: unknown) {
  const workspaceError = publicWorkspaceError(error);
  if (workspaceError) return workspaceError;
  const instructionError = publicBotInstructionError(error);
  if (instructionError) return instructionError;
  const displayNameError = publicBotDisplayNameError(error);
  if (displayNameError) return displayNameError;
  const coded = error as CodedError;
  if (coded?.code === 'slack-invalid-bot-token') {
    return { code: 'invalid-bot-token', message: 'Slack Bot Token 无效，请确认使用以 xoxb- 开头的令牌。' };
  }
  if (coded?.code === 'slack-invalid-app-token') {
    return { code: 'invalid-app-token', message: 'Slack App Token 无效，请确认使用以 xapp- 开头的令牌。' };
  }
  if (coded?.code === 'slack-missing-scope') {
    return { code: 'missing-scope', message: 'Slack 应用权限不完整，请重新导入 Manifest 并安装到工作区。' };
  }
  if (coded?.code === 'slack-socket-mode') {
    return { code: 'socket-mode-unavailable', message: coded.message };
  }
  return { code: 'slack-operation-failed', message: 'Slack 操作失败，请稍后重试。' };
}

export function createSlackRpcHandler(controller: SlackControllerLike | null | undefined) {
  for (const method of ['status', 'bindCredentials', 'reconnectBot', 'deleteBot'] as const) {
    if (typeof controller?.[method] !== 'function') {
      throw new TypeError(`A complete Slack controller is required (${method})`);
    }
  }
  const slackController = controller as SlackControllerLike;
  return async (endpoint: unknown, payload: unknown, signal?: AbortSignal | null) => {
    if (signal?.aborted) {
      return { ok: false, error: { code: 'cancelled', message: 'The request was cancelled.' } };
    }
    if (!(SLACK_RPC_ENDPOINTS as readonly string[]).includes(endpoint as string)) {
      return { ok: false, error: { code: 'bad-request', message: 'Unknown Slack endpoint.' } };
    }
    const invalid = payloadFailure(endpoint, payload);
    if (invalid) {
      const code = endpoint === SLACK_ENDPOINTS.setWorkspace ? 'invalid-payload' : 'bad-request';
      return { ok: false, error: { code, message: invalid } };
    }
    const body = payload as Record<string, unknown>;
    try {
      let value: unknown;
      if (endpoint === SLACK_ENDPOINTS.status) value = await slackController.status();
      else if (endpoint === SLACK_ENDPOINTS.bindCredentials) value = await slackController.bindCredentials(payload);
      else if (endpoint === SLACK_ENDPOINTS.reconnectBot) {
        value = await slackController.reconnectBot(body.botId);
        if (signal?.aborted) {
          return { ok: false, error: { code: 'cancelled', message: 'The request was cancelled.' } };
        }
        if (body.sendTest === true) {
          let testError = null;
          try {
            const snapshot = value as SlackSnapshot;
            if (snapshot?.bots?.find((bot) => bot?.botId === body.botId)?.connected !== true) {
              throw codedError('Bot is not connected', 'test-target-unavailable');
            }
            if (typeof slackController.sendConnectionTest !== 'function') {
              throw codedError('Connection test is unavailable', 'test-target-unavailable');
            }
            await slackController.sendConnectionTest(body.botId);
          } catch (error) {
            testError = error;
          }
          value = { ...(value as object), testMessage: publicConnectionTestResult(testError) };
        }
      }
      else if (endpoint === SLACK_ENDPOINTS.setWorkspace) {
        if (typeof slackController.updateWorkspace !== 'function') throw new Error('Workspace update is unavailable');
        value = await slackController.updateWorkspace(body.botId, body.workspaceId);
      }
      else if (endpoint === SLACK_ENDPOINTS.setAgentPreset) {
        if (typeof slackController.updateAgentPreset !== 'function') throw new Error('Agent Preset update is unavailable');
        value = await slackController.updateAgentPreset(body.botId, body.agentPreset);
      }
      else if (endpoint === SLACK_ENDPOINTS.setInstruction) {
        if (typeof slackController.updateInstruction !== 'function') throw new Error('Bot instruction update is unavailable');
        value = await slackController.updateInstruction(body.botId, body.instruction);
      }
      else if (endpoint === SLACK_ENDPOINTS.setDisplayName) {
        if (typeof slackController.updateDisplayName !== 'function') throw new Error('Bot display name update is unavailable');
        value = await slackController.updateDisplayName(body.botId, body.name);
      }
      else value = await slackController.deleteBot(body.botId);
      return signal?.aborted
        ? { ok: false, error: { code: 'cancelled', message: 'The request was cancelled.' } }
        : { ok: true, value: sanitizePublic(value) };
    } catch (error) {
      return signal?.aborted
        ? { ok: false, error: { code: 'cancelled', message: 'The request was cancelled.' } }
        : { ok: false, error: operationError(error) };
    }
  };
}

export function installSlackRpc(
  ctx: RpcContext | null | undefined,
  controller: SlackControllerLike | null | undefined,
  authority?: unknown,
) {
  if (!ctx?.connection?.rpc || typeof ctx.connection.rpc.handle !== 'function') {
    throw new TypeError('DSH Host Connection RPC is required');
  }
  return ctx.connection.rpc.handle(
    SLACK_RPC_CHANNEL,
    createSlackRpcHandler(controller),
    { authority: resolveRpcAuthority(authority) },
  );
}
