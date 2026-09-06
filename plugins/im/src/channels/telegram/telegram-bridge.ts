import {
  TextHarnessBridge,
  createTextBridgeStatus,
  type TextHarnessBridgeInit,
} from '../shared/text-harness-bridge.ts';

export const TELEGRAM_DESCRIPTOR = Object.freeze({
  key: 'telegram',
  label: 'Telegram',
  connectionLabel: ' Bot API 长轮询',
  reactions: Object.freeze({ processing: '👀', success: '✅', error: '❌' }),
});

export class TelegramHarnessBridge extends TextHarnessBridge {
  constructor(options: Omit<TextHarnessBridgeInit, 'descriptor'>) {
    super({ descriptor: TELEGRAM_DESCRIPTOR, ...options });
  }
}

export { createTextBridgeStatus as createTelegramBridgeStatus };
