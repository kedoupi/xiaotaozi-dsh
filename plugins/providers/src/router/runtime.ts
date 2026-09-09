import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { LlmCallConfig, UserMessage } from "@deepseek-ai/dsh-llm";
import type {
  AssembleContext,
  PromptAssembly,
} from "@deepseek-ai/dsh-system-prompt";
import {
  decideRoute,
  type RouteDecision,
  type RouteHealth,
  type RouteWeights,
} from "./decision.ts";
import type { RouterDecisionEvent } from "./events.ts";
import { isHardHealth, providerModelRefs } from "./health.ts";
import {
  assertSelectedAuthorized,
  modelRef,
  type AuthorizedModelInventory,
} from "./inventory.ts";
import { RouterEmptyPoolError } from "./empty-pool.ts";
import type { RoutingMode } from "./preferences.ts";
import { messageNeedsImage } from "./turn-input.ts";

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
  lastHuman?: UserMessage;
  current?: ModelSelection;
  assembled?: ModelSelection;
  decision?: RouteDecision;
  loggedStep?: `${number}/${number}`;
  failedOverStep?: `${number}/${number}`;
  switchNotice?: string;
}

interface StoredHealth extends RouteHealth {
  expiresAt: number;
  generation: string;
}

interface HealthRequest {
  turn: number;
  step: number;
  ref: string;
  generation: string;
  health: StoredHealth | undefined;
  selected: ModelSelection;
  inventory: AuthorizedModelInventory;
}
const SOFT_HEALTH = new Set([
  "RATE_LIMIT",
  "SERVER",
  "TIMEOUT",
  "EMPTY_RESPONSE",
  "CONTEXT_WINDOW_EXCEEDED",
]);
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
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("\n");
}

function messageHasImage(message: UserMessage): boolean {
  return messageNeedsImage(message);
}

