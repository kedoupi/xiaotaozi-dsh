// @ts-nocheck
import { setTimeout as sleep } from 'node:timers/promises';

import { harnessApprovalText } from '../shared/harness-approval.ts';
import { HarnessTurnError } from '../shared/harness-client.ts';
import {
  harnessAnswerForQuestion,
  harnessQuestionText,
  validHarnessQuestion,
} from '../shared/harness-question.ts';

const JOB_ID = /^job-[a-f0-9]{32}$/;
const RENEW_MS = 30_000;
const COMPLETED_LIMIT = 2_048;

function abortError() {
  return new DOMException('Office Job was cancelled', 'AbortError');
}

function clean(value, max = 8_000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function safeFailure(error) {
  if (error?.code === 'office-job-alias-invalid') return error.message;
  if (error?.code === 'turn-stopped') return '本机 Harness 已停止这次执行。';
  if (error?.code === 'office-job-conflict') return 'Office Job 已被领取、取消或结束。';
  return '本机 Harness 未能完成任务；请检查 Harness 会话后重试。';
}

function renderPrompt(job, preset) {
  return [
    '# AI Office Handoff',
    '',
    '你正在本机小桃子中继续一个来自 AI Office 的任务。',
    '只在当前 Workspace 内行动。完成后必须返回：结果摘要、改动文件、验证证据、未解决风险。',
    '',
    '## 本机 Instruction Preset',
    preset,
    '',
    ...(clean(job.instruction) ? ['## 本轮补充指令', clean(job.instruction), ''] : []),
    '## Office 时间线',
    clean(job.markdown, 200_000),
  ].join('\n');
}

function approvalRequest(interaction) {
  const id = clean(interaction?.interactionId || interaction?.rpcId, 180);
  if (!id || typeof interaction?.respond !== 'function') return null;
  if (interaction.kind === 'approval') {
    const prompt = harnessApprovalText(interaction.payload, {
      toolCall: interaction.toolCall,
      maxArgumentsLength: 10_000,
    });
    if (!prompt) return null;
    return {
      id,
      kind: 'approval',
      title: `批准 ${clean(interaction.payload?.toolName, 120) || 'Harness 工具'}`,
      prompt,
      toolName: clean(interaction.payload?.toolName, 120),
    };
  }
  if (interaction.kind !== 'question') return null;
  const questions = interaction.payload?.questions;
  if (!Array.isArray(questions) || questions.length === 0
    || questions.some((question) => !validHarnessQuestion(question))) return null;
  return {
    id,
    kind: 'question',
    title: questions.length > 1 ? `Harness 需要 ${questions.length} 项补充信息` : clean(questions[0].header || questions[0].question, 160),
    prompt: questions.map((question, index) => harnessQuestionText(question, index, questions.length)).join('\n\n---\n\n'),
    questions,
  };
}

type Reply = { decision: 'approved' | 'rejected'; answer: string };

function waitForReply(entry, approvalId): { promise: Promise<Reply>; dispose(reason?: unknown): void } {
  const signal = entry.controller.signal;
  let dispose;
  const promise = new Promise<Reply>((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      if (entry.approvals.get(approvalId) === waiter) entry.approvals.delete(approvalId);
      callback(value);
    };
    const onAbort = () => finish(reject, signal.reason ?? abortError());
    const waiter = { resolve: (value: Reply) => finish(resolve, value) };
    dispose = (reason = abortError()) => finish(reject, reason);
    if (signal.aborted) onAbort();
    else {
      signal.addEventListener('abort', onAbort, { once: true });
      entry.approvals.set(approvalId, waiter);
    }
  });
  // Presentation may fail before the consumer reaches await; keep its rejection observable there.
  void promise.catch(() => undefined);
  return { promise, dispose };
}

type ActiveEntry = {
  jobId: string;
  controller: AbortController;
  approvals: Map<string, { resolve(value: Reply): void }>;
  harness: {
    createOfficeSession(options): Promise<string>;
    ask(id, prompt, options): Promise<string>;
    rpc(method, payload, timeoutMs, options?): Promise<unknown>;
  } | null;
  sessionId: string | null;
  creating: Promise<string> | null;
  leaseToken: string | null;
  cancelled: boolean;
  askCompleted: boolean;
  cancellation: Promise<void> | null;
  cancelling: boolean;
  cancelError: Error | null;
  task: Promise<void> | null;
  taskFinished: boolean;
  lastProgressAt: number;
  lastProgress: string;
};

