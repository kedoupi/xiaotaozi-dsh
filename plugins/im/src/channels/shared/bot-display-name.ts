// @ts-nocheck

export const BOT_DISPLAY_NAME_MAX = 40;

export function validateBotDisplayName(value) {
  if (value == null) return null;
  if (typeof value !== 'string') {
    const error = new Error('名称必须是文字。');
    error.code = 'bot-display-name-invalid';
    throw error;
  }
  const name = value.trim();
  if (!name) return null;
  if (name.length > BOT_DISPLAY_NAME_MAX) {
    const error = new Error(`名称最多 ${BOT_DISPLAY_NAME_MAX} 个字。`);
    error.code = 'bot-display-name-too-long';
    throw error;
  }
  if (/[\u0000-\u001f]/u.test(name)) {
    const error = new Error('名称不能包含控制字符。');
    error.code = 'bot-display-name-invalid';
    throw error;
  }
  return name;
}
