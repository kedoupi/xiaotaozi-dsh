// @ts-nocheck
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

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, allowed) {
  return isRecord(value) && Object.keys(value).every((key) => allowed.includes(key));
}

function validId(value) {
  return typeof value === 'string' && /^slack_[a-f0-9]{24}$/.test(value);
}

function validBotToken(value) {
  return typeof value === 'string' && /^xoxb-[A-Za-z0-9-]{16,}$/.test(value.trim())
    && value.length <= 4_096;
}

function validAppToken(value) {
  return typeof value === 'string' && /^xapp-[A-Za-z0-9-]{16,}$/.test(value.trim())
    && value.length <= 4_096;
}

function payloadFailure(endpoint, payload) {
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

function sanitizePublic(value) {
  if (Array.isArray(value)) return value.map(sanitizePublic);
  if (!isRecord(value)) return value;
  const safe = {};
  for (const [key, child] of Object.entries(value)) {
    if (!FORBIDDEN_PUBLIC_KEYS.has(key)) safe[key] = sanitizePublic(child);
  }
  return safe;
}

function operationError(error) {
  const workspaceError = publicWorkspaceError(error);
  if (workspaceError) return workspaceError;
  const instructionError = publicBotInstructionError(error);
  if (instructionError) return instructionError;
  const displayNameError = publicBotDisplayNameError(error);
  if (displayNameError) return displayNameError;
  if (error?.code === 'slack-invalid-bot-token') {
    return { code: 'invalid-bot-token', message: 'Slack Bot Token 无效，请确认使用以 xoxb- 开头的令牌。' };
  }
  if (error?.code === 'slack-invalid-app-token') {
    return { code: 'invalid-app-token', message: 'Slack App Token 无效，请确认使用以 xapp- 开头的令牌。' };
  }
  if (error?.code === 'slack-missing-scope') {
    return { code: 'missing-scope', message: 'Slack 应用权限不完整，请重新导入 Manifest 并安装到工作区。' };
  }
  if (error?.code === 'slack-socket-mode') {
    return { code: 'socket-mode-unavailable', message: error.message };
  }
  return { code: 'slack-operation-failed', message: 'Slack 操作失败，请稍后重试。' };
}

export function createSlackRpcHandler(controller) {
  for (const method of ['status', 'bindCredentials', 'reconnectBot', 'deleteBot']) {
    if (typeof controller?.[method] !== 'function') {
      throw new TypeError(`A complete Slack controller is required (${method})`);
    }
  }
  return async (endpoint, payload, signal) => {
    if (signal?.aborted) {
      return { ok: false, error: { code: 'cancelled', message: 'The request was cancelled.' } };
    }
    if (!SLACK_RPC_ENDPOINTS.includes(endpoint)) {
      return { ok: false, error: { code: 'bad-request', message: 'Unknown Slack endpoint.' } };
    }
    const invalid = payloadFailure(endpoint, payload);
    if (invalid) {
      const code = endpoint === SLACK_ENDPOINTS.setWorkspace ? 'invalid-payload' : 'bad-request';
      return { ok: false, error: { code, message: invalid } };
    }
    try {
      let value;
      if (endpoint === SLACK_ENDPOINTS.status) value = await controller.status();
      else if (endpoint === SLACK_ENDPOINTS.bindCredentials) value = await controller.bindCredentials(payload);
      else if (endpoint === SLACK_ENDPOINTS.reconnectBot) {
        value = await controller.reconnectBot(payload.botId);
        if (signal?.aborted) {
          return { ok: false, error: { code: 'cancelled', message: 'The request was cancelled.' } };
        }
        if (payload.sendTest === true) {
          let testError = null;
          try {
            if (value?.bots?.find((bot) => bot?.botId === payload.botId)?.connected !== true) {
              const unavailable = new Error('Bot is not connected');
              unavailable.code = 'test-target-unavailable';
              throw unavailable;
            }
            if (typeof controller.sendConnectionTest !== 'function') {
              const unavailable = new Error('Connection test is unavailable');
              unavailable.code = 'test-target-unavailable';
              throw unavailable;
            }
            await controller.sendConnectionTest(payload.botId);
          } catch (error) {
            testError = error;
          }
          value = { ...value, testMessage: publicConnectionTestResult(testError) };
        }
      }
      else if (endpoint === SLACK_ENDPOINTS.setWorkspace) {
        if (typeof controller.updateWorkspace !== 'function') throw new Error('Workspace update is unavailable');
        value = await controller.updateWorkspace(payload.botId, payload.workspaceId);
      }
      else if (endpoint === SLACK_ENDPOINTS.setAgentPreset) {
        if (typeof controller.updateAgentPreset !== 'function') throw new Error('Agent Preset update is unavailable');
        value = await controller.updateAgentPreset(payload.botId, payload.agentPreset);
      }
      else if (endpoint === SLACK_ENDPOINTS.setInstruction) {
        if (typeof controller.updateInstruction !== 'function') throw new Error('Bot instruction update is unavailable');
        value = await controller.updateInstruction(payload.botId, payload.instruction);
      }
      else if (endpoint === SLACK_ENDPOINTS.setDisplayName) {
        if (typeof controller.updateDisplayName !== 'function') throw new Error('Bot display name update is unavailable');
        value = await controller.updateDisplayName(payload.botId, payload.name);
      }
      else value = await controller.deleteBot(payload.botId);
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

export function installSlackRpc(ctx, controller, authority) {
  if (!ctx?.connection?.rpc || typeof ctx.connection.rpc.handle !== 'function') {
    throw new TypeError('DSH Host Connection RPC is required');
  }
  return ctx.connection.rpc.handle(
    SLACK_RPC_CHANNEL,
    createSlackRpcHandler(controller),
    { authority: resolveRpcAuthority(authority) },
  );
}
