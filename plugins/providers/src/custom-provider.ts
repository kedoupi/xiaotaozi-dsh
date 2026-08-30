import type { LlmRuntime } from "@deepseek-ai/dsh-llm";
import { PRODUCTS } from "./catalog.ts";
import { RESERVED_API_PROVIDER_IDS } from "./display.ts";

const SETTINGS_NS = "llm-pi-ai";
const CUSTOM_ID = /^custom-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_ID_LENGTH = 64;
const MAX_NAME_LENGTH = 128;
const MAX_BASE_URL_LENGTH = 2_048;
const MAX_API_KEY_LENGTH = 8_192;
const MAX_MODELS = 1_000;
const MAX_MODEL_ID_LENGTH = 256;
const MAX_MODEL_NAME_LENGTH = 256;

interface SettingsDescriptor {
  ns: string;
  revision: number;
  value?: unknown;
  user?: unknown;
  base?: unknown;
}

interface SettingsHost {
  describe(options?: { redactSecrets?: boolean }): SettingsDescriptor[];
  mutate(
    ns: string,
    ops: ReadonlyArray<{ op: "set" | "unset"; path: readonly string[]; value?: unknown }>,
    expectedRevision?: number,
  ): Promise<void>;
}

interface CredentialsHost {
  set(ref: string, value: string): Promise<void>;
  unset(ref: string): Promise<void>;
}

export interface CustomProviderHost {
  llm: Pick<LlmRuntime, "listProviders" | "listConfigurableProviders">;
  settings: SettingsHost;
  credentials: CredentialsHost;
}

export interface CustomProviderInput {
  id: string;
  name: string;
  baseURL: string;
  apiKey: string;
  models: Array<{ id: string; name: string }>;
}

const STATIC_RESERVED_IDS: ReadonlySet<string> = new Set([
  ...RESERVED_API_PROVIDER_IDS,
  ...PRODUCTS.map((product) => product.id),
]);

function credentialRef(id: string): string {
  return `${id.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`;
}

function readText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label}不能为空`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) throw new Error(`${label}不能超过 ${String(maxLength)} 个字符`);
  return trimmed;
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

/** Parse and canonicalize the endpoint again at the Host trust boundary. */
function normalizeBaseUrl(value: unknown): string {
  const raw = readText(value, "接口地址", MAX_BASE_URL_LENGTH);
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw);
  const looksLikeHostPort = /^[^/?#]+:\d+(?:[/?#]|$)/.test(raw);
  const candidate = hasScheme && !looksLikeHostPort ? raw : `https://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("接口地址无效");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("接口地址只支持 http 或 https");
  }
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    throw new Error("接口地址不能包含用户名或密码");
  }
  if (parsed.hash.length > 0) throw new Error("接口地址不能包含片段标识");
  if (parsed.protocol === "http:" && !isLoopbackHost(parsed.hostname)) parsed.protocol = "https:";
  const path = parsed.pathname.replace(/\/+$/, "");
  return `${parsed.origin}${path.length === 0 || path === "/" ? "" : path}${parsed.search}`;
}

function readInput(value: unknown): CustomProviderInput {
  if (typeof value !== "object" || value === null) throw new Error("自定义服务商参数无效");
  const raw = value as Record<string, unknown>;
  const modelValues = Array.isArray(raw.models) ? raw.models : [];
  if (modelValues.length === 0) throw new Error("模型列表不能为空");
  if (modelValues.length > MAX_MODELS) throw new Error(`模型数量不能超过 ${String(MAX_MODELS)} 个`);
  const models = modelValues.map((entry) => {
    if (typeof entry !== "object" || entry === null) throw new Error("模型列表无效");
    const model = entry as Record<string, unknown>;
    return {
      id: readText(model.id, "模型 ID", MAX_MODEL_ID_LENGTH),
      name: readText(model.name, "模型名称", MAX_MODEL_NAME_LENGTH),
    };
  });
  return {
    id: readText(raw.id, "服务商 ID", MAX_ID_LENGTH),
    name: readText(raw.name, "服务商名称", MAX_NAME_LENGTH),
    baseURL: normalizeBaseUrl(raw.baseURL),
    apiKey: readText(raw.apiKey, "API Key", MAX_API_KEY_LENGTH),
    models,
  };
}

function readProfiles(layer: unknown): ReadonlyMap<string, unknown> {
  if (typeof layer !== "object" || layer === null) return new Map();
  const providers = (layer as Record<string, unknown>).providers;
  if (typeof providers !== "object" || providers === null) return new Map();
  return new Map(Object.entries(providers as Record<string, unknown>));
}

function settingsSnapshot(settings: SettingsHost): {
  descriptor: SettingsDescriptor;
  descriptors: readonly SettingsDescriptor[];
  profiles: ReadonlyMap<string, unknown>;
  userProfiles: ReadonlyMap<string, unknown>;
  baseProfiles: ReadonlyMap<string, unknown>;
} {
  const descriptors = settings.describe({ redactSecrets: true });
  const descriptor = descriptors.find((entry) => entry.ns === SETTINGS_NS);
  if (descriptor === undefined) throw new Error("模型服务配置暂不可用");
  return {
    descriptor,
    descriptors,
    profiles: readProfiles(descriptor.value),
    userProfiles: readProfiles(descriptor.user),
    baseProfiles: readProfiles(descriptor.base),
  };
}

