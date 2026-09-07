/** User-facing empty-pool copy. Product Chinese-only. */
export const EMPTY_POOL_GUIDE =
  "还没有可自动选择的模型。请到插件中心 → 已安装 → 模型勾选至少一个已授权模型。";

/** Image turn with no authorized candidate that advertises image input. */
export const CAPABILITY_IMAGE_GUIDE =
  "当前没有支持图片输入的已授权模型。请到插件中心 → 已安装 → 模型勾选至少一个支持图片的模型。";

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
