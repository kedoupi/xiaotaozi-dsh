import { RegistrationManager } from './registration-manager.ts';
import { assertTargetedAppUpdateUrl } from './repair-manager.ts';

export const FEISHU_GROUP_MESSAGE_SCOPE = 'im:message.group_msg';
export const GROUP_MESSAGE_PERMISSION_OPERATION = 'group_message_permission';

type QrReadyInfo = {
  url?: unknown;
};

type RegisterAppCallOptions = {
  onQRCodeReady: (info: QrReadyInfo) => unknown;
} & Record<string, unknown>;

type GroupMessagePermissionManagerOptions = {
  registerApp?: unknown;
  onCredentials?: unknown;
  appId?: unknown;
  domain?: unknown;
};

function accountsDomain(domain: unknown): string {
  return domain === 'lark' ? 'accounts.larksuite.com' : 'accounts.feishu.cn';
}

export function assertGroupMessagePermissionUrl(
  value: unknown,
  expectedAppId: unknown,
  domain = 'feishu',
) {
  return assertTargetedAppUpdateUrl(
    value,
    expectedAppId,
    domain,
    'Feishu group message permission update',
  );
}

/**
 * Incrementally grants the one sensitive tenant scope needed by all-message
 * mode to an existing app. The fixed manifest prevents this UI action from
 * creating another app or silently adding unrelated capabilities.
 */
export class GroupMessagePermissionManager {
  #manager: RegistrationManager;
  #appId: string;
  #domain: string;

  constructor({
    registerApp,
    onCredentials,
    appId,
    domain = 'feishu',
  }: GroupMessagePermissionManagerOptions = {}) {
    if (typeof registerApp !== 'function') throw new TypeError('registerApp is required');
    if (typeof onCredentials !== 'function') throw new TypeError('onCredentials is required');
    if (typeof appId !== 'string' || !appId.trim()) throw new TypeError('appId is required');
    if (domain !== 'feishu' && domain !== 'lark') throw new TypeError('domain is invalid');

    this.#appId = appId.trim();
    this.#domain = domain;
    this.#manager = new RegistrationManager({
      registerApp: (options: RegisterAppCallOptions) => registerApp({
        ...options,
        onQRCodeReady: (info: QrReadyInfo) => {
          assertGroupMessagePermissionUrl(info?.url, this.#appId, this.#domain);
          return options.onQRCodeReady(info);
        },
      }),
      onCredentials,
    } as ConstructorParameters<typeof RegistrationManager>[0]);
  }

  start() {
    return this.#manager.start({
      source: 'deepseek-harness-group-message-permission',
      domain: accountsDomain(this.#domain),
      appId: this.#appId,
      addons: {
        preset: false,
        scopes: { tenant: [FEISHU_GROUP_MESSAGE_SCOPE] },
      },
    });
  }

  status() {
    return this.#manager.status();
  }

  cancel() {
    return this.#manager.cancel();
  }
}

export default GroupMessagePermissionManager;
