import { explainHostError } from "../auth/explain.ts";
import { collapseApiVendors, HIDDEN_API_ROUTES, isFeaturedVendor, modelDisplayName, vendorDisplayName } from "../display.ts";
import { getPath, keyRef, pickedIds } from "../provider-profile.ts";

export { pickedIds };

export type WireResult<T> =
  | { result: { ok: true; value: T } }
  | { result: { ok: false; error: { message: string } } };

type RemoteResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { message: string } };

export const HOST_API_UNAVAILABLE = "宿主没有开放密钥接口，暂时无法列出或保存 API Key。";

function isFn(value: unknown): value is (...args: never[]) => unknown {
  return typeof value === "function";
}

function wrapResult<T>(result: RemoteResult<T> | WireResult<T>): WireResult<T> {
  if (result !== null && typeof result === "object" && "result" in result) return result;
  return result.ok
    ? { result: { ok: true, value: result.value } }
    : { result: { ok: false, error: result.error } };
}

function fail(message: string): WireResult<never> {
  return { result: { ok: false, error: { message } } };
}

function okValue<T>(wrapped: WireResult<T>): T | undefined {
  return wrapped.result.ok ? wrapped.result.value : undefined;
}

type RemoteSlice = {
  llm?: unknown;
  settings?: unknown;
  credentials?: unknown;
  api?: unknown;
};

function pickRemoteSlice(remote: unknown): RemoteSlice | undefined {
  if (remote == null || typeof remote !== "object") return undefined;
  const candidate = remote as RemoteSlice;
  if (candidate.llm != null || candidate.settings != null || candidate.credentials != null) {
    return candidate;
  }
  return pickRemoteSlice(candidate.api);
}

type ConfigurableProvider = {
  provider: string;
  displayName: string;
  settingsNs: string;
  settingsPath: readonly string[];
  declared?: boolean;
};

function asLegacyHostApi(slice: RemoteSlice): HostApi | undefined {
  const llm = slice.llm as Partial<HostApi["llm"]> | undefined;
  const settings = slice.settings as Partial<HostApi["settings"]> | undefined;
  const credentials = slice.credentials as Partial<HostApi["credentials"]> | undefined;
  if (!isFn(llm?.providers) || !isFn(settings?.describe) || !isFn(credentials?.describe)) {
    return undefined;
  }
  const wrap = <A extends unknown[], T>(fn: (...args: A) => Promise<RemoteResult<T> | WireResult<T>>) =>
    async (...args: A): Promise<WireResult<T>> => wrapResult(await fn(...args));
  return {
    llm: {
      providers: wrap(llm.providers.bind(llm)),
      models: isFn(llm.models)
        ? wrap(llm.models.bind(llm))
        : async () => ({ result: { ok: true, value: { groups: [] } } }),
      discoverModels: isFn(llm.discoverModels)
        ? wrap(llm.discoverModels.bind(llm))
        : async () => fail(HOST_API_UNAVAILABLE),
    },
    settings: {
      describe: wrap(settings.describe.bind(settings)),
      mutate: isFn(settings.mutate)
        ? wrap(settings.mutate.bind(settings))
        : async () => fail(HOST_API_UNAVAILABLE),
    },
    credentials: {
      describe: wrap(credentials.describe.bind(credentials)),
      set: isFn(credentials.set)
        ? wrap(credentials.set.bind(credentials))
        : async () => fail(HOST_API_UNAVAILABLE),
      unset: isFn(credentials.unset)
        ? wrap(credentials.unset.bind(credentials))
        : async () => fail(HOST_API_UNAVAILABLE),
    },
  };
}

