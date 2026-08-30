/**
 * CardKit schema 2.0 JSON for the Feishu streaming reply card.
 * Pure builders: no IO. Status lives in the header; the body is one markdown
 * element that CardKit streams into.
 */

import { t as translate } from '../shared/i18n.ts';

export const STREAM_ELEMENT_ID = 'stream_md';
export const STOP_REPLY_ACTION = 'stop_reply';

export type ReplyCardStatus = 'running' | 'done' | 'failed' | 'stopped';

const WAITING_TEXT = '正在回复…';

function t(text: string): string {
  return String(translate(text, undefined));
}

export function titleForReplyStatus(status: ReplyCardStatus): string {
  if (status === 'done') return t('回复');
  if (status === 'failed') return t('出错了');
  if (status === 'stopped') return t('已停止');
  return t('回复中');
}

export function headerTemplateForReplyStatus(status: ReplyCardStatus): string {
  if (status === 'done') return 'green';
  if (status === 'failed') return 'red';
  if (status === 'stopped') return 'grey';
  return 'blue';
}

export function summaryForReplyCard(status: ReplyCardStatus, body: unknown): string {
  const summary = String(body ?? '').replace(/\s+/g, ' ').trim();
  if (summary) return summary.length <= 50 ? summary : `${summary.slice(0, 49)}…`;
  if (status === 'done') return t('回答完成');
  return titleForReplyStatus(status);
}

/**
 * Keep the last assistant text on the card. Tool / stage updates must not
 * replace already-streamed markdown.
 */
export function nextReplyCardBody(update: unknown, previous: string | undefined): string | undefined {
  if (update && typeof update === 'object' && 'type' in update && update.type === 'text') {
    const text = String('text' in update ? update.text ?? '' : '');
    return text.trim() ? text : previous;
  }
  return previous;
}

type StopReplyValue = {
  action: typeof STOP_REPLY_ACTION;
  key: string;
  runId?: string;
};

export function buildStopReplyButton(key: string, runId: string): Record<string, unknown> {
  const value: StopReplyValue = { action: STOP_REPLY_ACTION, key, runId };
  return {
    tag: 'button',
    type: 'danger',
    text: { tag: 'plain_text', content: t('停止') },
    value,
    behaviors: [{ type: 'callback', value }],
  };
}

export function parseStopReplyAction(value: unknown): { key: string; runId?: string } | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as { action?: unknown; key?: unknown; runId?: unknown };
  if (raw.action !== STOP_REPLY_ACTION) return undefined;
  if (typeof raw.key !== 'string' || !raw.key) return undefined;
  return {
    key: raw.key,
    runId: typeof raw.runId === 'string' && raw.runId ? raw.runId : undefined,
  };
}

/** Feishu card.action.trigger must echo schema 2.0 as `{ card: { type: 'raw', data } }`. */
export function cardActionCallbackCard(card: unknown): Record<string, unknown> {
  if (!card || typeof card !== 'object') return {};
  return { card: { type: 'raw', data: card } };
}

export function stopReplyKeyAllowed(
  key: unknown,
  { operatorOpenId, chatId }: { operatorOpenId?: string | null; chatId?: string | null } = {},
): boolean {
  if (typeof key !== 'string' || !key) return false;
  if (operatorOpenId && key === `p2p:${operatorOpenId}`) return true;
  if (chatId && key === `group:${chatId}`) return true;
  return false;
}

export function buildStreamingReplyCard({
  status = 'running',
  body = '',
  streaming = false,
  printFrequencyMs = 70,
  printStep = 1,
  key,
  runId,
}: {
  status?: ReplyCardStatus;
  body?: unknown;
  streaming?: boolean;
  printFrequencyMs?: number;
  printStep?: number;
  key?: string;
  runId?: string;
} = {}): Record<string, unknown> {
  const running = status === 'running';
  const content = String(body ?? '').trim() || (running ? t(WAITING_TEXT) : ' ');
  const config: Record<string, unknown> = {
    wide_screen_mode: true,
    update_multi: true,
    streaming_mode: Boolean(streaming && running),
    summary: { content: summaryForReplyCard(status, body) },
  };
  if (config.streaming_mode) {
    config.streaming_config = {
      print_frequency_ms: { default: printFrequencyMs },
      print_step: { default: printStep },
      print_strategy: 'fast',
    };
  }
  const elements: Record<string, unknown>[] = [{
    tag: 'markdown',
    element_id: STREAM_ELEMENT_ID,
    content,
  }];
  if (running && key && runId) elements.push(buildStopReplyButton(key, runId));
  return {
    schema: '2.0',
    config,
    header: {
      template: headerTemplateForReplyStatus(status),
      title: { tag: 'plain_text', content: titleForReplyStatus(status) },
    },
    body: { elements },
  };
}
