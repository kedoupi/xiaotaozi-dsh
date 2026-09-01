// @ts-nocheck
import { randomUUID } from 'node:crypto';
import QRCode from 'qrcode';
import {
  conversationKey,
  extractInboundMessage,
  extractText,
  isAllowedSender,
  isBotSender,
  splitText,
} from './message-utils.ts';
import {
  hasInboundImages,
  imagePromptDiagnostic,
  imagePromptUserMessage,
  promptContentForMessage,
} from '../shared/image-prompt.ts';
import {
  hasInboundFiles,
  inboundFileUserMessage,
} from '../shared/inbound-file.ts';
import {
  harnessAnswerForQuestion,
  harnessQuestionText,
  validHarnessQuestion,
} from '../shared/harness-question.ts';
import { HarnessApprovalQueue } from '../shared/harness-approval.ts';
import {
  BatchInputManager,
  batchInputBusyMessage,
  batchInputGroupUnsupportedMessage,
  isBatchInputCommand,
} from '../shared/batch-input.ts';
import { runCompactCommand } from '../shared/compact-command.ts';
import {
  isControlCommand,
  runControlCommand,
} from '../shared/control-command.ts';
import { rememberDirectTargetAndFlush } from '../shared/connection-test.ts';
import { usageGuideText } from '../../usage-guide.ts';
import {
  isModelCommand,
  runModelCommand,
} from '../shared/model-command.ts';
import {
  isPresetCommand,
  runPresetCommand,
} from '../shared/preset-command.ts';
import { runWorkspaceCommand } from '../shared/workspace-command.ts';
import { askInWorkspaceSession, startNewConversation } from '../shared/workspace-session.ts';
import { deliverOutboundArtifacts } from '../shared/semantic/artifact-delivery.ts';
import {
  createDeliveryReceipt,
} from '../shared/semantic/delivery.ts';
import {
  MENU_PAGE_SIZE,
  PRESET_FOLLOW_DEFAULT_SENTINEL,
  STEER_CUSTOM_SENTINEL,
  completionCard,
  customSteerCard,
  helpCard,
  menuCard,
  modelCard,
  presetCard,
  sessionListCard,
  statusCard,
  steerCard,
  watchListCard,
  projectListCard,
} from './feishu-cards.ts';
import {
  buildStreamingReplyCard,
  cardActionCallbackCard,
  nextReplyCardBody,
  parseStopReplyAction,
  stopReplyKeyAllowed,
} from './feishu-reply-card.ts';
import { t } from '../shared/i18n.ts';
import {
  channelDeliveryFailure,
  classifyMessageFailure,
  clearLastMessageFailure,
  messageFailureText,
  setLastMessageFailure,
} from '../shared/message-failure.ts';
import { MAX_WATCHES_PER_KEY } from './state-store.ts';
import {
  FEISHU_GROUP_RESPONSE_MODES,
  normalizeFeishuGroupResponseMode,
} from './group-response-mode.ts';

// Lazily evaluated: t() must run after setImHostLanguage, not at import time.
const INTERACTION_RESOLVED_TEXT = () => t('这个问题已在其他客户端处理，无需再次回答。');
const RESOLVED_REPLY_TTL_MS = 30 * 60_000;

class StreamPresentedError extends Error {
  constructor(cause) {
    super(cause?.message ?? String(cause), { cause });
    this.name = 'StreamPresentedError';
    this.code = cause?.code;
  }
}

const MENU_COMMAND = /^\/m(?:enu)?$/i;
const REPAIR_COMMAND_PREFIX = /^\/repair(?:\s|$)/i;
const REPAIR_COMMAND = /^\/repair(?:\s+(qr|status|cancel|verify))?\s*$/i;
const WATCH_COMMAND = /^\/watch(?:\s+([^\s]+))?$/i;
const UNWATCH_COMMAND = /^\/unwatch(?:\s+([^\s]+))?$/i;
const WATCHLIST_COMMAND = /^\/watchlist$/i;
const SESSION_LIST_PREFIX = /^\/sessionlist(?:\s|$)/i;
const WORKSPACE_LIST_COMMAND = /^\/workspacelist$/i;
const NUMBER_REPLY = /^\d{1,2}$/;
/** A displayed menu stays number-tappable for this long. */
const MENU_TTL_MS = 10 * 60_000;
const MAX_TRACKED_MENUS = 50;
/** Bound callback work per conversation so retries cannot exhaust Host RPCs. */
const MAX_PENDING_CARD_ACTIONS_PER_KEY = 8;
/** Bound actual stop/steer submissions independently from ordinary card UI work. */
const MAX_PENDING_CARD_CONTROLS_PER_KEY = 8;
/** Provider retries may arrive after the original callback has already settled. */
const CARD_ACTION_DEDUPE_TTL_MS = 10 * 60_000;
const MAX_COMPLETED_CARD_ACTIONS = 400;
/** Collapse callback-flood notices instead of amplifying overload into more API calls. */
const CARD_OVERLOAD_NOTICE_COOLDOWN_MS = 5_000;
/** Cards should degrade promptly when one optional Host data source is slow. */
const CARD_DATA_TIMEOUT_MS = 5_000;
const REPAIR_LINK_WAIT_MS = 15_000;
const REPAIR_POLL_INTERVAL_MS = 1_000;
const REPAIR_ACTIVE_STATES = new Set([
  'starting', 'qr_ready', 'polling', 'slow_down', 'domain_switched', 'saving',
]);
const REPAIR_TERMINAL_STATES = new Set([
  'succeeded', 'expired', 'cancelled', 'error',
]);
const REPAIR_URL_HOSTS = new Set([
  'accounts.feishu.cn',
  'open.feishu.cn',
  'accounts.larksuite.com',
  'open.larksuite.com',
]);

function helpText() {
  return usageGuideText({
    channelLabel: '飞书',
    extraCommands: [
      ['/repair', '修复卡片按钮回调'],
      ['/m or /menu', '打开交互卡片菜单'],
      ['/watch [Session ID 或序号]', '关注会话，任务完成自动推送'],
      ['/unwatch [Session ID 或序号]', '取消关注'],
      ['/watchlist', '查看关注列表'],
      ['/archived on|off', '会话列表是否包含归档会话'],
      ['/presetlist', '列出可用 Agent Preset'],
      ['/preset [序号或完整ID]', '查看或设置当前机器人 Agent Preset'],
    ],
  });
}

const ARCHIVED_COMMAND = /^\/archived(?:\s+(on|off))?$/i;
/** Matches fast card commands that should not be queued behind a running task. */
const CARD_COMMAND = /^\/(?:m(?:enu)?|new|help|status|compact|sessionlist(?:\s|$)|workspacelist|watchlist|archived(?:\s+(on|off))?)$/i;

/** Canonical project/session help advertised by every bridge family. */
const WORKSPACE_HELP_LINES = [
  '/session Session ID 或当前项目会话序号  将当前聊天绑定到指定会话',
  '/workspacelist  列出 Web 中已创建的项目',
  '/sessionlist [项目序号]  列出会话 ID 和标题',
];

/** Safe user-facing text for bind/workspace failures (no raw messages). */
function safeErrorText(error) {
  switch (error?.code) {
    case 'workspace-not-absolute':
      return t('工作区必须是绝对路径。');
    case 'workspace-not-found':
      return t('工作区路径不存在。');
    case 'workspace-not-directory':
      return t('工作区路径必须指向一个目录。');
    case 'workspace-bot-not-found':
      return t('机器人正在移除或已重新接入，无法操作原会话的工作区。');
    default:
      return t('操作失败，请稍后重试。');
  }
}

function artifactFailureText(fileName, error) {
  const name = String(fileName ?? t('结果文件')).replace(/[\r\n]+/g, ' ').trim() || t('结果文件');
  switch (error?.code) {
    case 'artifact-permission-required':
      return t('结果文件「{name}」已生成，但机器人缺少飞书文件上传权限。请为应用添加 im:resource 并完成必要审批后重试。', { name });
    case 'artifact-too-large':
      return t('结果文件「{name}」超过飞书 30 MB 上限，未发送。', { name });
    case 'artifact-empty':
      return t('结果文件「{name}」为空，飞书不允许发送空文件。', { name });
    case 'artifact-changed':
    case 'artifact-invalid':
    case 'artifact-unavailable':
      return t('结果文件「{name}」暂时无法读取或准备发送，请确认文件仍可访问后重试。', { name });
    case 'artifact-rate-limited':
      return t('结果文件「{name}」暂时被飞书限流，未能发送，请稍后重试。', { name });
    case 'artifact-delivery-uncertain':
      return t('结果文件「{name}」发送结果未能确认，请先检查聊天内是否已收到，不要立即重试。', { name });
    default:
      return t('结果文件「{name}」已生成，但暂时未能发送，请稍后重试。', { name });
  }
}

function answerTextForDelivery(answer, artifacts) {
  if (typeof answer === 'string' && answer.trim()) return answer;
  return artifacts.length > 0 ? t('结果文件已生成。') : answer;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Accept SDK payload fields that may already be objects or JSON strings. */
function callbackObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Normalize a single-select value without corrupting valid commas in an id/path. */
function callbackSingleOption(value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const selected = callbackSingleOption(entry);
      if (selected !== null) return selected;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    if ('value' in value) return callbackSingleOption(value.value);
    if ('option' in value) return callbackSingleOption(value.option);
    return null;
  }
  if (typeof value !== 'string') return null;
  const source = value.trim();
  if (!source) return null;
  if (source.startsWith('[') || source.startsWith('{') || source.startsWith('"')) {
    try {
      const parsed = JSON.parse(source);
      if (parsed !== value) return callbackSingleOption(parsed);
    } catch { /* plain value below */ }
  }
  return source;
}

/** Normalize multi-select values across current and legacy SDK shapes. */
function callbackMultiOptionValues(value) {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap((entry) => callbackMultiOptionValues(entry));
  if (value && typeof value === 'object') {
    if ('value' in value) return callbackMultiOptionValues(value.value);
    if ('option' in value) return callbackMultiOptionValues(value.option);
    return [];
  }
  if (typeof value !== 'string') return [];
  const source = value.trim();
  if (!source) return [];
  if (source.startsWith('[') || source.startsWith('{') || source.startsWith('"')) {
    try {
      const parsed = JSON.parse(source);
      if (parsed !== value) return callbackMultiOptionValues(parsed);
    } catch { /* plain value below */ }
  }
  return source.split(',').map((entry) => entry.trim()).filter(Boolean);
}

function validLastSeq(value) {
  return Number.isSafeInteger(value) && value >= -1;
}

function orderedHistoryEvents(history) {
  return (Array.isArray(history?.events) ? history.events : [])
    .map((entry) => entry?.event ?? entry)
    .filter((entry) => entry && typeof entry === 'object' && Number.isFinite(entry.seq))
    .sort((left, right) => left.seq - right.seq);
}

function senderOpenId(event) {
  return nonEmptyString(event?.sender?.sender_id?.open_id)
    ?? nonEmptyString(event?.sender?.sender_id?.user_id);
}

function strictSenderOpenId(event) {
  return nonEmptyString(event?.sender?.sender_id?.open_id);
}

function abortableDelay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(done, milliseconds);
    timer.unref?.();
    function done() {
      signal?.removeEventListener('abort', aborted);
      resolve();
    }
    function aborted() {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    }
    signal?.addEventListener('abort', aborted, { once: true });
  });
}

function repairSnapshot(value, { botId } = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const registration = source.registration && typeof source.registration === 'object'
    ? source.registration
    : source;
  const operation = nonEmptyString(registration.operation) ?? nonEmptyString(source.operation);
  if (operation && operation !== 'callback_repair') {
    throw new Error('The active Feishu operation is not a callback repair');
  }
  const selectedBotId = nonEmptyString(registration.botId) ?? nonEmptyString(source.botId);
  if (botId && selectedBotId && selectedBotId !== botId) {
    throw new Error('The Feishu repair belongs to another bot');
  }
  const state = nonEmptyString(registration.state);
  const attempt = registration.attemptId ?? registration.attempt;
  const attemptId = typeof attempt === 'string' || Number.isFinite(attempt)
    ? String(attempt)
    : null;
  if (!state || !attemptId) throw new Error('Feishu returned an invalid repair status');
  const verificationUrl = nonEmptyString(registration.verificationUrl)
    ?? nonEmptyString(registration.qrCodeUrl);
  const expiresAt = Number(registration.expiresAt);
  const remainingSeconds = Number(registration.remainingSeconds);
  const pollIntervalMs = Number(registration.pollIntervalMs)
    || (Number(registration.pollIntervalSeconds) * 1000);
  return {
    state,
    attemptId,
    botId: selectedBotId,
    verificationUrl,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
    remainingSeconds: Number.isFinite(remainingSeconds) ? remainingSeconds : null,
    pollIntervalMs: Number.isFinite(pollIntervalMs) && pollIntervalMs > 0
      ? pollIntervalMs
      : null,
    error: registration.error && typeof registration.error === 'object'
      ? { code: nonEmptyString(registration.error.code), message: nonEmptyString(registration.error.message) }
      : null,
  };
}

function safeRepairUrl(rawUrl, expectedAppId) {
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:' || !REPAIR_URL_HOSTS.has(url.hostname)) {
    throw new Error('Feishu returned an untrusted repair URL');
  }
  if (url.searchParams.get('tp') !== 'sdk'
    || url.searchParams.get('clientID') !== expectedAppId
    || url.searchParams.has('createOnly')) {
    throw new Error('Feishu returned an invalid existing-app repair URL');
  }
  if (url.toString().includes('{{client_id}}') || url.toString().includes('%7B%7Bclient_id%7D%7D')) {
    throw new Error('Feishu returned an unresolved client id placeholder');
  }
  return url.toString();
}

function canClaimInteractionReply(event, pending) {
  return pending.questions[pending.index]
    && senderOpenId(event) === pending.actor
    && event?.message?.message_type === 'text'
    && nonEmptyString(extractText(event));
}

function ensureStatus(status) {
  for (const key of ['messagesReceived', 'messagesReplied', 'messagesRejected']) {
    status[key] ??= 0;
  }
  status.lastMessageAt ??= null;
  status.lastReplyAt ??= null;
  status.lastRejectedAt ??= null;
  status.lastError ??= null;
  status.lastMessageError ??= null;
}

export class FeishuHarnessBridge {
  #client;
  #channel;
  #harness;
  #state;
  #queues = new Map();
  #batchInputs = new BatchInputManager();
  #pendingInteractions = new Map();
  #interactionKeys = new Map();
  #resolvedQuestionReplies = new Map();
  #acceptedMessageIds = new Set();
  #interactionTasks = new Set();
  #commandTasks = new Set();
  /** All accepted card work, including tasks waiting behind an earlier click. */
  #cardActionTasks = new Set();
  /** Per-conversation navigation/configuration serialization tails. */
  #cardActionTails = new Map();
  /** Per-conversation serialization for actual stop/steer side effects. */
  #cardControlTails = new Map();
  /** Pending callback count per conversation, used for bounded backpressure. */
  #cardActionCounts = new Map();
  /** Pending control count per conversation, isolated from ordinary UI work. */
  #cardControlCounts = new Map();
  /** Same callback retry joins the original task instead of repeating side effects. */
  #cardActionInFlight = new Map();
  /** Stop is idempotent per conversation; coalesce floods while one stop is pending. */
  #cardStopInFlight = new Map();
  /** Stable ids coalesced into a stop move to the completed cache when it settles. */
  #cardStopFollowers = new Map();
  /** Settled provider event ids stay deduplicated for a bounded retry window. */
  #completedCardActions = new Map();
  /** Last overload notice time per conversation. */
  #cardOverloadNoticeAt = new Map();
  #approvals;
  #cardDataTimeoutMs;
  #status;
  #allowedSenderOpenIds;
  #replyTimeoutMs;
  #logger;
  #signal;
  #botId;
  #appId;
  #botOpenId;
  #groupResponseMode;
  #repair;
  #repairOwnerOpenIds;
  #repairAttempt = null;
  #repairMonitorVersion = 0;
  #repairPollIntervalMs;
  #repairLinkWaitMs;
  /** Number-tappable menus: conversation key → menu state. */
  #menus = new Map();
  /** Interactive-card message id → route context for button callbacks. */
  #cardKeys = new Map();
  /** Live streaming-reply runs keyed by conversation. */
  #replyRuns = new Map();
  /** The global event-mux watcher (one per bridge). */
  #eventWatcher = null;
  /** Serializes live completions and reconnect compensation. */
  #eventTail = Promise.resolve();
  /** Earliest completion that still needs delivery for each watch. */
  #failedWatchSeqs = new Map();

