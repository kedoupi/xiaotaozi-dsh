import { CAPABILITY_IMAGE_GUIDE, QUOTA_NO_FALLBACK_GUIDE } from "./empty-pool.ts";
import { HARD_HEALTH_CODES, QUOTA_EXCEEDED_CODE } from "./health.ts";
import type { AuthorizedModel, AuthorizedModelInventory } from "./inventory.ts";

export type RouteObjective = "quality" | "balanced" | "economy";
export type TaskClass = "simple" | "standard" | "complex" | "code";
export type RouteConfidence = "high" | "medium" | "low";

export type RouteReason =
  | "only-candidate"
  | "capability-image"
  | "capability-context"
  | "forced-quality"
  | "local-clear"
  | "classifier"
  | "stay-bias"
  | "classifier-fallback"
  | "current-unavailable";

export interface RouteWeights {
  quality: number;
  speed: number;
  cost: number;
}

export interface RouteHealth {
  code: string;
  penalty?: number;
}

export interface RouteRequest {
  text: string;
  inventory: AuthorizedModelInventory;
  hasImage?: boolean;
  estimatedTokens?: number;
  current?: { provider: string; model: string };
  health?: Readonly<Record<string, RouteHealth>>;
  objective?: RouteObjective;
  weights?: RouteWeights;
  switchMargin?: number;
  now?: number;
}

export interface RouteDecision {
  selected: AuthorizedModel;
  objective: RouteObjective;
  taskClass: TaskClass;
  confidence: RouteConfidence;
  reason: RouteReason;
  classifierUsed: boolean;
  candidates: readonly string[];
  inventoryGeneration: string;
  latencyMs: number;
}

export const QUALITY_WEIGHTS: RouteWeights = { quality: 0.70, speed: 0.15, cost: 0.05 };
export const BALANCED_WEIGHTS: RouteWeights = { quality: 0.45, speed: 0.25, cost: 0.20 };
export const ECONOMY_WEIGHTS: RouteWeights = { quality: 0.25, speed: 0.25, cost: 0.40 };
export const DEFAULT_SWITCH_MARGIN = 0.35;

const HARD_HEALTH = HARD_HEALTH_CODES;

