import * as React from 'react';

import { h, isEnglish } from './i18n.ts';

export function HelpGlyph() {
  return h('svg', {
    width: 14,
    height: 14,
    viewBox: '0 0 16 16',
    fill: 'none',
    'aria-hidden': 'true',
    focusable: 'false',
  },
    h('circle', { cx: '8', cy: '8', r: '6.2', stroke: 'currentColor', strokeWidth: '1.3' }),
    h('path', {
      d: 'M6.55 6.35c.2-1 1.05-1.7 2.15-1.7 1.2 0 2.05.75 2.05 1.8 0 .9-.55 1.4-1.3 1.75-.5.25-.8.5-.8 1.05',
      stroke: 'currentColor',
      strokeWidth: '1.3',
      strokeLinecap: 'round',
    }),
    h('circle', { cx: '8', cy: '11.4', r: '0.85', fill: 'currentColor' }));
}

export type LastMessageError = {
  code: string;
  reason: string;
  message: string;
  referenceId: string;
  at: number;
};

function messageErrorTime(value: string | number | Date) {
  try {
    return new Intl.DateTimeFormat(isEnglish() ? 'en-US' : 'zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return null;
  }
}

export type ChannelListHeadingProps = {
  className?: string;
  id?: string;
  title?: React.ReactNode;
  connectionLabel?: React.ReactNode;
};

export function ChannelListHeading({
  className = '',
  id,
  title,
  connectionLabel,
}: ChannelListHeadingProps) {
  const helpId = React.useId();
  return h('div', { className: `${className} dim-listHeading`.trim() },
    h('div', { className: 'dim-listTitle' },
      h('h3', id ? { id } : null, title),
      h('span', { className: 'dim-channelHelp' },
        h('button', {
          type: 'button',
          className: 'dim-channelHelpButton',
          'aria-label': '查看消息通道说明',
          'aria-describedby': helpId,
        }, h(HelpGlyph)),
        h('span', {
          id: helpId,
          className: 'dim-channelTooltip',
          role: 'tooltip',
        },
        h('span', null, '消息通道'),
        h('strong', null, connectionLabel)))));
}

export type BotStatusMetaProps = {
  className?: string;
  dotClassName?: string;
  tone?: string;
  stateLabel?: React.ReactNode;
  lastCheckedAt?: unknown;
  formatCheckedTime: (value: unknown) => React.ReactNode;
  healthState?: string;
};

export function BotStatusMeta({
  className = '',
  dotClassName = '',
  tone,
  stateLabel,
  lastCheckedAt,
  formatCheckedTime,
  healthState,
}: BotStatusMetaProps) {
  return h('div', { className: 'dim-botHealthGroup' },
    h('div', {
      className: `${className} dim-botHealth`.trim(),
      ...(healthState ? { 'data-health': healthState } : {}),
    },
    h('span', {
      className: `${dotClassName} dim-healthDot`.trim(),
      'data-tone': tone,
    }),
    h('span', null, stateLabel)),
    h('div', { className: 'dim-lastChecked' },
      h('span', null, '最近检查'),
      h('span', null, formatCheckedTime(lastCheckedAt))));
}

export type LastMessageErrorSummaryProps = {
  className?: string;
  error?: LastMessageError | null;
};

export function LastMessageErrorSummary({ className = '', error }: LastMessageErrorSummaryProps) {
  if (!error) return null;
  const occurredAt = messageErrorTime(error.at);
  return h('div', {
    className: `${className} dim-cardSummary`.trim(),
    role: 'status',
  },
  h('strong', null, '最近一条消息处理失败'),
  '：',
  h('span', null, error.message),
  '（',
  h('span', null, '错误码'),
  ` ${error.code} · `,
  h('span', null, '参考号'),
  ` ${error.referenceId}`,
  occurredAt ? h(React.Fragment, null,
    ' · ',
    h('time', { dateTime: new Date(error.at).toISOString() }, occurredAt)) : null,
  '）');
}
