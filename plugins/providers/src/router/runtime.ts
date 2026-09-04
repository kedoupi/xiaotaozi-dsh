import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { LlmCallConfig, UserMessage } from "@deepseek-ai/dsh-llm";
import type { AssembleContext, PromptAssembly } from "@deepseek-ai/dsh-system-prompt";
import { decideRoute, type RouteDecision, type RouteHealth, type RouteWeights } from "./decision.ts";
import type { RouterDecisionEvent } from "./events.ts";
import {
  assertSelectedAuthorized,
  modelRef,
  type AuthorizedModelInventory,
} from "./inventory.ts";
import { RouterEmptyPoolError } from "./empty-pool.ts";
import type { RoutingMode } from "./preferences.ts";

export interface ModelSelection {
  provider: string;
  model: string;
}

export interface RouterRuntimeOptions {
  getMode: () => RoutingMode | Promise<RoutingMode>;
  inventory: (signal?: AbortSignal) => Promise<AuthorizedModelInventory>;
  weights?: RouteWeights;
  switchMargin?: number;
  onDecision?: (event: RouterDecisionEvent) => void;
  now?: () => number;
  healthCooldownMs?: number;
}

interface AgentRoutingState {
  nextTurnMessageIds: Set<string>;
  pendingHumanTurn?: { turn: number; message: UserMessage };
  current?: ModelSelection;
  assembled?: ModelSelection;
  decision?: RouteDecision;
  loggedStep?: `${number}/${number}`;
}

interface StoredHealth extends RouteHealth {
  expiresAt: number;
  generation: string;
}

const HARD_HEALTH = new Set(["AUTH", "MISSING_CREDENTIAL", "INVALID_CREDENTIAL", "QUOTA_EXCEEDED"]);
const SOFT_HEALTH = new Set(["RATE_LIMIT", "SERVER", "TIMEOUT", "EMPTY_RESPONSE", "CONTEXT_WINDOW_EXCEEDED"]);
const DEFAULT_HEALTH_COOLDOWN_MS = 900_000;
const NON_TEXT_TOKENS = 2_048;
const MAX_ESTIMATED_TOKENS = 2_000_000;

interface AgentsHost {
  agents: { list(): Agent[] };
}

interface ContentLike {
  type: string;
  text?: string;
  content?: readonly ContentLike[];
}

function messageText(message: UserMessage): string {
  return message.content
    .flatMap((block) => block.type === "text" ? [block.text] : [])
    .join("\n");
}

function messageHasImage(message: UserMessage): boolean {
  return message.content.some((block) => block.type === "image");
}

function tokensForBlocks(blocks: readonly ContentLike[]): number {
  let tokens = 0;
  for (const block of blocks) {
    if ((block.type === "text" || block.type === "reasoning") && typeof block.text === "string") {
      tokens += Math.ceil(block.text.length / 2);
    } else if (block.type === "tool-result" && Array.isArray(block.content)) {
      tokens += tokensForBlocks(block.content);
    } else {
      tokens += NON_TEXT_TOKENS;
    }
  }
  return tokens;
}

function estimateSessionTokens(agent: Agent, current: UserMessage): number {
  const seen = new Set<string>();
  let tokens = 0;
  const add = (message: { id?: string; role?: string; content: readonly ContentLike[] }): void => {
    if (message.id !== undefined) {
      if (seen.has(message.id)) return;
      seen.add(message.id);
    }
    if (message.role === "system") return;
    tokens += tokensForBlocks(message.content);
  };
  try {
    for (const message of agent.session.deriveMessages()) add(message);
  } catch {
    // derived history is best-effort; current message still counts
  }
  add(current);
  return Math.min(MAX_ESTIMATED_TOKENS, tokens);
}

function hostCurrent(agent: Agent): ModelSelection | undefined {
  const header = agent.session.requestHeader()?.config;
  if (header?.provider && header.model) return { provider: header.provider, model: header.model };
  if (agent.options.provider && agent.options.model) {
    return { provider: agent.options.provider, model: agent.options.model };
  }
  return undefined;
}

function selectionFrom(variables: Record<string, string | undefined>): ModelSelection | undefined {
  const provider = variables.provider;
  const model = variables.model;
  if (typeof provider === "string" && provider.length > 0 && typeof model === "string" && model.length > 0) {
    return { provider, model };
  }
  return undefined;
}

function applyPromptVariables(assembled: PromptAssembly, selected: ModelSelection): PromptAssembly {
  return {
    ...assembled,
    variables: {
      ...assembled.variables,
      provider: selected.provider,
      model: selected.model,
    },
  };
}

function applyRequestSelection(base: LlmCallConfig, selected: ModelSelection): LlmCallConfig {
  const same = base.provider === selected.provider && base.model === selected.model;
  if (same) {
    return { ...base, provider: selected.provider, model: selected.model };
  }
  const { reasoningEffort: _inherited, ...rest } = base;
  return {
    ...rest,
    provider: selected.provider,
    model: selected.model,
  };
}

function listAgents(ctx: Context): Agent[] {
  const agents = (ctx as Context & Partial<AgentsHost>).agents;
  return agents?.list() ?? [];
}

