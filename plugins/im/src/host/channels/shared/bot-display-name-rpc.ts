import { BOT_DISPLAY_NAME_MAX } from '../../../channels/shared/bot-display-name.ts';

export const SET_BOT_DISPLAY_NAME_ENDPOINT = 'bot.displayName.set';

type CodedError = { code?: unknown; message?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validBotDisplayNamePayload(payload: unknown) {
  return isRecord(payload)
    && Object.keys(payload).every((key) => ['botId', 'name'].includes(key))
    && typeof payload.botId === 'string'
    && /^[A-Za-z0-9_-]{1,128}$/.test(payload.botId)
    && (payload.name === null
      || (typeof payload.name === 'string' && payload.name.length <= BOT_DISPLAY_NAME_MAX));
}

export function publicBotDisplayNameError(error: unknown) {
  const coded = error as CodedError;
  if (![
    'bot-display-name-invalid',
    'bot-display-name-too-long',
    'workspace-bot-not-found',
  ].includes(coded?.code as string)) return null;
  return { code: coded.code, message: coded.message };
}
