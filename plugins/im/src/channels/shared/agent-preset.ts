import { t } from './i18n.ts';

/** Matches DeepSeek Harness agent-preset directory ids. */
export const AGENT_PRESET_ID = /^[a-z0-9][a-z0-9-]*$/;

export const EMPTY_AGENT_PRESET_CATALOG = Object.freeze({
  defaultId: '',
  items: Object.freeze([]),
});

type CodedError = Error & { code: string };
type AgentPresetCtx = {
  get?: (name: string) => unknown;
  agentPresets?: { list?: () => Promise<unknown> | unknown; defaultId?: unknown };
};

export function normalizeAgentPresetId(value: unknown) {
  if (value == null) return null;
  if (typeof value !== 'string') return null;
  const id = value.trim();
  return AGENT_PRESET_ID.test(id) ? id : null;
}

export function validateAgentPresetId(value: unknown) {
  if (value == null || value === '') return null;
  const id = normalizeAgentPresetId(value);
  if (!id) {
    const error = new Error(t('Agent Preset 无效。') as string) as CodedError;
    error.code = 'agent-preset-invalid';
    throw error;
  }
  return id;
}

function catalogItem(value: unknown) {
  if (typeof value === 'string') {
    const id = normalizeAgentPresetId(value);
    return id ? { id, label: id } : null;
  }
  if (!value || typeof value !== 'object') return null;
  const record = value as { broken?: unknown; id?: unknown; name?: unknown; label?: unknown };
  if (record.broken !== undefined) return null;
  const id = normalizeAgentPresetId(record.id);
  if (!id) return null;
  const label = typeof record.name === 'string' && record.name.trim()
    ? record.name.trim().slice(0, 128)
    : typeof record.label === 'string' && record.label.trim()
      ? record.label.trim().slice(0, 128)
      : id;
  return { id, label };
}

export function normalizeAgentPresetCatalog(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { defaultId: '', items: [] };
  }
  const record = value as { items?: unknown; defaultId?: unknown };
  const items = [];
  const seen = new Set<string>();
  for (const entry of Array.isArray(record.items) ? record.items : []) {
    const item = catalogItem(entry);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }
  return {
    defaultId: normalizeAgentPresetId(record.defaultId) ?? '',
    items,
  };
}

export async function listAgentPresetCatalog(ctx: unknown) {
  try {
    const host = ctx as AgentPresetCtx;
    const service = typeof host?.get === 'function' ? host.get('agentPresets') : host?.agentPresets;
    const listedService = service as { list?: () => Promise<unknown> | unknown; defaultId?: unknown } | undefined;
    if (!listedService || typeof listedService.list !== 'function') return { defaultId: '', items: [] };
    const listed = await listedService.list();
    return normalizeAgentPresetCatalog({
      defaultId: typeof listedService.defaultId === 'string' ? listedService.defaultId : '',
      items: Array.isArray(listed) ? listed : [],
    });
  } catch {
    return { defaultId: '', items: [] };
  }
}
