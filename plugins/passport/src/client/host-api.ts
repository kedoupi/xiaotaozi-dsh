import { explainHostError } from "../auth/explain.ts";
import { collapseApiVendors, HIDDEN_API_ROUTES, isFeaturedVendor, modelDisplayName, vendorDisplayName } from "../display.ts";

export type WireResult<T> =
  | { result: { ok: true; value: T } }
  | { result: { ok: false; error: { message: string } } };

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

function getPath(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const key of path) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function keyRef(provider: string, profile: unknown): string {
  if (typeof profile === "object" && profile !== null) {
    const named = (profile as { apiKeyEnv?: unknown }).apiKeyEnv;
    if (typeof named === "string" && named.length > 0) return named;
  }
  return `${provider.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`;
}

/** `undefined` means every advertised model is on; `[]` means the user turned them all off. */
export function pickedIds(profile: unknown): string[] | undefined {
  if (typeof profile !== "object" || profile === null) return undefined;
  const models = (profile as { models?: unknown }).models;
  if (!Array.isArray(models)) return undefined;
  if (models.length === 0) return [];
  const ids = models.flatMap((entry) => {
    if (typeof entry === "object" && entry !== null && typeof (entry as { id?: unknown }).id === "string") {
      return [(entry as { id: string }).id];
    }
    return [];
  });
  return ids.length === 0 ? undefined : ids;
}

const catalogKey = (id: string): string => `dsh-passport.catalog.${id}`;

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
  if (api === undefined) return { vendors: [] };
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

export async function saveApiKey(api: HostApi, ref: string, value: string): Promise<string | undefined> {
  const response = await api.credentials.set({ ref, value });
  return response.result.ok ? undefined : explainHostError(response.result.error.message);
}

export async function removeApiKey(api: HostApi, ref: string): Promise<string | undefined> {
  const response = await api.credentials.unset({ ref });
  return response.result.ok ? undefined : explainHostError(response.result.error.message);
}

export function normalizeBaseUrl(raw: string): string {
  let url = raw.trim();
  if (url.startsWith("http://")) url = `https://${url.slice("http://".length)}`;
  return url.replace(/\/+$/, "");
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

export async function createCustomVendor(
  api: HostApi,
  input: { id: string; name: string; baseURL: string; apiKey: string; models: Array<{ id: string; name: string }> },
): Promise<string | undefined> {
  const settings = await api.settings.describe({});
  if (!settings.result.ok) return explainHostError(settings.result.error.message);
  const namespace = settings.result.value.namespaces.find((entry) => entry.ns === PI_AI);
  const ref = `${input.id.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`;
  const written = await api.settings.mutate({
    ns: PI_AI,
    ...namespace?.revision === undefined ? {} : { expectedRevision: namespace.revision },
    ops: [{
      op: "set",
      path: ["providers", input.id],
      value: {
        displayName: input.name,
        apiKeyEnv: ref,
        api: "openai-completions",
        baseURL: normalizeBaseUrl(input.baseURL),
        models: input.models.map((model) => ({ id: model.id, name: model.name })),
      },
    }],
  });
  if (!written.result.ok) return explainHostError(written.result.error.message);
  return saveApiKey(api, ref, input.apiKey);
}

export async function removeCustomVendor(api: HostApi, id: string, ref: string): Promise<string | undefined> {
  const cleared = await removeApiKey(api, ref);
  if (cleared !== undefined) return cleared;
  const settings = await api.settings.describe({});
  if (!settings.result.ok) return explainHostError(settings.result.error.message);
  const namespace = settings.result.value.namespaces.find((entry) => entry.ns === PI_AI);
  const written = await api.settings.mutate({
    ns: PI_AI,
    ...namespace?.revision === undefined ? {} : { expectedRevision: namespace.revision },
    ops: [{ op: "unset", path: ["providers", id] }],
  });
  return written.result.ok ? undefined : explainHostError(written.result.error.message);
}