function tokensForBlocks(blocks: readonly ContentLike[]): number {
  let tokens = 0;
  for (const block of blocks) {
    if (
      (block.type === "text" || block.type === "reasoning") &&
      typeof block.text === "string"
    ) {
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
  const add = (message: {
    id?: string;
    role?: string;
    content: readonly ContentLike[];
  }): void => {
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
  if (header?.provider && header.model)
    return { provider: header.provider, model: header.model };
  if (agent.options.provider && agent.options.model) {
    return { provider: agent.options.provider, model: agent.options.model };
  }
  return undefined;
}

function selectionFrom(
  variables: Record<string, string | undefined>,
): ModelSelection | undefined {
  const provider = variables.provider;
  const model = variables.model;
  if (
    typeof provider === "string" &&
    provider.length > 0 &&
    typeof model === "string" &&
    model.length > 0
  ) {
    return { provider, model };
  }
  return undefined;
}

function applyPromptVariables(
  assembled: PromptAssembly,
  selected: ModelSelection,
): PromptAssembly {
  return {
    ...assembled,
    variables: {
      ...assembled.variables,
      provider: selected.provider,
      model: selected.model,
    },
  };
}

function applyRequestSelection(
  base: LlmCallConfig,
  selected: ModelSelection,
): LlmCallConfig {
  const same =
    base.provider === selected.provider && base.model === selected.model;
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

export function installRouterRuntime(
  ctx: Context,
  options: RouterRuntimeOptions,
): () => void {
  const states = new WeakMap<Agent, AgentRoutingState>();
  const health = new Map<string, StoredHealth>();
  let healthGeneration: string | undefined;
  const requests = new WeakMap<Agent["session"], HealthRequest>();
  const now = (): number => options.now?.() ?? Date.now();
  const cooldownMs = options.healthCooldownMs ?? DEFAULT_HEALTH_COOLDOWN_MS;

  const noteFailure = (
    selected: ModelSelection,
    code: string,
    generation: string,
    inventory: AuthorizedModelInventory,
  ): void => {
    // An in-flight request may outlive its authorization generation.
    if (generation !== healthGeneration) return;
    const expiresAt = now() + cooldownMs;
    if (isHardHealth(code)) {
      const entry = { code, expiresAt, generation };
      for (const ref of providerModelRefs(selected.provider, inventory)) health.set(ref, entry);
      health.set(modelRef(selected.provider, selected.model), entry);
      return;
    }
    if (SOFT_HEALTH.has(code)) {
      health.set(modelRef(selected.provider, selected.model), { code, penalty: 0.5, expiresAt, generation });
    }
  };

  const displayNameOf = (inventory: AuthorizedModelInventory, selected: ModelSelection): string => {
    return inventory.candidates.find((model) => (
      model.provider === selected.provider && model.model === selected.model
    ))?.displayName ?? selected.model;
  };

  const pruneHealth = (generation: string): Record<string, RouteHealth> => {
    healthGeneration = generation;
    const current = now();
    for (const [ref, entry] of health) {
      if (entry.expiresAt <= current || entry.generation !== generation)
        health.delete(ref);
    }
    return Object.fromEntries(
      [...health].map(([ref, entry]) => [
        ref,
        entry.penalty === undefined
          ? { code: entry.code }
          : { code: entry.code, penalty: entry.penalty },
      ]),
    );
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
      if (message.source.kind === "user")
        state.nextTurnMessageIds.add(message.id);
    }
  };

  const route = async (
    agent: Agent,
    message: UserMessage,
    signal: AbortSignal | undefined,
    current: ModelSelection | undefined,
    request?: HealthRequest,
  ): Promise<ModelSelection> => {
    const inventory = await options.inventory(signal);
    signal?.throwIfAborted();
    if (disposed || (request !== undefined && (
      requests.get(agent.session) !== request || request.generation !== healthGeneration
    ))) throw new Error("Routing request is no longer current");
    if (inventory.candidates.length === 0) throw new RouterEmptyPoolError();
    const started = now();
    const decision = decideRoute({
      text: messageText(message),
      inventory,
      current,
      hasImage: messageHasImage(message),
      estimatedTokens: estimateSessionTokens(agent, message),
      health: pruneHealth(inventory.generation),
      ...(options.weights === undefined ? {} : { weights: options.weights }),
      ...(options.switchMargin === undefined
        ? {}
        : { switchMargin: options.switchMargin }),
    });
    stateOf(agent).decision = { ...decision, latencyMs: now() - started };
    return {
      provider: decision.selected.provider,
      model: decision.selected.model,
    };
  };

  let disposed = false;
  const disposers = [
    ctx.on("agent/created", (payload: { agent: Agent }) => {
      attach(payload.agent);
    }),
    ctx.on("agent/disposed", (payload: { agent: Agent }) => {
      states.delete(payload.agent);
      requests.delete(payload.agent.session);
    }),
    ctx.on(
      "agent/inbox/inserted",
      (payload: { agent: Agent; message: UserMessage }) => {
        if (
          payload.agent.inbox.nextTurn.some(
            (message) => message.id === payload.message.id,
          ) &&
          payload.message.source.kind === "user"
        ) {
          stateOf(payload.agent).nextTurnMessageIds.add(payload.message.id);
        }
      },
    ),
    ctx.on(
      "agent/inbox/discarded",
      (payload: { agent: Agent; message: UserMessage }) => {
        states
          .get(payload.agent)
          ?.nextTurnMessageIds.delete(payload.message.id);
      },
    ),
    ctx.on(
      "agent/inbox/claimed",
      (payload: { agent: Agent; message: UserMessage; turn: number }) => {
        const state = states.get(payload.agent);
        if (state === undefined) return;
        if (payload.message.source.kind !== "user") return;
        if (!state.nextTurnMessageIds.has(payload.message.id)) return;
        state.nextTurnMessageIds.delete(payload.message.id);
        state.pendingHumanTurn = {
          turn: payload.turn,
          message: payload.message,
        };
        state.lastHuman = payload.message;
        state.switchNotice = undefined;
      },
    ),
    ctx.on(
      "system-prompt/assemble",
      async (
        _assembly: PromptAssembly,
        context: AssembleContext & { agent?: Agent },
        next: () => Promise<PromptAssembly>,
      ) => {
        const agent = context.agent;
        if (agent === undefined) return next();
        const state = stateOf(agent);
        const pending = state.pendingHumanTurn;
        const assembled = await next();
        if (pending !== undefined) {
          if ((await options.getMode()) === "smart") {
            const baseline =
              selectionFrom(assembled.variables) ?? hostCurrent(agent);
            state.current = await route(
              agent,
              pending.message,
              context.signal,
              baseline,
            );
          } else {
            state.current = undefined;
          }
          state.pendingHumanTurn = undefined;
        }
        state.assembled = state.current;
        return state.assembled === undefined
          ? assembled
          : applyPromptVariables(assembled, state.assembled);
      },
      { prepend: true, global: true },
    ),
    ctx.on(
      "agent/request",
      async (payload, next) => {
        const base = await next();
        const state = states.get(payload.agent);
        requests.delete(payload.agent.session);
        if (state === undefined || state.assembled === undefined) return base;
        const selected = state.assembled;
        const inventory = await options.inventory(payload.signal);
        assertSelectedAuthorized(selected, inventory);
        pruneHealth(inventory.generation);
        const ref = modelRef(selected.provider, selected.model);
        requests.set(payload.agent.session, {
          turn: payload.turn,
          step: payload.step,
          ref,
          generation: inventory.generation,
          health: health.get(ref),
          selected,
          inventory,
        });
        const decision = state.decision;
        if (!disposed && decision !== undefined) {
          const key = `${payload.turn}/${payload.step}` as const;
          if (state.loggedStep !== key) {
            state.loggedStep = key;
            options.onDecision?.({
              sessionId: payload.agent.session.id,
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
              ...(state.switchNotice === undefined ? {} : { switchNotice: state.switchNotice }),
            });
          }
        }
        return applyRequestSelection(base, selected);
      },
      { prepend: true, global: true },
    ),
    ctx.on("agent/request-error", async (payload, next) => {
      const request = requests.get(payload.agent.session);
      const action = await next();
      if (
        disposed || payload.signal?.aborted || request === undefined ||
        request !== requests.get(payload.agent.session) ||
        request.turn !== payload.turn || request.step !== payload.step ||
        request.generation !== healthGeneration
      ) return action;
      noteFailure(request.selected, payload.failure.code, request.generation, request.inventory);
      const state = states.get(payload.agent);
      const stepKey = `${payload.turn}/${payload.step}` as const;
      if (
        action?.kind === "retry" || state === undefined ||
        state.lastHuman === undefined || state.failedOverStep === stepKey ||
        !isHardHealth(payload.failure.code) || await options.getMode() !== "smart"
      ) return action;
      try {
        const nextSel = await route(payload.agent, state.lastHuman, payload.signal, request.selected, request);
        if (disposed || payload.signal?.aborted || requests.get(payload.agent.session) !== request) return action;
        if (nextSel.provider === request.selected.provider && nextSel.model === request.selected.model) return action;
        const from = displayNameOf(request.inventory, request.selected);
        state.assembled = nextSel;
        state.current = nextSel;
        state.failedOverStep = stepKey;
        state.loggedStep = undefined;
        state.switchNotice = `已从 ${from} 换来：账号余额或授权暂时不可用`;
        return { kind: "retry" as const };
      } catch {
        return action;
      }
    }),
    ctx.on("session/event", (session, event) => {
      if (event.type !== "assistant/message" || event.data.interrupted === true)
        return;
      const source = event.data.message.source;
      if (source.kind !== "model") return;
      const request = requests.get(session);
      const ref = modelRef(source.provider, source.model);
      if (
        request === undefined ||
        request.turn !== event.data.turn ||
        request.step !== event.data.step ||
        request.ref !== ref
      )
        return;
      requests.delete(session);
      // Only this request's observed failure may be cleared, never a newer
      // failure from another turn/session or an obsolete authorization generation.
      const entry = health.get(ref);
      if (
        entry !== undefined &&
        entry === request.health &&
        entry.generation === request.generation
      )
        health.delete(ref);
    }),
  ];

  for (const agent of listAgents(ctx)) attach(agent);

  return () => {
    disposed = true;
    for (const dispose of disposers) dispose();
    health.clear();
  };
}
