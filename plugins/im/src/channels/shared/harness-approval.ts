type ApprovalDecision = 'allowed-once' | 'rejected';

type CodedError = {
  code?: unknown;
};

type ApprovalPayloadRecord = {
  type?: unknown;
  sessionId?: unknown;
  approvalId?: unknown;
  toolName?: unknown;
  callId?: unknown;
  reason?: unknown;
};

type ApprovalPayload = {
  type: 'approval/requested';
  sessionId: unknown;
  approvalId: unknown;
  toolName: unknown;
  callId?: unknown;
  reason?: unknown;
};

type ToolCallRecord = {
  arguments?: unknown;
  callId?: unknown;
  name?: unknown;
};

type ApprovalTextOptions = {
  toolCall?: unknown;
  requiresMention?: boolean;
  maxArgumentsLength?: number;
};

type SendFn = (value: string) => Promise<unknown>;

type Thenable = {
  then: (...args: unknown[]) => unknown;
  catch: (onrejected?: unknown) => Promise<unknown>;
};

type ApprovalInteraction = {
  kind?: unknown;
  rpcId?: unknown;
  sessionId?: unknown;
  recovered?: unknown;
  payload?: unknown;
  toolCall?: unknown;
  respond: (result: unknown, options?: { signal?: AbortSignal }) => unknown;
  reconnect?: () => unknown;
};

type ApprovalContext = {
  send?: unknown;
  key?: unknown;
  actor?: unknown;
  requiresMention?: unknown;
};

type ApprovalResolution = {
  kind?: unknown;
  interactionId?: unknown;
  outcome?: unknown;
};

type Logger = {
  warn?: (...args: unknown[]) => unknown;
  error?: (...args: unknown[]) => unknown;
};

type QueueOptions = {
  label?: string;
  logger?: Logger;
};

type ClaimReplyInput = {
  key: unknown;
  actor: unknown;
  text: unknown;
  addressed?: unknown;
  hasPendingQuestion?: unknown;
  questionCompletion?: unknown;
  isQuestionPending?: unknown;
  send: SendFn;
};

type PendingApproval = {
  approvalId: string;
  sessionId: unknown;
  interaction: ApprovalInteraction;
  toolCall: unknown;
  key: string;
  actor: string;
  requiresMention: boolean;
  send: SendFn;
  text: string;
  presented: boolean;
  presentationTask: Promise<unknown> | null;
  deliveryCompleted: boolean;
  replyTail: Promise<unknown> | null;
  submitting: boolean;
  inactive: boolean;
  resolving: boolean;
  closedOutcome: unknown;
  resolutionNotified: boolean;
  activationTask: Promise<unknown> | null;
};

type ApprovalRoute = {
  items: PendingApproval[];
};

const APPROVAL_REPLIES = new Map<string, ApprovalDecision>([
  ['批准', 'allowed-once'],
  ['同意', 'allowed-once'],
  ['yes', 'allowed-once'],
  ['拒绝', 'rejected'],
  ['不同意', 'rejected'],
  ['no', 'rejected'],
]);