function asTypertHostApi(slice: RemoteSlice): HostApi | undefined {
  const llm = slice.llm as {
    listConfigurableProviders?: () => Promise<RemoteResult<ConfigurableProvider[]> | WireResult<ConfigurableProvider[]>>;
    discoverModels?: (
      settingsNs: string,
      request: { provider?: string; baseURL?: string; api?: string; apiKey?: string },
    ) => Promise<RemoteResult<Array<{ id: string; name?: string }>> | WireResult<Array<{ id: string; name?: string }>>>;
  } | undefined;
  const settings = slice.settings as {
    describe?: () => Promise<RemoteResult<{ namespaces: Array<{ ns: string; value: unknown; revision?: number }> }> | WireResult<{ namespaces: Array<{ ns: string; value: unknown; revision?: number }> }>>;
    mutate?: (
      ns: string,
      ops: Array<{ op: "set" | "unset"; path: string[]; value?: unknown }>,
      expectedRevision: number | undefined,
    ) => Promise<RemoteResult<unknown> | WireResult<unknown>>;
  } | undefined;
  const credentials = slice.credentials as {
    describe?: (refs: string[]) => Promise<
      RemoteResult<Record<string, { configured?: boolean; writable?: boolean; source?: string }>>
      | WireResult<Record<string, { configured?: boolean; writable?: boolean; source?: string }>>
    >;
    set?: (ref: string, value: string) => Promise<RemoteResult<unknown> | WireResult<unknown>>;
    unset?: (ref: string) => Promise<RemoteResult<unknown> | WireResult<unknown>>;
  } | undefined;
  const listConfigurable = llm?.listConfigurableProviders;
  const describeSettings = settings?.describe;
  const describeCredentials = credentials?.describe;
  if (!isFn(listConfigurable) || !isFn(describeSettings) || !isFn(describeCredentials)) {
    return undefined;
  }
  const discoverModels = llm?.discoverModels;
  const mutateSettings = settings?.mutate;
  const setCredential = credentials?.set;
  const unsetCredential = credentials?.unset;
  return {
    llm: {
      providers: async () => {
        const wrapped = wrapResult(await listConfigurable());
        const listed = okValue(wrapped);
        if (listed === undefined) return wrapped as WireResult<never>;
        return {
          result: {
            ok: true,
            value: {
              providers: listed.map((entry) => ({
                provider: entry.provider,
                displayName: entry.displayName,
                settingsNs: entry.settingsNs,
                settingsPath: [...entry.settingsPath],
                ...entry.declared === undefined ? {} : { declared: entry.declared },
              })),
            },
          },
        };
      },
      models: async () => ({ result: { ok: true, value: { groups: [] } } }),
      discoverModels: async (payload) => {
        if (!isFn(discoverModels)) return fail(HOST_API_UNAVAILABLE);
        const wrapped = wrapResult(await discoverModels(payload.settingsNs, {
          ...payload.provider === undefined ? {} : { provider: payload.provider },
          ...payload.baseURL === undefined ? {} : { baseURL: payload.baseURL },
          ...payload.api === undefined ? {} : { api: payload.api },
          ...payload.apiKey === undefined ? {} : { apiKey: payload.apiKey },
        }));
        const models = okValue(wrapped);
        if (models === undefined) return wrapped as WireResult<never>;
        return { result: { ok: true, value: { models } } };
      },
    },
    settings: {
      describe: async () => wrapResult(await describeSettings()),
      mutate: async (payload) => {
        if (!isFn(mutateSettings)) return fail(HOST_API_UNAVAILABLE);
        return wrapResult(await mutateSettings(payload.ns, payload.ops, payload.expectedRevision));
      },
    },
    credentials: {
      describe: async (payload) => {
        const wrapped = wrapResult(await describeCredentials(payload.refs));
        const credentials = okValue(wrapped);
        if (credentials === undefined) return wrapped as WireResult<never>;
        return { result: { ok: true, value: { credentials } } };
      },
      set: async (payload) => {
        if (!isFn(setCredential)) return fail(HOST_API_UNAVAILABLE);
        return wrapResult(await setCredential(payload.ref, payload.value));
      },
      unset: async (payload) => {
        if (!isFn(unsetCredential)) return fail(HOST_API_UNAVAILABLE);
        return wrapResult(await unsetCredential(payload.ref));
      },
    },
  };
}

