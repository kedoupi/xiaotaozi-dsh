// @ts-nocheck
import { t } from './i18n.ts';

export const BOT_INSTRUCTION_MAX = 8_000;

export function validateBotInstruction(value) {
  if (value == null) return null;
  if (typeof value !== 'string') {
    const error = new Error(t('机器人职责必须是文字。'));
    error.code = 'bot-instruction-invalid';
    throw error;
  }
  const text = value.trim();
  if (!text) return null;
  if (text.length > BOT_INSTRUCTION_MAX) {
    const error = new Error(t('机器人职责最多 {max} 字。', { max: BOT_INSTRUCTION_MAX }));
    error.code = 'bot-instruction-too-long';
    throw error;
  }
  return text;
}

export function wrapPromptWithBotInstruction(prompt, instruction) {
  if (typeof instruction !== 'string' || !instruction) return prompt;
  const preface = [
    t('## 机器人职责'),
    instruction,
    '',
    t('## 用户消息'),
  ].join('\n');
  if (typeof prompt === 'string') return `${preface}\n${prompt}`;
  if (Array.isArray(prompt)) return [{ type: 'text', text: `${preface}\n` }, ...prompt];
  return prompt;
}
