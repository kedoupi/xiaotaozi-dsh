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

export const DINGTALK_RPC_CHANNEL = '/dingtalk';
export const DINGTALK_ENDPOINTS = Object.freeze({
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
  approveSender: 'bot.sender.approve',
  revokeSender: 'bot.sender.revoke',
});
export const DINGTALK_RPC_ENDPOINTS = Object.freeze(Object.values(DINGTALK_ENDPOINTS));

const FORBIDDEN_PUBLIC_KEYS = new Set([
  'clientSecret',
  'client_secret',
  'deviceCode',
  'device_code',
  'secretRef',
  'staffId',
  'senderStaffId',
  'verificationUrl',
  'verificationUri',
  'userCode',
]);

type EncodeQr = (value: string) => Promise<string>;
type DingtalkSnapshot = {
  bots?: Array<{ botId?: unknown; connected?: unknown } | null | undefined>;
  provisioning?: unknown;
  attemptId?: unknown;
};
type DingtalkControllerLike = {
  status: () => unknown;
  startProvisioning: (payload?: unknown) => unknown;
  registrationStatus: (attemptId: unknown) => unknown;
  cancelProvisioning: (attemptId: unknown) => unknown;
  bindCredentials: (payload: unknown) => unknown;
  reconnectBot: (botId: unknown) => unknown;
  deleteBot: (botId: unknown) => unknown;
  approveSender: (botId: unknown, requestId: unknown) => unknown;
  revokeSender: (botId: unknown, senderKey: unknown) => unknown;
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
  if (endpoint === DINGTALK_ENDPOINTS.status) {
    return exactKeys(payload, []) ? null : 'connection.status does not accept fields.';
  }
  if (endpoint === DINGTALK_ENDPOINTS.beginProvisioning) {
    return exactKeys(payload, ['locale']) && (payload.locale === undefined || payload.locale === 'zh-CN')
      ? null
      : 'provision.begin received unsupported fields.';
  }
  if ([DINGTALK_ENDPOINTS.pollProvisioning, DINGTALK_ENDPOINTS.cancelProvisioning].includes(endpoint as typeof DINGTALK_ENDPOINTS.pollProvisioning)) {
    return exactKeys(payload, ['attemptId']) && validId(payload.attemptId)
      ? null
      : `${endpoint} requires an attemptId.`;
  }
  if (endpoint === DINGTALK_ENDPOINTS.bindCredentials) {
    return exactKeys(payload, ['clientId', 'clientSecret'])
      && validCredential(payload.clientId, 256)
      && validCredential(payload.clientSecret, 1024)
      ? null
      : 'bot.bind-credentials requires Client ID and Client Secret.';
  }
  if (endpoint === DINGTALK_ENDPOINTS.reconnectBot) {
    return exactKeys(payload, ['botId', 'sendTest'])
      && validId(payload.botId)
      && (payload.sendTest === undefined || payload.sendTest === true)
      ? null
      : 'bot.reconnect requires a botId and optional sendTest=true.';
  }
  if (endpoint === DINGTALK_ENDPOINTS.deleteBot) {
    return exactKeys(payload, ['botId', 'confirm']) && validId(payload.botId) && payload.confirm === true
      ? null
      : 'bot.delete requires a botId and confirm=true.';
  }
  if (endpoint === DINGTALK_ENDPOINTS.setWorkspace) {
    return validWorkspacePayload(payload)
      ? null : '请选择一个已有项目。';
  }
  if (endpoint === DINGTALK_ENDPOINTS.setAgentPreset) {
    return validAgentPresetPayload(payload)
      ? null : '请选择 Agent Preset。';
  }
  if (endpoint === DINGTALK_ENDPOINTS.setInstruction) {
    return validBotInstructionPayload(payload)
      ? null : '请填写机器人职责。';
  }
  if (endpoint === DINGTALK_ENDPOINTS.setDisplayName) {
    return validBotDisplayNamePayload(payload)
      ? null : '请填写机器人名称。';
  }
  if (endpoint === DINGTALK_ENDPOINTS.approveSender) {
    return exactKeys(payload, ['botId', 'requestId', 'confirm'])
      && validId(payload.botId)
      && validId(payload.requestId)
      && payload.confirm === true
      ? null
      : 'bot.sender.approve requires botId, requestId, and confirm=true.';
  }
  if (endpoint === DINGTALK_ENDPOINTS.revokeSender) {
    return exactKeys(payload, ['botId', 'senderKey', 'confirm'])
      && validId(payload.botId)
      && validId(payload.senderKey)
      && payload.confirm === true
      ? null
      : 'bot.sender.revoke requires botId, senderKey, and confirm=true.';
  }
  return 'Unknown DingTalk endpoint.';
}

