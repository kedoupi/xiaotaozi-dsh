import {
  TextHarnessBridge,
  createTextBridgeStatus,
  type TextHarnessBridgeInit,
} from '../shared/text-harness-bridge.ts';
import { t } from '../shared/i18n.ts';

export const WHATSAPP_DESCRIPTOR = Object.freeze({
  key: 'whatsapp',
  label: 'WhatsApp',
  // Translated lazily: t() must run after setImHostLanguage, not at import time.
  get connectionLabel() { return t(' Web 关联设备'); },
  reactions: Object.freeze({ processing: '👀', success: '✅', error: '❌' }),
});

export class WhatsappHarnessBridge extends TextHarnessBridge {
  constructor(options: Omit<TextHarnessBridgeInit, 'descriptor'>) {
    super({ ...options, descriptor: WHATSAPP_DESCRIPTOR });
  }
}

export { createTextBridgeStatus as createWhatsappBridgeStatus };
