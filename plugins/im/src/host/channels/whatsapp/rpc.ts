import QRCode from 'qrcode';

import { publicConnectionTestResult } from '../../../channels/shared/connection-test.ts';
import { normalizeWhatsappAccessPolicy } from '../../../channels/whatsapp/config-store.ts';
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

export const WHATSAPP_RPC_CHANNEL = '/whatsapp';
export const WHATSAPP_ENDPOINTS = Object.freeze({
  status: 'connection.status',
  beginProvisioning: 'provision.begin',
  pollProvisioning: 'provision.poll',
  cancelProvisioning: 'provision.cancel',
  reconnectBot: 'bot.reconnect',
  deleteBot: 'bot.delete',
  setAccessPolicy: 'bot.access-policy.set',
  setWorkspace: SET_WORKSPACE_ENDPOINT,
  setAgentPreset: SET_AGENT_PRESET_ENDPOINT,
  setInstruction: SET_BOT_INSTRUCTION_ENDPOINT,
  setDisplayName: SET_BOT_DISPLAY_NAME_ENDPOINT,
});
export const WHATSAPP_RPC_ENDPOINTS = Object.freeze(Object.values(WHATSAPP_ENDPOINTS));

const FORBIDDEN_PUBLIC_KEYS = new Set(['qrValue', 'accountJid', 'authDirectory']);

