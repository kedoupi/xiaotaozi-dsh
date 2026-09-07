import * as React from 'react';

import { h } from './i18n.ts';

export const SET_AGENT_PRESET_ENDPOINT = 'bot.preset.set';

const PRESET_ID = /^[a-z0-9][a-z0-9-]*$/;

export type AgentPresetItem = {
  id: string;
  label: string;
  unavailable?: boolean;
};

export type AgentPresetCatalog = {
  defaultId: string;
  items: readonly AgentPresetItem[];
};

export const EMPTY_AGENT_PRESET_CATALOG: AgentPresetCatalog = Object.freeze({
  defaultId: '',
  items: Object.freeze<AgentPresetItem[]>([]),
});

export const AgentPresetCatalogContext = React.createContext<AgentPresetCatalog>(EMPTY_AGENT_PRESET_CATALOG);

export function normalizeAgentPresetId(value: unknown) {
  if (typeof value !== 'string') return '';
  const id = value.trim();
  return PRESET_ID.test(id) ? id : '';
}

function catalogEntry(value: unknown): { id?: unknown; label?: unknown; name?: unknown } | undefined {
  return value && typeof value === 'object' ? value as { id?: unknown; label?: unknown; name?: unknown } : undefined;
}

export function normalizeAgentPresetCatalog(value: unknown): AgentPresetCatalog {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { defaultId: '', items: [] };
  }
  const record = value as { items?: unknown; defaultId?: unknown };
  const items: AgentPresetItem[] = [];
  const seen = new Set<string>();
  for (const entry of Array.isArray(record.items) ? record.items : []) {
    const fields = catalogEntry(entry);
    const id = typeof entry === 'string'
      ? normalizeAgentPresetId(entry)
      : normalizeAgentPresetId(fields?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const label = typeof fields?.label === 'string' && fields.label.trim()
      ? fields.label.trim().slice(0, 128)
      : typeof fields?.name === 'string' && fields.name.trim()
        ? fields.name.trim().slice(0, 128)
        : id;
    items.push({ id, label });
  }
  return {
    defaultId: normalizeAgentPresetId(record.defaultId),
    items,
  };
}

export type AgentPresetEditorProps = {
  agentPreset?: unknown;
  disabled?: boolean;
  onSave?: (preset: string | null) => void | Promise<void>;
};

export function AgentPresetEditor({
  agentPreset = '',
  disabled = false,
  onSave,
}: AgentPresetEditorProps) {
  const catalog = React.useContext(AgentPresetCatalogContext) ?? EMPTY_AGENT_PRESET_CATALOG;
  const helpId = React.useId();
  const current = normalizeAgentPresetId(agentPreset);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const items: AgentPresetItem[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(catalog.items) ? catalog.items : []) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }
  const currentUnavailable = Boolean(current && !seen.has(current));
  if (currentUnavailable) items.push({ id: current, label: current, unavailable: true });

  const inheritLabel = '跟随 Host 默认';
  const currentLabel = current
    ? (items.find((item) => item.id === current)?.label ?? current)
    : inheritLabel;

  const change = async (event: { target: { value: string } }) => {
    const next = event.target.value;
    if (next === current || saving || disabled) return;
    setSaving(true);
    setError(null);
    try {
      await onSave?.(next || null);
    } catch (cause) {
      setError(cause instanceof Error && cause.message
        ? cause.message
        : 'Agent Preset 修改失败，请重试。');
    } finally {
      setSaving(false);
    }
  };

  return h('details', {
    className: 'dim-preset',
    // Errors and an unavailable current preset must stay visible, so the
    // disclosure is forced open while either applies.
    open: error || currentUnavailable ? true : undefined,
  },
    h('summary', { className: 'dim-presetSummary' },
      h('span', { className: 'dim-presetTitle' },
        h('span', null, 'Agent Preset'),
        h('span', { className: 'dim-presetHelp' },
          h('button', {
            type: 'button',
            className: 'dim-presetHelpButton',
            'aria-label': '查看 Agent Preset 说明',
            'aria-describedby': helpId,
          }, h('span', { 'aria-hidden': 'true' }, '?')),
          h('span', {
            id: helpId,
            className: 'dim-presetTooltip',
            role: 'tooltip',
          }, '只影响新建会话；若当前聊天已有会话，先发送 /new，再发送普通消息生效。'))),
      saving ? h('span', { className: 'dim-presetStatus' }, '保存中…') : null,
      h('span', { className: 'dim-presetCurrent' }, currentLabel)),
    h('div', { className: 'dim-presetBody' },
      React.createElement('select', {
        className: 'dim-presetSelect',
        value: current,
        disabled: disabled || saving,
        'aria-label': 'Agent Preset',
        onChange: (event: { target: { value: string } }) => { void change(event); },
      },
        h('option', { value: '' }, inheritLabel),
        ...items.map((item) => h(
          'option',
          { key: item.id, value: item.id },
          item.unavailable
            ? [item.id, '（已不可用）']
            : item.label && item.label !== item.id ? `${item.label}（${item.id}）` : item.id,
        )),
      ),
      error || currentUnavailable ? h(
        'p',
        { className: 'dim-presetError', role: error ? 'alert' : 'status' },
        error ?? '当前 Agent Preset 已不可用，请选择其他 Preset 或跟随 Host 默认。',
      ) : null),
  );
}
