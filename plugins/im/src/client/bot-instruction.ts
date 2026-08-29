// @ts-nocheck
import * as React from 'react';

import { h } from './i18n.ts';

export const SET_BOT_INSTRUCTION_ENDPOINT = 'bot.instruction.set';
export const BOT_INSTRUCTION_MAX = 8_000;

export function displayBotInstruction(value) {
  if (typeof value !== 'string') return '';
  return value.slice(0, BOT_INSTRUCTION_MAX);
}

export function BotInstructionEditor({ instruction = '', disabled = false, onSave }) {
  const current = displayBotInstruction(instruction);
  const [draft, setDraft] = React.useState(current);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(null);
  const helpId = React.useId();
  const errorId = React.useId();

  React.useEffect(() => {
    setDraft(current);
    setError(null);
  }, [current]);

  const dirty = draft !== current;
  const overLimit = draft.length > BOT_INSTRUCTION_MAX;

  const save = async () => {
    if (disabled || saving || !dirty || overLimit) return;
    setSaving(true);
    setError(null);
    try {
      await onSave?.(draft.trim() ? draft : null);
    } catch (cause) {
      setError(cause?.message ?? '机器人职责保存失败，请重试。');
    } finally {
      setSaving(false);
    }
  };

  return h('details', { className: 'dim-instruction' },
    h('summary', { className: 'dim-instructionSummary' },
      h('span', { className: 'dim-instructionTitle' },
        h('span', null, '职责 / 范围'),
        h('span', { className: 'dim-presetHelp' },
          h('button', {
            type: 'button',
            className: 'dim-presetHelpButton',
            'aria-label': '查看职责说明',
            'aria-describedby': helpId,
          }, h('span', { 'aria-hidden': 'true' }, '?')),
          h('span', {
            id: helpId,
            className: 'dim-presetTooltip',
            role: 'tooltip',
          }, '只约束这个机器人。项目规范仍看工作区 AGENTS.md。换工具箱请用 Agent Preset。'))),
      saving ? h('span', { className: 'dim-presetStatus' }, '保存中…') : null),
    h('div', { className: 'dim-instructionBody' },
      h('textarea', {
        className: 'dim-instructionInput',
        value: draft,
        disabled: disabled || saving,
        maxLength: BOT_INSTRUCTION_MAX,
        rows: 4,
        placeholder: '例如：只做客服，不改代码。',
        'aria-label': '职责 / 范围',
        'aria-invalid': error ? 'true' : undefined,
        'aria-describedby': error ? errorId : undefined,
        onChange: (event) => setDraft(event.target.value),
      }),
      h('div', { className: 'dim-instructionActions' },
        h('button', {
          type: 'button',
          className: 'dim-instructionSave',
          disabled: disabled || saving || !dirty || overLimit,
          onClick: () => { void save(); },
        }, saving ? '保存中…' : '保存')),
      error ? h('p', { id: errorId, className: 'dim-presetError', role: 'alert' }, error) : null),
  );
}