function asHostApi(remote: unknown): HostApi | undefined {
  const slice = pickRemoteSlice(remote);
  if (slice === undefined) return undefined;
  return asLegacyHostApi(slice) ?? asTypertHostApi(slice);
}

/** Build the Models Host API from `ctx.remote` after `connection.api` was removed. */
export function hostApiFromRemote(remote: unknown): HostApi | undefined {
  try {
    return asHostApi(remote);
  } catch {
    return undefined;
  }
}

export interface HostApi {
  llm: {
    providers(payload: Record<string, never>): Promise<WireResult<{
      providers: Array<{
        provider: string;
        displayName: string;
        settingsNs: string;
        settingsPath: string[];
        declared?: boolean;
      }>;
    }>>;
    models(payload: Record<string, never>): Promise<WireResult<{
      groups: Array<{ id: string; name: string; models: Array<{ id: string; name: string }> }>;
    }>>;
    discoverModels(payload: {
      settingsNs: string;
      provider?: string;
      baseURL?: string;
      api?: string;
      apiKey?: string;
    }): Promise<WireResult<{
      models: Array<{ id: string; name?: string }>;
    }>>;
  };
  settings: {
    describe(payload: Record<string, never>): Promise<WireResult<{
      namespaces: Array<{ ns: string; value: unknown; revision?: number }>;
    }>>;
    mutate(payload: {
      ns: string;
      ops: Array<{ op: "set" | "unset"; path: string[]; value?: unknown }>;
      expectedRevision?: number;
    }): Promise<WireResult<unknown>>;
  };
  credentials: {
    describe(payload: { refs: string[] }): Promise<WireResult<{
      credentials: Record<string, { configured?: boolean; writable?: boolean; source?: string }>;
    }>>;
    set(payload: { ref: string; value: string }): Promise<WireResult<unknown>>;
    unset(payload: { ref: string }): Promise<WireResult<unknown>>;
  };
}

export interface ApiVendor {
  id: string;
  name: string;
  ref: string;
  configured: boolean;
  declared: boolean;
  featured: boolean;
  settingsNs: string;
  settingsPath: string[];
  revision?: number;
  picked?: string[];
  baseURL?: string;
  /** False when the launch environment supplies the key (read-only). */
  writable?: boolean;
}

const PI_AI = "llm-pi-ai";

const catalogKey = (id: string): string => `dsh-providers.catalog.${id}`;

export function mergeModelCatalog(
  ...groups: Array<ReadonlyArray<{ id: string; name: string }> | undefined>
): Array<{ id: string; name: string }> {
  const map = new Map<string, { id: string; name: string }>();
  for (const group of groups) {
    if (group === undefined) continue;
    for (const model of group) {
      if (model.id.length === 0) continue;
      const current = map.get(model.id);
      if (current === undefined || (model.name.length > 0 && model.name !== model.id && current.name === current.id)) {
        map.set(model.id, { id: model.id, name: model.name.length > 0 ? model.name : model.id });
      }
    }
  }
  return [...map.values()];
}

function readCachedCatalog(id: string): Array<{ id: string; name: string }> {
  try {
    const raw = localStorage.getItem(catalogKey(id));
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return mergeModelCatalog(parsed.flatMap((entry) => {
      if (typeof entry !== "object" || entry === null || typeof (entry as { id?: unknown }).id !== "string") return [];
      const idValue = (entry as { id: string }).id;
      const name = typeof (entry as { name?: unknown }).name === "string" ? (entry as { name: string }).name : idValue;
      return [{ id: idValue, name }];
    }));
  } catch {
    return [];
  }
}

function writeCachedCatalog(id: string, models: readonly { id: string; name: string }[]): Array<{ id: string; name: string }> {
  const merged = mergeModelCatalog(readCachedCatalog(id), models);
  try {
    localStorage.setItem(catalogKey(id), JSON.stringify(merged));
  } catch {
    // quota / private mode — memory merge still returned
  }
  return merged;
}

