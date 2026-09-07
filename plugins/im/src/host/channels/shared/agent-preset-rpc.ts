import { AGENT_PRESET_ID } from '../../../channels/shared/agent-preset.ts';

export const SET_AGENT_PRESET_ENDPOINT = 'bot.preset.set';

type CodedError = { code?: unknown; message?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validAgentPresetPayload(payload: unknown) {
  return isRecord(payload)
    && Object.keys(payload).every((key) => ['botId', 'agentPreset'].includes(key))
    && typeof payload.botId === 'string'
    && /^[A-Za-z0-9_-]{1,128}$/.test(payload.botId)
    && (payload.agentPreset === null
      || (typeof payload.agentPreset === 'string' && AGENT_PRESET_ID.test(payload.agentPreset)));
}

export function publicAgentPresetError(error: unknown) {
  const coded = error as CodedError;
  if (![
    'agent-preset-invalid',
    'agent-preset-unavailable',
    'workspace-bot-not-found',
  ].includes(coded?.code as string)) return null;
  return { code: coded.code, message: coded.message };
}
