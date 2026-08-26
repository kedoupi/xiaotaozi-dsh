// @ts-nocheck
import { BOT_DISPLAY_NAME_MAX } from '../../../channels/shared/bot-display-name.ts';

export const SET_BOT_DISPLAY_NAME_ENDPOINT = 'bot.displayName.set';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validBotDisplayNamePayload(payload) {
  return isRecord(payload)
    && Object.keys(payload).every((key) => ['botId', 'name'].includes(key))
    && typeof payload.botId === 'string'
    && /^[A-Za-z0-9_-]{1,128}$/.test(payload.botId)
    && (payload.name === null
      || (typeof payload.name === 'string' && payload.name.length <= BOT_DISPLAY_NAME_MAX));
}

export function publicBotDisplayNameError(error) {
  if (![
    'bot-display-name-invalid',
    'bot-display-name-too-long',
    'workspace-bot-not-found',
  ].includes(error?.code)) return null;
  return { code: error.code, message: error.message };
}
