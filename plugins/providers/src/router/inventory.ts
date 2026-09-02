import { createHash } from "node:crypto";

export type ModelModality = "text" | "image";

export interface ModelProfile {
  quality: 1 | 2 | 3 | 4 | 5;
  speed: 1 | 2 | 3 | 4 | 5;
  cost: 1 | 2 | 3 | 4 | 5;
  code?: boolean;
  tools?: boolean;
}

export interface AuthorizedModel {
  ref: `${string}/${string}`;
  provider: string;
  model: string;
  source: "subscription" | "api";
  displayName: string;
  inputModalities?: readonly ModelModality[];
  contextWindow?: number;
  reasoningEfforts?: readonly string[];
  profile: ModelProfile;
}

export interface AuthorizedModelInventory {
  capturedAt: number;
  generation: string;
  candidates: readonly AuthorizedModel[];
}

export interface ListedModel {
  id: string;
  name?: string;
}

export interface SubscriptionSource {
  provider: string;
  loggedIn: boolean;
  models: readonly ListedModel[];
  picked?: readonly string[];
}

export interface ApiSource {
  provider: string;
  displayName: string;
  configured: boolean;
  registered: boolean;
  models: readonly ListedModel[];
  picked?: readonly string[];
  hidden?: boolean;
}

export interface ResolvedCapability {
  inputModalities?: readonly ModelModality[];
  contextWindow?: number;
  reasoningEfforts?: readonly string[];
  displayName?: string;
}

export interface InventoryInput {
  subscriptions: readonly SubscriptionSource[];
  apis: readonly ApiSource[];
  resolve?: (provider: string, model: string) => Promise<ResolvedCapability | undefined>;
  profiles?: Readonly<Record<string, ModelProfile>>;
  profileFor?: (provider: string, model: string) => ModelProfile;
  now?: number;
}

export const NEUTRAL_PROFILE: ModelProfile = { quality: 3, speed: 3, cost: 3 };

export class RouterAuthorizationError extends Error {
  readonly code = "ROUTER_UNAUTHORIZED";

  constructor(message: string) {
    super(message);
    this.name = "RouterAuthorizationError";
  }
}

export function modelRef(provider: string, model: string): `${string}/${string}` {
  return `${provider}/${model}`;
}

function pickedKey(picked: readonly string[] | undefined): string {
  return picked === undefined ? "*" : [...picked].join(",");
}

function applyPicked(models: readonly ListedModel[], picked: readonly string[] | undefined): ListedModel[] {
  if (picked === undefined) return models.filter((model) => model.id.length > 0);
  const allow = new Set(picked);
  return models.filter((model) => model.id.length > 0 && allow.has(model.id));
}

function profileOf(
  provider: string,
  model: string,
  input: Pick<InventoryInput, "profiles" | "profileFor">,
): ModelProfile {
  const ref = modelRef(provider, model);
  return input.profiles?.[ref] ?? input.profileFor?.(provider, model) ?? NEUTRAL_PROFILE;
}

async function enrich(
  candidate: Omit<AuthorizedModel, "inputModalities" | "contextWindow" | "reasoningEfforts" | "displayName"> & {
    displayName: string;
  },
  resolve: InventoryInput["resolve"],
): Promise<AuthorizedModel> {
  if (resolve === undefined) return candidate;
  let capability: ResolvedCapability | undefined;
  try {
    capability = await resolve(candidate.provider, candidate.model);
  } catch {
    return candidate;
  }
  if (capability === undefined) return candidate;
  return {
    ...candidate,
    displayName: capability.displayName ?? candidate.displayName,
    ...capability.inputModalities === undefined ? {} : { inputModalities: capability.inputModalities },
    ...capability.contextWindow === undefined ? {} : { contextWindow: capability.contextWindow },
    ...capability.reasoningEfforts === undefined ? {} : { reasoningEfforts: capability.reasoningEfforts },
  };
}

export async function buildAuthorizedInventory(input: InventoryInput): Promise<AuthorizedModelInventory> {
  const facts: string[] = [];
  const pending: Array<Promise<AuthorizedModel>> = [];

  for (const subscription of input.subscriptions) {
    facts.push(`sub:${subscription.provider}:${subscription.loggedIn ? 1 : 0}:${pickedKey(subscription.picked)}`);
    if (!subscription.loggedIn) continue;
    for (const model of applyPicked(subscription.models, subscription.picked)) {
      const ref = modelRef(subscription.provider, model.id);
      pending.push(enrich({
        ref,
        provider: subscription.provider,
        model: model.id,
        source: "subscription",
        displayName: model.name && model.name.length > 0 ? model.name : model.id,
        profile: profileOf(subscription.provider, model.id, input),
      }, input.resolve));
    }
  }

  for (const api of input.apis) {
    facts.push(`api:${api.provider}:${api.configured ? 1 : 0}:${api.registered ? 1 : 0}:${pickedKey(api.picked)}`);
    if (!api.configured || !api.registered || api.hidden === true) continue;
    for (const model of applyPicked(api.models, api.picked)) {
      const ref = modelRef(api.provider, model.id);
      pending.push(enrich({
        ref,
        provider: api.provider,
        model: model.id,
        source: "api",
        displayName: model.name && model.name.length > 0 ? model.name : api.displayName,
        profile: profileOf(api.provider, model.id, input),
      }, input.resolve));
    }
  }

  const candidates = await Promise.all(pending);
  facts.push(...candidates.map((candidate) => candidate.ref));
  facts.sort();
  return {
    capturedAt: input.now ?? Date.now(),
    generation: createHash("sha256").update(facts.join("\n")).digest("hex").slice(0, 16),
    candidates,
  };
}

export function assertSelectedAuthorized(
  selected: { provider: string; model: string },
  inventory: AuthorizedModelInventory,
): AuthorizedModel {
  const found = inventory.candidates.find(
    (candidate) => candidate.provider === selected.provider && candidate.model === selected.model,
  );
  if (found === undefined) {
    throw new RouterAuthorizationError("当前模型已不再授权");
  }
  return found;
}