export async function loadApiVendors(api: HostApi | undefined, hide: ReadonlySet<string>): Promise<{ vendors: ApiVendor[]; error?: string }> {
  if (api === undefined) return { vendors: [], error: HOST_API_UNAVAILABLE };
  try {
    const [directory, settings] = await Promise.all([
      api.llm.providers({}),
      api.settings.describe({}),
    ]);
    if (!directory.result.ok) return { vendors: [], error: explainHostError(directory.result.error.message) };
    if (!settings.result.ok) return { vendors: [], error: explainHostError(settings.result.error.message) };
    const namespaces = new Map(settings.result.value.namespaces.map((entry) => [entry.ns, entry]));
    const rows = collapseApiVendors(
      directory.result.value.providers
        .filter((entry) => !hide.has(entry.provider) && !HIDDEN_API_ROUTES.has(entry.provider))
        .map((entry) => {
          const namespace = namespaces.get(entry.settingsNs);
          const profile = getPath(namespace?.value, entry.settingsPath);
          const baseURL = typeof profile === "object" && profile !== null && typeof (profile as { baseURL?: unknown }).baseURL === "string"
            ? (profile as { baseURL: string }).baseURL
            : undefined;
          const picked = pickedIds(profile);
          return {
            id: entry.provider,
            name: vendorDisplayName(entry.provider, entry.displayName),
            ref: keyRef(entry.provider, profile),
            declared: entry.declared === true,
            featured: isFeaturedVendor(entry.provider) || entry.declared === true,
            settingsNs: entry.settingsNs,
            settingsPath: entry.settingsPath,
            ...namespace?.revision === undefined ? {} : { revision: namespace.revision },
            ...picked === undefined ? {} : { picked },
            ...baseURL === undefined ? {} : { baseURL },
          };
        }),
    );
    if (rows.length === 0) return { vendors: [] };
    const described = await api.credentials.describe({ refs: rows.map((row) => row.ref) });
    const credentials = described.result.ok ? described.result.value.credentials : {};
    return {
      vendors: rows.flatMap((row) => {
        const info = credentials[row.ref];
        const configured = info?.configured === true;
        if (!configured && !row.featured && !row.declared) return [];
        return [{ ...row, configured, ...info?.writable === false ? { writable: false } : {} }];
      }),
    };
  } catch (error) {
    return { vendors: [], error: explainHostError(error) };
  }
}

export async function listHostModels(api: HostApi, vendor: ApiVendor): Promise<Array<{ id: string; name: string; selected: boolean }>> {
  const listed: Array<{ id: string; name: string }> = [];
  const discovered: Array<{ id: string; name: string }> = [];
  try {
    const groups = await api.llm.models({});
    if (groups.result.ok) {
      const group = groups.result.value.groups.find((entry) => entry.id === vendor.id);
      if (group !== undefined) {
        for (const model of group.models) {
          listed.push({ id: model.id, name: modelDisplayName(model.id, model.name) });
        }
      }
    }
  } catch {
    // keep listed empty
  }
  if (vendor.configured) {
    try {
      const found = await api.llm.discoverModels({ settingsNs: vendor.settingsNs, provider: vendor.id });
      if (found.result.ok) {
        for (const model of found.result.value.models) {
          discovered.push({ id: model.id, name: modelDisplayName(model.id, model.name) });
        }
      }
    } catch {
      // keep discovered empty
    }
  }
  const remembered = (vendor.picked ?? []).map((id) => ({ id, name: modelDisplayName(id) }));
  const advertised = writeCachedCatalog(vendor.id, mergeModelCatalog(readCachedCatalog(vendor.id), listed, discovered, remembered));
  const allow = vendor.picked === undefined ? undefined : new Set(vendor.picked);
  const subset = allow !== undefined && advertised.some((model) => !allow.has(model.id));
  return advertised.map((model) => ({
    ...model,
    selected: !subset || allow?.has(model.id) === true,
  }));
}