const APPROVAL_PROMPT = '请精准回复「批准」或「拒绝」（也支持：同意 / 不同意 / yes / no）。';
const APPROVAL_AFTER_QUESTION_PROMPT = '请先完成当前问题，再精准回复「批准」或「拒绝」。';
const APPROVAL_RESOLVED_TEXT = '该审批已处理，无需再次回复。';
const RESOLVED_ROUTE_TTL_MS = 5 * 60_000;
const MAX_RESOLVED_ROUTES = 2_048;

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function printableText(value: unknown) {
  return cleanText(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
}

function errorCode(error: unknown) {
  return (error as CodedError | undefined)?.code;
}

function asThenable(value: unknown): Thenable | null {
  if (value && typeof (value as Thenable).then === 'function') {
    return value as Thenable;
  }
  return null;
}

export function harnessApprovalDecision(text: unknown) {
  return APPROVAL_REPLIES.get(cleanText(text).toLowerCase()) ?? null;
}

export function validHarnessApproval(payload: unknown): payload is ApprovalPayload {
  const value = payload as ApprovalPayloadRecord | null | undefined;
  return value?.type === 'approval/requested'
    && Boolean(cleanText(value.sessionId))
    && Boolean(cleanText(value.approvalId))
    && Boolean(cleanText(value.toolName))
    && (value.callId === undefined || Boolean(cleanText(value.callId)))
    && (value.reason === undefined || typeof value.reason === 'string');
}

function toolArguments(toolCall: unknown) {
  const source = (toolCall as ToolCallRecord | null | undefined)?.arguments;
  if (source !== null && typeof source === 'object') {
    try {
      return JSON.stringify(source, null, 2);
    } catch {
      return null;
    }
  }
  if (typeof source !== 'string') return null;
  const raw = printableText(source);
  // Harness treats an empty tool argument string as an empty object.
  if (!raw) return source === '' ? '{}' : null;
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export function harnessApprovalText(payload: unknown, {
  toolCall,
  requiresMention = false,
  maxArgumentsLength = 6_000,
}: ApprovalTextOptions = {}) {
  if (!validHarnessApproval(payload)) return null;
  const callId = cleanText(payload.callId);
  const call = toolCall as ToolCallRecord | null | undefined;
  if (!callId
    || cleanText(call?.callId) !== callId
    || cleanText(call?.name) !== cleanText(payload.toolName)) return null;
  const operation = toolArguments(toolCall);
  if (!operation || operation.length > maxArgumentsLength) return null;

  const lines = [
    '小桃子需要你的审批：',
    '',
    `工具：${printableText(payload.toolName)}`,
    '操作参数：',
    operation,
  ];
  const reason = printableText(payload.reason);
  if (reason) lines.push(`原因：${reason}`);
  lines.push('', APPROVAL_PROMPT);
  if (requiresMention) lines.push('', '群聊中请 @机器人 后发送审批决定。');
  return lines.join('\n');
}

function approvalResult(pending: PendingApproval, outcome: unknown) {
  return {
    ok: true,
    value: {
      sessionId: pending.sessionId,
      approvalId: pending.approvalId,
      outcome,
    },
  };
}

function approvalOutcomeText(outcome: unknown) {
  if (outcome === 'allowed-once') return '已批准，仅对本次操作有效。';
  if (outcome === 'rejected') return '已拒绝此次操作。';
  return APPROVAL_RESOLVED_TEXT;
}

export class HarnessApprovalQueue {
  #label: string;
  #logger: Logger;
  #byId = new Map<string, PendingApproval>();
  #routes = new Map<unknown, ApprovalRoute>();
  #resolvedRoutes = new Map<unknown, number>();

  constructor({ label = 'IM', logger = console }: QueueOptions = {}) {
    this.#label = label;
    this.#logger = logger;
  }

  hasPending(key: unknown) {
    return this.#routes.get(key)?.items.some((pending) => !pending.inactive) === true;
  }

  claimReply({
    key,
    actor,
    text,
    addressed = true,
    hasPendingQuestion = false,
    questionCompletion,
    isQuestionPending,
    send,
  }: ClaimReplyInput) {
    const route = this.#routes.get(key);
    const pending = route?.items[0];
    const decision = harnessApprovalDecision(text);
    const questionTask = asThenable(questionCompletion);
    const notice = (value: string, resolved = false) => ({
      ...(resolved ? { resolved: true } : {}),
      process: async (before: unknown) => {
        if (typeof before === 'function' && await before() === false) return;
        await send(value);
      },
    });
    // Match Harness' own interaction precedence: a live ask_user_question
    // outranks sibling approvals. Otherwise a question answer such as "yes"
    // could accidentally authorize a tool call.
    const deferredByQuestion = hasPendingQuestion
      && pending
      && questionTask;
    if (hasPendingQuestion && !deferredByQuestion) return null;
    if (!pending || pending.inactive) {
      const resolvedUntil = this.#resolvedRoutes.get(key) ?? 0;
      if (resolvedUntil <= Date.now()) {
        this.#resolvedRoutes.delete(key);
        return null;
      }
      if (!decision) return null;
      return notice(APPROVAL_RESOLVED_TEXT, true);
    }
    if (pending.actor !== actor || (pending.requiresMention && addressed !== true)) {
      if (!decision) return null;
      return notice('只有发起当前任务的用户可以处理这条审批。');
    }

    return {
      process: async (before: unknown) => {
        const presentedWhenClaimed = pending.presented;
        const previous = pending.replyTail ?? Promise.resolve();
        const task = previous
          .catch(() => undefined)
          .then(async () => {
            if (typeof before === 'function' && await before() === false) return;
            if (deferredByQuestion && questionTask) {
              await questionTask.catch(() => undefined);
              if (pending.inactive || pending.resolving) return;
              if (typeof isQuestionPending === 'function' && isQuestionPending()) {
                await send(APPROVAL_AFTER_QUESTION_PROMPT);
                return;
              }
            }
            await pending.activationTask?.catch(() => undefined);
            await pending.presentationTask?.catch(() => undefined);
            if (pending.inactive || pending.resolving) {
              await send(APPROVAL_RESOLVED_TEXT);
              return;
            }
            pending.send = send;
            // Never turn a decision sent before the operation was visibly
            // presented into an approval. This also covers a failed presentation
            // and the small FIFO promotion window before the next item is shown.
            if (!presentedWhenClaimed || !pending.presented) {
              if (!pending.presented) await this.#present(pending);
              if (pending.inactive || pending.resolving) return;
              await send(APPROVAL_PROMPT);
              return;
            }
            if (pending.submitting) {
              await send('审批决定正在提交，请稍候。');
              return;
            }
            if (!decision) {
              await send(APPROVAL_PROMPT);
              return;
            }
            await this.#submit(pending, decision);
          });
        pending.replyTail = task;
        try {
          await task;
        } finally {
          if (pending.replyTail === task) pending.replyTail = null;
        }
      },
    };
  }

  async handleRequested(interaction: unknown, context: unknown) {
    const event = interaction as ApprovalInteraction | null | undefined;
    if (event?.kind !== 'approval') return false;
    const payload = event.payload;
    const approvalId = cleanText((payload as ApprovalPayloadRecord | null | undefined)?.approvalId);
    if (!cleanText(event.rpcId)
      || !cleanText(event.sessionId)
      || !approvalId
      || !validHarnessApproval(payload)
      || payload.sessionId !== event.sessionId
      || typeof event.respond !== 'function') {
      this.#logger.warn?.(`[dsh-im:${this.#label}] ignored an invalid Harness approval`);
      return true;
    }

    if (event.recovered === true) {
      await this.#rejectInteraction(event, payload);
      return true;
    }

    const existing = this.#byId.get(approvalId);
    if (existing) {
      existing.interaction = event;
      existing.toolCall = event.toolCall;
      if (!existing.presented) await this.#present(existing);
      return true;
    }

    const requestContext = context as ApprovalContext | null | undefined;
    const send = requestContext?.send;
    const key = cleanText(requestContext?.key);
    const actor = cleanText(requestContext?.actor);
    if (!key || !actor || typeof send !== 'function') {
      this.#logger.warn?.(`[dsh-im:${this.#label}] ignored an approval without a reply route`);
      await this.#rejectInteraction(event, payload);
      return true;
    }
    const deliver = send as SendFn;

    const text = harnessApprovalText(payload, {
      toolCall: event.toolCall,
      requiresMention: requestContext?.requiresMention === true,
    });
    if (!text) {
      const rejected = await this.#rejectInteraction(event, payload);
      await deliver(rejected
        ? '无法完整展示这次操作，已安全拒绝此次审批。'
        : APPROVAL_RESOLVED_TEXT);
      return true;
    }

    const pending: PendingApproval = {
      approvalId,
      sessionId: event.sessionId,
      interaction: event,
      toolCall: event.toolCall,
      key,
      actor,
      requiresMention: requestContext?.requiresMention === true,
      send: deliver,
      text,
      presented: false,
      presentationTask: null,
      deliveryCompleted: false,
      replyTail: null,
      submitting: false,
      inactive: false,
      resolving: false,
      closedOutcome: null,
      resolutionNotified: false,
      activationTask: null,
    };
    this.#byId.set(approvalId, pending);
    const route = this.#routes.get(key) ?? { items: [] };
    route.items.push(pending);
    this.#routes.set(key, route);
    if (route.items[0] === pending) await this.#present(pending);
    return true;
  }

  async handleResolved(resolution: unknown) {
    const event = resolution as ApprovalResolution | null | undefined;
    if (event?.kind !== 'approval') return false;
    const pending = this.#byId.get(cleanText(event.interactionId));
    if (!pending) return true;
    // A queued item may already be the next route head while the previous
    // item's confirmation is still in flight. Preserve that route barrier so
    // resolving this item cannot expose a later approval out of order.
    pending.resolving = true;
    if (pending.activationTask) {
      await pending.activationTask.catch(() => undefined);
    }
    if (pending.inactive || this.#byId.get(pending.approvalId) !== pending) return true;
    const presentationTask = pending.presentationTask;
    const shouldNotify = pending.presented || presentationTask;
    const send = pending.send;
    const next = this.#remove(pending);
    await this.#transition(next, async () => {
      let delivered = pending.presented;
      if (presentationTask) {
        delivered = await presentationTask.then(() => true, () => false);
      }
      if (shouldNotify && delivered) {
        pending.resolutionNotified = true;
        await send(approvalOutcomeText(event.outcome)).catch(() => undefined);
      }
    });
    return true;
  }

  async closeRoute(key: unknown) {
    const route = this.#routes.get(key);
    if (!route) return;
    const pendingItems = [...route.items];
    for (const pending of pendingItems) this.#remove(pending);
    await Promise.all(pendingItems.map(async (pending) => {
      try {
        await pending.interaction.respond(
          approvalResult(pending, 'rejected'),
          { signal: AbortSignal.timeout(5_000) },
        );
        pending.closedOutcome = 'rejected';
        if ((pending.presented || pending.deliveryCompleted) && !pending.resolutionNotified) {
          pending.resolutionNotified = true;
          await pending.send(approvalOutcomeText('rejected')).catch(() => undefined);
        }
      } catch (error) {
        if (errorCode(error) === 'interaction-not-pending') {
          pending.closedOutcome = 'resolved';
          if ((pending.presented || pending.deliveryCompleted) && !pending.resolutionNotified) {
            pending.resolutionNotified = true;
            await pending.send(APPROVAL_RESOLVED_TEXT).catch(() => undefined);
          }
        } else {
          this.#logger.warn?.(`[dsh-im:${this.#label}] failed to reject a closing approval:`, error);
        }
      }
    }));
  }

  async #present(pending: PendingApproval) {
    if (this.#routes.get(pending.key)?.items[0] !== pending
      || pending.inactive || pending.resolving || pending.presented) return;
    await pending.activationTask?.catch(() => undefined);
    if (this.#routes.get(pending.key)?.items[0] !== pending
      || pending.inactive || pending.resolving || pending.presented) return;
    if (pending.presentationTask) return pending.presentationTask;
    const task = Promise.resolve().then(() => pending.send(pending.text));
    pending.presentationTask = task;
    try {
      await task;
      pending.deliveryCompleted = true;
      if (!pending.inactive) {
        pending.presented = true;
      } else if (pending.closedOutcome && !pending.resolutionNotified) {
        pending.resolutionNotified = true;
        await pending.send(approvalOutcomeText(pending.closedOutcome)).catch(() => undefined);
      }
    } finally {
      if (pending.presentationTask === task) pending.presentationTask = null;
    }
  }

  async #submit(pending: PendingApproval, outcome: unknown) {
    pending.submitting = true;
    try {
      await pending.interaction.respond(approvalResult(pending, outcome));
    } catch (error) {
      if (errorCode(error) === 'interaction-not-pending') {
        const send = pending.send;
        const next = this.#remove(pending);
        await this.#transition(next, async () => {
          if (!pending.resolutionNotified) {
            await send(APPROVAL_RESOLVED_TEXT).catch(() => undefined);
          }
        });
        return;
      }
      if (pending.inactive) return;
      pending.submitting = false;
      this.#logger.error?.(`[dsh-im:${this.#label}] failed to submit an approval:`, error);
      await pending.send('审批提交失败，请重新回复「批准」或「拒绝」。').catch(() => undefined);
      return;
    }

    const send = pending.send;
    const next = this.#remove(pending);
    await this.#transition(next, async () => {
      if (!pending.resolutionNotified) {
        await send(approvalOutcomeText(outcome)).catch(() => undefined);
      }
    });
  }

  async #transition(next: PendingApproval | null, work: () => Promise<void>) {
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    if (next) next.activationTask = barrier;
    try {
      await work();
    } finally {
      release();
      if (next?.activationTask === barrier) next.activationTask = null;
    }
    await this.#promote(next);
  }

  async #promote(pending: PendingApproval | null) {
    if (!pending) return;
    try {
      await this.#present(pending);
    } catch (error) {
      this.#logger.error?.(
        `[dsh-im:${this.#label}] failed to present the next approval:`,
        error,
      );
      try {
        pending.interaction.reconnect?.();
      } catch {
        // A replay will retry presentation when the transport can reconnect.
      }
    }
  }

  #remove(pending: PendingApproval) {
    if (pending.inactive) return null;
    pending.inactive = true;
    this.#rememberResolvedRoute(pending.key);
    this.#byId.delete(pending.approvalId);
    const route = this.#routes.get(pending.key);
    if (!route) return null;
    const wasCurrent = route.items[0] === pending;
    const index = route.items.indexOf(pending);
    if (index !== -1) route.items.splice(index, 1);
    if (route.items.length === 0) {
      this.#routes.delete(pending.key);
      return null;
    }
    return wasCurrent ? route.items[0] : null;
  }

  #rememberResolvedRoute(key: unknown) {
    const now = Date.now();
    for (const [routeKey, expiresAt] of this.#resolvedRoutes) {
      if (expiresAt <= now) this.#resolvedRoutes.delete(routeKey);
    }
    this.#resolvedRoutes.delete(key);
    this.#resolvedRoutes.set(key, now + RESOLVED_ROUTE_TTL_MS);
    while (this.#resolvedRoutes.size > MAX_RESOLVED_ROUTES) {
      const oldest = this.#resolvedRoutes.keys().next().value;
      if (oldest === undefined) break;
      this.#resolvedRoutes.delete(oldest);
    }
  }

  async #rejectInteraction(interaction: ApprovalInteraction, payload: ApprovalPayload) {
    try {
      await interaction.respond({
        ok: true,
        value: {
          sessionId: interaction.sessionId,
          approvalId: payload.approvalId,
          outcome: 'rejected',
        },
      }, { signal: AbortSignal.timeout(5_000) });
      return true;
    } catch (error) {
      if (errorCode(error) === 'interaction-not-pending') return false;
      throw error;
    }
  }
}
