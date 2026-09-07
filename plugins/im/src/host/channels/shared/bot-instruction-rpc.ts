import { BOT_INSTRUCTION_MAX } from '../../../channels/shared/bot-instruction.ts';

export const SET_BOT_INSTRUCTION_ENDPOINT = 'bot.instruction.set';

type CodedError = { code?: unknown; message?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validBotInstructionPayload(payload: unknown) {
  return isRecord(payload)
    && Object.keys(payload).every((key) => ['botId', 'instruction'].includes(key))
    && typeof payload.botId === 'string'
    && /^[A-Za-z0-9_-]{1,128}$/.test(payload.botId)
    && (payload.instruction === null
      || (typeof payload.instruction === 'string' && payload.instruction.length <= BOT_INSTRUCTION_MAX));
}

export function publicBotInstructionError(error: unknown) {
  const coded = error as CodedError;
  if (![
    'bot-instruction-invalid',
    'bot-instruction-too-long',
    'workspace-bot-not-found',
  ].includes(coded?.code as string)) return null;
  return { code: coded.code, message: coded.message };
}