export async function saveHostModels(
  api: HostApi,
  vendor: ApiVendor,
  ids: string[],
  catalog: Array<{ id: string; name: string }>,
): Promise<string | undefined> {
  const full = writeCachedCatalog(vendor.id, catalog);
  const settings = await api.settings.describe({});
  if (!settings.result.ok) return explainHostError(settings.result.error.message);
  const namespace = settings.result.value.namespaces.find((entry) => entry.ns === vendor.settingsNs);
  const profile = getPath(namespace?.value, vendor.settingsPath);
  const existing = typeof profile === "object" && profile !== null && Array.isArray((profile as { models?: unknown }).models)
    ? (profile as { models: unknown[] }).models
    : [];
  const byId = new Map<string, unknown>();
  for (const entry of existing) {
    if (typeof entry === "object" && entry !== null && typeof (entry as { id?: unknown }).id === "string") {
      byId.set((entry as { id: string }).id, entry);
    }
  }
  const serveAll = full.length > 0 && ids.length >= full.length;
  if (serveAll && !vendor.declared) {
    const response = await api.settings.mutate({
      ns: vendor.settingsNs,
      ...namespace?.revision === undefined ? {} : { expectedRevision: namespace.revision },
      ops: [{ op: "unset", path: [...vendor.settingsPath, "models"] }],
    });
    return response.result.ok ? undefined : explainHostError(response.result.error.message);
  }
  if (ids.length === 0) {
    const response = await api.settings.mutate({
      ns: vendor.settingsNs,
      ...namespace?.revision === undefined ? {} : { expectedRevision: namespace.revision },
      ops: [{ op: "set", path: [...vendor.settingsPath, "models"], value: [] }],
    });
    return response.result.ok ? undefined : explainHostError(response.result.error.message);
  }
  const value = ids.map((id) => {
    const prior = byId.get(id);
    if (prior !== undefined) return prior;
    const named = full.find((model) => model.id === id);
    return { id, name: named?.name ?? modelDisplayName(id) };
  });
  const response = await api.settings.mutate({
    ns: vendor.settingsNs,
    ...namespace?.revision === undefined ? {} : { expectedRevision: namespace.revision },
    ops: [{ op: "set", path: [...vendor.settingsPath, "models"], value }],
  });
  return response.result.ok ? undefined : explainHostError(response.result.error.message);
}

/** Catalog vendors need an llm-pi-ai profile with apiKeyEnv or the host never registers the route. */
function needsCatalogRoute(vendor: Pick<ApiVendor, "declared" | "settingsNs" | "settingsPath">): boolean {
  return !vendor.declared && vendor.settingsNs.length > 0 && vendor.settingsPath.length > 0;
}

function profileApiKeyEnv(profile: Record<string, unknown> | undefined): string | undefined {
  const named = profile?.apiKeyEnv;
  return typeof named === "string" && named.length > 0 ? named : undefined;
}

export async function ensureCatalogRoutes(
  api: HostApi,
  vendors: readonly ApiVendor[],
): Promise<{ wrote: boolean; error?: string }> {
  const candidates = vendors.filter((vendor) => vendor.configured && needsCatalogRoute(vendor));
  if (candidates.length === 0) return { wrote: false };
  const settings = await api.settings.describe({});
  if (!settings.result.ok) return { wrote: false, error: explainHostError(settings.result.error.message) };
  const byNs = new Map<string, {
    revision?: number;
    ops: Array<{ op: "set"; path: string[]; value: unknown }>;
  }>();
  for (const vendor of candidates) {
    const namespace = settings.result.value.namespaces.find((entry) => entry.ns === vendor.settingsNs);
    const profile = getPath(namespace?.value, vendor.settingsPath);
    if (profileApiKeyEnv(profile) === vendor.ref) continue;
    const bucket = byNs.get(vendor.settingsNs) ?? {
      ...namespace?.revision === undefined ? {} : { revision: namespace.revision },
      ops: [],
    };
    bucket.ops.push({
      op: "set",
      path: [...vendor.settingsPath],
      value: { ...profile, apiKeyEnv: vendor.ref },
    });
    byNs.set(vendor.settingsNs, bucket);
  }
  if (byNs.size === 0) return { wrote: false };
  for (const [ns, bucket] of byNs) {
    const response = await api.settings.mutate({
      ns,
      ...bucket.revision === undefined ? {} : { expectedRevision: bucket.revision },
      ops: bucket.ops,
    });
    if (!response.result.ok) return { wrote: false, error: explainHostError(response.result.error.message) };
  }
  return { wrote: true };
}

