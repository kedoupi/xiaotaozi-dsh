/** User-facing empty-pool copy. Product Chinese-only. */
export const EMPTY_POOL_GUIDE =
  "还没有可自动选择的模型。请到设置 → 模型勾选至少一个已授权模型。";

export class RouterEmptyPoolError extends Error {
  readonly code = "ROUTER_EMPTY_POOL";

  constructor(message = EMPTY_POOL_GUIDE) {
    super(message);
    this.name = "RouterEmptyPoolError";
  }
}

export function isEmptyAuthorizedPool(candidateCount: number): boolean {
  return candidateCount <= 0;
}