const SIMPLE_RE = /翻译|translate|改写|rewrite|格式|format|改成短|calmer tone|tone/i;
const CODE_RE = /```|diff --git|\bstack\b|traceback|typeerror|\.ts\b|\.tsx\b|\.js\b|\.py\b|补测试|重构|调试|\btest\b|\bdebug\b|\brefactor\b/i;
const COMPLEX_RE = /架构|architecture|多文件|multi-file|安全|security|权限|permission|不可逆|生产迁移|比较.*方案|audit/i;
const HIGH_RISK_RE = /删除生产|生产数据库|drop table|rm\s+-rf|权限提升/i;

export class RouterDecisionError extends Error {
  readonly code = "ROUTER_NO_CANDIDATE";

  constructor(message = "没有满足当前任务且已授权的模型") {
    super(message);
    this.name = "RouterDecisionError";
  }
}

export function classifyTask(text: string): {
  taskClass: TaskClass;
  confidence: RouteConfidence;
  forcedQuality: boolean;
} {
  const forcedQuality = HIGH_RISK_RE.test(text);
  if (forcedQuality) return { taskClass: "complex", confidence: "high", forcedQuality: true };
  if (COMPLEX_RE.test(text)) return { taskClass: "complex", confidence: "high", forcedQuality: false };
  if (CODE_RE.test(text)) return { taskClass: "code", confidence: "high", forcedQuality: false };
  if (SIMPLE_RE.test(text)) return { taskClass: "simple", confidence: "high", forcedQuality: false };
  return { taskClass: "standard", confidence: "medium", forcedQuality: false };
}

function isCurrent(model: AuthorizedModel, current: RouteRequest["current"]): boolean {
  return current !== undefined && model.provider === current.provider && model.model === current.model;
}

function hardHealth(ref: string, health: RouteRequest["health"]): boolean {
  const code = health?.[ref]?.code;
  return code !== undefined && HARD_HEALTH.has(code);
}

/** Catalog advertised inbound `image`. Generate-attach is not this. */
export function declaresImageInput(model: AuthorizedModel): boolean {
  return model.inputModalities?.includes("image") === true;
}

/**
 * Inbound image understanding. `profile.vision === false` is a shared-catalog
 * or generate-attach tag and does not pass an image turn.
 */
export function understandsImages(model: AuthorizedModel): boolean {
  return declaresImageInput(model) && model.profile.vision !== false;
}

/** Image-turn ranking: known vision-primary beats a bare image advertisement. */
export function visionFit(model: AuthorizedModel): number {
  if (!understandsImages(model)) return 0;
  return model.profile.vision === true ? 2 : 1;
}

function gate(request: RouteRequest): AuthorizedModel[] {
  const estimated = request.estimatedTokens;
  return request.inventory.candidates.filter((model) => {
    if (hardHealth(model.ref, request.health)) return false;
    if (request.hasImage === true && !understandsImages(model)) return false;
    if (estimated !== undefined && model.contextWindow !== undefined && model.contextWindow < estimated) return false;
    return true;
  });
}

function taskFit(model: AuthorizedModel, taskClass: TaskClass): number {
  return taskClass === "code" && model.profile.code === true ? 1 : 0;
}

function contextFit(model: AuthorizedModel, estimatedTokens: number | undefined): number {
  if (estimatedTokens === undefined) return 0;
  return model.contextWindow !== undefined && model.contextWindow >= estimatedTokens ? 1 : 0;
}

function healthPenalty(ref: string, health: RouteRequest["health"]): number {
  const entry = health?.[ref];
  if (entry === undefined || HARD_HEALTH.has(entry.code)) return 0;
  return entry.penalty ?? 0.5;
}

function score(
  model: AuthorizedModel,
  taskClass: TaskClass,
  weights: RouteWeights,
  estimatedTokens: number | undefined,
  health: RouteRequest["health"],
  hasImage: boolean,
): number {
  return taskFit(model, taskClass)
    + weights.quality * model.profile.quality
    + weights.speed * model.profile.speed
    - weights.cost * model.profile.cost
    + contextFit(model, estimatedTokens)
    + (hasImage ? visionFit(model) : 0)
    - healthPenalty(model.ref, health);
}

function compare(
  left: AuthorizedModel,
  right: AuthorizedModel,
  remaining: readonly AuthorizedModel[],
  current: RouteRequest["current"],
): number {
  if (isCurrent(left, current) !== isCurrent(right, current)) return isCurrent(left, current) ? -1 : 1;
  const leftIndex = remaining.indexOf(left);
  const rightIndex = remaining.indexOf(right);
  if (leftIndex !== rightIndex) return leftIndex - rightIndex;
  return left.ref.localeCompare(right.ref);
}

function weightsFor(objective: RouteObjective, override: RouteWeights | undefined): RouteWeights {
  if (override !== undefined) return override;
  if (objective === "balanced") return BALANCED_WEIGHTS;
  if (objective === "economy") return ECONOMY_WEIGHTS;
  return QUALITY_WEIGHTS;
}

export function decideRoute(request: RouteRequest): RouteDecision {
  const objective = request.objective ?? "quality";
  const weights = weightsFor(objective, request.weights);
  const switchMargin = request.switchMargin ?? DEFAULT_SWITCH_MARGIN;
  const { taskClass, confidence, forcedQuality } = classifyTask(request.text);
  const remaining = gate(request);
  if (remaining.length === 0) {
    const quotaBlocked = request.inventory.candidates.some(
      (model) => request.health?.[model.ref]?.code === QUOTA_EXCEEDED_CODE,
    );
    throw new RouterDecisionError(
      request.hasImage === true
        ? CAPABILITY_IMAGE_GUIDE
        : quotaBlocked ? QUOTA_NO_FALLBACK_GUIDE : undefined,
    );
  }

  const scored = remaining.map((model) => ({
    model,
    value: score(
      model,
      taskClass,
      weights,
      request.estimatedTokens,
      request.health,
      request.hasImage === true,
    ),
  }));
  const current = scored.find((entry) => isCurrent(entry.model, request.current));
  scored.sort((left, right) => {
    if (right.value !== left.value) return right.value - left.value;
    return compare(left.model, right.model, remaining, request.current);
  });
  const top = scored[0];
  let selected = top.model;
  let stayed = false;
  if (current !== undefined) {
    if (top.value <= current.value + switchMargin) {
      stayed = top.model !== current.model;
      selected = current.model;
    }
  }

  const contextPreferred = request.estimatedTokens !== undefined
    && remaining.some((model) => model.contextWindow === undefined)
    && remaining.some((model) => model.contextWindow !== undefined);
  let reason: RouteReason;
  if (current === undefined && request.current !== undefined) reason = "current-unavailable";
  else if (remaining.length === 1 && request.hasImage === true) reason = "capability-image";
  else if (contextPreferred && selected.contextWindow !== undefined) reason = "capability-context";
  else if (forcedQuality) reason = "forced-quality";
  else if (stayed) reason = "stay-bias";
  else if (remaining.length === 1) reason = "only-candidate";
  else reason = "local-clear";

  return {
    selected,
    objective,
    taskClass,
    confidence,
    reason,
    classifierUsed: false,
    candidates: remaining.map((model) => model.ref),
    inventoryGeneration: request.inventory.generation,
    latencyMs: 0,
  };
}