function badRequest(message: string) {
  return { ok: false, error: { code: 'bad-request', message } };
}

function cancelled() {
  return { ok: false, error: { code: 'cancelled', message: 'The request was cancelled.' } };
}

function internalFailure() {
  return {
    ok: false,
    error: { code: 'dingtalk-operation-failed', message: '钉钉操作失败，请稍后重试。' },
  };
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
    type: 'image/png',
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 320,
  });
}

async function withEncodedQr(value: unknown, encodeQr: EncodeQr) {
  if (!isRecord(value) || typeof value.verificationUrl !== 'string') return sanitizePublic(value);
  return sanitizePublic({
    ...value,
    qrCodeDataUrl: await encodeQr(value.verificationUrl),
  });
}

async function publicStatus(status: unknown, encodeQr: EncodeQr) {
  const value = structuredClone(status) as DingtalkSnapshot | null | undefined;
  if (value?.provisioning) {
    value.provisioning = await withEncodedQr(value.provisioning, encodeQr);
  }
  return sanitizePublic(value);
}

function assertController(controller: DingtalkControllerLike | null | undefined) {
  for (const method of [
    'status',
    'startProvisioning',
    'registrationStatus',
    'cancelProvisioning',
    'bindCredentials',
    'reconnectBot',
    'deleteBot',
    'approveSender',
    'revokeSender',
  ] as const) {
    if (typeof controller?.[method] !== 'function') {
      throw new TypeError(`A complete DingTalk controller is required (${method})`);
    }
  }
}

