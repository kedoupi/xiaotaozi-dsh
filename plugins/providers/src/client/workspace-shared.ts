import type { SubscriptionProduct } from "../catalog.ts";
import type { HostApi, ApiVendor } from "./host-api.ts";
import type { ProvidersKey } from "./locales.ts";
import { FEATURED_SUB_IDS, pairedApiVendorId } from "../display.ts";

export interface Status {
  loggedIn: boolean;
  busy: boolean;
  account?: string;
  detail?: string;
  deviceName?: string;
  deviceDetail?: string;
  authorizeUrl?: string;
  userCode?: string;
}

export interface CatalogModel {
  id: string;
  name: string;
  selected: boolean;
}

export interface RpcResult<T> {
  ok: boolean;
  value?: T;
  error?: { message: string };
}

export interface Rpc {
  call(channel: string, endpoint: string, payload: unknown): Promise<RpcResult<unknown>>;
}

export interface ModelsWorkspaceInjected {
  rpc: Rpc;
  api?: HostApi;
  t: (key: ProvidersKey, vars?: Record<string, string>) => string;
}

export const FEATURED_ORDER = [...FEATURED_SUB_IDS, "deepseek-official"];

export function format(template: string, vars?: Record<string, string>): string {
  if (vars === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => vars[name] ?? "");
}

export async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export function unifyModels(...groups: Array<readonly CatalogModel[] | undefined>): CatalogModel[] {
  const map = new Map<string, CatalogModel>();
  for (const group of groups) {
    if (group === undefined) continue;
    for (const model of group) {
      const existing = map.get(model.id);
      if (existing === undefined) map.set(model.id, { ...model });
      else if (model.selected) existing.selected = true;
    }
  }
  return [...map.values()];
}

export function loginBadge(product: SubscriptionProduct, t: ModelsWorkspaceInjected["t"]): string {
  if (pairedApiVendorId(product.id) !== undefined) return t("bothBadge");
  if (product.login === "device") return t("deviceBadge");
  return t("oauthBadge");
}

export function apiMethodBadge(vendor: Pick<ApiVendor, "declared">, t: ModelsWorkspaceInjected["t"]): string {
  return vendor.declared ? t("customBadge") : t("apiBadge");
}

export function trapTab(root: HTMLElement, event: KeyboardEvent): void {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>("button, input")).filter((node) => !node.hasAttribute("disabled"));
  if (nodes.length === 0) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}

export function pairConfigured(vendors: readonly ApiVendor[], subId: string): boolean {
  const pair = pairedApiVendorId(subId);
  return pair !== undefined && vendors.some((vendor) => vendor.id === pair && vendor.configured);
}

export function emptyVendor(id: string): ApiVendor {
  return {
    id,
    name: id,
    ref: "",
    configured: false,
    declared: false,
    featured: true,
    settingsNs: "",
    settingsPath: [],
  };
}

export function sortFeatured(
  subs: readonly SubscriptionProduct[],
  apis: readonly ApiVendor[],
): Array<{ kind: "sub"; product: SubscriptionProduct } | { kind: "api"; vendor: ApiVendor }> {
  const cards: Array<{ kind: "sub"; product: SubscriptionProduct } | { kind: "api"; vendor: ApiVendor }> = [
    ...subs.map((product) => ({ kind: "sub" as const, product })),
    ...apis.map((vendor) => ({ kind: "api" as const, vendor })),
  ];
  return cards.sort((left, right) => {
    const leftId = left.kind === "sub" ? left.product.id : left.vendor.id;
    const rightId = right.kind === "sub" ? right.product.id : right.vendor.id;
    return FEATURED_ORDER.indexOf(leftId) - FEATURED_ORDER.indexOf(rightId);
  });
}