function containsRef(value: unknown, ref: string): boolean {
  if (Array.isArray(value)) return value.some((entry) => containsRef(entry, ref));
  if (typeof value !== "object" || value === null) return false;
  return Object.entries(value as Record<string, unknown>).some(([key, entry]) =>
    ((key === "apiKeyEnv" || key === "credentialRef" || key === "secretRef") && entry === ref)
    || containsRef(entry, ref));
}

function profileCredentialRef(id: string, profile: unknown): string {
  if (typeof profile === "object" && profile !== null) {
    const ref = (profile as { apiKeyEnv?: unknown }).apiKeyEnv;
    if (typeof ref === "string" && ref.length > 0) return ref;
  }
  return credentialRef(id);
}

/** Host-side owner for custom pi-ai profiles and their credential references. */
export class CustomProviderStore {
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly host: CustomProviderHost) {}

  private runExclusive<T>(run: () => Promise<T>): Promise<T> {
    const result = this.tail.then(run, run);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }

  create(value: unknown): Promise<{ id: string }> {
    return this.runExclusive(() => this.createUnlocked(value));
  }

  private async createUnlocked(value: unknown): Promise<{ id: string }> {
    const input = readInput(value);
    if (!CUSTOM_ID.test(input.id)) {
      throw new Error('自定义服务商 ID 必须使用 "custom-" 前缀');
    }
    const liveIds = new Set(this.host.llm.listProviders().map((provider) => provider.id));
    const declaredIds = new Set(this.host.llm.listConfigurableProviders().map((provider) => provider.provider));
    const snapshot = settingsSnapshot(this.host.settings);
    const ref = credentialRef(input.id);
    const existingIds = new Set([...liveIds, ...declaredIds, ...snapshot.profiles.keys()]);
    const credentialCollision = [...existingIds]
      .some((id) => id !== input.id && profileCredentialRef(id, snapshot.profiles.get(id)) === ref)
      || snapshot.descriptors.some((descriptor) =>
        containsRef(descriptor.value, ref) || containsRef(descriptor.user, ref) || containsRef(descriptor.base, ref));
    if (STATIC_RESERVED_IDS.has(input.id) || liveIds.has(input.id) || declaredIds.has(input.id) || credentialCollision) {
      throw new Error(`服务商 ID "${input.id}" 已保留或正在使用`);
    }

    await this.host.credentials.set(ref, input.apiKey);
    try {
      await this.host.settings.mutate(SETTINGS_NS, [{
        op: "set",
        path: ["providers", input.id],
        value: {
          displayName: input.name,
          apiKeyEnv: ref,
          api: "openai-completions",
          baseURL: input.baseURL,
          models: input.models,
        },
      }], snapshot.descriptor.revision);
    } catch (mutationError) {
      try {
        await this.host.credentials.unset(ref);
      } catch (cleanupError) {
        throw new AggregateError(
          [mutationError, cleanupError],
          "保存自定义服务商失败，且凭据补偿清理失败",
        );
      }
      throw mutationError;
    }
    return { id: input.id };
  }

  remove(value: unknown): Promise<void> {
    return this.runExclusive(() => this.removeUnlocked(value));
  }

  private async removeUnlocked(value: unknown): Promise<void> {
    const id = readText(value, "服务商 ID", MAX_ID_LENGTH);
    const configurable = this.host.llm.listConfigurableProviders();
    const liveProviders = this.host.llm.listProviders();
    const declared = configurable.find((provider) => provider.provider === id);
    const live = liveProviders.some((provider) => provider.id === id);
    const namespaced = CUSTOM_ID.test(id);
    // `declared: true` keeps legacy pre-namespace custom providers removable,
    // while the static reserved set still wins for every shipped/hidden route.
    const ownedByCustomConfig = declared?.declared === true;
    const ownedByAnotherAdapter = declared !== undefined ? !ownedByCustomConfig : live;
    const snapshot = settingsSnapshot(this.host.settings);
    const userOwned = snapshot.userProfiles.has(id);
    const inherited = snapshot.baseProfiles.has(id);
    if (STATIC_RESERVED_IDS.has(id) || ownedByAnotherAdapter || (!namespaced && !ownedByCustomConfig)
      || !userOwned || inherited) {
      throw new Error(`服务商 ID "${id}" 不是可删除的自定义服务商`);
    }

    const ref = profileCredentialRef(id, snapshot.profiles.get(id));
    const existingIds = new Set([
      ...liveProviders.map((provider) => provider.id),
      ...configurable.map((provider) => provider.provider),
      ...snapshot.profiles.keys(),
    ]);
    const shared = [...existingIds]
      .some((otherId) => otherId !== id && profileCredentialRef(otherId, snapshot.profiles.get(otherId)) === ref)
      || [snapshot.userProfiles, snapshot.baseProfiles].some((profiles) =>
        [...profiles].some(([otherId, profile]) => otherId !== id && profileCredentialRef(otherId, profile) === ref))
      || snapshot.descriptors
        .filter((descriptor) => descriptor.ns !== SETTINGS_NS)
        .some((descriptor) =>
          containsRef(descriptor.value, ref) || containsRef(descriptor.user, ref) || containsRef(descriptor.base, ref));

    await this.host.settings.mutate(SETTINGS_NS, [{ op: "unset", path: ["providers", id] }], snapshot.descriptor.revision);
    if (!shared) await this.host.credentials.unset(ref);
  }
}