export function installRouterRuntime(ctx: Context, options: RouterRuntimeOptions): () => void {
  const states = new WeakMap<Agent, AgentRoutingState>();
  const health = new Map<string, StoredHealth>();
  const now = (): number => options.now?.() ?? Date.now();
  const cooldownMs = options.healthCooldownMs ?? DEFAULT_HEALTH_COOLDOWN_MS;

  const noteFailure = (ref: string, code: string, generation: string): void => {
    const expiresAt = now() + cooldownMs;
    if (HARD_HEALTH.has(code)) health.set(ref, { code, expiresAt, generation });
    else if (SOFT_HEALTH.has(code)) health.set(ref, { code, penalty: 0.5, expiresAt, generation });
  };

  const pruneHealth = (generation: string): Record<string, RouteHealth> => {
    const current = now();
    for (const [ref, entry] of health) {
      if (entry.expiresAt <= current || entry.generation !== generation) health.delete(ref);
    }
    return Object.fromEntries([...health].map(([ref, entry]) => [
      ref,
      entry.penalty === undefined ? { code: entry.code } : { code: entry.code, penalty: entry.penalty },
    ]));
  };

  const stateOf = (agent: Agent): AgentRoutingState => {
    const existing = states.get(agent);
    if (existing !== undefined) return existing;
    const created: AgentRoutingState = { nextTurnMessageIds: new Set() };
    states.set(agent, created);
    return created;
  };

  const attach = (agent: Agent): void => {
    const state = stateOf(agent);
    for (const message of agent.inbox.nextTurn) {
      if (message.source.kind === "user") state.nextTurnMessageIds.add(message.id);
    }
  };

  const route = async (
    agent: Agent,
    message: UserMessage,
    signal: AbortSignal | undefined,
    current: ModelSelection | undefined,
  ): Promise<ModelSelection> => {
    const inventory = await options.inventory(signal);
    if (inventory.candidates.length === 0) throw new RouterEmptyPoolError();
    const started = now();
    const decision = decideRoute({
      text: messageText(message),
      inventory,
      current,
      hasImage: messageHasImage(message),
      estimatedTokens: estimateSessionTokens(agent, message),
      health: pruneHealth(inventory.generation),
      ...options.weights === undefined ? {} : { weights: options.weights },
      ...options.switchMargin === undefined ? {} : { switchMargin: options.switchMargin },
    });
    stateOf(agent).decision = { ...decision, latencyMs: now() - started };
    return { provider: decision.selected.provider, model: decision.selected.model };
  };

  const disposers = [
    ctx.on("agent/created", (payload: { agent: Agent }) => {
      attach(payload.agent);
    }),
    ctx.on("agent/disposed", (payload: { agent: Agent }) => {
      states.delete(payload.agent);
    }),
    ctx.on("agent/inbox/inserted", (payload: { agent: Agent; message: UserMessage }) => {
      if (payload.agent.inbox.nextTurn.some((message) => message.id === payload.message.id)
        && payload.message.source.kind === "user") {
        stateOf(payload.agent).nextTurnMessageIds.add(payload.message.id);
      }
    }),
    ctx.on("agent/inbox/discarded", (payload: { agent: Agent; message: UserMessage }) => {
      states.get(payload.agent)?.nextTurnMessageIds.delete(payload.message.id);
    }),
    ctx.on("agent/inbox/claimed", (payload: { agent: Agent; message: UserMessage; turn: number }) => {
      const state = states.get(payload.agent);
      if (state === undefined) return;
      if (payload.message.source.kind !== "user") return;
      if (!state.nextTurnMessageIds.has(payload.message.id)) return;
      state.nextTurnMessageIds.delete(payload.message.id);
      state.pendingHumanTurn = { turn: payload.turn, message: payload.message };
    }),
    ctx.on("system-prompt/assemble", async (_assembly: PromptAssembly, context: AssembleContext & { agent?: Agent }, next: () => Promise<PromptAssembly>) => {
      const agent = context.agent;
      if (agent === undefined) return next();
      const state = stateOf(agent);
      const pending = state.pendingHumanTurn;
      if (pending !== undefined) state.pendingHumanTurn = undefined;
      const assembled = await next();
      if (pending !== undefined) {
        if (await options.getMode() === "smart") {
          const baseline = selectionFrom(assembled.variables) ?? hostCurrent(agent);
          state.current = await route(agent, pending.message, context.signal, baseline);
        } else {
          state.current = undefined;
        }
      }
      state.assembled = state.current;
      return state.assembled === undefined ? assembled : applyPromptVariables(assembled, state.assembled);
    }, { prepend: true, global: true }),
    ctx.on("agent/request", async (payload, next) => {
      const base = await next();
      const state = states.get(payload.agent);
      if (state === undefined || state.assembled === undefined) return base;
      const selected = state.assembled;
      assertSelectedAuthorized(selected, await options.inventory(payload.signal));
      const decision = state.decision;
      if (decision !== undefined) {
        const key = `${payload.turn}/${payload.step}` as const;
        if (state.loggedStep !== key) {
          state.loggedStep = key;
          options.onDecision?.({
            turn: payload.turn,
            step: payload.step,
            selected: { provider: selected.provider, model: selected.model },
            objective: decision.objective,
            taskClass: decision.taskClass,
            confidence: decision.confidence,
            reason: decision.reason,
            classifierUsed: false,
            candidates: [...decision.candidates],
            inventoryGeneration: decision.inventoryGeneration,
            latencyMs: decision.latencyMs,
          });
        }
      }
      return applyRequestSelection(base, selected);
    }, { prepend: true, global: true }),
    ctx.on("agent/request-error", async (payload, next) => {
      const action = await next();
      const state = states.get(payload.agent);
      const selected = state?.assembled;
      const generation = state?.decision?.inventoryGeneration;
      if (selected !== undefined && generation !== undefined) {
        noteFailure(modelRef(selected.provider, selected.model), payload.failure.code, generation);
      }
      return action;
    }),
    ctx.on("session/event", (_session, event) => {
      if (event.type !== "assistant/message" || event.data.interrupted === true) return;
      const source = event.data.message.source;
      if (source.kind !== "model") return;
      health.delete(modelRef(source.provider, source.model));
    }),
  ];

  for (const agent of listAgents(ctx)) attach(agent);

  return () => {
    for (const dispose of disposers) dispose();
    health.clear();
  };
}
