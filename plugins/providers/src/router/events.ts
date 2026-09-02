import type { RouteConfidence, RouteObjective, RouteReason, TaskClass } from "./decision.ts";

/** Bounded routing metadata. Not a session event on rc.2. */
export interface RouterDecisionEvent {
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
