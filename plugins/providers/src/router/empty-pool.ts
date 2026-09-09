/** User-facing empty-pool copy. Product Chinese-only. */
export const EMPTY_POOL_GUIDE =
  "还没有可自动选择的模型。请到插件中心 → 已安装 → 模型勾选至少一个已授权模型。";

/** Shown when the provider reports exhausted balance/quota. */
export const QUOTA_GUIDE = "账号余额不足，当前模型暂时不可用。";

/** Smart routing exhausted every checked provider on quota/auth. */
export const QUOTA_NO_FALLBACK_GUIDE =
  "账号余额不足，已勾选的其他服务商里也没有能接替的模型。请充值，或到插件中心 → 已安装 → 模型勾选其他服务商。";

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
