/**
 * Credential references owned by the Feishu Host plugin.  They deliberately
 * use DSH's credential provider instead of plugin settings, so the browser's
 * configuration plane can only observe configured/source metadata.
 */
export const FEISHU_APP_ID_REF = 'DSH_FEISHU_APP_ID';
export const FEISHU_APP_SECRET_REF = 'DSH_FEISHU_APP_SECRET';

type CredentialRecord = {
  value?: unknown;
  configured?: unknown;
};

type CredentialProvider = {
  resolve: (ref: string) => Promise<CredentialRecord | null | undefined> | CredentialRecord | null | undefined;
  describe: (ref: string) => Promise<CredentialRecord | null | undefined> | CredentialRecord | null | undefined;
  set: (ref: string, value: string) => unknown;
  unset: (ref: string) => unknown;
};

type CredentialStoreOptions = {
  appIdRef?: string;
  appSecretRef?: string;
};

function assertNonEmptyString(value: unknown, label: string) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function isCredentialProvider(value: unknown): value is CredentialProvider {
  return Boolean(
    value
    && typeof value === 'object'
    && typeof (value as CredentialProvider).resolve === 'function'
    && typeof (value as CredentialProvider).describe === 'function'
    && typeof (value as CredentialProvider).set === 'function'
    && typeof (value as CredentialProvider).unset === 'function',
  );
}

async function restore(
  provider: CredentialProvider,
  ref: string,
  previous: CredentialRecord | null | undefined,
) {
  try {
    if (previous?.value) await provider.set(ref, previous.value as string);
    else await provider.unset(ref);
  } catch {
    // Preserve the original write failure.  The provider remains the source
    // of truth and will report the partial state through describe().
  }
}

/**
 * Adapt the real DSH `ctx.credentials` seam to the small interface consumed
 * by the Feishu controller.  Secret values only travel Host-to-Host here.
 *
 * @param {{resolve(Function), describe(Function), set(Function), unset(Function)}} provider
 * @param {{appIdRef?: string, appSecretRef?: string}} options
 */
export function createDshCredentialStore(provider: unknown, options: CredentialStoreOptions = {}) {
  if (!isCredentialProvider(provider)) {
    throw new TypeError('A DSH credential provider is required');
  }

  const appIdRef = options.appIdRef ?? FEISHU_APP_ID_REF;
  const appSecretRef = options.appSecretRef ?? FEISHU_APP_SECRET_REF;

  return Object.freeze({
    async save({ appId, appSecret }: { appId?: unknown; appSecret?: unknown }) {
      const nextId = assertNonEmptyString(appId, 'Feishu App ID');
      const nextSecret = assertNonEmptyString(appSecret, 'Feishu App Secret');
      const [previousId, previousSecret] = await Promise.all([
        provider.resolve(appIdRef),
        provider.resolve(appSecretRef),
      ]);

      try {
        // Store the secret first.  An App ID without its matching secret must
        // never be treated as a usable integration.
        await provider.set(appSecretRef, nextSecret);
        await provider.set(appIdRef, nextId);
      } catch {
        await restore(provider, appSecretRef, previousSecret);
        await restore(provider, appIdRef, previousId);
        throw new Error('Unable to store the Feishu credentials.');
      }
    },

    async clear() {
      const outcomes = await Promise.allSettled([
        provider.unset(appIdRef),
        provider.unset(appSecretRef),
      ]);
      if (outcomes.some((outcome) => outcome.status === 'rejected')) {
        throw new Error('Unable to remove the Feishu credentials.');
      }
    },

    async configured() {
      const [appId, appSecret] = await Promise.all([
        provider.describe(appIdRef),
        provider.describe(appSecretRef),
      ]);
      return (appId as CredentialRecord).configured === true
        && (appSecret as CredentialRecord).configured === true;
    },
  });
}
