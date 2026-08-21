import type { ProviderId } from "./auth/store.ts";

export type Region = "cn" | "intl";
export type LoginKind = "oauth" | "device" | "soon";

export interface SubscriptionProduct {
  id: string;
  name: string;
  nameZh: string;
  region: Region;
  login: LoginKind;
  hint: string;
  hintZh: string;
}

export const PRODUCTS: readonly SubscriptionProduct[] = [
  {
    id: "qwen",
    name: "Qwen Code",
    nameZh: "通义灵码",
    region: "cn",
    login: "device",
    hint: "Official Qwen Code device login",
    hintZh: "官方通义灵码设备码授权",
  },
  {
    id: "kimi",
    name: "Kimi Code",
    nameZh: "Kimi 编程",
    region: "cn",
    login: "device",
    hint: "Official Kimi Code device login",
    hintZh: "官方 Kimi 编程设备码授权",
  },
  {
    id: "glm",
    name: "Zhipu GLM",
    nameZh: "智谱 GLM",
    region: "cn",
    login: "soon",
    hint: "Official subscription login coming next",
    hintZh: "官方会员授权接入中",
  },
  {
    id: "doubao",
    name: "Doubao",
    nameZh: "豆包",
    region: "cn",
    login: "soon",
    hint: "Official subscription login coming next",
    hintZh: "官方会员授权接入中",
  },
  {
    id: "minimax",
    name: "MiniMax",
    nameZh: "MiniMax",
    region: "cn",
    login: "soon",
    hint: "Official subscription login coming next",
    hintZh: "官方会员授权接入中",
  },
  {
    id: "spark",
    name: "iFlytek Spark",
    nameZh: "讯飞星火",
    region: "cn",
    login: "soon",
    hint: "Official subscription login coming next",
    hintZh: "官方会员授权接入中",
  },
  {
    id: "hunyuan",
    name: "Hunyuan",
    nameZh: "腾讯混元",
    region: "cn",
    login: "soon",
    hint: "Official subscription login coming next",
    hintZh: "官方会员授权接入中",
  },
  {
    id: "codex",
    name: "ChatGPT Codex",
    nameZh: "ChatGPT Codex",
    region: "intl",
    login: "oauth",
    hint: "ChatGPT Plus / Pro",
    hintZh: "ChatGPT Plus / Pro 会员",
  },
  {
    id: "claude",
    name: "Claude",
    nameZh: "Claude",
    region: "intl",
    login: "oauth",
    hint: "Claude Pro / Max",
    hintZh: "Claude Pro / Max 会员",
  },
  {
    id: "grok",
    name: "Grok",
    nameZh: "Grok",
    region: "intl",
    login: "oauth",
    hint: "X Premium / SuperGrok",
    hintZh: "X Premium / SuperGrok 会员",
  },
];

export function liveProviderIds(): ProviderId[] {
  return PRODUCTS.filter((product) => product.login !== "soon").map((product) => product.id as ProviderId);
}

/** Keep configured ids that this build can actually authorize, in request order. */
export function enabledProviders(requested: readonly string[]): ProviderId[] {
  const live = new Set<string>(liveProviderIds());
  const seen = new Set<string>();
  const ids: ProviderId[] = [];
  for (const id of requested) {
    if (!live.has(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id as ProviderId);
  }
  return ids;
}

/** Live products that `Config.providers` actually turned on, in catalog order. */
export function listedProducts(requested: readonly string[]): SubscriptionProduct[] {
  const ids = new Set<string>(enabledProviders(requested));
  return PRODUCTS.filter((product) => ids.has(product.id));
}

/** Reject unknown or config-disabled provider ids at the RPC boundary. */
export function requireEnabledProvider(enabled: readonly ProviderId[], value: unknown): ProviderId {
  if (typeof value !== "string" || !enabled.includes(value as ProviderId)) {
    throw new Error(`provider must be one of ${enabled.join(", ") || "(none)"}`);
  }
  return value as ProviderId;
}

export function productsIn(region: Region): SubscriptionProduct[] {
  return PRODUCTS.filter((product) => product.region === region);
}
