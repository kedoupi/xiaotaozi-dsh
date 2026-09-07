/**
 * Browser-safe contract for the Feishu Host plugin.
 *
 * The Host owns app registration and credentials. This module deliberately
 * models only redacted presentation data; app secrets and credential refs
 * must never be returned by any endpoint on this channel.
 */

import { normalizeAgentPresetCatalog, normalizeAgentPresetId } from "../../agent-preset.ts";
import { SET_BOT_INSTRUCTION_ENDPOINT, displayBotInstruction } from "../../bot-instruction.ts";
import { SET_BOT_DISPLAY_NAME_ENDPOINT } from "../../bot-display-name.ts";
import { normalizeLastMessageError } from "../../last-message-error.ts";

export const FEISHU_RPC_CHANNEL = "/feishu";

export const FEISHU_ENDPOINTS = Object.freeze({
  status: "connection.status",
  beginProvisioning: "provision.begin",
  beginCallbackRepair: "bot.callback-repair.begin",
  beginGroupMessagePermission: "bot.group-message-permission.begin",
  pollProvisioning: "provision.poll",
  cancelProvisioning: "provision.cancel",
  bindCredentials: "bot.bind-credentials",
  reconnectBot: "bot.reconnect",
  disconnectBot: "bot.disconnect",
  deleteBot: "bot.delete",
  setWorkspace: "bot.workspace.set",
  setAgentPreset: "bot.preset.set",
  setInstruction: SET_BOT_INSTRUCTION_ENDPOINT,
  setDisplayName: SET_BOT_DISPLAY_NAME_ENDPOINT,
  setGroupResponseMode: "bot.group-response-mode.set",
  // Kept for rolling upgrades. The multi-bot UI never calls these endpoints.
  testConnection: "connection.test",
  disconnect: "connection.disconnect",
});

export const FEISHU_REGISTRATION_OPERATIONS = Object.freeze({
  PROVISION: "provision",
  CALLBACK_REPAIR: "callback_repair",
  GROUP_MESSAGE_PERMISSION: "group_message_permission",
});

const CONNECTION_STATES = new Set([
  "disconnected",
  "offline",
  "provisioning",
  "connecting",
  "reconnecting",
  "connected",
  "error",
]);

const POLL_STATES = new Set([
  "pending",
  "scanned",
  "connecting",
  "connected",
  "expired",
  "failed",
]);

const HEALTH_STATUSES = ["healthy", "degraded", "offline", "checking"];

type CodedError = Error & { code: string };

type RegistrationOperation = (typeof FEISHU_REGISTRATION_OPERATIONS)[keyof typeof FEISHU_REGISTRATION_OPERATIONS];

type FeishuRpcInvoke = (
  endpoint: string,
  payload?: Record<string, unknown>,
  signal?: unknown,
) => unknown | Promise<unknown>;