  constructor({
    client,
    channel,
    harness,
    state,
    status,
    allowedSenderOpenIds = new Set(),
    botId,
    appId,
    botOpenId,
    groupResponseMode = FEISHU_GROUP_RESPONSE_MODES.ALL,
    repair,
    repairOwnerOpenIds,
    repairPollIntervalMs = REPAIR_POLL_INTERVAL_MS,
    repairLinkWaitMs = REPAIR_LINK_WAIT_MS,
    cardDataTimeoutMs = CARD_DATA_TIMEOUT_MS,
    replyTimeoutMs = 600_000,
    logger = console,
    signal,
  }) {
    if (!client || !harness || !state || !status) {
      throw new TypeError('Feishu bridge dependencies are required');
    }
    if (repair !== undefined && repair !== null) {
      if (!repair || typeof repair.start !== 'function'
        || typeof repair.status !== 'function'
        || typeof repair.cancel !== 'function') {
        throw new TypeError('Feishu repair capability requires start/status/cancel');
      }
      if (!nonEmptyString(botId) || !nonEmptyString(appId)) {
        throw new TypeError('Feishu repair capability requires botId and appId');
      }
    }
    if (!Number.isFinite(repairPollIntervalMs) || repairPollIntervalMs <= 0
      || !Number.isFinite(repairLinkWaitMs) || repairLinkWaitMs <= 0
      || !Number.isFinite(cardDataTimeoutMs) || cardDataTimeoutMs <= 0) {
      throw new TypeError('Feishu timing values must be positive numbers');
    }
    this.#client = client;
    this.#channel = channel;
    this.#harness = harness;
    this.#state = state;
    this.#status = status;
    this.#allowedSenderOpenIds = allowedSenderOpenIds;
    this.#botId = nonEmptyString(botId);
    this.#appId = nonEmptyString(appId);
    this.#botOpenId = nonEmptyString(botOpenId);
    this.#groupResponseMode = normalizeFeishuGroupResponseMode(groupResponseMode);
    this.#repair = repair ?? null;
    const repairOwners = repairOwnerOpenIds ?? allowedSenderOpenIds;
    this.#repairOwnerOpenIds = new Set(
      [...(repairOwners ?? [])].filter((value) => typeof value === 'string' && value && value !== '*'),
    );
    this.#repairPollIntervalMs = repairPollIntervalMs;
    this.#repairLinkWaitMs = repairLinkWaitMs;
    this.#cardDataTimeoutMs = cardDataTimeoutMs;
    this.#replyTimeoutMs = replyTimeoutMs;
    this.#logger = logger;
    this.#approvals = new HarnessApprovalQueue({ label: 'Feishu', logger });
    this.#signal = signal;
    ensureStatus(this.#status);
    // Persisted watches must resume at runtime start, not on the first
    // message. Older hosts without the mux watcher simply skip this.
    if (typeof this.#harness?.watchHarnessEvents === 'function') {
      queueMicrotask(() => this.#ensureEventWatcher());
    }
  }

  setGroupResponseMode(value) {
    this.#groupResponseMode = normalizeFeishuGroupResponseMode(value);
  }

  #isAddressed(event) {
    if (event?.message?.chat_type === 'p2p') return true;
    const mentions = Array.isArray(event?.message?.mentions) ? event.message.mentions : [];
    if (!this.#botOpenId) return mentions.length > 0;
    return mentions.some((mention) => mention?.id?.open_id === this.#botOpenId
      || mention?.open_id === this.#botOpenId);
  }

  accept(event) {
    if (this.#signal?.aborted) return Promise.resolve();
    const messageId = nonEmptyString(event?.message?.message_id);
    if (!messageId || isBotSender(event)) return Promise.resolve();
    if (!isAllowedSender(event, this.#allowedSenderOpenIds)) {
      this.#status.messagesRejected += 1;
      this.#status.lastRejectedAt = new Date().toISOString();
      this.#logger.warn?.('[dsh-feishu] ignored a message from a sender outside the allowlist');
      return Promise.resolve();
    }
    const addressed = this.#isAddressed(event);
    if (event?.message?.chat_type !== 'p2p'
      && this.#groupResponseMode === FEISHU_GROUP_RESPONSE_MODES.MENTION
      && !addressed) {
      return Promise.resolve();
    }
    if (this.#state.hasSeen(messageId) || this.#acceptedMessageIds.has(messageId)) {
      return Promise.resolve();
    }

    let key;
    try {
      key = conversationKey(event);
    } catch {
      this.#status.messagesRejected += 1;
      this.#status.lastRejectedAt = new Date().toISOString();
      return Promise.resolve();
    }

    if (event.message.chat_type === 'p2p') {
      const chatId = nonEmptyString(event.message.chat_id);
      if (chatId) {
        void rememberDirectTargetAndFlush(
          this.#state,
          { chatId },
          (target, content) => this.#send(target.chatId, content),
        );
      }
    }

    this.#acceptedMessageIds.add(messageId);
    const processingReaction = this.#addReaction(messageId, 'OnIt');
    const commandMessage = extractInboundMessage(event, this.#client);
    const commandText = nonEmptyString(commandMessage.content) ?? '';
    const batchText = event.message.message_type === 'text'
      ? nonEmptyString(extractText(event)) ?? ''
      : '';
    const batchCommand = event.message.message_type === 'text'
      && isBatchInputCommand(batchText);
    const pending = this.#pendingInteractions.get(key);
    const batchStatus = this.#batchInputs.status(key);
    if (batchCommand && event.message.chat_type !== 'p2p') {
      return this.#finishBatchResult(
        event,
        messageId,
        processingReaction,
        { message: batchInputGroupUnsupportedMessage() },
      );
    }
    if (event.message.chat_type === 'p2p'
      && (batchCommand || batchStatus.phase === 'collecting')) {
      const exactBatchStart = /^\/batch$/iu.test(batchText);
      const result = exactBatchStart
        && batchStatus.phase === 'idle'
        && (this.#queues.has(key) || pending || this.#approvals.hasPending(key))
        ? { handled: true, kind: 'busy', message: batchInputBusyMessage() }
        : this.#batchInputs.handle(key, batchText, {
            plainText: event.message.message_type === 'text' && Boolean(batchText),
          });
      if (result.handled) {
        if (result.kind === 'submit') {
          const submissionEvent = {
            ...event,
            batchSubmission: { token: result.token },
            message: {
              ...event.message,
              message_type: 'text',
              content: JSON.stringify({ text: result.prompt }),
              mentions: [],
            },
          };
          return this.#enqueueMessage(
            submissionEvent,
            messageId,
            key,
            processingReaction,
          );
        }
        return this.#finishBatchResult(
          event,
          messageId,
          processingReaction,
          result,
        );
      }
    }
    // Card commands (/m, /help, /status, etc.) bypass the queue so they
    // respond immediately even when a harness task is still streaming.
    if (CARD_COMMAND.test(commandText)) {
      const processing = Promise.resolve()
        .then(() => this.#handle(event, key, { alreadyRecorded: false }))
        .then(() => this.#finishReaction(messageId, processingReaction, 'DONE'))
        .catch((error) => this.#handleMessageFailure(
          event,
          messageId,
          processingReaction,
          error,
        ))
        .finally(() => this.#acceptedMessageIds.delete(messageId));
      return processing;
    }
    const commandRunner = hasInboundFiles(commandMessage) ? null : isControlCommand(commandText)
      ? runControlCommand
      : (isModelCommand(commandText)
          ? runModelCommand
          : (isPresetCommand(commandText) ? runPresetCommand : null));
    if (commandRunner && addressed) {
      const processing = this.#processFastCommand(
        event,
        messageId,
        key,
        commandMessage,
        commandRunner,
      );
      let current;
      current = processing
        .then(() => this.#finishReaction(messageId, processingReaction, 'DONE'))
        .catch((error) => this.#handleMessageFailure(
          event,
          messageId,
          processingReaction,
          error,
        ))
        .finally(() => {
          this.#acceptedMessageIds.delete(messageId);
          this.#commandTasks.delete(current);
        });
      this.#commandTasks.add(current);
      return current;
    }
    if (this.#isResolvedQuestionReply(event, key)) {
      const current = Promise.resolve()
        .then(() => this.#discardResolvedInteractionReply(event, messageId))
        .then(() => this.#finishReaction(messageId, processingReaction, 'DONE'))
        .catch((error) => this.#handleMessageFailure(
          event,
          messageId,
          processingReaction,
          error,
        ))
        .finally(() => this.#acceptedMessageIds.delete(messageId));
      return current;
    }
    const approvalReply = this.#approvals.claimReply({
      key,
      actor: senderOpenId(event),
      messageId,
      text: extractText(event) ?? '',
      addressed,
      hasPendingQuestion: Boolean(pending),
      questionCompletion: pending?.submitting || pending?.claimedReplyMessageId
        ? pending.queue
        : null,
      isQuestionPending: () => this.#pendingInteractions.has(key),
      send: (text) => this.#send(event.message.chat_id, text),
    });
    if (approvalReply) {
      const processing = approvalReply.process(async () => {
        if (this.#state.hasSeen(messageId)) return false;
        await this.#state.markSeen(messageId);
        this.#status.lastMessageAt = new Date().toISOString();
        this.#status.messagesReceived += 1;
        return true;
      });
      let current;
      current = processing
        .then(() => this.#finishReaction(messageId, processingReaction, 'DONE'))
        .catch((error) => this.#handleMessageFailure(
          event,
          messageId,
          processingReaction,
          error,
        ))
        .finally(() => {
          this.#acceptedMessageIds.delete(messageId);
          this.#interactionTasks.delete(current);
        });
      this.#interactionTasks.add(current);
      return current;
    }
    if (pending && senderOpenId(event) !== pending.actor) {
      return this.#enqueueMessage(event, messageId, key, processingReaction);
    }
    if (pending?.submitting || pending?.claimedReplyMessageId) {
      return this.#enqueueMessage(event, messageId, key, processingReaction);
    }
    if (pending) {
      if (canClaimInteractionReply(event, pending)) pending.claimedReplyMessageId = messageId;
      const previous = pending.queue ?? Promise.resolve();
      const processing = previous
        .catch(() => undefined)
        .then(() => this.#processInteractionReply(
          event,
          messageId,
          key,
          pending,
          processingReaction,
        ));
      pending.queue = processing;

      const releaseInteraction = () => {
        if (pending.claimedReplyMessageId === messageId) {
          pending.claimedReplyMessageId = null;
        }
        if (pending.queue === processing) pending.queue = null;
      };
      let current;
      current = processing
        .then(
          () => {
            releaseInteraction();
            return this.#finishReaction(messageId, processingReaction, 'DONE');
          },
          (error) => {
            releaseInteraction();
            return this.#handleMessageFailure(
              event,
              messageId,
              processingReaction,
              error,
            );
          },
        )
        .finally(() => {
          releaseInteraction();
          this.#acceptedMessageIds.delete(messageId);
          this.#interactionTasks.delete(current);
        });
      this.#interactionTasks.add(current);
      return current;
    }
    return this.#enqueueMessage(event, messageId, key, processingReaction);
  }

  #enqueueMessage(event, messageId, key, processingReaction, {
    releaseMessageId = true,
    alreadyRecorded = false,
    finalize = true,
  } = {}) {
    const previous = this.#queues.get(key) ?? Promise.resolve();
    const work = previous
      .catch(() => undefined)
      .then(() => this.#handle(event, key, { alreadyRecorded }));
    const settled = finalize
      ? work
        .then(async (receipt) => {
          await this.#finishReaction(messageId, processingReaction, 'DONE');
          return receipt;
        })
        .catch((error) => this.#handleMessageFailure(
          event,
          messageId,
          processingReaction,
          error,
        ))
      : work;
    let current;
    current = settled.finally(() => {
      if (releaseMessageId) this.#acceptedMessageIds.delete(messageId);
      if (this.#queues.get(key) === current) this.#queues.delete(key);
    });
    this.#queues.set(key, current);
    return current;
  }

  #finishBatchResult(event, messageId, processingReaction, result) {
    let current;
    current = Promise.resolve()
      .then(async () => {
        if (this.#state.hasSeen(messageId)) return;
        await this.#state.markSeen(messageId);
        this.#status.lastMessageAt = new Date().toISOString();
        this.#status.messagesReceived += 1;
        if (result?.message) await this.#send(event.message.chat_id, result.message);
        this.#status.lastError = null;
        clearLastMessageFailure(this.#status);
      })
      .then(() => this.#finishReaction(messageId, processingReaction, 'DONE'))
      .catch((error) => this.#handleMessageFailure(
        event,
        messageId,
        processingReaction,
        error,
      ))
      .finally(() => {
        this.#acceptedMessageIds.delete(messageId);
        this.#commandTasks.delete(current);
      });
    this.#commandTasks.add(current);
    return current;
  }

  #recordFailure(error, {
    logLabel = 'operation',
    logLevel = 'warn',
    userMessage,
    reason,
  } = {}) {
    this.#status.lastError = error?.message ?? String(error);
    const failure = setLastMessageFailure(this.#status, error, { userMessage, reason });
    this.#logger?.[logLevel]?.(
      `[dsh-feishu] ${logLabel} failed [${failure.referenceId}]:`,
      error?.message ?? String(error),
    );
    return failure;
  }

  async #sendFailure(chatId, error, options = {}) {
    const failure = this.#recordFailure(error, {
      ...options,
      userMessage: options.userMessage
        ?? inboundFileUserMessage(error)
        ?? imagePromptUserMessage(error),
      reason: options.reason ?? imagePromptDiagnostic(error)?.reason,
    });
    const text = options.appendMessage
      ? `${messageFailureText(failure)}\n\n${options.appendMessage}`
      : messageFailureText(failure);
    await this.#send(chatId, text).catch(() => undefined);
    return failure;
  }

  async #handleMessageFailure(event, messageId, processingReaction, error) {
    const presented = error instanceof StreamPresentedError;
    const reported = presented ? (error.cause ?? error) : error;
    if (reported?.code === 'turn-stopped') {
      await this.#removeProcessingReaction(messageId, processingReaction);
      if (error?.batchInputMessage) {
        await this.#send(event.message.chat_id, error.batchInputMessage).catch(() => undefined);
      }
      return;
    }
    if (this.#signal?.aborted) {
      await this.#removeProcessingReaction(messageId, processingReaction);
      return;
    }
    const userMessage = inboundFileUserMessage(reported)
      ?? imagePromptUserMessage(reported);
    const failure = this.#recordFailure(reported, {
      logLabel: 'message handling',
      logLevel: 'error',
      userMessage,
      reason: imagePromptDiagnostic(reported)?.reason,
    });
    await this.#finishReaction(messageId, processingReaction, 'ERROR');
    if (presented) return;
    const failureText = error?.batchInputMessage
      ? `${messageFailureText(failure)}\n\n${error.batchInputMessage}`
      : messageFailureText(failure);
    await this.#send(
      event.message.chat_id,
      failureText,
    ).catch(() => undefined);
  }

  #failureNoticeText(error) {
    const userMessage = inboundFileUserMessage(error)
      ?? imagePromptUserMessage(error);
    return messageFailureText(classifyMessageFailure(error, {
      userMessage,
      reason: imagePromptDiagnostic(error)?.reason,
    }));
  }

  async waitForIdle() {
    // Drain to a fixed point: awaited work can register compensation or
    // another serialized tail before it settles.
    for (;;) {
      const tasks = [
        ...this.#queues.values(),
        ...[...this.#pendingInteractions.values()].flatMap((pending) => (
          pending.queue ? [pending.queue] : []
        )),
        ...this.#interactionTasks,
        ...this.#commandTasks,
        ...this.#cardActionTasks,
        this.#eventTail,
      ];
      await Promise.allSettled(tasks);
      if (this.#queues.size === 0
        && this.#interactionTasks.size === 0
        && this.#commandTasks.size === 0
        && this.#cardActionTasks.size === 0
        && ![...this.#pendingInteractions.values()].some((pending) => pending.queue)) return;
    }
  }

  #cardDataSignal() {
    const timeout = AbortSignal.timeout(this.#cardDataTimeoutMs);
    return this.#signal ? AbortSignal.any([this.#signal, timeout]) : timeout;
  }

  #hasPendingInteraction(key) {
    return this.#pendingInteractions.has(key) || this.#approvals.hasPending(key);
  }

  async #processFastCommand(event, messageId, key, message, runner) {
    this.#signal?.throwIfAborted();
    if (this.#state.hasSeen(messageId)) return;
    await this.#state.markSeen(messageId);
    this.#status.lastMessageAt = new Date().toISOString();
    this.#status.messagesReceived += 1;
    const result = await runner(
      nonEmptyString(message.content) ?? '',
      this.#harness,
      this.#state,
      key,
      {
        signal: this.#signal,
        hasImages: hasInboundImages(message),
        hasFiles: hasInboundFiles(message),
        pendingInteraction: this.#hasPendingInteraction(key),
        control: { owner: this, key },
      },
    );
    if (result?.stopped) {
      await Promise.allSettled([
        this.#cancelPendingInteraction(key),
        this.#approvals.closeRoute(key),
      ]);
    }
    for (const reply of result?.messages ?? [result?.message]) {
      if (reply) await this.#send(event.message.chat_id, reply);
    }
    this.#status.lastError = null;
    clearLastMessageFailure(this.#status);
  }

  async #handle(event, key, { alreadyRecorded = false } = {}) {
    this.#signal?.throwIfAborted();
    const messageId = event.message.message_id;
    if (!alreadyRecorded) {
      if (this.#state.hasSeen(messageId)) return;
      await this.#state.markSeen(messageId);
      this.#status.lastMessageAt = new Date().toISOString();
      this.#status.messagesReceived += 1;
    }

    const message = extractInboundMessage(event, this.#client);
    const text = message.content;
    const hasImages = hasInboundImages(message);
    const hasFiles = hasInboundFiles(message);
    // Commands treat text and attachment-free single-paragraph posts the same
    // (paste of /new into a Feishu post). Images/files stay ordinary prompts.
    const commandText = !hasImages && !hasFiles && text ? text.trim() : null;
    if (!text && !hasImages && !hasFiles) {
      await this.#send(event.message.chat_id, t('目前支持文字、图片和文件消息。'));
      return;
    }

    if (commandText !== null && REPAIR_COMMAND_PREFIX.test(commandText)) {
      await this.#handleRepairCommand(event, commandText);
      return;
    }
    if (commandText === '/help') {
      await this.#send(event.message.chat_id, helpText());
      return;
    }
    if (MENU_COMMAND.test(commandText)) {
      await this.#sendMenuCard(key, event.message.chat_id);
      return;
    }
    if (commandText === '/new') {
      if (this.#queues.has(key) || this.#hasPendingInteraction(key)) {
        await this.#send(
          event.message.chat_id,
          t('当前任务仍在运行，请先停止任务或等待任务完成后再开启新会话。'),
        );
        return;
      }
      const started = await startNewConversation(this.#state, key);
      await this.#send(event.message.chat_id, started.message);
      await this.#sendMenuCard(key, event.message.chat_id);
      return;
    }
    if (commandText === '/status') {
      await this.#showStatusText(key, event.message.chat_id);
      return;
    }
    if (commandText === '/compact') {
      const compactCommand = await runCompactCommand(commandText, this.#harness, this.#state, key, { signal: this.#signal });
      if (compactCommand) {
        await this.#send(event.message.chat_id, compactCommand.message);
      }
      return;
    }
    if (SESSION_LIST_PREFIX.test(commandText)) {
      const selector = commandText.slice('/sessionlist'.length).trim() || null;
      await this.#showSessions({ chatId: event.message.chat_id, key }, selector, 0);
      return;
    }
    if (WORKSPACE_LIST_COMMAND.test(commandText)) {
      await this.#showWorkspaces({ chatId: event.message.chat_id, key });
      return;
    }
    if (WATCH_COMMAND.test(commandText)) {
      const target = (WATCH_COMMAND.exec(commandText)?.[1] ?? '').trim() || null;
      await this.#runWatch(key, event.message.chat_id, target);
      return;
    }
    if (UNWATCH_COMMAND.test(commandText)) {
      const target = (UNWATCH_COMMAND.exec(commandText)?.[1] ?? '').trim() || null;
      await this.#runUnwatch(key, event.message.chat_id, target);
      return;
    }
    if (WATCHLIST_COMMAND.test(commandText)) {
      await this.#showWatchList(key, event.message.chat_id);
      return;
    }
    if (ARCHIVED_COMMAND.test(commandText)) {
      const match = ARCHIVED_COMMAND.exec(commandText);
      const value = match[1]?.toLowerCase();
      if (value !== 'on' && value !== 'off') {
        await this.#send(event.message.chat_id, t('用法：/archived on（包含归档会话）或 /archived off（隐藏归档会话）'));
        return;
      }
      if (typeof this.#state?.setIncludeArchivedSessions === 'function') {
        await this.#state.setIncludeArchivedSessions(value === 'on');
      }
      await this.#send(
        event.message.chat_id,
        value === 'on' ? t('已开启：会话列表包含归档会话。') : t('已关闭：会话列表隐藏归档会话。'),
      );
      return;
    }
    if (NUMBER_REPLY.test(commandText)) {
      const menu = this.#takeMenu(key);
      if (menu) {
        await this.#handleMenuPick(menu, Number(commandText), {
          chatId: event.message.chat_id,
          key,
          event,
        });
        return;
      }
    }
    const workspaceCommand = commandText === null
      ? null
      : await runWorkspaceCommand(text, this.#harness, key);
    if (workspaceCommand) {
      for (const reply of workspaceCommand.messages ?? [workspaceCommand.message]) {
        await this.#send(event.message.chat_id, reply);
      }
      return;
    }
    const compactCommand = commandText === null
      ? null
      : await runCompactCommand(
          commandText,
          this.#harness,
          this.#state,
          key,
          { signal: this.#signal },
        );
    if (compactCommand) {
      await this.#send(event.message.chat_id, compactCommand.message);
      return;
    }

    this.#logger.info?.(`[dsh-feishu] processing ${event.message.chat_type} message ${messageId}`);
    const batchSubmission = event.batchSubmission ?? null;
    let batchAskCompleted = false;
    try {
      const receipt = await this.#answerWithStream(event, key, message, {
        onAskComplete: batchSubmission
          ? () => {
              batchAskCompleted = this.#batchInputs.complete(
                key,
                batchSubmission.token,
              ).completed;
            }
          : undefined,
      });
      this.#status.messagesReplied += 1;
      this.#status.lastReplyAt = new Date().toISOString();
      this.#status.lastError = null;
      clearLastMessageFailure(this.#status);
      return receipt;
    } catch (error) {
      if (batchSubmission && !batchAskCompleted) {
        if (error?.code === 'turn-stopped') {
          this.#batchInputs.complete(key, batchSubmission.token);
          throw error;
        }
        const failed = this.#batchInputs.fail(key, batchSubmission.token);
        if (failed.retained) {
          const batchError = new Error(error?.message ?? String(error), { cause: error });
          batchError.code = error?.code;
          batchError.providerCode = error?.providerCode;
          batchError.method = error?.method;
          if (Number.isInteger(error?.status)) batchError.status = error.status;
          batchError.batchInputMessage = failed.message;
          throw batchError;
        }
      }
      throw error;
    } finally {
      await this.#cancelPendingInteraction(key);
      await this.#approvals.closeRoute(key);
    }
  }

  // ── Interactive cards: menus and session/workspace lists ────────────────

  // Existing-app callback repair. This path deliberately uses ordinary text
  // and number replies because callback buttons are the capability being fixed.
  async #handleRepairCommand(event, commandText) {
    if (event?.message?.chat_type !== 'p2p') {
      await this.#send(event.message.chat_id, t('为避免授权链接暴露，请私聊机器人发送 /repair。'));
      return;
    }
    const actorOpenId = strictSenderOpenId(event);
    if (!actorOpenId || !this.#repairOwnerOpenIds.has(actorOpenId)) {
      await this.#send(
        event.message.chat_id,
        this.#repairOwnerOpenIds.size === 0
          ? t('当前机器人没有可验证的接入者身份，不能从聊天发起修复；请先在插件页设置管理员。')
          : t('此操作只能由机器人接入者在私聊中发起，未进行任何修改。'),
      );
      return;
    }
    if (!this.#repair) {
      await this.#send(event.message.chat_id, t('当前 Host 版本暂不支持聊天内修复，请先更新插件。'));
      return;
    }

    const parsed = REPAIR_COMMAND.exec(commandText);
    if (!parsed) {
      await this.#send(event.message.chat_id, t('用法：/repair、/repair qr、/repair status、/repair cancel 或 /repair verify'));
      return;
    }
    const operation = parsed[1]?.toLowerCase() ?? 'start';
    const chatId = event.message.chat_id;
    if (operation === 'start') {
      await this.#startRepair({ actorOpenId, chatId });
      return;
    }

    const attempt = this.#repairAttempt;
    if (!attempt) {
      await this.#send(
        chatId,
        t('当前 Runtime 没有可恢复的修复任务记录（机器人可能刚完成密钥更新并重启）。本命令不会启动新的授权；请查看机器人发送的验证结果，确认上一次任务已结束后再发送 /repair。'),
      );
      return;
    }
    if (attempt.actorOpenId !== actorOpenId) {
      await this.#send(chatId, t('另一位管理员正在修复该机器人，本次不会显示其授权信息。'));
      return;
    }
    if (operation === 'cancel') {
      let snapshot;
      try {
        const result = await this.#repair.cancel(this.#repairArgs(attempt));
        snapshot = repairSnapshot(result, { botId: this.#botId });
        attempt.snapshot = snapshot;
      } catch {
        await this.#send(chatId, t('暂时无法取消修复任务，请稍后重试。'));
        return;
      }
      if (snapshot.state === 'cancelled') {
        attempt.stopped = true;
        this.#repairMonitorVersion += 1;
      }
      await this.#send(chatId, this.#repairStatusText(snapshot));
      return;
    }

    let snapshot;
    try {
      snapshot = await this.#refreshRepairAttempt(attempt);
    } catch {
      await this.#send(chatId, t('暂时无法查询修复状态，请稍后重试。'));
      return;
    }
    if (operation === 'qr') {
      if (!REPAIR_ACTIVE_STATES.has(snapshot.state) || !attempt.verificationUrl) {
        await this.#send(chatId, this.#repairStatusText(snapshot, { verificationFocused: true }));
        return;
      }
      await this.#sendRepairQr(chatId, attempt.verificationUrl, snapshot);
      return;
    }
    await this.#send(chatId, this.#repairStatusText(snapshot, {
      verificationFocused: operation === 'verify',
    }));
  }

  #repairArgs(attempt) {
    return {
      botId: this.#botId,
      attemptId: attempt.attemptId,
      actorOpenId: attempt.actorOpenId,
      chatId: attempt.chatId,
    };
  }

  async #startRepair({ actorOpenId, chatId }) {
    const previous = this.#repairAttempt;
    if (previous && REPAIR_ACTIVE_STATES.has(previous.snapshot.state)) {
      if (previous.actorOpenId !== actorOpenId) {
        await this.#send(chatId, t('另一位管理员正在修复该机器人，本次不会显示其授权信息。'));
        return;
      }
      try {
        const current = await this.#refreshRepairAttempt(previous);
        if (REPAIR_ACTIVE_STATES.has(current.state) && previous.verificationUrl) {
          await this.#sendRepairLink(chatId, previous.verificationUrl, current, { existing: true });
          return;
        }
      } catch {
        await this.#send(chatId, t('暂时无法查询修复状态，请稍后重试。'));
        return;
      }
    }

    let snapshot;
    try {
      snapshot = repairSnapshot(await this.#repair.start({
        botId: this.#botId,
        actorOpenId,
        chatId,
      }), { botId: this.#botId });
      snapshot = await this.#waitForRepairLink(snapshot, { actorOpenId, chatId });
    } catch {
      await this.#send(chatId, t('修复流程暂时失败，现有机器人连接不受影响；请稍后发送 /repair 重试。'));
      return;
    }
    const attempt = {
      attemptId: snapshot.attemptId,
      actorOpenId,
      chatId,
      snapshot,
      verificationUrl: null,
      stopped: false,
      announcedSaving: false,
      announcedTerminal: false,
    };
    this.#repairAttempt = attempt;

    if (snapshot.verificationUrl) {
      try {
        attempt.verificationUrl = safeRepairUrl(snapshot.verificationUrl, this.#appId);
      } catch {
        attempt.stopped = true;
        await this.#repair.cancel(this.#repairArgs(attempt)).catch(() => undefined);
        await this.#send(chatId, t('飞书返回了无法安全验证的授权链接，已中止本次修复。'));
        return;
      }
    }
    if (REPAIR_TERMINAL_STATES.has(snapshot.state)) {
      attempt.announcedTerminal = true;
      if (snapshot.state !== 'succeeded') {
        await this.#send(chatId, this.#repairStatusText(snapshot));
      }
      return;
    }
    if (!attempt.verificationUrl) {
      attempt.stopped = true;
      await this.#send(chatId, t('飞书未返回授权链接，已中止本次修复。'));
      return;
    }
    await this.#sendRepairLink(chatId, attempt.verificationUrl, snapshot);
    this.#monitorRepair(attempt);
  }

  async #waitForRepairLink(initial, context) {
    let current = initial;
    const deadline = Date.now() + this.#repairLinkWaitMs;
    while (!current.verificationUrl && REPAIR_ACTIVE_STATES.has(current.state)) {
      if (Date.now() >= deadline) throw new Error('Feishu repair link timed out');
      await abortableDelay(Math.min(100, this.#repairPollIntervalMs), this.#signal);
      current = repairSnapshot(await this.#repair.status({
        botId: this.#botId,
        attemptId: current.attemptId,
        actorOpenId: context.actorOpenId,
        chatId: context.chatId,
      }), { botId: this.#botId });
    }
    return current;
  }

  async #refreshRepairAttempt(attempt) {
    const snapshot = repairSnapshot(
      await this.#repair.status(this.#repairArgs(attempt)),
      { botId: this.#botId },
    );
    if (snapshot.attemptId !== attempt.attemptId) {
      throw new Error('Feishu repair attempt changed unexpectedly');
    }
    attempt.snapshot = snapshot;
    if (snapshot.verificationUrl) {
      attempt.verificationUrl = safeRepairUrl(snapshot.verificationUrl, this.#appId);
    }
    return snapshot;
  }

  #monitorRepair(attempt) {
    const version = ++this.#repairMonitorVersion;
    void (async () => {
      while (!attempt.stopped && this.#repairAttempt === attempt
        && this.#repairMonitorVersion === version
        && !this.#signal?.aborted) {
        const delayMs = Math.max(
          250,
          Math.min(10_000, attempt.snapshot.pollIntervalMs ?? this.#repairPollIntervalMs),
        );
        await abortableDelay(delayMs, this.#signal);
        if (attempt.stopped || this.#repairAttempt !== attempt || this.#repairMonitorVersion !== version) return;
        const snapshot = await this.#refreshRepairAttempt(attempt);
        if (snapshot.state === 'saving' && !attempt.announcedSaving) {
          attempt.announcedSaving = true;
          await this.#send(
            attempt.chatId,
            t('授权已确认，正在发送并等待测试按钮回调；收到真实回调后才会完成。'),
          );
        }
        if (REPAIR_TERMINAL_STATES.has(snapshot.state)) {
          attempt.stopped = true;
          // Runtime sends the verified-success notice before resolving the
          // controller probe. Avoid duplicating it here; failure terminals
          // still need an explicit chat-side explanation.
          if (snapshot.state !== 'succeeded' && !attempt.announcedTerminal) {
            attempt.announcedTerminal = true;
            await this.#send(attempt.chatId, this.#repairStatusText(snapshot));
          }
          return;
        }
      }
    })().catch(async () => {
      if (this.#signal?.aborted || attempt.stopped || this.#repairAttempt !== attempt) return;
      attempt.stopped = true;
      this.#logger.warn?.('[dsh-feishu] callback repair status monitoring failed');
      await this.#send(
        attempt.chatId,
        t('修复状态查询中断，现有机器人连接不受影响；发送 /repair status 重试查询。'),
      ).catch(() => undefined);
    });
  }

  async #sendRepairLink(chatId, url, snapshot, { existing = false } = {}) {
    const remaining = snapshot.remainingSeconds
      ?? (snapshot.expiresAt ? Math.max(0, Math.ceil((snapshot.expiresAt - Date.now()) / 1000)) : null);
    const expiry = remaining === null
      ? t('链接为短期有效')
      : t('链接约 {minutes} 分钟后过期', { minutes: Math.max(1, Math.ceil(remaining / 60)) });
    await this.#send(chatId, [
      existing ? t('已有一个修复任务在等待授权。') : t('🔧 准备修复卡片按钮。'),
      t('本次只会增量添加 card.action.trigger。请核对确认页只显示这一项；若出现其他权限或事件，请取消。'),
      '',
      t('当前设备直接打开：'),
      url,
      '',
      t('若要用另一台设备扫码，发送 /repair qr。{expiry}。', { expiry }),
    ].join('\n'));
  }

  async #sendRepairQr(chatId, url, snapshot) {
    try {
      const image = await QRCode.toBuffer(url, {
        errorCorrectionLevel: 'M', margin: 1, width: 480, type: 'png',
      });
      const uploaded = await this.#client.im.v1.image.create({
        data: { image_type: 'message', image },
      });
      const imageKey = nonEmptyString(uploaded?.image_key) ?? nonEmptyString(uploaded?.data?.image_key);
      if (!imageKey) throw new Error('Feishu QR upload returned no image key');
      const remaining = snapshot.remainingSeconds
        ?? (snapshot.expiresAt ? Math.max(0, Math.ceil((snapshot.expiresAt - Date.now()) / 1000)) : null);
      const remainingText = remaining === null
        ? ''
        : t('（剩余约 {minutes} 分钟）', { minutes: Math.max(1, Math.ceil(remaining / 60)) });
      await this.#send(
        chatId,
        t('请用另一台设备扫码完成授权{remaining}。', { remaining: remainingText }),
      );
      const response = await this.#client.im.v1.message.create({
        params: { receive_id_type: 'chat_id' },
        data: {
          receive_id: chatId,
          msg_type: 'image',
          content: JSON.stringify({ image_key: imageKey }),
        },
      });
      if (response?.code && response.code !== 0) throw new Error('Feishu QR message send failed');
    } catch {
      await this.#send(chatId, t('二维码暂时无法发送，请直接打开授权链接：\n{url}', { url }));
    }
  }

  #repairStatusText(snapshot, { verificationFocused = false } = {}) {
    if (snapshot.state === 'succeeded') {
      return t('✅ 修复完成：已实测收到 card.action.trigger，菜单按钮现在可用。');
    }
    if (snapshot.state === 'expired' || snapshot.error?.code === 'expired_token') {
      return t('授权链接已过期；平台未返回成功结果，无法确认已修复。发送 /repair 生成新链接。');
    }
    if (snapshot.state === 'cancelled' || snapshot.error?.code === 'abort') {
      return t('已取消本次修复授权，未确认完成修复。');
    }
    if (snapshot.error?.code === 'access_denied') {
      return t('你已取消或拒绝授权，没有确认修复；发送 /repair 可重试。');
    }
    if (snapshot.error?.code === 'card_action_probe_timeout'
      || snapshot.error?.code === 'card-action-probe-timeout') {
      return t('授权已提交，但未收到测试按钮回调。可能尚未点击或配置仍在传播；稍后发送 /repair verify 查询，不要盲目重复授权。');
    }
    if (snapshot.state === 'error') {
      return t('修复流程暂时失败，现有机器人连接不受影响；发送 /repair 可重试。');
    }
    if (snapshot.state === 'saving') {
      return t('授权已确认，正在等待专用测试按钮的真实回调；回调到达前不会宣告成功。');
    }
    if (verificationFocused) {
      return t('授权尚未完成，暂时不能验证卡片按钮。请先打开授权链接并确认。');
    }
    const remaining = snapshot.remainingSeconds === null
      ? ''
      : t('，剩余约 {minutes} 分钟', { minutes: Math.max(1, Math.ceil(snapshot.remainingSeconds / 60)) });
    return t('修复任务正在等待授权{remaining}。发送 /repair qr 可获取二维码，/repair cancel 可取消。', { remaining });
  }

  /**
   * Card button callback (card.action.trigger). The operator must be an
   * allowed sender: group members outside the allowlist must never drive
   * session binding, workspace switches or other card actions.
   */
  onCardAction(event) {
    const operatorOpenId = nonEmptyString(event?.operator?.open_id)
      ?? nonEmptyString(event?.operator?.user_id)
      // Keep accepting the legacy nested shape while preferring the current
      // card.action.trigger v2 payload used by the official SDK.
      ?? nonEmptyString(event?.operator?.operator_id?.open_id)
      ?? nonEmptyString(event?.operator?.operator_id?.user_id)
      ?? nonEmptyString(event?.open_id)
      ?? nonEmptyString(event?.user_id);
    const operatorAllowed = operatorOpenId !== null
      && (this.#allowedSenderOpenIds.has('*') || this.#allowedSenderOpenIds.has(operatorOpenId));
    if (!operatorAllowed) {
      this.#logger.warn?.('[dsh-feishu] ignoring card action from an unallowed sender');
      return Promise.resolve();
    }
    const actionValue = callbackObject(event?.action?.value);
    const formValue = callbackObject(event?.action?.form_value);
    const action = nonEmptyString(actionValue.action)
      ?? nonEmptyString(event?.action?.action);
    if (!action) return Promise.resolve();
    // select_static dropdown: resolve pickers to their target actions
    const option = callbackSingleOption(event?.action?.option)
      ?? (action.endsWith('_pick') ? callbackMultiOptionValues(event?.action?.options)[0] : null);
    // The official Card 2.0 callback currently uses a comma-separated string
    // for multi-select values; older SDKs emitted arrays or value objects.
    const multiValues = [...new Set([
      ...callbackMultiOptionValues(actionValue.options),
      ...callbackMultiOptionValues(event?.action?.options),
      ...callbackMultiOptionValues(formValue[action]),
      ...(action === 'watch_add' || action === 'watch_remove'
        ? callbackMultiOptionValues(event?.action?.option)
        : []),
    ])];
    const resolvedAction = action === 'workspace_pick' && typeof option === 'string'
      ? `workspace:${option}`
      : action === 'session_pick' && typeof option === 'string'
        ? `use:${option}`
        : action === 'preset_pick' && typeof option === 'string'
          ? `preset:select:${option}`
          : action === 'model_pick' && typeof option === 'string'
            ? `model:select:${option}`
            : action === 'archive_pick' && typeof option === 'string'
              ? `archive:${option}`
              : action === 'steer_pick' && typeof option === 'string'
                ? `steer:${option}`
                : action;
    const messageId = nonEmptyString(event?.context?.open_message_id)
      ?? nonEmptyString(event?.open_message_id)
      ?? nonEmptyString(event?.message_id);
    const chatId = nonEmptyString(event?.context?.open_chat_id)
      ?? nonEmptyString(event?.open_chat_id)
      ?? nonEmptyString(event?.chat_id);
    const stopReply = parseStopReplyAction(actionValue);
    if (stopReply) {
      if (!stopReplyKeyAllowed(stopReply.key, { operatorOpenId, chatId })) {
        return Promise.resolve({});
      }
      const identity = JSON.stringify({
        messageId,
        resolvedAction: 'stop_reply',
        runId: stopReply.runId ?? null,
      });
      const eventId = nonEmptyString(event?.event_id)
        ?? nonEmptyString(event?.header?.event_id)
        ?? nonEmptyString(event?.uuid)
        ?? nonEmptyString(event?.header?.uuid);
      return this.#queueCardAction({
        chatId: chatId ?? '',
        key: stopReply.key,
        messageId,
      }, identity, async () => this.#handleStopReply(stopReply, {
        chatId,
        key: stopReply.key,
      }), {
        lane: 'control',
        coalesceStop: true,
        eventId,
        operatorOpenId,
      });
    }
    const route = messageId ? this.#cardKeys.get(messageId) : null;
    if (!route) {
      // The card predates this process (the in-memory mapping resets on
      // restart) or never came from us: nudge instead of staying silent.
      if (chatId) {
        this.#send(chatId, t('这个菜单已过期，请回复 /m 重新打开。')).catch(() => undefined);
      }
      return Promise.resolve({});
    }
    // A used card is recent even if it was first created long ago.
    this.#cardKeys.delete(messageId);
    this.#cardKeys.set(messageId, route);
    const entry = { ...route, messageId, selections: multiValues, operatorOpenId };
    const source = nonEmptyString(actionValue.source);
    const formText = nonEmptyString(formValue.steer_text);
    const eventId = nonEmptyString(event?.event_id)
      ?? nonEmptyString(event?.header?.event_id)
      ?? nonEmptyString(event?.uuid)
      ?? nonEmptyString(event?.header?.uuid);
    const identity = JSON.stringify({
      messageId,
      resolvedAction,
      option,
      multiValues,
      source,
      formText,
    });
    const isStop = resolvedAction === 'stop' || resolvedAction === 'stop_reply';
    const rawSteer = resolvedAction.startsWith('steer:')
      ? resolvedAction.slice('steer:'.length)
      : null;
    const isCustomSteer = rawSteer === 'custom' || rawSteer === STEER_CUSTOM_SENTINEL;
    const isRealSteer = (action === 'steer'
      && source === 'quick'
      && option !== null
      && option !== STEER_CUSTOM_SENTINEL)
      || (action === 'steer' && source === 'form' && formText !== null)
      || (rawSteer !== null && rawSteer !== '' && !isCustomSteer);

    return this.#queueCardAction(entry, identity, async () => {
      // 补充指令卡片：快捷下拉(source=quick, option=指令) / 表单提交(source=form)
      if (action === 'steer') {
        if (source === 'quick' && option) {
          if (option === STEER_CUSTOM_SENTINEL) {
            await this.#sendCard(entry.chatId, customSteerCard(), {
              key: entry.key,
              updateMessageId: entry.messageId,
            });
            return;
          }
          await this.#sendSteer(entry, option);
          return;
        }
        if (source === 'form') {
          if (formText) {
            await this.#sendSteer(entry, formText);
            return;
          }
          await this.#send(entry.chatId, t('请输入补充指令后再提交。'));
          return;
        }
      }
      await this.#handleCardAction(resolvedAction, entry);
    }, {
      lane: isStop || isRealSteer ? 'control' : 'regular',
      coalesceStop: isStop,
      eventId,
      operatorOpenId,
    });
  }

  #pruneCompletedCardActions(now = Date.now()) {
    for (const [key, expiresAt] of this.#completedCardActions) {
      if (expiresAt <= now) this.#completedCardActions.delete(key);
    }
    while (this.#completedCardActions.size > MAX_COMPLETED_CARD_ACTIONS) {
      const oldest = this.#completedCardActions.keys().next().value;
      if (oldest === undefined) break;
      this.#completedCardActions.delete(oldest);
    }
  }

  #rememberCompletedCardAction(key, now = Date.now()) {
    if (!key) return;
    this.#completedCardActions.delete(key);
    this.#completedCardActions.set(key, now + CARD_ACTION_DEDUPE_TTL_MS);
    this.#pruneCompletedCardActions(now);
  }

  #notifyCardOverflow(entry) {
    const conversation = entry.key;
    const now = Date.now();
    const existing = this.#cardOverloadNoticeAt.get(conversation);
    if (existing?.task || (existing && now - existing.at < CARD_OVERLOAD_NOTICE_COOLDOWN_MS)) {
      return existing?.task ?? Promise.resolve();
    }
    this.#logger.warn?.('[dsh-feishu] card action queue is full; dropping callbacks');
    let tracked;
    tracked = this.#send(entry.chatId, t('操作过于频繁，请稍后再试。'))
      .catch(() => undefined)
      .finally(() => {
        this.#cardActionTasks.delete(tracked);
        const current = this.#cardOverloadNoticeAt.get(conversation);
        if (current?.task === tracked) this.#cardOverloadNoticeAt.set(conversation, { at: current.at, task: null });
      });
    this.#cardOverloadNoticeAt.delete(conversation);
    this.#cardOverloadNoticeAt.set(conversation, { at: now, task: tracked });
    this.#cardActionTasks.add(tracked);
    while (this.#cardOverloadNoticeAt.size > 200) {
      const oldest = this.#cardOverloadNoticeAt.keys().next().value;
      if (oldest === undefined) break;
      this.#cardOverloadNoticeAt.delete(oldest);
    }
    return tracked;
  }

  #queueCardAction(entry, identity, task, {
    lane = 'regular',
    coalesceStop = false,
    eventId = null,
    operatorOpenId = null,
  } = {}) {
    const conversation = entry.key;
    const completedKey = eventId
      ? `${conversation}\0${operatorOpenId ?? ''}\0event:${eventId}`
      : null;
    const dedupeKey = completedKey
      ?? `${conversation}\0${operatorOpenId ?? ''}\0action:${identity}`;
    const now = Date.now();
    this.#pruneCompletedCardActions(now);
    if (completedKey && (this.#completedCardActions.get(completedKey) ?? 0) > now) {
      return Promise.resolve();
    }
    const duplicate = this.#cardActionInFlight.get(dedupeKey);
    if (duplicate) return duplicate;
    if (coalesceStop) {
      const pendingStop = this.#cardStopInFlight.get(conversation);
      if (pendingStop) {
        if (completedKey) {
          // Remember only a bounded LRU of provider ids while the shared stop
          // is unresolved. They become completed only after that stop settles.
          this.#cardStopFollowers.delete(completedKey);
          this.#cardStopFollowers.set(completedKey, pendingStop);
          while (this.#cardStopFollowers.size > MAX_COMPLETED_CARD_ACTIONS) {
            const oldest = this.#cardStopFollowers.keys().next().value;
            if (oldest === undefined) break;
            this.#cardStopFollowers.delete(oldest);
          }
        }
        return pendingStop;
      }
    }

    const control = lane === 'control';
    const tails = control ? this.#cardControlTails : this.#cardActionTails;
    const counts = control ? this.#cardControlCounts : this.#cardActionCounts;
    const limit = control ? MAX_PENDING_CARD_CONTROLS_PER_KEY : MAX_PENDING_CARD_ACTIONS_PER_KEY;
    const pending = counts.get(conversation) ?? 0;
    // Reserve one bounded control slot for stop. All further stop clicks join
    // that task, so a flood cannot grow the queue beyond limit + 1.
    const pendingLimit = coalesceStop ? limit + 1 : limit;
    if (pending >= pendingLimit) {
      return this.#notifyCardOverflow(entry);
    }

    const previous = tails.get(conversation) ?? Promise.resolve();
    counts.set(conversation, pending + 1);

    let tracked;
    let started = false;
    tracked = previous
      .catch(() => undefined)
      .then(async () => {
        this.#signal?.throwIfAborted();
        started = true;
        return await task();
      })
      .catch(async (error) => {
        if (this.#signal?.aborted) return;
        await this.#sendFailure(entry.chatId, error, { logLabel: 'card action' });
      })
      .finally(() => {
        if (this.#cardActionInFlight.get(dedupeKey) === tracked) {
          this.#cardActionInFlight.delete(dedupeKey);
        }
        if (started && completedKey) {
          this.#rememberCompletedCardAction(completedKey);
        }
        if (coalesceStop && this.#cardStopInFlight.get(conversation) === tracked) {
          this.#cardStopInFlight.delete(conversation);
        }
        if (coalesceStop) {
          const settledAt = Date.now();
          for (const [followerKey, pendingStop] of this.#cardStopFollowers) {
            if (pendingStop !== tracked) continue;
            this.#cardStopFollowers.delete(followerKey);
            this.#rememberCompletedCardAction(followerKey, settledAt);
          }
        }
        if (tails.get(conversation) === tracked) tails.delete(conversation);
        const remaining = (counts.get(conversation) ?? 1) - 1;
        if (remaining > 0) counts.set(conversation, remaining);
        else counts.delete(conversation);
        this.#cardActionTasks.delete(tracked);
      });
    this.#cardActionInFlight.set(dedupeKey, tracked);
    if (coalesceStop) this.#cardStopInFlight.set(conversation, tracked);
    this.#cardActionTasks.add(tracked);
    tails.set(conversation, tracked);
    return tracked;
  }

  async #handleCardAction(action, {
    chatId,
    key,
    messageId = null,
    sessionProjectId = null,
    sessionPage = 0,
    selections = [],
  }) {
    if (action === 'sessions' || /^sessions:\d+$/.test(action)) {
      const page = action === 'sessions' ? 0 : Number(action.slice('sessions:'.length));
      await this.#showSessions(
        { chatId, key },
        null,
        page,
        { updateMessageId: messageId, projectId: sessionProjectId },
      );
      return;
    }
    if (action === 'workspaces') {
      await this.#showWorkspaces({ chatId, key }, { updateMessageId: messageId });
      return;
    }
    if (action === 'watchlist') {
      await this.#showWatchList(key, chatId, { updateMessageId: messageId });
      return;
    }
    // 多选关注下拉：action=watch_add / watch_remove，选中项在 selections 数组
    if (action === 'watch_add' || action === 'watch_remove') {
      if (selections.length === 0) {
        await this.#send(chatId, t('请先选择至少一个会话。'));
        return;
      }
      let changed = 0;
      let failed = 0;
      if (action === 'watch_add') {
        let freshTargets = new Map();
        try {
          freshTargets = await this.#freshWatchTargets(sessionProjectId);
        } catch (error) {
          this.#logger.warn?.('[dsh-feishu] batch watch validation failed:', error.message);
        }
        for (const sessionId of selections) {
          const validatedTarget = freshTargets.get(sessionId);
          if (!validatedTarget) {
            failed += 1;
            continue;
          }
          const result = await this.#runWatch(key, chatId, sessionId, {
            notify: false,
            validatedTarget,
          });
          if (result.changed) changed += 1;
          else if (!result.ok) failed += 1;
        }
      } else {
        for (const sessionId of selections) {
          const result = await this.#runUnwatch(key, chatId, sessionId, { notify: false });
          if (result.changed) changed += 1;
          else if (!result.ok) failed += 1;
        }
      }
      const summary = changed > 0 && failed > 0
        ? action === 'watch_add'
          ? t('已批量关注 {count} 个会话，另有 {failed} 个未成功。', { count: changed, failed })
          : t('已取消关注 {count} 个会话，另有 {failed} 个未成功。', { count: changed, failed })
        : changed > 0
          ? action === 'watch_add'
            ? t('已批量关注 {count} 个会话。', { count: changed })
            : t('已取消关注 {count} 个会话。', { count: changed })
          : failed > 0
            ? t('所选会话均未处理成功，请稍后重试。')
            : action === 'watch_add'
              ? t('所选会话已在关注列表中。')
              : t('所选会话已不在关注列表中。');
      try {
        await this.#showWatchList(key, chatId, { updateMessageId: messageId });
      } catch (error) {
        this.#logger.warn?.('[dsh-feishu] watch list refresh failed:', error.message);
      }
      await this.#send(chatId, summary).catch((error) => {
        this.#logger.warn?.('[dsh-feishu] watch batch summary failed:', error.message);
      });
      return;
    }
    if (action === 'new') {
      if (this.#queues.has(key) || this.#hasPendingInteraction(key)) {
        await this.#send(chatId, t('当前任务仍在运行，请先停止任务或等待任务完成后再开启新会话。'));
        return;
      }
      const started = await startNewConversation(this.#state, key);
      await this.#send(chatId, started.message);
      await this.#sendMenuCard(key, chatId, { updateMessageId: messageId });
      return;
    }
    if (action === 'use:current') {
      const sessionId = this.#state.sessionFor(key);
      if (typeof sessionId !== 'string' || !sessionId) {
        await this.#send(chatId, t('当前没有绑定的会话，请先从会话列表选择。'));
        return;
      }
      await this.#send(chatId, t('已就绪，直接发消息即可继续当前会话。'));
      return;
    }
    if (action === 'archive_toggle' || action === 'archive:on' || action === 'archive:off') {
      const next = action === 'archive:on' ? true : action === 'archive:off' ? false : !(this.#state?.includesArchivedSessions?.() ?? false);
      await this.#state?.setIncludeArchivedSessions?.(next);
      await this.#send(
        chatId,
        next ? t('已开启：会话列表包含归档会话。') : t('已关闭：会话列表隐藏归档会话。'),
      );
      await this.#sendMenuCard(key, chatId, { updateMessageId: messageId });
      return;
    }
    if (action === 'repair') {
      await this.#send(chatId, t('修复需在私聊中验证接入者身份，请直接发送 /repair 开始。'));
      return;
    }
    if (action === 'compact') {
      await this.#handleCompact(key, chatId);
      return;
    }
    if (action === 'stop') {
      await this.#handleStop(key, chatId);
      return;
    }
    if (action === 'steer') {
      await this.#showSteerCard(key, chatId, { updateMessageId: messageId });
      return;
    }
    // 主菜单「补充指令」下拉：option = steer:<指令> / steer:custom
    if (action.startsWith('steer:')) {
      const raw = action.slice('steer:'.length);
      if (raw === 'custom') {
        await this.#sendCard(chatId, customSteerCard(), { key, updateMessageId: messageId });
        return;
      }
      await this.#sendSteer({ key, chatId }, raw);
      return;
    }
    if (action === 'presets') {
      await this.#showPresetCard(key, chatId, { updateMessageId: messageId });
      return;
    }
    if (action === 'models') {
      await this.#showModelCard(key, chatId, { updateMessageId: messageId });
      return;
    }
    if (action === 'status') {
      await this.#showStatusCard(key, chatId, { updateMessageId: messageId });
      return;
    }
    if (action === 'help') {
      await this.#showHelpCard(key, chatId, { updateMessageId: messageId });
      return;
    }
    if (action === 'back_to_menu') {
      await this.#sendMenuCard(key, chatId, { updateMessageId: messageId });
      return;
    }
    if (action === 'preset_default') {
      await this.#handlePresetDefault(key, chatId, { updateMessageId: messageId });
      return;
    }
    if (action.startsWith('preset:select:')) {
      const presetId = action.slice('preset:select:'.length);
      // 哨兵值 = 用户在预设下拉里选了「跟随默认」
      if (presetId === PRESET_FOLLOW_DEFAULT_SENTINEL) {
        await this.#handlePresetDefault(key, chatId, { updateMessageId: messageId });
        return;
      }
      await this.#handlePresetSelect(key, chatId, presetId, { updateMessageId: messageId });
      return;
    }
    if (action.startsWith('model:select:')) {
      const modelId = action.slice('model:select:'.length);
      await this.#handleModelSelect(key, chatId, modelId, { updateMessageId: messageId });
      return;
    }
    if (action.startsWith('use:')) {
      await this.#bindSession(key, chatId, action.slice('use:'.length), { updateMessageId: messageId });
      return;
    }
    if (action.startsWith('workspace:')) {
      await this.#switchWorkspace(key, chatId, action.slice('workspace:'.length), { updateMessageId: messageId });
      return;
    }
    if (action.startsWith('unwatch:')) {
      const result = await this.#runUnwatch(key, chatId, action.slice('unwatch:'.length));
      if (result.ok && messageId) {
        await this.#showSessions(
          { chatId, key },
          null,
          sessionPage,
          { updateMessageId: messageId, projectId: sessionProjectId },
        );
      }
      return;
    }
    if (action.startsWith('watch:')) {
      const sessionId = action.slice('watch:'.length);
      const result = await this.#runWatch(key, chatId, sessionId, {
        projectId: sessionProjectId,
      });
      if (result.ok && messageId) {
        await this.#showSessions(
          { chatId, key },
          null,
          sessionPage,
          { updateMessageId: messageId, projectId: sessionProjectId },
        );
      }
    }
  }

  #rememberMenu(key, menu) {
    if (this.#menus.size >= MAX_TRACKED_MENUS) {
      const oldest = this.#menus.keys().next().value;
      if (oldest !== undefined) this.#menus.delete(oldest);
    }
    this.#menus.delete(key);
    this.#menus.set(key, { ...menu, expiresAt: Date.now() + MENU_TTL_MS });
  }

  #takeMenu(key) {
    const menu = this.#menus.get(key);
    if (!menu) return null;
    if (menu.expiresAt < Date.now()) {
      this.#menus.delete(key);
      return null;
    }
    return menu;
  }

  async #handleMenuPick(menu, number, { chatId, key, event }) {
    if (menu.kind === 'menu') {
      // Number fallback for the total menu:
      // 1=项目列表 2=新会话 3=会话列表 4=状态 5=修复 6=帮助
      const actions = ['workspaces', 'new', 'sessions', 'status', 'repair', 'help'];
      const action = actions[number - 1];
      if (!action) {
        await this.#send(chatId, t('菜单没有这个编号，回复 /m 重新打开。'));
        return;
      }
      if (action === 'repair') {
        await this.#handleRepairCommand(event, '/repair');
        return;
      }
      await this.#handleCardAction(action, { chatId, key });
      return;
    }
    if (menu.kind === 'sessions') {
      const session = menu.sessions[number - 1];
      if (!session?.sessionId) {
        await this.#send(chatId, t('本页只有 {count} 个会话，回复 /sessionlist 重新查看。', { count: menu.sessions.length }));
        return;
      }
      // The number label sits on the session (bind) button of the row.
      await this.#handleCardAction(`use:${session.sessionId}`, { chatId, key });
      return;
    }
    if (menu.kind === 'workspaces') {
      const project = menu.projects[number - 1];
      if (!project) {
        await this.#send(chatId, t('只有 {count} 个项目，回复 /workspacelist 重新查看。', { count: menu.projects.length }));
        return;
      }
      await this.#handleCardAction(`workspace:${project.workspaceId}`, { chatId, key });
      return;
    }
    if (menu.kind === 'watches') {
      const entry = menu.entries[number - 1];
      if (!entry?.sessionId) {
        await this.#send(chatId, t('关注列表只有 {count} 个会话。', { count: menu.entries.length }));
        return;
      }
      await this.#handleCardAction(`unwatch:${entry.sessionId}`, { chatId, key });
    }
  }

  /** The sessions visible under the bot's archived policy. */
  #visibleSessions(sessions) {
    if (this.#state?.includesArchivedSessions?.() === false) {
      return sessions.filter((session) => session.archived !== true);
    }
    return sessions;
  }

  async #showSessions(
    { chatId, key },
    selector,
    page = 0,
    { updateMessageId = null, projectId = null } = {},
  ) {
    try {
      await this.#harness.whenWorkspaceReady?.(
        this.#signal ? { signal: this.#signal } : undefined,
      );
      const signal = this.#cardDataSignal();
      const projects = await this.#harness.listProjects({ signal });
      const project = projectId
        ? projects.find((item) => item.workspaceId === projectId)
        : selector == null
          ? this.#harness.currentProject?.()
          : /^\d+$/u.test(selector)
            ? projects[Number(selector) - 1]
            : null;
      if (!project) {
        await this.#send(chatId, selector == null
          ? t('当前机器人尚未选择项目。请先执行 /workspacelist。')
          : t('项目序号不存在，请先执行 /workspacelist。'));
        return;
      }
      const listed = await this.#harness.listProjectSessions(project.workspaceId, { signal });
      const sessions = this.#visibleSessions(Array.isArray(listed?.sessions) ? listed.sessions : []);
      if (sessions.length === 0) {
        await this.#send(chatId, t('项目：{title}\n该项目暂无会话。', { title: project.title }));
        return;
      }
      const pageCount = Math.ceil(sessions.length / MENU_PAGE_SIZE);
      const safePage = Number.isSafeInteger(page) && page > 0 ? Math.min(page, pageCount - 1) : 0;
      const watchedSet = new Set(
        (this.#state.watchEntries?.(key) ?? []).map((entry) => entry.sessionId),
      );
      const pageSlice = sessions.slice(safePage * MENU_PAGE_SIZE, (safePage + 1) * MENU_PAGE_SIZE);
      this.#rememberMenu(key, {
        kind: 'sessions',
        sessions: pageSlice.map((session) => ({ ...session, watched: watchedSet.has(session.sessionId) })),
      });
      await this.#sendCard(
        chatId,
        sessionListCard(project, sessions, safePage, sessions.length, watchedSet),
        {
          key,
          updateMessageId,
          sessionProjectId: project.workspaceId,
          sessionPage: safePage,
        },
      );
    } catch (error) {
      await this.#sendFailure(chatId, error, { logLabel: 'session list' });
    }
  }

  async #showWorkspaces({ chatId, key }, { updateMessageId = null } = {}) {
    try {
      const projects = await this.#harness.listProjects({ signal: this.#cardDataSignal() });
      const current = this.#harness.currentProject?.() ?? null;
      this.#rememberMenu(key, { kind: 'workspaces', projects });
      await this.#sendCard(
        chatId,
        projectListCard(projects, current),
        { key, updateMessageId },
      );
    } catch (error) {
      await this.#sendFailure(chatId, error, { logLabel: 'project list' });
    }
  }

  async #bindSession(key, chatId, sessionId, { updateMessageId = null } = {}) {
    try {
      const bound = await this.#harness.bindWorkspaceSession(key, sessionId);
      const title = String(bound?.title ?? '').replace(/\s+/gu, ' ').trim() || t('暂无标题');
      await this.#send(chatId, t('已绑定会话「{title}」\nID：{id}', { title, id: bound?.sessionId ?? sessionId }));
      await this.#sendMenuCard(key, chatId, { updateMessageId });
    } catch (error) {
      await this.#sendFailure(chatId, error, {
        logLabel: 'session binding',
        userMessage: t('绑定失败：{message}', { message: safeErrorText(error) }),
      });
    }
  }

  async #switchWorkspace(key, chatId, workspaceId, { updateMessageId = null } = {}) {
    try {
      const projects = await this.#harness.listProjects({ signal: this.#cardDataSignal() });
      const project = projects.find((item) => item.workspaceId === workspaceId);
      if (!project) {
        const error = new Error('The selected project no longer exists');
        error.code = 'workspace-project-not-found';
        throw error;
      }
      const current = await this.#harness.switchProject(project.workspaceId);
      await this.#send(chatId, t('已切换到项目「{title}」。', { title: current.title }));
      await this.#sendMenuCard(key, chatId, { updateMessageId });
    } catch (error) {
      if (error?.code === 'workspace-project-not-found') {
        await this.#send(chatId, t('这个项目已不存在，请执行 /workspacelist 后重新选择。'));
        await this.#showWorkspaces({ chatId, key }, { updateMessageId });
        return;
      }
      await this.#sendFailure(chatId, error, {
        logLabel: 'project switch',
        userMessage: t('暂时无法切换项目，请稍后重试。'),
      });
    }
  }

  #rememberCardRoute(messageId, chatId, options) {
    if (!options.key || !messageId) return;
    this.#cardKeys.delete(messageId);
    this.#cardKeys.set(messageId, {
      key: options.key,
      chatId,
      sessionProjectId: typeof options.sessionProjectId === 'string' && options.sessionProjectId
        ? options.sessionProjectId
        : null,
      sessionPage: Number.isSafeInteger(options.sessionPage) && options.sessionPage >= 0
        ? options.sessionPage
        : 0,
    });
    if (this.#cardKeys.size > 200) {
      const oldest = this.#cardKeys.keys().next().value;
      if (oldest !== undefined) this.#cardKeys.delete(oldest);
    }
  }

  async #sendCard(chatId, cardJson, options = {}) {
    const updateMessageId = nonEmptyString(options.updateMessageId);

    if (updateMessageId) {
      try {
        const response = await this.#client.im.v1.message.patch({
          path: { message_id: updateMessageId },
          data: { content: cardJson },
        });
        if (response?.code && response.code !== 0) {
          throw new Error(`Feishu card update failed: ${response.msg || response.code}`);
        }
        this.#rememberCardRoute(updateMessageId, chatId, options);
        return updateMessageId;
      } catch (error) {
        this.#logger.warn?.('[dsh-feishu] card update failed:', error?.code ?? error?.message ?? error, 'sending new');
      }
    }

    const response = await this.#client.im.v1.message.create({
      params: { receive_id_type: 'chat_id' },
      data: { receive_id: chatId, msg_type: 'interactive', content: cardJson },
    });
    if (response?.code && response.code !== 0) {
      throw new Error(`Feishu card send failed: ${response.msg || response.code}`);
    }
    const messageId = nonEmptyString(response?.data?.message_id);
    this.#rememberCardRoute(messageId, chatId, options);
    return messageId;
  }

  async #sendMenuCard(key, chatId, { updateMessageId = null } = {}) {
    let currentSessionId = null;
    let directSessionTitle = null;
    try {
      const sessionId = this.#state.sessionFor(key);
      if (typeof sessionId === 'string' && sessionId) {
        currentSessionId = sessionId;
        const session = this.#harness.workspaceSession?.(sessionId);
        directSessionTitle = nonEmptyString(session?.title)
          ?? nonEmptyString(session?.name)
          ?? nonEmptyString(session?.displayName);
      }
    } catch { /* render without a selected session */ }

    const dataSignal = this.#cardDataSignal();
    // Independent sections start together. Each one degrades on its own so a
    // slow preset/model RPC cannot force redundant session-list scans.
    const projectTask = this.#harness.listProjects({ signal: dataSignal })
      .then((projects) => ({ projects, current: this.#harness.currentProject?.() ?? null }))
      .catch(() => {
        const current = this.#harness.currentProject?.() ?? null;
        return { current, projects: current ? [current] : [] };
      });
    const sessionTask = (async () => {
      const current = this.#harness.currentProject?.() ?? null;
      if (!current || typeof this.#harness.listProjectSessions !== 'function') return [];
      try {
        const listed = await this.#harness.listProjectSessions(current.workspaceId, { signal: dataSignal });
        return this.#visibleSessions(Array.isArray(listed?.sessions) ? listed.sessions : []);
      } catch {
        return [];
      }
    })();
    const presetTask = (async () => {
      try {
        const settings = await this.#harness.agentPresetSettings({ signal: dataSignal });
        return { ...settings.agentPresetCatalog, _currentId: settings.agentPreset };
      } catch {
        return null;
      }
    })();
    const modelTask = (async () => {
      try {
        if (currentSessionId) {
          const session = this.#harness.workspaceSession?.(currentSessionId);
          if (typeof session?.models === 'function') {
            return await session.models({ signal: dataSignal });
          }
        }
        return await this.#harness.listModels({ signal: dataSignal });
      } catch {
        return null;
      }
    })();

    const [snapshot, listedSessions, presetCatalog, modelCatalog] = await Promise.all([
      projectTask,
      sessionTask,
      presetTask,
      modelTask,
    ]);
    const projects = Array.isArray(snapshot.projects) ? snapshot.projects : [];
    const currentProject = snapshot.current ?? null;
    const currentMatch = listedSessions.find((session) => session.sessionId === currentSessionId);
    const currentSessionTitle = currentSessionId
      ? nonEmptyString(currentMatch?.title)
        ?? nonEmptyString(currentMatch?.name)
        ?? directSessionTitle
        ?? currentSessionId
      : null;
    let sessions = listedSessions
      .map((session) => ({
        id: session.sessionId,
        title: session.title ?? session.name ?? session.sessionId,
      }))
      .slice(0, 20);
    // 确保当前绑定会话始终出现在下拉最前（它可能不在最近列表里），
    // 否则 initial_index 找不到默认展示项，下拉会显示占位文本。
    if (currentSessionId) {
      sessions = sessions.filter((s) => s.id !== currentSessionId);
      sessions.unshift({ id: currentSessionId, title: currentSessionTitle ?? currentSessionId });
      sessions = sessions.slice(0, 20);
    }
    const archiveVisible = this.#state?.includesArchivedSessions?.() ?? false;
    this.#rememberMenu(key, { kind: 'menu', chatId });
    await this.#sendCard(
      chatId,
      menuCard({
        projects, currentProject,
        currentSession: currentSessionId ? { id: currentSessionId, title: currentSessionTitle } : null,
        sessions, archiveVisible, presetCatalog, modelCatalog,
      }),
      { key, updateMessageId },
    );
  }

  /**
   * Fetch the preset catalog and show the preset selection card.
   */
  async #showPresetCard(key, chatId, { updateMessageId = null } = {}) {
    try {
      const settings = await this.#harness.agentPresetSettings({ signal: this.#cardDataSignal() });
      const catalog = settings.agentPresetCatalog;
      // Inject the current preset id so the card can render the selection
      catalog._currentId = settings.agentPreset;
      await this.#sendCard(chatId, presetCard(catalog), { key, updateMessageId });
    } catch (error) {
      await this.#sendFailure(chatId, error, { logLabel: 'preset card' });
    }
  }

  /**
   * Fetch the model catalog and show the model selection card.
   */
  async #showModelCard(key, chatId, { updateMessageId = null } = {}) {
    try {
      const signal = this.#cardDataSignal();
      await this.#harness.ensureRunning({ signal });
      // Try to get the session-bound catalog first, fall back to harness-level
      const sessionId = this.#state?.sessionFor?.(key);
      let catalog;
      if (typeof sessionId === 'string' && sessionId) {
        const session = this.#harness.workspaceSession(sessionId);
        if (session?.models) {
          catalog = await session.models({ signal });
        }
      }
      if (!catalog) {
        catalog = await this.#harness.listModels({ signal });
      }
      await this.#sendCard(chatId, modelCard(catalog), { key, updateMessageId });
    } catch (error) {
      await this.#sendFailure(chatId, error, { logLabel: 'model card' });
    }
  }

  /**
   * Gather system status and show the status card.
   */
  async #showStatusText(key, chatId) {
    try {
      await this.#harness.ensureRunning({ signal: this.#signal });
      const lines = [t('连接正常')];
      const project = this.#harness.currentProject?.() ?? null;
      lines.push(project
        ? t('项目：{title}', { title: project.title })
        : t('项目：未选择项目'));
      const settings = typeof this.#harness.agentPresetSettings === 'function'
        ? await this.#harness.agentPresetSettings({ signal: this.#signal }).catch(() => null)
        : null;
      if (settings) {
        const item = settings.agentPresetCatalog?.items?.find((i) => i.id === settings.agentPreset);
        lines.push(t('预设：{preset}', {
          preset: item
            ? `${item.label}（${item.id}）`
            : (settings.agentPreset || t('跟随默认')),
        }));
      }
      await this.#send(chatId, lines.join('\n'));
    } catch (error) {
      await this.#sendFailure(chatId, error, { logLabel: 'status text' });
    }
  }

  async #showStatusCard(key, chatId, { updateMessageId = null } = {}) {
    try {
      const signal = this.#cardDataSignal();
      await this.#harness.ensureRunning({ signal });
      const info = { connected: true, projectTitle: null, preset: null, model: null, sessionCount: 0 };

      try {
        info.projectTitle = this.#harness.currentProject?.()?.title ?? null;
      } catch { /* ignore */ }

      // Preset
      try {
        const settings = await this.#harness.agentPresetSettings({ signal });
        const item = settings.agentPresetCatalog.items.find((i) => i.id === settings.agentPreset);
        info.preset = item
          ? `${item.label}（${item.id}）`
          : (settings.agentPreset || t('跟随默认'));
      } catch { /* ignore */ }

      // Model (from bound session or harness)
      try {
        const sessionId = this.#state?.sessionFor?.(key);
        if (typeof sessionId === 'string' && sessionId) {
          const session = this.#harness.workspaceSession(sessionId);
          if (session?.models) {
            const cat = await session.models({ signal });
            if (cat.current) info.model = `${cat.current.provider}/${cat.current.model}`;
          }
        }
      } catch { /* ignore */ }

      // Session count
      try {
        const project = this.#harness.currentProject?.() ?? null;
        if (project) {
          const listed = await this.#harness.listProjectSessions(project.workspaceId, { signal });
          if (Array.isArray(listed?.sessions)) info.sessionCount = listed.sessions.length;
        }
      } catch { /* ignore */ }

      await this.#sendCard(chatId, statusCard(info), { key, updateMessageId });
    } catch (error) {
      await this.#sendFailure(chatId, error, { logLabel: 'status card' });
    }
  }

  /**
   * Show the help card with all command descriptions.
   */
  async #showHelpCard(key, chatId, { updateMessageId = null } = {}) {
    await this.#sendCard(
      chatId,
      helpCard(WORKSPACE_HELP_LINES.map((line) => t(line))),
      { key, updateMessageId },
    );
  }

  /**
   * Run the /compact command and show the result.
   */
  async #handleCompact(key, chatId) {
    try {
      const result = await runCompactCommand(
        '/compact', this.#harness, this.#state, key, { signal: this.#signal },
      );
      await this.#send(chatId, result?.message || t('上下文压缩失败。'));
    } catch (error) {
      await this.#sendFailure(chatId, error, { logLabel: 'compact' });
    }
  }

  /**
   * Stop the running task in the bound session (mirrors `/stop`).
   */
  async #handleStop(key, chatId, { silent = false } = {}) {
    try {
      const result = await runControlCommand(
        '/stop', this.#harness, this.#state, key, {
          signal: this.#signal,
          control: { owner: this, key },
        },
      );
      if (result?.stopped) {
        await Promise.allSettled([
          this.#cancelPendingInteraction(key),
          this.#approvals.closeRoute(key),
        ]);
      }
      if (!silent) {
        await this.#send(chatId, result?.message || t('/stop 执行完成。'));
      }
      return result;
    } catch (error) {
      if (!silent) await this.#sendFailure(chatId, error, { logLabel: 'stop' });
      else throw error;
    }
  }

  async #handleStopReply(stopReply, { chatId, key }) {
    const run = this.#replyRuns.get(key);
    const stale = Boolean(run && stopReply.runId && run.runId && run.runId !== stopReply.runId);
    const body = run?.body || t('已停止');
    if (!stale && run?.status === 'running') {
      await this.#handleStop(key, chatId, { silent: true });
    }
    return cardActionCallbackCard(buildStreamingReplyCard({
      status: 'stopped',
      body,
      streaming: false,
    }));
  }

  /**
   * Show the steer card (quick-select dropdown + free-text input).
   */
  async #showSteerCard(key, chatId, { updateMessageId = null } = {}) {
    const hasSession = Boolean(this.#state.sessionFor?.(key));
    this.#rememberMenu(key, { kind: 'steer' });
    await this.#sendCard(chatId, steerCard({ hasSession }), { key, updateMessageId });
  }

  /**
   * Send a steer instruction to the bound session (mirrors `/steer <text>`).
   */
  async #sendSteer(entry, text) {
    const { key, chatId } = entry;
    const result = await runControlCommand(
      `/steer ${text}`, this.#harness, this.#state, key, {
        signal: this.#signal,
        pendingInteraction: this.#hasPendingInteraction(key),
        control: { owner: this, key },
      },
    );
    await this.#send(chatId, result?.message || t('已提交补充指令。'));
  }

  /**
   * Reset the preset to follow the Host default.
   */
  async #handlePresetDefault(key, chatId, { updateMessageId = null } = {}) {
    try {
      const result = await runPresetCommand(
        '/preset --default', this.#harness, this.#state, key, { signal: this.#signal },
      );
      for (const reply of result?.messages ?? [result?.message]) {
        if (reply) await this.#send(chatId, reply);
      }
    } catch (error) {
      await this.#sendFailure(chatId, error, { logLabel: 'preset reset' });
      return;
    }
    try {
      await this.#sendMenuCard(key, chatId, { updateMessageId });
    } catch (error) {
      this.#logger.warn?.('[dsh-feishu] menu refresh failed after preset reset:', error.message);
    }
  }

  /**
   * Handle preset selection from the preset dropdown.
   */
  async #handlePresetSelect(key, chatId, presetId, { updateMessageId = null } = {}) {
    try {
      const selector = /^\d+$/u.test(presetId) ? `id:${presetId}` : presetId;
      const result = await runPresetCommand(
        `/preset ${selector}`, this.#harness, this.#state, key, { signal: this.#signal },
      );
      for (const reply of result?.messages ?? [result?.message]) {
        if (reply) await this.#send(chatId, reply);
      }
    } catch (error) {
      await this.#sendFailure(chatId, error, { logLabel: 'preset selection' });
      return;
    }
    try {
      await this.#sendMenuCard(key, chatId, { updateMessageId });
    } catch (error) {
      this.#logger.warn?.('[dsh-feishu] menu refresh failed after preset select:', error.message);
    }
  }

  /**
   * Handle model selection from the model dropdown.
   *
   * Reuses `runModelCommand` (the same path as the `/model <id>` text
   * command) so model IDs containing `/` (e.g.
   * `openrouter/anthropic/claude-sonnet-4`) keep working, and all the
   * catalog validation, busy checks, pending-interaction checks and the
   * session binding lock stay in one place.
   */
  async #handleModelSelect(key, chatId, modelId, { updateMessageId = null } = {}) {
    try {
      const result = await runModelCommand(
        `/model ${modelId}`, this.#harness, this.#state, key, {
          signal: this.#signal,
          pendingInteraction: this.#hasPendingInteraction(key),
          control: { owner: this, key },
        },
      );
      for (const reply of result?.messages ?? [result?.message]) {
        if (reply) await this.#send(chatId, reply);
      }
    } catch (error) {
      await this.#sendFailure(chatId, error, { logLabel: 'model selection' });
      return;
    }
    try {
      await this.#sendMenuCard(key, chatId, { updateMessageId });
    } catch (error) {
      this.#logger.warn?.('[dsh-feishu] menu refresh failed after model select:', error.message);
    }
  }

  // ── Watches: read-only session tracking + completion pushes ─────────────

  #ensureEventWatcher() {
    if (this.#eventWatcher) return;
    if (typeof this.#harness?.watchHarnessEvents !== 'function') return;
    if (this.#signal?.aborted) return;
    const signal = this.#signal ?? new AbortController().signal;
    try {
      this.#eventWatcher = this.#harness.watchHarnessEvents({
        signal,
        onSessionEvent: (payload) => this.#onHarnessEvent(payload),
        onReconnect: () => {
          void this.#queueEventTask(() => this.#compensateMissedEvents());
        },
      });
      Promise.resolve(this.#eventWatcher).catch((error) => {
        if (!signal.aborted) {
          this.#logger.warn?.('[dsh-feishu] event watcher stopped:', error.message);
        }
      });
    } catch (error) {
      this.#eventWatcher = null;
      this.#logger.warn?.('[dsh-feishu] event watcher failed to start:', error.message);
    }
  }

  #queueEventTask(task) {
    const next = this.#eventTail.then(task, task).catch((error) => {
      if (!this.#signal?.aborted) {
        this.#logger.warn?.('[dsh-feishu] completion event failed:', error.message);
      }
    });
    this.#eventTail = next;
    return next;
  }

  /** Resolve a /watch target against the Host project catalog without switching projects. */
  async #resolveWatchTarget(target, { projectId = null, signal = this.#signal } = {}) {
    if (typeof target !== 'string' || target === '') {
      return { error: t('用法：/watch <Session ID 或当前项目会话序号>') };
    }
    const numeric = /^\d{1,4}$/.test(target) ? Number(target) : null;
    const current = this.#harness.currentProject?.() ?? null;
    const projects = projectId
      ? (await this.#harness.listProjects({ signal })).filter((project) => project.workspaceId === projectId)
      : [current, ...(await this.#harness.listProjects({ signal }))
        .filter((project) => project.workspaceId !== current?.workspaceId)].filter(Boolean);
    if (numeric !== null) {
      if (!current) return { error: t('当前机器人没有可用的项目，无法按序号解析会话。') };
      const listed = await this.#harness.listProjectSessions(current.workspaceId, { signal });
      const sessions = this.#visibleSessions(Array.isArray(listed?.sessions) ? listed.sessions : []);
      const session = sessions[numeric - 1];
      if (!session?.sessionId) {
        return { error: t('当前项目只有 {count} 个会话。', { count: sessions.length }) };
      }
      return {
        sessionId: session.sessionId,
        title: session.title ?? t('暂无标题'),
        ...(validLastSeq(session.lastSeq) ? { lastSeq: session.lastSeq } : {}),
      };
    }
    for (const project of projects) {
      const listed = await this.#harness.listProjectSessions(project.workspaceId, { signal });
      const sessions = Array.isArray(listed?.sessions) ? listed.sessions : [];
      const session = sessions.find((candidate) => candidate.sessionId === target);
      if (session) {
        return {
          sessionId: target,
          title: session.title ?? t('暂无标题'),
          ...(validLastSeq(session.lastSeq) ? { lastSeq: session.lastSeq } : {}),
        };
      }
    }
    return { error: t('没有找到这个会话，请用 /sessionlist 查看可用会话。') };
  }

  async #freshWatchTargets(projectId) {
    const selectedProjectId = nonEmptyString(projectId)
      ?? this.#harness.currentProject?.()?.workspaceId
      ?? null;
    if (!selectedProjectId || typeof this.#harness?.listProjectSessions !== 'function') {
      return new Map();
    }
    const listed = await this.#harness.listProjectSessions(
      selectedProjectId,
      { signal: this.#cardDataSignal() },
    );
    return new Map(this.#visibleSessions(Array.isArray(listed?.sessions) ? listed.sessions : [])
      .filter((session) => nonEmptyString(session?.sessionId))
      .map((session) => [session.sessionId, {
        sessionId: session.sessionId,
        title: session.title ?? session.name ?? t('暂无标题'),
        ...(validLastSeq(session.lastSeq) ? { lastSeq: session.lastSeq } : {}),
      }]));
  }

  async #latestSessionSeq(sessionId) {
    if (typeof this.#harness?.rpc !== 'function') return null;
    const history = await this.#harness.rpc(
      'session.history',
      { sessionId, maxMessages: 20 },
      30_000,
      { signal: this.#signal },
    );
    return orderedHistoryEvents(history).at(-1)?.seq ?? -1;
  }

  async #runWatch(key, chatId, target, {
    notify = true,
    validatedTarget = null,
    projectId = null,
  } = {}) {
    const reply = async (message) => {
      if (!notify) return;
      await this.#send(chatId, message).catch((error) => {
        this.#logger.warn?.('[dsh-feishu] watch notification failed:', error.message);
      });
    };
    this.#ensureEventWatcher();
    if (typeof this.#state?.setWatch !== 'function') {
      await reply(t('当前状态存储不支持关注。'));
      return { ok: false, changed: false, reason: 'unsupported' };
    }
    let resolved;
    try {
      resolved = validatedTarget?.sessionId === target
        ? validatedTarget
        : await this.#resolveWatchTarget(target, {
          projectId,
          signal: projectId ? this.#cardDataSignal() : this.#signal,
        });
    } catch (error) {
      await reply(t('无法解析会话：{message}', { message: safeErrorText(error) }));
      return { ok: false, changed: false, reason: 'resolve' };
    }
    if (resolved.error) {
      await reply(resolved.error);
      return { ok: false, changed: false, reason: 'not-found' };
    }
    const existing = this.#state.watchEntries?.(key) ?? [];
    const existingEntry = existing.find((entry) => entry.sessionId === resolved.sessionId);
    if (!existingEntry && existing.length >= MAX_WATCHES_PER_KEY) {
      await reply(t('每个聊天最多关注 {count} 个会话。', { count: MAX_WATCHES_PER_KEY }));
      return { ok: false, changed: false, reason: 'limit' };
    }
    try {
      const lastSeq = typeof existingEntry?.lastSeq === 'number'
        ? existingEntry.lastSeq
        : validLastSeq(resolved.lastSeq)
          ? resolved.lastSeq
          : await this.#latestSessionSeq(resolved.sessionId);
      await this.#state.setWatch(key, {
        sessionId: resolved.sessionId,
        title: resolved.title,
        chatId,
        lastSeq,
      });
      await reply(t('已关注会话「{title}」，任务完成会推送结果。', { title: String(resolved.title).replace(/\s+/gu, ' ') }));
      await this.#queueEventTask(() => this.#compensateSession(resolved.sessionId));
      return { ok: true, changed: !existingEntry, entry: this.#state.watchEntry?.(key, resolved.sessionId) };
    } catch (error) {
      await reply(t('关注失败：{message}', { message: safeErrorText(error) }));
      return { ok: false, changed: false, reason: 'persist' };
    }
  }

  async #runUnwatch(key, chatId, target, { notify = true } = {}) {
    const reply = async (message) => {
      if (!notify) return;
      await this.#send(chatId, message).catch((error) => {
        this.#logger.warn?.('[dsh-feishu] unwatch notification failed:', error.message);
      });
    };
    if (typeof this.#state?.removeWatch !== 'function') {
      return { ok: false, changed: false, reason: 'unsupported' };
    }
    const entries = this.#state.watchEntries?.(key) ?? [];
    const entry = typeof target === 'string' && /^\d{1,4}$/.test(target)
      ? entries[Number(target) - 1]
      : entries.find((candidate) => candidate.sessionId === target);
    if (!entry) {
      await reply(t('关注列表里没有这个会话，回复 /watchlist 查看。'));
      return { ok: true, changed: false, reason: 'absent' };
    }
    try {
      await this.#state.removeWatch(key, entry.sessionId);
      this.#failedWatchSeqs.delete(`${key}\0${entry.sessionId}`);
    } catch (error) {
      await reply(t('取消失败：{message}', { message: safeErrorText(error) }));
      return { ok: false, changed: false, reason: 'persist' };
    }
    await reply(t('已取消关注「{title}」。', { title: String(entry.title ?? '').replace(/\s+/gu, ' ') }));
    return { ok: true, changed: true, entry };
  }

  async #showWatchList(key, chatId, { updateMessageId = null } = {}) {
    const entries = this.#state.watchEntries?.(key) ?? [];
    // 收集可选会话（用于「添加关注」多选下拉）；失败则传空数组 → 只渲染移除/列表。
    let availableSessions = [];
    let currentProjectId = null;
    try {
      currentProjectId = this.#harness.currentProject?.()?.workspaceId ?? null;
      if (currentProjectId && typeof this.#harness?.listProjectSessions === 'function') {
        const listed = await this.#harness.listProjectSessions(
          currentProjectId,
          { signal: this.#cardDataSignal() },
        );
        availableSessions = this.#visibleSessions(
          Array.isArray(listed?.sessions) ? listed.sessions : [],
        )
          .map((session) => ({
            sessionId: session.sessionId,
            title: session.title ?? session.name ?? session.sessionId,
          }));
      }
    } catch { /* add-select section degrades to remove-only */ }
    this.#rememberMenu(key, { kind: 'watches', entries });
    await this.#sendCard(
      chatId,
      watchListCard(entries, availableSessions),
      {
        key,
        updateMessageId,
        sessionProjectId: currentProjectId,
      },
    );
  }

  /** Queue live turn completions behind any reconnect compensation. */
  #onHarnessEvent({ sessionId, event }) {
    if (this.#signal?.aborted
      || !sessionId
      || !event
      || typeof event !== 'object'
      || event.type !== 'turn/end'
      || !Number.isFinite(event.seq)) return;
    void this.#queueEventTask(async () => {
      const hasFailedDelivery = (this.#state.keysWatching?.(sessionId) ?? [])
        .some((key) => this.#failedWatchSeqs.has(`${key}\0${sessionId}`));
      if (hasFailedDelivery) await this.#compensateSession(sessionId);
      await this.#deliverCompletion(sessionId, event);
    });
  }

  async #deliverCompletion(sessionId, event) {
    if (this.#signal?.aborted || typeof this.#state?.keysWatching !== 'function') return;
    const reason = event?.data?.reason?.kind ?? event?.data?.reason ?? null;
    for (const key of this.#state.keysWatching(sessionId)) {
      if (this.#signal?.aborted) return;
      const entry = this.#state.watchEntry?.(key, sessionId);
      const deliveryKey = `${key}\0${sessionId}`;
      let failedSeq = this.#failedWatchSeqs.get(deliveryKey);
      if (typeof failedSeq === 'number'
        && typeof entry?.lastSeq === 'number'
        && entry.lastSeq >= failedSeq) {
        this.#failedWatchSeqs.delete(deliveryKey);
        failedSeq = undefined;
      }
      if (!entry?.chatId
        || (typeof entry.lastSeq === 'number' && entry.lastSeq >= event.seq)
        || (typeof failedSeq === 'number' && event.seq > failedSeq)) continue;
      try {
        await this.#sendCard(
          entry.chatId,
          completionCard(sessionId, entry.title, reason),
          { key },
        );
        const current = this.#state.watchEntry?.(key, sessionId);
        if (!current
          || current.chatId !== entry.chatId
          || (typeof current.lastSeq === 'number' && current.lastSeq >= event.seq)) continue;
        await this.#state.setWatch(key, { ...current, lastSeq: event.seq });
        if (failedSeq === event.seq) this.#failedWatchSeqs.delete(deliveryKey);
      } catch (error) {
        this.#failedWatchSeqs.set(
          deliveryKey,
          typeof failedSeq === 'number' ? Math.min(failedSeq, event.seq) : event.seq,
        );
        this.#logger.warn?.('[dsh-feishu] completion push failed:', error.message);
      }
    }
  }

  async #compensateSession(sessionId) {
    if (this.#signal?.aborted || typeof this.#harness?.rpc !== 'function') return;
    try {
      const history = await this.#harness.rpc(
        'session.history',
        { sessionId, maxMessages: 20 },
        30_000,
        { signal: this.#signal },
      );
      const events = orderedHistoryEvents(history);
      const latestSeq = events.at(-1)?.seq ?? -1;
      const keys = typeof this.#state?.keysWatching === 'function'
        ? this.#state.keysWatching(sessionId)
        : [];

      // Watches created by older versions have no baseline. Establish one
      // without replaying completions that predate the watch.
      for (const key of keys) {
        const entry = this.#state.watchEntry?.(key, sessionId);
        if (entry && typeof entry.lastSeq !== 'number') {
          await this.#state.setWatch(key, { ...entry, lastSeq: latestSeq });
        }
      }

      for (const event of events) {
        if (event.type === 'turn/end') await this.#deliverCompletion(sessionId, event);
      }
    } catch (error) {
      if (!this.#signal?.aborted) {
        this.#logger.warn?.(`[dsh-feishu] watch compensation failed for ${sessionId}:`, error.message);
      }
    }
  }

  /** Replay recent turn completions missed while the mux was disconnected. */
  async #compensateMissedEvents() {
    const sessionIds = typeof this.#state?.watchedSessionIds === 'function'
      ? this.#state.watchedSessionIds()
      : [];
    for (const sessionId of sessionIds) {
      if (this.#signal?.aborted) return;
      await this.#compensateSession(sessionId);
    }
  }

  #interactionAskOptions(event, key, files) {
    return {
      timeoutMs: this.#replyTimeoutMs,
      signal: this.#signal,
      control: { owner: this, key },
      onInteraction: (interaction) => this.#handleInteraction(interaction, {
        key,
        actor: senderOpenId(event),
        chatId: event.message.chat_id,
        requiresMention: event.message.chat_type !== 'p2p',
      }),
      onInteractionResolved: (resolution) => this.#handleInteractionResolved(resolution),
      files,
    };
  }

  async #sendAnswerText(chatId, answer, { deliveryId, presentation }) {
    const providerMessageIds = [];
    for (const chunk of splitText(answer)) {
      this.#signal?.throwIfAborted();
      const messageId = await this.#send(chatId, chunk);
      if (messageId) providerMessageIds.push(messageId);
    }
    return createDeliveryReceipt({
      deliveryId,
      presentation,
      providerMessageIds,
    });
  }

  async #deliverArtifacts(chatId, replyTo, artifacts = [], baseReceipt) {
    const delivery = await deliverOutboundArtifacts({
      artifacts,
      baseReceipt,
      deliveryId: baseReceipt?.deliveryId ?? artifacts[0]?.deliveryKey ?? replyTo,
      aggregatePresentation: baseReceipt ? 'feishu-text-and-files' : 'feishu-files',
      channelKey: 'feishu',
      signal: this.#signal,
      sendImage: typeof this.#channel?.sendImage === 'function'
        ? (file) => this.#channel.sendImage(chatId, file, {
            replyTo,
            signal: this.#signal,
          })
        : undefined,
      sendFile: typeof this.#channel?.sendFile === 'function'
        ? (file) => this.#channel.sendFile(chatId, file, {
            replyTo,
            signal: this.#signal,
          })
        : undefined,
      onFailure: (artifact, error) => setLastMessageFailure(this.#status, error, {
        userMessage: artifactFailureText(artifact?.fileName, error),
        reason: error?.code,
      }),
      sendFailureNotice: async (_artifact, _error, failure) => ({
        messageId: await this.#send(
          chatId,
          messageFailureText(failure),
        ),
      }),
      logger: this.#logger,
    });
    this.#status.artifactsSent = (this.#status.artifactsSent ?? 0)
      + delivery.artifactsSent;
    this.#status.artifactSendErrors = (this.#status.artifactSendErrors ?? 0)
      + delivery.artifactSendErrors;
    if (!delivery.receipt) {
      return {
        receipt: createDeliveryReceipt({
          deliveryId: replyTo,
          presentation: 'feishu-files',
        }),
        failureNoticeVisible: delivery.failureNoticeVisible,
        artifactSendErrors: delivery.artifactSendErrors,
      };
    }
    return {
      receipt: delivery.receipt,
      failureNoticeVisible: delivery.failureNoticeVisible,
      artifactSendErrors: delivery.artifactSendErrors,
    };
  }

  async #answerWithStream(event, key, message, { onAskComplete } = {}) {
    const chatId = event.message.chat_id;
    const messageId = event.message.message_id;
    const text = message.content;
    let askCompleted = false;
    const markAskComplete = () => {
      if (askCompleted) return;
      askCompleted = true;
      onAskComplete?.();
    };
    const content = hasInboundImages(message)
      ? await promptContentForMessage(message, { signal: this.#signal })
      : undefined;
    if (!this.#channel?.stream) {
      const { answer, artifacts = [] } = await askInWorkspaceSession({
        harness: this.#harness,
        state: this.#state,
        key,
        text,
        content,
        createOptions: { signal: this.#signal },
        existsOptions: { signal: this.#signal },
        askOptions: this.#interactionAskOptions(event, key, message.files),
      });
      markAskComplete();
      let textReceipt;
      let textSendError = null;
      try {
        textReceipt = await this.#sendAnswerText(
          chatId,
          answerTextForDelivery(answer, artifacts),
          {
            deliveryId: messageId,
            presentation: 'feishu-text',
          },
        );
      } catch (error) {
        textSendError = channelDeliveryFailure(error);
        this.#logger.warn?.(
          '[dsh-feishu] final text delivery failed; continuing with result files:',
          error,
        );
      }
      const delivery = await this.#deliverArtifacts(chatId, messageId, artifacts, textReceipt);
      const artifactDispatched = delivery.receipt.artifacts.some(
        ({ outcome }) => outcome === 'sent' || outcome === 'unknown',
      );
      if (textSendError && !artifactDispatched && !delivery.failureNoticeVisible) {
        throw textSendError;
      }
      if (textSendError && delivery.artifactSendErrors === 0) {
        setLastMessageFailure(this.#status, textSendError);
      }
      this.#status.streamFallbacks = (this.#status.streamFallbacks ?? 0) + 1;
      return { ...delivery, textDeliveryErrors: textSendError ? 1 : 0 };
    }

    let promptStarted = false;
    let completedAnswer = '';
    let completedArtifacts = [];
    let presentedFailure = null;
    let stream;
    const run = {
      runId: randomUUID(),
      body: '',
      status: 'running',
    };
    this.#replyRuns.set(key, run);
    try {
      stream = await this.#channel.stream(chatId, {
        markdown: async (controller) => {
          promptStarted = true;
          let streamedBody;
          const askOptions = {
            ...this.#interactionAskOptions(event, key, message.files),
            onUpdate: async (update) => {
              const next = nextReplyCardBody(update, streamedBody);
              if (next == null || next === streamedBody) return;
              streamedBody = next;
              run.body = next;
              await controller.setContent(next);
              this.#status.streamUpdates = (this.#status.streamUpdates ?? 0) + 1;
            },
          };
          try {
            const completed = await askInWorkspaceSession({
              harness: this.#harness,
              state: this.#state,
              key,
              text,
              content,
              createOptions: { signal: this.#signal },
              existsOptions: { signal: this.#signal },
              askOptions,
            });
            markAskComplete();
            completedAnswer = completed.answer;
            completedArtifacts = completed.artifacts ?? [];
            const finalText = answerTextForDelivery(completedAnswer, completedArtifacts);
            if (finalText !== streamedBody) await controller.setContent(finalText);
            run.body = finalText || streamedBody || run.body;
            run.status = 'done';
          } catch (error) {
            if (error?.code === 'turn-stopped' || this.#signal?.aborted) {
              run.status = 'stopped';
              throw error;
            }
            if (completedAnswer || completedArtifacts.length > 0) throw error;
            try {
              const notice = this.#failureNoticeText(error);
              run.body = notice;
              run.status = 'failed';
              await controller.setContent(notice);
              controller.fail?.();
            } catch {
              throw error;
            }
            presentedFailure = error;
          }
        },
      }, {
        replyTo: messageId,
        conversationKey: key,
        runId: run.runId,
        onCardReady: ({ messageId: cardMessageId }) => {
          this.#rememberCardRoute(cardMessageId, chatId, { key });
        },
      });
      if (run.status === 'running') run.status = presentedFailure ? 'failed' : 'done';
      if (presentedFailure) {
        this.#status.streamErrors = (this.#status.streamErrors ?? 0) + 1;
        throw new StreamPresentedError(presentedFailure);
      }
      const delivery = await this.#deliverArtifacts(
        chatId,
        messageId,
        completedArtifacts,
        createDeliveryReceipt({
          deliveryId: messageId,
          presentation: 'feishu-cardkit',
          providerMessageIds: stream?.messageId ? [stream.messageId] : [],
        }),
      );
      this.#status.streamResponses = (this.#status.streamResponses ?? 0) + 1;
      return delivery.receipt;
    } catch (error) {
      if (error instanceof StreamPresentedError) throw error;
      this.#status.streamErrors = (this.#status.streamErrors ?? 0) + 1;
      if (completedAnswer || completedArtifacts.length > 0) {
        this.#logger.warn?.(
          '[dsh-feishu] native stream failed after generation; sending final text:',
          error.message,
        );
        let textReceipt;
        let textSendError = null;
        try {
          textReceipt = await this.#sendAnswerText(
            chatId,
            answerTextForDelivery(completedAnswer, completedArtifacts),
            {
              deliveryId: messageId,
              presentation: 'feishu-text-fallback',
            },
          );
        } catch (fallbackError) {
          textSendError = channelDeliveryFailure(fallbackError);
          this.#logger.warn?.(
            '[dsh-feishu] fallback text delivery failed; continuing with result files:',
            fallbackError,
          );
        }
        const delivery = await this.#deliverArtifacts(
          chatId,
          messageId,
          completedArtifacts,
          textReceipt,
        );
        const artifactDispatched = delivery.receipt.artifacts.some(
          ({ outcome }) => outcome === 'sent' || outcome === 'unknown',
        );
        if (textSendError && !artifactDispatched && !delivery.failureNoticeVisible) {
          throw textSendError;
        }
        if (textSendError && delivery.artifactSendErrors === 0) {
          setLastMessageFailure(this.#status, textSendError);
        }
        this.#status.streamFallbacks = (this.#status.streamFallbacks ?? 0) + 1;
        return { ...delivery, textDeliveryErrors: textSendError ? 1 : 0 };
      }
      if (promptStarted) throw error;

      this.#logger.warn?.('[dsh-feishu] native stream unavailable; using text fallback:', error.message);
      const { answer, artifacts = [] } = await askInWorkspaceSession({
        harness: this.#harness,
        state: this.#state,
        key,
        text,
        content,
        createOptions: { signal: this.#signal },
        existsOptions: { signal: this.#signal },
        askOptions: this.#interactionAskOptions(event, key, message.files),
      });
      markAskComplete();
      let textReceipt;
      let textSendError = null;
      try {
        textReceipt = await this.#sendAnswerText(
          chatId,
          answerTextForDelivery(answer, artifacts),
          {
            deliveryId: messageId,
            presentation: 'feishu-text-fallback',
          },
        );
      } catch (fallbackError) {
        textSendError = channelDeliveryFailure(fallbackError);
        this.#logger.warn?.(
          '[dsh-feishu] fallback text delivery failed; continuing with result files:',
          fallbackError,
        );
      }
      const delivery = await this.#deliverArtifacts(chatId, messageId, artifacts, textReceipt);
      const artifactDispatched = delivery.receipt.artifacts.some(
        ({ outcome }) => outcome === 'sent' || outcome === 'unknown',
      );
      if (textSendError && !artifactDispatched && !delivery.failureNoticeVisible) {
        throw textSendError;
      }
      if (textSendError && delivery.artifactSendErrors === 0) {
        setLastMessageFailure(this.#status, textSendError);
      }
      this.#status.streamFallbacks = (this.#status.streamFallbacks ?? 0) + 1;
      return { ...delivery, textDeliveryErrors: textSendError ? 1 : 0 };
    } finally {
      if (this.#replyRuns.get(key) === run) this.#replyRuns.delete(key);
    }
  }

  async #processInteractionReply(event, messageId, key, expected, processingReaction) {
    this.#signal?.throwIfAborted();
    const current = this.#pendingInteractions.get(key);
    const claimed = expected.claimedReplyMessageId === messageId;
    if (!current || current !== expected || current.submitting) {
      if (this.#isResolvedQuestionReply(event, key)) {
        return this.#discardResolvedInteractionReply(event, messageId);
      }
      if (claimed && (!current || current !== expected)) {
        return this.#discardResolvedInteractionReply(event, messageId);
      }
      return this.#enqueueMessage(event, messageId, key, processingReaction, {
        releaseMessageId: false,
        finalize: false,
      });
    }
    if (this.#state.hasSeen(messageId)) return;
    await this.#state.markSeen(messageId);
    this.#status.lastMessageAt = new Date().toISOString();
    this.#status.messagesReceived += 1;

    const text = extractText(event);
    if (!text) {
      await this.#send(event.message.chat_id, t('请用文字回答当前问题。'));
      return;
    }

    const pending = this.#pendingInteractions.get(key);
    if (!pending || pending !== expected || pending.submitting) {
      if (this.#isResolvedQuestionReply(event, key)) {
        await this.#send(event.message.chat_id, INTERACTION_RESOLVED_TEXT()).catch(() => undefined);
        return;
      }
      if (claimed && (!pending || pending !== expected)) {
        await this.#send(event.message.chat_id, INTERACTION_RESOLVED_TEXT());
        return;
      }
      return this.#enqueueMessage(event, messageId, key, processingReaction, {
        releaseMessageId: false,
        alreadyRecorded: true,
        finalize: false,
      });
    }
    pending.chatId = event.message.chat_id;
    if (pending.needsPresentation) {
      const presentationWasInFlight = pending.presentationPromise != null;
      try {
        await this.#presentInteraction(pending);
      } catch {
        this.#status.lastError = '飞书交互问题发送失败。';
        this.#logger.error?.('[dsh-feishu] failed to retry an interaction question');
        pending.interaction.reconnect?.();
        return;
      }
      const presented = this.#pendingInteractions.get(key);
      if (!presented || presented !== expected || presented.submitting) {
        if (claimed && (!presented || presented !== expected)) {
          await this.#send(event.message.chat_id, INTERACTION_RESOLVED_TEXT()).catch(() => undefined);
          return;
        }
        return this.#enqueueMessage(event, messageId, key, processingReaction, {
          releaseMessageId: false,
          alreadyRecorded: true,
          finalize: false,
        });
      }
      if (!presentationWasInFlight) return;
    }
    const question = pending.questions[pending.index];
    if (!question) return;

    pending.answers.push(harnessAnswerForQuestion(question, text));
    pending.index += 1;
    if (pending.index < pending.questions.length) {
      if (pending.claimedReplyMessageId === messageId) {
        pending.claimedReplyMessageId = null;
      }
      pending.needsPresentation = true;
      try {
        await this.#presentInteraction(pending);
      } catch {
        this.#status.lastError = '飞书交互问题发送失败。';
        this.#logger.error?.('[dsh-feishu] failed to send the next interaction question');
        pending.interaction.reconnect?.();
      }
      return;
    }

    pending.submitting = true;
    try {
      await pending.interaction.respond({
        ok: true,
        value: {
          sessionId: pending.sessionId,
          answer: { answers: pending.answers },
        },
      });
      this.#rememberResolvedInteraction(key, pending);
      this.#clearPendingInteraction(key, pending.interactionId);
      this.#status.lastError = null;
      clearLastMessageFailure(this.#status);
    } catch (error) {
      if (this.#signal?.aborted) return;
      if (this.#pendingInteractions.get(key) !== pending) return;
      if (error?.code === 'interaction-not-pending') {
        this.#rememberResolvedInteraction(key, pending);
        this.#clearPendingInteraction(key, pending.interactionId);
        await this.#send(event.message.chat_id, INTERACTION_RESOLVED_TEXT()).catch(() => undefined);
        return;
      }
      pending.submitting = false;
      pending.answers.pop();
      pending.index -= 1;
      this.#status.lastError = '回答提交失败。';
      this.#logger.error?.('[dsh-feishu] failed to answer a Harness interaction');
      await this.#send(event.message.chat_id, t('回答提交失败，请重新发送当前问题的答案。'))
        .catch(() => undefined);
    }
  }

  async #handleInteraction(interaction, {
    key,
    actor,
    chatId,
    requiresMention,
  }) {
    if (await this.#approvals.handleRequested(interaction, {
      key,
      actor,
      requiresMention,
      send: (text) => this.#send(chatId, text),
    })) return;

    // Approval requests return above; the existing question state machine stays unchanged.
    if (interaction?.kind !== 'question') return;
    const questions = interaction?.payload?.questions;
    const interactionId = typeof interaction?.interactionId === 'string'
      ? interaction.interactionId
      : interaction?.rpcId;
    if (typeof interaction.rpcId !== 'string'
      || typeof interactionId !== 'string'
      || typeof interaction.sessionId !== 'string'
      || !Array.isArray(questions)
      || questions.length === 0
      || questions.some((question) => !validHarnessQuestion(question))) {
      this.#logger.warn?.('[dsh-feishu] ignored an invalid Harness question interaction');
      return;
    }

    if (interaction.recovered === true) {
      await interaction.respond({
        ok: false,
        error: {
          code: 'cancelled',
          message: 'Feishu safely cancelled an interaction left by an earlier client.',
          details: {},
        },
      });
      await this.#send(
        chatId,
        t('检测到这个 Session 中遗留的待回答问题，已安全取消并继续处理你刚才的消息。'),
      ).catch(() => undefined);
      return;
    }

    const existing = this.#pendingInteractions.get(key);
    if (existing?.interactionId === interactionId) {
      existing.interaction = interaction;
      if (existing.needsPresentation) await this.#presentInteraction(existing);
      return;
    }
    if (this.#interactionKeys.has(interactionId)) return;
    if (existing) {
      await interaction.respond({
        ok: false,
        error: {
          code: 'cancelled',
          message: 'Feishu is already handling another user interaction.',
          details: {},
        },
      });
      return;
    }

    const pending = {
      kind: 'question',
      interactionId,
      sessionId: interaction.sessionId,
      interaction,
      key,
      actor,
      requiresMention,
      questions,
      answers: [],
      index: 0,
      chatId,
      queue: null,
      claimedReplyMessageId: null,
      submitting: false,
      needsPresentation: true,
      presentationPromise: null,
      questionMessageIds: new Set(),
      inactive: false,
    };
    this.#pendingInteractions.set(key, pending);
    this.#interactionKeys.set(pending.interactionId, key);
    await this.#presentInteraction(pending);
  }

  async #handleInteractionResolved(resolution) {
    if (await this.#approvals.handleResolved(resolution)) return;
    const interactionId = resolution?.interactionId;
    if (resolution?.kind !== 'question' || typeof interactionId !== 'string') return;
    const key = this.#interactionKeys.get(interactionId);
    if (!key) return;
    const pending = this.#pendingInteractions.get(key);
    if (pending) this.#rememberResolvedInteraction(key, pending);
    this.#clearPendingInteraction(key, interactionId);
  }

  #presentInteraction(pending) {
    if (!pending.needsPresentation) return Promise.resolve();
    if (pending.presentationPromise) return pending.presentationPromise;
    const question = pending.questions[pending.index];
    if (!question) return Promise.resolve();
    const presentation = this.#send(
      pending.chatId,
      harnessQuestionText(
        question,
        pending.index,
        pending.questions.length,
        { requiresMention: pending.requiresMention },
      ),
    ).then((messageId) => {
      if (messageId) {
        pending.questionMessageIds.add(messageId);
        if (pending.inactive) this.#rememberResolvedInteraction(pending.key, pending);
      }
      pending.needsPresentation = false;
    }).finally(() => {
      if (pending.presentationPromise === presentation) pending.presentationPromise = null;
    });
    pending.presentationPromise = presentation;
    return presentation;
  }

  #rememberResolvedInteraction(key, pending) {
    const expiresAt = Date.now() + RESOLVED_REPLY_TTL_MS;
    for (const messageId of pending.questionMessageIds ?? []) {
      this.#resolvedQuestionReplies.set(messageId, { key, expiresAt });
    }
  }

  #isResolvedQuestionReply(event, key) {
    const now = Date.now();
    for (const [messageId, resolution] of this.#resolvedQuestionReplies) {
      if (resolution.expiresAt <= now) this.#resolvedQuestionReplies.delete(messageId);
    }
    for (const reference of [event?.message?.parent_id, event?.message?.root_id]) {
      const resolution = this.#resolvedQuestionReplies.get(reference);
      if (resolution?.key === key && resolution.expiresAt > now) return true;
    }
    return false;
  }

  async #discardResolvedInteractionReply(event, messageId) {
    if (this.#state.hasSeen(messageId)) return;
    await this.#state.markSeen(messageId);
    this.#status.lastMessageAt = new Date().toISOString();
    this.#status.messagesReceived += 1;
    await this.#send(event.message.chat_id, INTERACTION_RESOLVED_TEXT()).catch(() => undefined);
  }

  #takePendingInteraction(key, interactionId) {
    const pending = this.#pendingInteractions.get(key);
    if (!pending
      || (interactionId !== undefined && pending.interactionId !== interactionId)) return null;
    this.#pendingInteractions.delete(key);
    this.#interactionKeys.delete(pending.interactionId);
    pending.inactive = true;
    return pending;
  }

  #clearPendingInteraction(key, interactionId) {
    return this.#takePendingInteraction(key, interactionId) !== null;
  }

  async #cancelPendingInteraction(key) {
    const pending = this.#takePendingInteraction(key);
    if (!pending || pending.kind !== 'question') return;
    this.#rememberResolvedInteraction(key, pending);
    try {
      await pending.interaction.respond({
        ok: false,
        error: {
          code: 'cancelled',
          message: 'The Feishu interaction ended before the user answered.',
          details: {},
        },
      }, { signal: AbortSignal.timeout(5_000) });
    } catch (error) {
      if (error?.code !== 'interaction-not-pending') {
        this.#logger.warn?.('[dsh-feishu] failed to cancel a pending Harness interaction');
      }
    }
  }

  async #addReaction(messageId, emojiType) {
    if (!this.#channel?.addReaction) return null;
    try {
      const reactionId = await this.#channel.addReaction(messageId, emojiType);
      this.#status.reactionsAdded = (this.#status.reactionsAdded ?? 0) + 1;
      return reactionId;
    } catch (error) {
      this.#status.reactionErrors = (this.#status.reactionErrors ?? 0) + 1;
      this.#logger.warn?.(`[dsh-feishu] unable to add ${emojiType} reaction:`, error.message);
      return null;
    }
  }

  async #removeProcessingReaction(messageId, processingReaction) {
    const reactionId = await processingReaction;
    if (reactionId && this.#channel?.removeReaction) {
      try {
        await this.#channel.removeReaction(messageId, reactionId);
        this.#status.reactionsRemoved = (this.#status.reactionsRemoved ?? 0) + 1;
      } catch (error) {
        this.#status.reactionErrors = (this.#status.reactionErrors ?? 0) + 1;
        this.#logger.warn?.('[dsh-feishu] unable to remove processing reaction:', error.message);
      }
    }
  }

  async #finishReaction(messageId, processingReaction, finalEmojiType) {
    await this.#removeProcessingReaction(messageId, processingReaction);
    await this.#addReaction(messageId, finalEmojiType);
  }

  async #send(chatId, text) {
    const response = await this.#client.im.v1.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        msg_type: 'text',
        content: JSON.stringify({ text }),
      },
    });
    if (response?.code && response.code !== 0) {
      throw new Error(`Feishu send failed: ${response.msg || response.code}`);
    }
    return nonEmptyString(response?.data?.message_id);
  }
}
