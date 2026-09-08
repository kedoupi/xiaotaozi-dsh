import QRCode from 'qrcode';
import { resolveRpcAuthority } from '../../../rpc-authority.ts';
import { publicWorkspaceError, SET_WORKSPACE_ENDPOINT, validWorkspacePayload } from '../shared/workspace-rpc.ts';
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
import {
  connectionTestTargetUnavailable,
  publicConnectionTestResult,
} from '../../../channels/shared/connection-test.ts';

export const WECOM_RPC_CHANNEL = '/wecom';
export const WECOM_ENDPOINTS = Object.freeze({
  status: 'connection.status',
  beginProvisioning: 'provision.begin',
  pollProvisioning: 'provision.poll',
  cancelProvisioning: 'provision.cancel',
  bindCredentials: 'bot.bind-credentials',
  reconnectBot: 'bot.reconnect',
  deleteBot: 'bot.delete',
  setWorkspace: SET_WORKSPACE_ENDPOINT,
  setAgentPreset: SET_AGENT_PRESET_ENDPOINT,
  setInstruction: SET_BOT_INSTRUCTION_ENDPOINT,
  setDisplayName: SET_BOT_DISPLAY_NAME_ENDPOINT,
});
export const WECOM_RPC_ENDPOINTS = Object.freeze(Object.values(WECOM_ENDPOINTS));

const FORBIDDEN_PUBLIC_KEYS = new Set([
  'secret', 'secretRef', 'scode', 'remoteBotId', 'verificationUrl', 'bot_info', 'botid',
]);

type EncodeQr = (value: string) => Promise<string>;
type WecomSnapshot = {
  bots?: Array<{ botId?: unknown; connected?: unknown } | null | undefined>;
  provisioning?: unknown;
};
type WecomControllerLike = {
  status: () => unknown;
  startProvisioning: () => unknown;
  registrationStatus: (attemptId: unknown) => unknown;
  cancelProvisioning: (attemptId: unknown) => unknown;
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
type RpcOptions = { encodeQr?: EncodeQr };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: unknown, allowed: string[]) {
  return isRecord(value) && Object.keys(value).every((key) => allowed.includes(key));
}