export function createDingtalkRpcHandler(
  controller: DingtalkControllerLike | null | undefined,
  { encodeQr = qrDataUrl }: RpcOptions = {},
) {
  assertController(controller);
  const dingtalkController = controller as DingtalkControllerLike;
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
    if (signal?.aborted) return cancelled();
    if (!(DINGTALK_RPC_ENDPOINTS as readonly string[]).includes(endpoint as string)) {
      return badRequest('Unknown DingTalk endpoint.');
    }
    const invalid = payloadFailure(endpoint, payload);
    if (invalid) {
      return endpoint === DINGTALK_ENDPOINTS.setWorkspace
        ? { ok: false, error: { code: 'invalid-payload', message: invalid } }
        : badRequest(invalid);
    }
    const body = payload as Record<string, unknown>;

    try {
      let value: unknown;
      if (endpoint === DINGTALK_ENDPOINTS.status) {
        value = await publicStatus(await dingtalkController.status(), cachedEncode);
      } else if (endpoint === DINGTALK_ENDPOINTS.beginProvisioning) {
        const started = await dingtalkController.startProvisioning({ signal }) as DingtalkSnapshot;
        if (signal?.aborted) {
          await dingtalkController.cancelProvisioning(started.attemptId);
          return cancelled();
        }
        value = await withEncodedQr(started, cachedEncode);
      } else if (endpoint === DINGTALK_ENDPOINTS.pollProvisioning) {
        const current = await dingtalkController.registrationStatus(body.attemptId);
        if (!current) return badRequest('The provisioning attempt no longer exists.');
        value = await withEncodedQr(current, cachedEncode);
      } else if (endpoint === DINGTALK_ENDPOINTS.cancelProvisioning) {
        value = await dingtalkController.cancelProvisioning(body.attemptId);
        if (!value) return badRequest('The provisioning attempt no longer exists.');
        value = sanitizePublic(value);
      } else if (endpoint === DINGTALK_ENDPOINTS.bindCredentials) {
        value = await publicStatus(await dingtalkController.bindCredentials(payload), cachedEncode);
      } else if (endpoint === DINGTALK_ENDPOINTS.reconnectBot) {
        const snapshot = await dingtalkController.reconnectBot(body.botId) as DingtalkSnapshot | null | undefined;
        if (signal?.aborted) return cancelled();
        let testMessage;
        if (body.sendTest === true) {
          const connected = snapshot?.bots?.some(
            (bot) => bot?.botId === body.botId && bot?.connected === true,
          );
          if (!connected || typeof dingtalkController.sendConnectionTest !== 'function') {
            testMessage = publicConnectionTestResult(
              connectionTestTargetUnavailable('钉钉机器人'),
            );
          } else {
            try {
              await dingtalkController.sendConnectionTest(body.botId);
              testMessage = publicConnectionTestResult();
            } catch (error) {
              testMessage = publicConnectionTestResult(error);
            }
          }
        }
        value = await publicStatus({ ...snapshot, ...(testMessage ? { testMessage } : {}) }, cachedEncode);
      } else if (endpoint === DINGTALK_ENDPOINTS.deleteBot) {
        value = await publicStatus(await dingtalkController.deleteBot(body.botId), cachedEncode);
      } else if (endpoint === DINGTALK_ENDPOINTS.setWorkspace) {
        if (typeof dingtalkController.updateWorkspace !== 'function') throw new Error('Workspace update is unavailable');
        value = await publicStatus(
          await dingtalkController.updateWorkspace(body.botId, body.workspaceId),
          cachedEncode,
        );
      } else if (endpoint === DINGTALK_ENDPOINTS.setAgentPreset) {
        if (typeof dingtalkController.updateAgentPreset !== 'function') throw new Error('Agent Preset update is unavailable');
        value = await publicStatus(
          await dingtalkController.updateAgentPreset(body.botId, body.agentPreset),
          cachedEncode,
        );
      } else if (endpoint === DINGTALK_ENDPOINTS.setInstruction) {
        if (typeof dingtalkController.updateInstruction !== 'function') throw new Error('Bot instruction update is unavailable');
        value = await publicStatus(
          await dingtalkController.updateInstruction(body.botId, body.instruction),
          cachedEncode,
        );
      } else if (endpoint === DINGTALK_ENDPOINTS.setDisplayName) {
        if (typeof dingtalkController.updateDisplayName !== 'function') throw new Error('Bot display name update is unavailable');
        value = await publicStatus(
          await dingtalkController.updateDisplayName(body.botId, body.name),
          cachedEncode,
        );
      } else if (endpoint === DINGTALK_ENDPOINTS.approveSender) {
        value = await publicStatus(
          await dingtalkController.approveSender(body.botId, body.requestId),
          cachedEncode,
        );
      } else {
        value = await publicStatus(
          await dingtalkController.revokeSender(body.botId, body.senderKey),
          cachedEncode,
        );
      }
      return signal?.aborted ? cancelled() : { ok: true, value };
    } catch (error) {
      const workspaceError = publicWorkspaceError(error);
      const instructionError = publicBotInstructionError(error);
      const displayNameError = publicBotDisplayNameError(error);
      return signal?.aborted ? cancelled() : workspaceError
        ? { ok: false, error: workspaceError }
        : instructionError
          ? { ok: false, error: instructionError }
        : displayNameError
          ? { ok: false, error: displayNameError }
        : internalFailure();
    }
  };
}

export function installDingtalkRpc(
  ctx: RpcContext | null | undefined,
  controller: unknown,
  options?: unknown,
  authority?: unknown,
) {
  if (!ctx?.connection?.rpc || typeof ctx.connection.rpc.handle !== 'function') {
    throw new TypeError('DSH Host Connection RPC is required');
  }
  return ctx.connection.rpc.handle(
    DINGTALK_RPC_CHANNEL,
    createDingtalkRpcHandler(controller as DingtalkControllerLike, options as RpcOptions | undefined),
    { authority: resolveRpcAuthority(authority) },
  );
}