type EncodeQr = (value: string) => Promise<string>;
type WhatsappSnapshot = {
  bots?: Array<{ botId?: unknown; connected?: unknown } | null | undefined>;
  provisioning?: unknown;
};
type WhatsappControllerLike = {
  status: () => unknown;
  startProvisioning: () => unknown;
  registrationStatus: (attemptId: unknown) => unknown;
  cancelProvisioning: (attemptId: unknown) => unknown;
  reconnectBot: (botId: unknown) => unknown;
  deleteBot: (botId: unknown) => unknown;
  setAccessPolicy: (botId: unknown, policy: unknown) => unknown;
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

function payloadFailure(endpoint: unknown, payload: unknown) {
  if (!isRecord(payload)) return 'Payload must be an object.';
  if ([WHATSAPP_ENDPOINTS.status, WHATSAPP_ENDPOINTS.beginProvisioning].includes(endpoint as typeof WHATSAPP_ENDPOINTS.status)) {
    return exactKeys(payload, []) ? null : `${endpoint} does not accept fields.`;
  }
  if ([WHATSAPP_ENDPOINTS.pollProvisioning, WHATSAPP_ENDPOINTS.cancelProvisioning].includes(endpoint as typeof WHATSAPP_ENDPOINTS.pollProvisioning)) {
    return exactKeys(payload, ['attemptId']) && validId(payload.attemptId)
      ? null : `${endpoint} requires an attemptId.`;
  }
  if (endpoint === WHATSAPP_ENDPOINTS.reconnectBot) {
    return exactKeys(payload, ['botId', 'sendTest']) && validId(payload.botId)
      && (payload.sendTest === undefined || typeof payload.sendTest === 'boolean')
      ? null : 'bot.reconnect requires a botId and optional sendTest flag.';
  }
  if (endpoint === WHATSAPP_ENDPOINTS.deleteBot) {
    return exactKeys(payload, ['botId', 'confirm']) && validId(payload.botId)
      && payload.confirm === true ? null : 'bot.delete requires a botId and confirm=true.';
  }
  if (endpoint === WHATSAPP_ENDPOINTS.setAccessPolicy) {
    if (!exactKeys(payload, ['botId', 'accessMode', 'allowedNumbers'])
      || Object.keys(payload).length !== 3
      || !validId(payload.botId)) return '请输入有效的 WhatsApp 访问模式和电话号码。';
    try {
      normalizeWhatsappAccessPolicy(payload);
      return null;
    } catch {
      return '请输入有效的 WhatsApp 访问模式和电话号码。';
    }
  }
  if (endpoint === WHATSAPP_ENDPOINTS.setWorkspace) {
    return validWorkspacePayload(payload)
      ? null : '请选择一个已有项目。';
  }
  if (endpoint === WHATSAPP_ENDPOINTS.setAgentPreset) {
    return validAgentPresetPayload(payload)
      ? null : '请选择 Agent Preset。';
  }
  if (endpoint === WHATSAPP_ENDPOINTS.setInstruction) {
    return validBotInstructionPayload(payload)
      ? null : '请填写机器人职责。';
  }
  if (endpoint === WHATSAPP_ENDPOINTS.setDisplayName) {
    return validBotDisplayNamePayload(payload)
      ? null : '请填写机器人名称。';
  }
  return 'Unknown WhatsApp endpoint.';
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

async function encodeAttempt(value: unknown, encodeQr: EncodeQr) {
  if (!isRecord(value) || typeof value.qrValue !== 'string') return sanitizePublic(value);
  return sanitizePublic({ ...value, qrCodeDataUrl: await encodeQr(value.qrValue) });
}

async function publicStatus(value: unknown, encodeQr: EncodeQr) {
  const snapshot = structuredClone(value) as WhatsappSnapshot | null | undefined;
  if (snapshot?.provisioning) snapshot.provisioning = await encodeAttempt(snapshot.provisioning, encodeQr);
  return sanitizePublic(snapshot);
}

export function createWhatsappRpcHandler(
  controller: WhatsappControllerLike | null | undefined,
  { encodeQr = qrDataUrl }: RpcOptions = {},
) {
  for (const method of ['status', 'startProvisioning', 'registrationStatus', 'cancelProvisioning', 'reconnectBot', 'deleteBot', 'setAccessPolicy'] as const) {
    if (typeof controller?.[method] !== 'function') {
      throw new TypeError(`A complete WhatsApp controller is required (${method})`);
    }
  }
  const whatsappController = controller as WhatsappControllerLike;
  const qrCache = new Map<string, Promise<string>>();
  const cachedEncode = (value: string) => {
    let encoded = qrCache.get(value);
    if (!encoded) {
      if (qrCache.size >= 16) qrCache.delete(qrCache.keys().next().value as string);
      encoded = Promise.resolve().then(() => encodeQr(value));
      qrCache.set(value, encoded);
    }
    return encoded;
  };
  return async (endpoint: unknown, payload: unknown, signal?: AbortSignal | null) => {
    if (signal?.aborted) return { ok: false, error: { code: 'cancelled', message: 'The request was cancelled.' } };
    if (!(WHATSAPP_RPC_ENDPOINTS as readonly string[]).includes(endpoint as string)) {
      return { ok: false, error: { code: 'bad-request', message: 'Unknown WhatsApp endpoint.' } };
    }
    const invalid = payloadFailure(endpoint, payload);
    if (invalid) {
      const code = endpoint === WHATSAPP_ENDPOINTS.setWorkspace ? 'invalid-payload' : 'bad-request';
      return { ok: false, error: { code, message: invalid } };
    }
    const body = payload as Record<string, unknown>;
    try {
      let value: unknown;
      if (endpoint === WHATSAPP_ENDPOINTS.status) {
        value = await publicStatus(await whatsappController.status(), cachedEncode);
      } else if (endpoint === WHATSAPP_ENDPOINTS.beginProvisioning) {
        value = await encodeAttempt(await whatsappController.startProvisioning(), cachedEncode);
      } else if (endpoint === WHATSAPP_ENDPOINTS.pollProvisioning) {
        const attempt = await whatsappController.registrationStatus(body.attemptId);
        if (!attempt) return { ok: false, error: { code: 'bad-request', message: 'The provisioning attempt no longer exists.' } };
        value = await encodeAttempt(attempt, cachedEncode);
      } else if (endpoint === WHATSAPP_ENDPOINTS.cancelProvisioning) {
        value = sanitizePublic(await whatsappController.cancelProvisioning(body.attemptId));
      } else if (endpoint === WHATSAPP_ENDPOINTS.reconnectBot) {
        const checked = await whatsappController.reconnectBot(body.botId) as WhatsappSnapshot | null | undefined;
        if (signal?.aborted) {
          return { ok: false, error: { code: 'cancelled', message: 'The request was cancelled.' } };
        }
        value = await publicStatus(checked, cachedEncode);
        if (body.sendTest === true) {
          let testError: unknown = null;
          const connected = checked?.bots?.some(
            (bot) => bot?.botId === body.botId && bot?.connected === true,
          ) === true;
          if (connected) {
            try {
              if (typeof whatsappController.sendConnectionTest !== 'function') {
                const unavailable = new Error('Connection test is unavailable') as Error & { code: string };
                unavailable.code = 'test-target-unavailable';
                throw unavailable;
              }
              await whatsappController.sendConnectionTest(body.botId);
            } catch (error) {
              testError = error;
            }
          } else {
            testError = new Error('WhatsApp bot is not connected') as Error & { code: string };
            (testError as Error & { code: string }).code = 'test-target-unavailable';
          }
          value = { ...(value as object), testMessage: publicConnectionTestResult(testError) };
        }
      } else if (endpoint === WHATSAPP_ENDPOINTS.setWorkspace) {
        if (typeof whatsappController.updateWorkspace !== 'function') throw new Error('Workspace update is unavailable');
        value = await publicStatus(
          await whatsappController.updateWorkspace(body.botId, body.workspaceId),
          cachedEncode,
        );
      } else if (endpoint === WHATSAPP_ENDPOINTS.setAgentPreset) {
        if (typeof whatsappController.updateAgentPreset !== 'function') throw new Error('Agent Preset update is unavailable');
        value = await publicStatus(
          await whatsappController.updateAgentPreset(body.botId, body.agentPreset),
          cachedEncode,
        );
      } else if (endpoint === WHATSAPP_ENDPOINTS.setInstruction) {
        if (typeof whatsappController.updateInstruction !== 'function') throw new Error('Bot instruction update is unavailable');
        value = await publicStatus(
          await whatsappController.updateInstruction(body.botId, body.instruction),
          cachedEncode,
        );
      } else if (endpoint === WHATSAPP_ENDPOINTS.setDisplayName) {
        if (typeof whatsappController.updateDisplayName !== 'function') throw new Error('Bot display name update is unavailable');
        value = await publicStatus(
          await whatsappController.updateDisplayName(body.botId, body.name),
          cachedEncode,
        );
      } else if (endpoint === WHATSAPP_ENDPOINTS.setAccessPolicy) {
        value = await publicStatus(
          await whatsappController.setAccessPolicy(body.botId, normalizeWhatsappAccessPolicy(payload)),
          cachedEncode,
        );
      } else {
        value = await publicStatus(await whatsappController.deleteBot(body.botId), cachedEncode);
      }
      return signal?.aborted
        ? { ok: false, error: { code: 'cancelled', message: 'The request was cancelled.' } }
        : { ok: true, value };
    } catch (error) {
      const mapped = publicWorkspaceError(error)
        ?? publicAgentPresetError(error)
        ?? publicBotInstructionError(error)
        ?? publicBotDisplayNameError(error);
      return signal?.aborted
        ? { ok: false, error: { code: 'cancelled', message: 'The request was cancelled.' } }
        : { ok: false, error: mapped
          ?? { code: 'whatsapp-operation-failed', message: 'WhatsApp 操作失败，请稍后重试。' } };
    }
  };
}

export function installWhatsappRpc(
  ctx: RpcContext | null | undefined,
  controller: unknown,
  options?: unknown,
  authority?: unknown,
) {
  if (!ctx?.connection?.rpc || typeof ctx.connection.rpc.handle !== 'function') {
    throw new TypeError('DSH Host Connection RPC is required');
  }
  return ctx.connection.rpc.handle(
    WHATSAPP_RPC_CHANNEL,
    createWhatsappRpcHandler(controller as WhatsappControllerLike, options as RpcOptions | undefined),
    { authority: resolveRpcAuthority(authority) },
  );
}