export class OfficeJobExecutor {
  #config;
  #transport;
  #createHarness;
  #logger;
  #sleep;
  #cancelTimeoutMs;
  #active = new Map<string, ActiveEntry>();
  #queued = new Set();
  #completed = new Set();
  #closed = false;
  #status = {
    running: 0,
    completed: 0,
    failed: 0,
    lastJobId: null,
    lastJobAt: null,
  };

  constructor({
    config,
    transport,
    createHarness,
    logger = console,
    sleepImpl = sleep,
    cancelTimeoutMs = 10_000,
  }) {
    if (!config || !transport || typeof createHarness !== 'function') {
      throw new TypeError('OfficeJobExecutor requires config, transport, and createHarness');
    }
    this.#config = config;
    this.#transport = transport;
    this.#createHarness = createHarness;
    this.#logger = logger;
    this.#sleep = sleepImpl;
    this.#cancelTimeoutMs = cancelTimeoutMs;
  }

  get status() { return structuredClone(this.#status); }

  offer(jobId) {
    if (this.#closed || !JOB_ID.test(jobId) || this.#active.has(jobId)
      || this.#queued.has(jobId) || this.#completed.has(jobId)) return false;
    this.#queued.add(jobId);
    this.#drain();
    return true;
  }

  handleEvent(event) {
    const jobId = clean(event?.data?.jobId, 80);
    if (!JOB_ID.test(jobId)) return false;
    if (event.type === 'job.available') return this.offer(jobId);
    if (event.type === 'job.cancel') return this.cancel(jobId);
    if (event.type === 'approval.reply') {
      const entry = this.#active.get(jobId);
      const approvalId = clean(event.data?.approvalId, 180);
      const pending = entry?.approvals.get(approvalId);
      if (!pending) return false;
      pending.resolve({
        decision: event.data?.decision === 'approved' ? 'approved' : 'rejected',
        answer: clean(event.data?.answer),
      });
      return true;
    }
    return false;
  }

  cancel(jobId) {
    this.#queued.delete(jobId);
    const entry = this.#active.get(jobId);
    if (!entry) return false;
    void this.#cancelEntry(entry);
    return true;
  }

  async close() {
    this.#closed = true;
    this.#queued.clear();
    const entries = [...this.#active.values()];
    const cancellations = entries.map((entry) => this.#cancelEntry(entry));
    const results = await Promise.allSettled([...cancellations, ...entries.map((entry) => entry.task)]);
    const failed = results.find((result) => result.status === 'rejected');
    if (failed) throw failed.reason;
  }

  #cancelEntry(entry: ActiveEntry): Promise<void> {
    if (entry.cancellation && !entry.cancelError) return entry.cancellation;
    entry.cancelled = true;
    entry.cancelling = true;
    entry.cancelError = null;
    // Publish ownership before abort wakes ask/renew cleanup. A late create must still be retained.
    entry.cancellation = Promise.resolve().then(async () => {
      await entry.creating?.catch(() => undefined);
      if (!entry.sessionId || !entry.harness || entry.askCompleted) return;
      const controller = new AbortController();
      let timer;
      try {
        const bound = new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error('Cancellation timed out'));
          }, this.#cancelTimeoutMs);
        });
        const result = await Promise.race([
          entry.harness.rpc('session.cancel', {
            sessionId: entry.sessionId, keepInbox: true,
          }, this.#cancelTimeoutMs, { signal: controller.signal }),
          bound,
        ]);
        if (result?.accepted !== true) throw new Error('Cancellation not acknowledged');
      } finally {
        clearTimeout(timer);
      }
    }).then(() => {
      entry.cancelling = false;
      this.#release(entry);
    }).catch(() => {
      entry.cancelling = false;
      const error = new Error(`Office cancellation is uncertain for session ${entry.sessionId ?? 'unknown'}; retry shutdown before reconnecting.`);
      entry.cancelError = error;
      this.#logger.warn?.(`[dsh-im:office] ${error.message}`);
      throw error;
    });
    void entry.cancellation.catch(() => undefined);
    entry.controller.abort(abortError());
    return entry.cancellation;
  }

  #release(entry: ActiveEntry) {
    if (!entry.taskFinished || entry.cancelling || entry.cancelError) return;
    this.#active.delete(entry.jobId);
    this.#status.running = this.#active.size;
    this.#drain();
  }

  #drain() {
    while (!this.#closed && this.#active.size < this.#config.maxConcurrency && this.#queued.size > 0) {
      const jobId = this.#queued.values().next().value;
      this.#queued.delete(jobId);
      const entry: ActiveEntry = {
        jobId,
        controller: new AbortController(),
        approvals: new Map(),
        harness: null,
        sessionId: null,
        creating: null,
        leaseToken: null,
        cancelled: false,
        askCompleted: false,
        cancellation: null,
        cancelling: false,
        cancelError: null,
        taskFinished: false,
        lastProgressAt: 0,
        lastProgress: '',
        task: null,
      };
      entry.task = this.#run(jobId, entry).finally(() => {
        entry.taskFinished = true;
        this.#release(entry);
      });
      this.#active.set(jobId, entry);
      this.#status.running = this.#active.size;
      void entry.task.catch((error) => this.#logger.warn?.('[dsh-im:office] Job task ended:', error.message));
    }
  }

  async #run(jobId, entry) {
    const signal = entry.controller.signal;
    let renewTask = null;
    try {
      const fetched = await this.#transport.getJob(jobId, { signal });
      const job = fetched?.job;
      if (!job || job.id !== jobId) throw new Error('Office returned an invalid Job payload');
      const accepted = await this.#transport.acceptJob(jobId, { signal });
      if (!clean(accepted?.leaseToken, 200)) throw new Error('Office returned an invalid Job lease');
      entry.leaseToken = accepted.leaseToken;
      renewTask = this.#renew(jobId, entry);
      const workspace = this.#config.workspaces[job.workspaceAlias];
      const preset = this.#config.instructionPresets[job.instructionPreset];
      if (!workspace || !preset) {
        const error = new Error('Office Job 引用了本机未配置的 Workspace/Preset alias。');
        error.code = 'office-job-alias-invalid';
        throw error;
      }
      entry.harness = this.#createHarness({ workspace });
      await this.#progress(jobId, entry, { kind: 'status', message: `已领取 Job，准备 Workspace alias：${job.workspaceAlias}` }, true);
      if (signal.aborted) throw signal.reason ?? abortError();
      entry.creating = entry.harness.createOfficeSession({ signal, workspace }).then((sessionId) => {
        entry.sessionId = sessionId;
        return sessionId;
      });
      await entry.creating;
      if (signal.aborted) throw signal.reason ?? abortError();
      await this.#progress(jobId, entry, { kind: 'status', message: 'Harness Session 已创建。', sessionId: entry.sessionId }, true);
      if (signal.aborted) throw signal.reason ?? abortError();
      const answer = await entry.harness.ask(entry.sessionId, renderPrompt(job, preset), {
        timeoutMs: 30 * 60_000,
        signal,
        onUpdate: (update) => this.#handleUpdate(jobId, entry, update),
        onInteraction: (interaction) => this.#handleInteraction(jobId, entry, interaction),
        onInteractionResolved: (resolution) => {
          const id = clean(resolution?.interactionId, 180);
          entry.approvals.get(id)?.resolve({ decision: 'rejected', answer: '' });
        },
      });
      entry.askCompleted = true;
      if (signal.aborted) throw signal.reason ?? abortError();
      await this.#transport.completeJob(jobId, entry.leaseToken, {
        resultMarkdown: answer,
        sessionId: entry.sessionId,
      }, { signal });
      this.#status.completed += 1;
      this.#rememberCompleted(jobId);
    } catch (error) {
      // Harness emits this only after observing turn/end, even when no text was produced.
      if (error instanceof HarnessTurnError) entry.askCompleted = true;
      if (!entry.cancelled && entry.leaseToken) {
        await this.#transport.failJob(jobId, entry.leaseToken, {
          error: safeFailure(error),
          ...(entry.sessionId ? { sessionId: entry.sessionId } : {}),
        }, { signal }).catch(() => undefined);
        this.#status.failed += 1;
      }
      if (error?.code === 'office-job-conflict' || error?.code === 'office-hook-unavailable') {
        this.#rememberCompleted(jobId);
        return;
      }
      if (!entry.cancelled && !signal.aborted) this.#logger.warn?.(`[dsh-im:office] Job ${jobId} failed:`, error.message);
    } finally {
      // Local failures leave remote execution uncertain; terminal results need no cancel.
      const cancellation = entry.cancellation
        ?? (entry.sessionId && !entry.askCompleted ? this.#cancelEntry(entry) : null);
      entry.controller.abort(abortError());
      await renewTask?.catch(() => undefined);
      // Do not retry an uncertain request from cleanup; the owner must explicitly retry shutdown.
      await cancellation?.catch(() => undefined);
      this.#status.lastJobId = jobId;
      this.#status.lastJobAt = new Date().toISOString();
    }
  }

  async #renew(jobId, entry) {
    while (!entry.controller.signal.aborted) {
      try { await this.#sleep(RENEW_MS, undefined, { signal: entry.controller.signal }); }
      catch { return; }
      try {
        await this.#transport.renewJob(jobId, entry.leaseToken, { signal: entry.controller.signal });
      } catch (error) {
        if (entry.controller.signal.aborted) return;
        void this.#cancelEntry(entry);
        return;
      }
      try {
        const snapshot = await this.#transport.getJob(jobId, { signal: entry.controller.signal });
        const approval = snapshot?.job?.approval;
        if (approval && (approval.status === 'approved' || approval.status === 'rejected')) {
          entry.approvals.get(approval.id)?.resolve({
            decision: approval.status,
            answer: clean(approval.answer),
          });
        }
      } catch (error) {
        if (entry.controller.signal.aborted) return;
        this.#logger.warn?.(
          `[dsh-im:office] Job ${jobId} approval poll failed; will retry after the next renewal:`,
          error.message,
        );
      }
    }
  }

  async #handleUpdate(jobId, entry, update) {
    const message = update?.type === 'tool' ? `正在使用 ${clean(update.name, 160) || 'Harness 工具'}…`
      : clean(update?.text, 4_000);
    if (!message) return;
    const key = `${update.type}:${message}`;
    if (key === entry.lastProgress) return;
    const now = Date.now();
    if (update.type === 'text' && now - entry.lastProgressAt < 1_000) return;
    entry.lastProgress = key;
    entry.lastProgressAt = now;
    await this.#progress(jobId, entry, {
      kind: update.type === 'tool' ? 'tool' : update.type === 'text' ? 'text' : 'status',
      message,
      ...(entry.sessionId ? { sessionId: entry.sessionId } : {}),
    });
  }

  #progress(jobId, entry, value, required = false) {
    const request = this.#transport.progressJob(jobId, entry.leaseToken, value, {
      signal: entry.controller.signal,
    });
    return required ? request : request.catch((error) => {
      this.#logger.debug?.('[dsh-im:office] ignored a progress delivery failure:', error.message);
    });
  }

  async #handleInteraction(jobId, entry, interaction) {
    const request = approvalRequest(interaction);
    if (!request) {
      if (interaction?.kind === 'approval' && typeof interaction.respond === 'function') {
        await interaction.respond({
          ok: true,
          value: {
            sessionId: interaction.sessionId,
            approvalId: interaction.payload?.approvalId,
            outcome: 'rejected',
          },
        });
      }
      return;
    }
    const reply = waitForReply(entry, request.id);
    try {
      await this.#transport.requestApproval(jobId, entry.leaseToken, request, {
        signal: entry.controller.signal,
      });
      const decision = await reply.promise;
      if (entry.controller.signal.aborted) throw entry.controller.signal.reason ?? abortError();
      if (request.kind === 'approval') {
        await interaction.respond({
          ok: true,
          value: {
            sessionId: interaction.sessionId,
            approvalId: interaction.payload.approvalId,
            outcome: decision.decision === 'approved' ? 'allowed-once' : 'rejected',
          },
        });
        return;
      }
      if (decision.decision !== 'approved') {
        await interaction.respond({
          ok: false,
          error: { code: 'cancelled', message: 'The AI Office user rejected this question.', details: {} },
        });
        return;
      }
      const answers = clean(decision.answer).split(/\r?\n/);
      await interaction.respond({
        ok: true,
        value: {
          sessionId: interaction.sessionId,
          answer: {
            answers: request.questions.map((question, index) => (
              harnessAnswerForQuestion(question, answers[index] || answers[0] || '')
            )),
          },
        },
      });
    } finally {
      reply.dispose();
    }
  }

  #rememberCompleted(jobId) {
    this.#completed.add(jobId);
    if (this.#completed.size <= COMPLETED_LIMIT) return;
    this.#completed.delete(this.#completed.values().next().value);
  }
}
