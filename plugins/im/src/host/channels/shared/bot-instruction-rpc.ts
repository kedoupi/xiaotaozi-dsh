// @ts-nocheck
import { BOT_INSTRUCTION_MAX } from '../../../channels/shared/bot-instruction.ts';

export const SET_BOT_INSTRUCTION_ENDPOINT = 'bot.instruction.set';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validBotInstructionPayload(payload) {
  return isRecord(payload)
    && Object.keys(payload).every((key) => ['botId', 'instruction'].includes(key))
    && typeof payload.botId === 'string'
    && /^[A-Za-z0-9_-]{1,128}$/.test(payload.botId)
    && (payload.instruction === null
      || (typeof payload.instruction === 'string' && payload.instruction.length <= BOT_INSTRUCTION_MAX));
}

export function publicBotInstructionError(error) {
  if (![
    'bot-instruction-invalid',
    'bot-instruction-too-long',
    'workspace-bot-not-found',
  ].includes(error?.code)) return null;
  return { code: error.code, message: error.message };
}