export async function syncApiVendors(
  api: HostApi | undefined,
  hide: ReadonlySet<string>,
): Promise<{ vendors: ApiVendor[]; error?: string }> {
  const loaded = await loadApiVendors(api, hide);
  if (api === undefined || loaded.error !== undefined) return loaded;
  const result = await ensureCatalogRoutes(api, loaded.vendors.filter((vendor) => vendor.configured));
  if (result.error !== undefined) return { vendors: loaded.vendors, error: result.error };
  if (!result.wrote) return loaded;
  return loadApiVendors(api, hide);
}

export async function saveApiKey(api: HostApi, vendor: ApiVendor, value: string): Promise<string | undefined> {
  const response = await api.credentials.set({ ref: vendor.ref, value });
  if (!response.result.ok) return explainHostError(response.result.error.message);
  if (!needsCatalogRoute(vendor)) return undefined;
  const wired = await ensureCatalogRoutes(api, [{ ...vendor, configured: true }]);
  if (wired.error === undefined) return undefined;
  if (!vendor.configured) {
    try {
      await api.credentials.unset({ ref: vendor.ref });
    } catch {
      return wired.error;
    }
  }
  return wired.error;
}

export async function removeApiKey(api: HostApi, vendor: ApiVendor): Promise<string | undefined> {
  if (needsCatalogRoute(vendor)) {
    const settings = await api.settings.describe({});
    if (settings.result.ok) {
      const namespace = settings.result.value.namespaces.find((entry) => entry.ns === vendor.settingsNs);
      const profile = getPath(namespace?.value, vendor.settingsPath);
      if (profile !== undefined) {
        const dropped = await api.settings.mutate({
          ns: vendor.settingsNs,
          ...namespace?.revision === undefined ? {} : { expectedRevision: namespace.revision },
          ops: [{ op: "unset", path: [...vendor.settingsPath] }],
        });
        if (!dropped.result.ok) return explainHostError(dropped.result.error.message);
      }
    }
  }
  const response = await api.credentials.unset({ ref: vendor.ref });
  return response.result.ok ? undefined : explainHostError(response.result.error.message);
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

export function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  try {
    const parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    if (parsed.protocol === "http:" && !isLoopbackHost(parsed.hostname)) {
      parsed.protocol = "https:";
    }
    const path = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.origin}${path === "/" ? "" : path}${parsed.search}`;
  } catch {
    let url = trimmed;
    if (url.startsWith("http://")) {
      const host = url.slice("http://".length).split("/")[0] ?? "";
      if (!isLoopbackHost(host.split(":")[0] ?? "") && host !== "[::1]") {
        url = `https://${url.slice("http://".length)}`;
      }
    }
    return url.replace(/\/+$/, "");
  }
}

export async function discoverEndpointModels(
  api: HostApi,
  baseURL: string,
  apiKey: string,
): Promise<{ models: Array<{ id: string; name: string }>; error?: string }> {
  try {
    const response = await api.llm.discoverModels({
      settingsNs: PI_AI,
      api: "openai-completions",
      baseURL: normalizeBaseUrl(baseURL),
      apiKey,
    });
    if (!response.result.ok) return { models: [], error: explainHostError(response.result.error.message) };
    const models = response.result.value.models.map((model) => ({
      id: model.id,
      name: modelDisplayName(model.id, model.name),
    }));
    if (models.length === 0) return { models: [], error: "没从接口拉到模型，请检查地址和密钥。" };
    return { models };
  } catch (error) {
    return { models: [], error: explainHostError(error) };
  }
}