type Provisioning = {
  attemptId: string;
  operation: RegistrationOperation;
  botId?: string;
  verificationUrl?: string;
  qrCodeDataUrl?: string;
  submitted: boolean;
  expiresAt: number;
  pollIntervalMs: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function optionalTimestamp(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length > 0) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

export function normalizeGroupResponseMode(value: unknown) {
  return value === "all" ? "all" : "mention";
}

function clamp(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function normalizeRegistrationOperation(value: unknown): RegistrationOperation {
  if (value === FEISHU_REGISTRATION_OPERATIONS.CALLBACK_REPAIR) {
    return FEISHU_REGISTRATION_OPERATIONS.CALLBACK_REPAIR;
  }
  if (value === FEISHU_REGISTRATION_OPERATIONS.GROUP_MESSAGE_PERMISSION) {
    return FEISHU_REGISTRATION_OPERATIONS.GROUP_MESSAGE_PERMISSION;
  }
  return FEISHU_REGISTRATION_OPERATIONS.PROVISION;
}

function isTargetedAppUpdate(operation: unknown) {
  return operation === FEISHU_REGISTRATION_OPERATIONS.CALLBACK_REPAIR
    || operation === FEISHU_REGISTRATION_OPERATIONS.GROUP_MESSAGE_PERMISSION;
}

export function unwrapRpcResult(result: unknown) {
  if (!isRecord(result) || typeof result.ok !== "boolean") {
    throw new Error("飞书服务返回了无法识别的响应");
  }
  if (!result.ok) {
    const errorPayload = isRecord(result.error) ? result.error : undefined;
    const message = optionalString(errorPayload?.message) ?? "飞书服务请求失败";
    const error = new Error(message) as CodedError;
    error.code = optionalString(errorPayload?.code) ?? "FEISHU_RPC_ERROR";
    throw error;
  }
  return result.value;
}

export function normalizeProvisioning(value: unknown, now = Date.now()): Provisioning {
  const source = isRecord(value) && isRecord(value.provisioning) ? value.provisioning : value;
  if (!isRecord(source)) throw new Error("飞书服务没有返回二维码信息");

  const attemptId = optionalString(source.attemptId)
    ?? optionalString(source.provisioningId);
  const verificationUrl = optionalString(source.verificationUrl);
  const qrCodeDataUrl = optionalString(source.qrCodeDataUrl);
  const submitted = source.submitted === true;
  if (!attemptId || (!verificationUrl && !qrCodeDataUrl && !submitted)) {
    throw new Error("飞书服务返回的二维码信息不完整");
  }

  const explicitExpiry = optionalTimestamp(source.expiresAt);
  const expireIn = clamp(source.expireIn, 1, 60 * 60, 5 * 60);
  const operation = normalizeRegistrationOperation(source.operation);
  const botId = optionalString(source.botId);
  if (isTargetedAppUpdate(operation) && !botId) {
    throw new Error("飞书服务返回的应用更新信息缺少 botId");
  }
  return {
    attemptId,
    operation,
    botId,
    verificationUrl,
    qrCodeDataUrl,
    submitted,
    expiresAt: explicitExpiry ?? now + expireIn * 1000,
    pollIntervalMs: clamp(source.pollIntervalMs, 800, 10_000, 1_800),
  };
}

function normalizeBot(value: unknown) {
  const source = isRecord(value) ? value : {};
  return {
    name: optionalString(source.name) ?? "飞书机器人",
    avatarUrl: optionalString(source.avatarUrl),
    appIdMasked: optionalString(source.appIdMasked),
    tenantName: optionalString(source.tenantName),
    domain: source.domain === "lark" ? "lark" : "feishu",
    activated: typeof source.activated === "boolean" || typeof source.activated === "number"
      ? source.activated
      : undefined,
  };
}

function normalizeHealth(value: unknown, connected = false) {
  const source = isRecord(value) ? value : {};
  const fallbackStatus = connected ? "healthy" : "offline";
  const status = typeof source.status === "string" && HEALTH_STATUSES.includes(source.status)
    ? source.status
    : fallbackStatus;
  return {
    status,
    summary: optionalString(source.summary)
      ?? (connected ? "长连接运行正常" : "机器人尚未连接"),
    lastCheckedAt: optionalTimestamp(source.lastCheckedAt),
    lastConnectedAt: optionalTimestamp(source.lastConnectedAt),
  };
}

function normalizeError(value: unknown) {
  if (!isRecord(value)) return undefined;
  const message = optionalString(value.message);
  if (!message) return undefined;
  return { message, code: optionalString(value.code) };
}

function authoritativeState(value: unknown, connected: boolean) {
  if (connected) return "connected";
  const reported = typeof value === "string" && CONNECTION_STATES.has(value) ? value : "disconnected";
  if (reported === "connected" || reported === "connecting" || reported === "reconnecting") {
    return "connecting";
  }
  if (reported === "error") return "error";
  return "offline";
}

/** Normalize one redacted bot connection. `connected` is authoritative. */
export function normalizeBotConnection(value: unknown, fallbackBotId?: unknown) {
  if (!isRecord(value)) throw new Error("飞书服务返回了无效的机器人状态");
  const botId = optionalString(value.botId) ?? optionalString(fallbackBotId);
  if (!botId) throw new Error("飞书服务返回的机器人缺少 botId");
  const connected = value.connected === true;
  return {
    botId,
    state: authoritativeState(value.state, connected),
    connected,
    configured: value.configured !== false,
    workspaceId: typeof value.workspaceId === "string" ? value.workspaceId : null,
    workspaceTitle: typeof value.workspaceTitle === "string" ? value.workspaceTitle : null,
    workspace: typeof value.workspace === "string" ? value.workspace : null,
    workspacePending: value.workspacePending === true,
    agentPreset: normalizeAgentPresetId(value.agentPreset),
    instruction: displayBotInstruction(value.instruction),
    groupResponseMode: normalizeGroupResponseMode(value.groupResponseMode),
    groupMessagePermissionGranted: value.groupMessagePermissionGranted === true,
    bot: normalizeBot(value.bot),
    health: normalizeHealth(value.health, connected),
    error: normalizeError(value.error),
    lastMessageError: normalizeLastMessageError(value.lastMessageError),
  };
}

/**
 * Normalize the v2 multi-bot list. A singleton fallback is accepted only so a
 * browser/Host rolling upgrade does not strand an existing connection.
 */
export function normalizeBotsSnapshot(value: unknown) {
  if (!isRecord(value)) throw new Error("飞书服务没有返回连接状态");

  let sourceBots: unknown[] = Array.isArray(value.bots) ? value.bots : [];
  if (sourceBots.length === 0 && value.configured === true) {
    sourceBots = [{
      botId: optionalString(value.botId) ?? "legacy-default",
      state: value.state,
      connected: value.connected,
      configured: true,
      bot: value.bot,
      health: value.health,
      error: value.error,
    }];
  }

  const seen = new Set<string>();
  const bots = [];
  for (const source of sourceBots) {
    const bot = normalizeBotConnection(source);
    if (seen.has(bot.botId)) continue;
    seen.add(bot.botId);
    bots.push(bot);
  }

  const configured = bots.filter((bot) => bot.configured).length;
  const connected = bots.filter((bot) => bot.connected).length;
  const revision = typeof value.revision === "number"
    && Number.isSafeInteger(value.revision)
    && value.revision >= 0
    ? value.revision
    : 0;
  const state = typeof value.state === "string" && CONNECTION_STATES.has(value.state)
    ? value.state
    : "disconnected";

  return {
    schemaVersion: value.schemaVersion === 2 ? 2 : 1,
    revision,
    state,
    bots,
    agentPresetCatalog: normalizeAgentPresetCatalog(value.agentPresetCatalog),
    // Derive counts from the authoritative list so stale summary fields never
    // make the UI claim that an unavailable bot is online.
    totals: { configured, connected },
    provisioning: value.provisioning
      ? normalizeProvisioning(value.provisioning)
      : undefined,
    error: normalizeError(value.error),
  };
}

type ConnectionSnapshot = {
  state: string;
  configured: boolean;
  bot: ReturnType<typeof normalizeBot>;
  health: ReturnType<typeof normalizeHealth>;
  provisioning?: Provisioning;
  errorMessage?: string;
};

/** Legacy single-bot normalizer retained for the compatibility surface. */
export function normalizeConnectionSnapshot(value: unknown): ConnectionSnapshot {
  if (!isRecord(value)) throw new Error("飞书服务没有返回连接状态");
  const connected = value.connected === true;
  const reportedState = typeof value.state === "string" && CONNECTION_STATES.has(value.state)
    ? value.state
    : "disconnected";
  const state = connected
    ? "connected"
    : reportedState === "connected"
      ? "connecting"
      : reportedState;
  const snapshot: ConnectionSnapshot = {
    state,
    configured: value.configured === true,
    bot: normalizeBot(value.bot),
    health: normalizeHealth(value.health, connected),
    provisioning: undefined,
    errorMessage: optionalString(isRecord(value.error) ? value.error.message : undefined)
      ?? optionalString(value.message),
  };
  if (value.provisioning) snapshot.provisioning = normalizeProvisioning(value.provisioning);
  return snapshot;
}

/** Legacy UI projection retained for tests and rolling upgrades. */
export function screenFromSnapshot(snapshot: ConnectionSnapshot) {
  switch (snapshot.state) {
    case "connected":
      return { phase: "connected", configured: snapshot.configured, bot: snapshot.bot, health: snapshot.health };
    case "provisioning":
      return snapshot.provisioning
        ? { phase: "qr", configured: snapshot.configured, provision: snapshot.provisioning, expired: false }
        : { phase: "creating", configured: snapshot.configured };
    case "connecting":
      return { phase: "connecting", configured: snapshot.configured, provision: snapshot.provisioning };
    case "error":
      return {
        phase: "error",
        configured: snapshot.configured,
        bot: snapshot.bot,
        health: snapshot.health,
        error: { message: snapshot.errorMessage ?? "飞书连接遇到问题", code: "FEISHU_CONNECTION_ERROR" },
        retry: snapshot.configured ? "test" : "begin",
      };
    default:
      return snapshot.configured
        ? { phase: "offline", configured: true, bot: snapshot.bot, health: snapshot.health }
        : { phase: "disconnected", configured: false };
  }
}

function asRpcInvoke(invoke: unknown, label: string): FeishuRpcInvoke {
  if (typeof invoke !== "function") throw new TypeError(`${label} requires an RPC caller`);
  return invoke as FeishuRpcInvoke;
}

/** Legacy helper. The new UI uses reconnectBot with an explicit botId. */
export async function retryConnection(invoke: unknown, signal?: unknown) {
  const call = asRpcInvoke(invoke, "retryConnection");
  await call(FEISHU_ENDPOINTS.testConnection, {}, signal);
  return call(FEISHU_ENDPOINTS.status, {}, signal);
}

/** Reconnect exactly one bot, then fetch the authoritative list once. */
export async function reconnectBot(invoke: unknown, botId: unknown, signal?: unknown) {
  const call = asRpcInvoke(invoke, "reconnectBot");
  const id = optionalString(botId);
  if (!id) throw new TypeError("reconnectBot requires a botId");
  await call(FEISHU_ENDPOINTS.reconnectBot, { botId: id }, signal);
  return call(FEISHU_ENDPOINTS.status, {}, signal);
}

type PollResult = {
  status: string;
  operation: RegistrationOperation;
  botId?: string;
  message?: string;
  connection?: ReturnType<typeof normalizeBotConnection> | ConnectionSnapshot;
  provisioning?: Provisioning;
};

export function normalizePollResult(value: unknown): PollResult {
  if (!isRecord(value)) throw new Error("飞书服务没有返回创建进度");
  const status = typeof value.status === "string" && POLL_STATES.has(value.status)
    ? value.status
    : typeof value.state === "string" && POLL_STATES.has(value.state)
      ? value.state
      : undefined;
  if (!status) throw new Error("飞书服务返回了未知的创建状态");

  const normalized: PollResult = {
    status,
    operation: normalizeRegistrationOperation(value.operation),
    botId: optionalString(value.botId),
    message: optionalString(isRecord(value.error) ? value.error.message : undefined)
      ?? optionalString(value.message),
    connection: undefined,
    provisioning: undefined,
  };
  if (value.provisioning) normalized.provisioning = normalizeProvisioning(value.provisioning);
  if (status === "connected" && isRecord(value.connection)) {
    normalized.connection = value.connection.botId
      ? normalizeBotConnection(value.connection)
      : normalizeConnectionSnapshot(value.connection);
  }
  return normalized;
}

/** Keep transport and Host details out of the user-facing alert. */
export function presentError(error: unknown) {
  const payload = isRecord(error) ? error : undefined;
  const raw = optionalString(payload?.message) ?? "操作失败，请稍后重试";
  const message = raw
    .replace(/(client[_-]?secret|app[_-]?secret|secret|token)\s*[:=]\s*[^\s,;]+/gi, "$1=••••••")
    .slice(0, 240);
  return { message, code: optionalString(payload?.code) };
}

export function formatRemaining(milliseconds: unknown) {
  const totalSeconds = Math.max(0, Math.ceil(Number(milliseconds) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
