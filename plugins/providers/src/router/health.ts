import { QUOTA_EXCEEDED_CODE } from "@deepseek-ai/dsh-llm";
import type { AuthorizedModelInventory } from "./inventory.ts";

export { QUOTA_EXCEEDED_CODE };

/** Account-level failures: do not retry the same provider this turn. */
export const HARD_HEALTH_CODES = new Set([
  "AUTH",
  "MISSING_CREDENTIAL",
  "INVALID_CREDENTIAL",
  QUOTA_EXCEEDED_CODE,
]);

export function isHardHealth(code: string): boolean {
  return HARD_HEALTH_CODES.has(code);
}

/** Quota/auth is usually the API account, not a single catalog row. */
export function providerModelRefs(
  provider: string,
  inventory: AuthorizedModelInventory,
): readonly string[] {
  return inventory.candidates
    .filter((model) => model.provider === provider)
    .map((model) => model.ref);
}
