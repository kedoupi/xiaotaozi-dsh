// @ts-nocheck
import * as React from 'react';

import { h, localizeText } from './i18n.ts';

export const SET_BOT_DISPLAY_NAME_ENDPOINT = 'bot.displayName.set';
export const BOT_DISPLAY_NAME_MAX = 40;

export function BotDisplayNameEditor({ name = '', id, disabled = false, onSave }) {
  const current = typeof name === 'string' ? name : '';
  const [draft, setDraft] = React.useState(current);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(null);
  const generatedInputId = React.useId();
  const errorId = React.useId();
  const inputId = id ?? generatedInputId;

  React.useEffect(() => {
    setDraft(current);
    setError(null);
  }, [current]);

  const save = async () => {
    const next = draft.trim();
    if (disabled || saving || next === current.trim()) return;
    if (next.length > BOT_DISPLAY_NAME_MAX) {
      setError(localizeText('名称最多 40 个字。'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave?.(next || null);
    } catch (cause) {
      setError(cause?.message ?? localizeText('名称保存失败，请重试。'));
    } finally {
      setSaving(false);
    }
  };

  return h('div', { className: 'dim-botNameEditor' },
    h('input', {
      id: inputId,
      className: 'dim-botNameInput',
      value: draft,
      disabled: disabled || saving,
      maxLength: BOT_DISPLAY_NAME_MAX,
      placeholder: localizeText('给这个机器人起个名，方便区分'),
      'aria-label': localizeText('机器人名称'),
      'aria-invalid': error ? 'true' : undefined,
      'aria-describedby': error ? errorId : undefined,
      title: localizeText('给这个机器人起个名，方便区分'),
      onChange: (event) => setDraft(event.target.value),
      onBlur: () => { void save(); },
      onKeyDown: (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        }
      },
    }),
    error ? h('p', { id: errorId, className: 'dim-presetError', role: 'alert' }, error) : null);
}
