import type {
  RouteConfidence,
  RouteObjective,
  RouteReason,
  TaskClass,
} from "./decision.ts";

/** Bounded routing metadata. Not a durable Session event on pinned RC1. */
export interface RouterDecisionEvent {
  sessionId?: string;
  turn: number;
  step: number;
  selected: { provider: string; model: string };
  objective: RouteObjective;
  taskClass: TaskClass;
  confidence: RouteConfidence;
  reason: RouteReason;
  classifierUsed: boolean;
  candidates: string[];
  inventoryGeneration: string;
  latencyMs: number;
}