function validId(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function validCredential(value: unknown, maxLength: number) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function payloadFailure(endpoint: unknown, payload: unknown) {
  if (!isRecord(payload)) return 'Payload must be an object.';
  if (endpoint === WECOM_ENDPOINTS.status) return exactKeys(payload, []) ? null : 'connection.status does not accept fields.';
  if (endpoint === WECOM_ENDPOINTS.beginProvisioning) {
    return exactKeys(payload, ['locale']) && (payload.locale === undefined || payload.locale === 'zh-CN')
      ? null : 'provision.begin received unsupported fields.';
  }
  if ([WECOM_ENDPOINTS.pollProvisioning, WECOM_ENDPOINTS.cancelProvisioning].includes(endpoint as typeof WECOM_ENDPOINTS.pollProvisioning)) {
    return exactKeys(payload, ['attemptId']) && validId(payload.attemptId)
      ? null : `${endpoint} requires an attemptId.`;
  }
  if (endpoint === WECOM_ENDPOINTS.bindCredentials) {
    return exactKeys(payload, ['botId', 'secret'])
      && validCredential(payload.botId, 512)
      && validCredential(payload.secret, 1024)
      ? null : 'bot.bind-credentials requires Bot ID and Secret.';
  }
  if (endpoint === WECOM_ENDPOINTS.reconnectBot) {
    return exactKeys(payload, ['botId', 'sendTest'])
      && validId(payload.botId)
      && (payload.sendTest === undefined || payload.sendTest === true)
      ? null : 'bot.reconnect requires a botId and optional sendTest=true.';
  }
  if (endpoint === WECOM_ENDPOINTS.deleteBot) {
    return exactKeys(payload, ['botId', 'confirm']) && validId(payload.botId) && payload.confirm === true
      ? null : 'bot.delete requires a botId and confirm=true.';
  }
  if (endpoint === WECOM_ENDPOINTS.setWorkspace) {
    return validWorkspacePayload(payload)
      ? null : '请选择一个已有项目。';
  }
  if (endpoint === WECOM_ENDPOINTS.setAgentPreset) {
    return validAgentPresetPayload(payload)
      ? null : '请选择 Agent Preset。';
  }
  if (endpoint === WECOM_ENDPOINTS.setInstruction) {
    return validBotInstructionPayload(payload)
      ? null : '请填写机器人职责。';
  }
  if (endpoint === WECOM_ENDPOINTS.setDisplayName) {
    return validBotDisplayNamePayload(payload)
      ? null : '请填写机器人名称。';
  }
  return 'Unknown Enterprise WeChat endpoint.';
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

async function qrDataUrl(value: string) {
  return QRCode.toDataURL(value, {
    type: 'image/png', errorCorrectionLevel: 'M', margin: 2, width: 320,
  });
}

async function withEncodedQr(value: unknown, encodeQr: EncodeQr) {
  if (!isRecord(value) || typeof value.verificationUrl !== 'string') return sanitizePublic(value);
  return sanitizePublic({ ...value, qrCodeDataUrl: await encodeQr(value.verificationUrl) });
}

async function publicStatus(status: unknown, encodeQr: EncodeQr) {
  const value = structuredClone(status) as WecomSnapshot | null | undefined;
  if (value?.provisioning) value.provisioning = await withEncodedQr(value.provisioning, encodeQr);
  return sanitizePublic(value);
}

export function createWecomRpcHandler(
  controller: WecomControllerLike | null | undefined,
  { encodeQr = qrDataUrl }: RpcOptions = {},
) {
  for (const method of ['status', 'startProvisioning', 'registrationStatus', 'cancelProvisioning', 'bindCredentials', 'reconnectBot', 'deleteBot'] as const) {
    if (typeof controller?.[method] !== 'function') {
      throw new TypeError(`A complete Enterprise WeChat controller is required (${method})`);
    }
  }
  const wecomController = controller as WecomControllerLike;
  const qrCache = new Map<string, Promise<string>>();
  const cachedEncode = (url: string) => {
    let encoded = qrCache.get(url);
    if (!encoded) {
      if (qrCache.size >= 16) qrCache.delete(qrCache.keys().next().value as string);
      encoded = Promise.resolve().then(() => encodeQr(url));
      qrCache.set(url, encoded);
    }
    return encoded;
  };
  return async (endpoint: unknown, payload: unknown, signal?: AbortSignal | null) => {
    if (signal?.aborted) return { ok: false, error: { code: 'cancelled', message: 'The request was cancelled.' } };
    if (!(WECOM_RPC_ENDPOINTS as readonly string[]).includes(endpoint as string)) {
      return { ok: false, error: { code: 'bad-request', message: 'Unknown Enterprise WeChat endpoint.' } };
    }
    const invalid = payloadFailure(endpoint, payload);
    if (invalid) {
      const code = endpoint === WECOM_ENDPOINTS.setWorkspace ? 'invalid-payload' : 'bad-request';
      return { ok: false, error: { code, message: invalid } };
    }
    const body = payload as Record<string, unknown>;
    try {
      let value: unknown;
      if (endpoint === WECOM_ENDPOINTS.status) value = await publicStatus(await wecomController.status(), cachedEncode);
      else if (endpoint === WECOM_ENDPOINTS.beginProvisioning) {
        value = await withEncodedQr(await wecomController.startProvisioning(), cachedEncode);
      } else if (endpoint === WECOM_ENDPOINTS.pollProvisioning) {
        const current = await wecomController.registrationStatus(body.attemptId);
        if (!current) return { ok: false, error: { code: 'bad-request', message: 'The provisioning attempt no longer exists.' } };
        value = await withEncodedQr(current, cachedEncode);
      } else if (endpoint === WECOM_ENDPOINTS.cancelProvisioning) {
        value = sanitizePublic(await wecomController.cancelProvisioning(body.attemptId));
      } else if (endpoint === WECOM_ENDPOINTS.bindCredentials) {
        value = await publicStatus(await wecomController.bindCredentials(payload), cachedEncode);
      } else if (endpoint === WECOM_ENDPOINTS.reconnectBot) {
        const snapshot = await wecomController.reconnectBot(body.botId) as WecomSnapshot | null | undefined;
        if (signal?.aborted) {
          return { ok: false, error: { code: 'cancelled', message: 'The request was cancelled.' } };
        }
        let testMessage;
        if (body.sendTest === true) {
          const connected = snapshot?.bots?.some(
            (bot) => bot?.botId === body.botId && bot?.connected === true,
          );
          if (!connected || typeof wecomController.sendConnectionTest !== 'function') {
            testMessage = publicConnectionTestResult(
              connectionTestTargetUnavailable('企业微信机器人'),
            );
          } else {
            try {
              await wecomController.sendConnectionTest(body.botId);
              testMessage = publicConnectionTestResult();
            } catch (error) {
              testMessage = publicConnectionTestResult(error);
            }
          }
        }
        value = await publicStatus({ ...snapshot, ...(testMessage ? { testMessage } : {}) }, cachedEncode);
      } else if (endpoint === WECOM_ENDPOINTS.setWorkspace) {
        if (typeof wecomController.updateWorkspace !== 'function') throw new Error('Workspace update is unavailable');
        value = await publicStatus(
          await wecomController.updateWorkspace(body.botId, body.workspaceId),
          cachedEncode,
        );
      } else if (endpoint === WECOM_ENDPOINTS.setAgentPreset) {
        if (typeof wecomController.updateAgentPreset !== 'function') throw new Error('Agent Preset update is unavailable');
        value = await publicStatus(
          await wecomController.updateAgentPreset(body.botId, body.agentPreset),
          cachedEncode,
        );
      } else if (endpoint === WECOM_ENDPOINTS.setInstruction) {
        if (typeof wecomController.updateInstruction !== 'function') throw new Error('Bot instruction update is unavailable');
        value = await publicStatus(
          await wecomController.updateInstruction(body.botId, body.instruction),
          cachedEncode,
        );
      } else if (endpoint === WECOM_ENDPOINTS.setDisplayName) {
        if (typeof wecomController.updateDisplayName !== 'function') throw new Error('Bot display name update is unavailable');
        value = await publicStatus(
          await wecomController.updateDisplayName(body.botId, body.name),
          cachedEncode,
        );
      } else {
        value = await publicStatus(await wecomController.deleteBot(body.botId), cachedEncode);
      }
      return signal?.aborted
        ? { ok: false, error: { code: 'cancelled', message: 'The request was cancelled.' } }
        : { ok: true, value };
    } catch (error) {
      const workspaceError = publicWorkspaceError(error);
      const instructionError = publicBotInstructionError(error);
      const displayNameError = publicBotDisplayNameError(error);
      return signal?.aborted
        ? { ok: false, error: { code: 'cancelled', message: 'The request was cancelled.' } }
        : { ok: false, error: workspaceError
          ?? instructionError
          ?? displayNameError
          ?? { code: 'wecom-operation-failed', message: '企业微信操作失败，请稍后重试。' } };
    }
  };
}

export function installWecomRpc(
  ctx: RpcContext | null | undefined,
  controller: unknown,
  options?: unknown,
  authority?: unknown,
) {
  if (!ctx?.connection?.rpc || typeof ctx.connection.rpc.handle !== 'function') {
    throw new TypeError('DSH Host Connection RPC is required');
  }
  return ctx.connection.rpc.handle(
    WECOM_RPC_CHANNEL,
    createWecomRpcHandler(controller as WecomControllerLike, options as RpcOptions | undefined),
    { authority: resolveRpcAuthority(authority) },
  );
}
