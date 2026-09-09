import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import type {} from "@deepseek-ai/dsh-client-ui-theme/client";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
import type {} from "@deepseek-ai/dsh-client-ui-layout/client";
import type {} from "@deepseek-ai/dsh-client-connection/client";

/**
 * Client ctx after 0.1.2 unbundled `dsh-client-runtime`.
 * Domain modules augment cordis `Context`.
 */
export type ClientContext = import("@deepseek-ai/cordis").Context;

/**
 * Settings scope face used by Advanced runtime forms.
 * Structural subset of `dsh-client-ui-settings/client` so we do not also pin
 * `dsh-api-remotes` just for `mutate` types.
 */
export type SettingsScopeSnapshot<T> = {
  status: string;
  value?: T;
  base?: unknown;
  user?: unknown;
  revision?: number;
  writable?: boolean;
  mode?: string;
};

export interface SettingsScope<T> {
  getSnapshot(): SettingsScopeSnapshot<T>;
  subscribe(listener: () => void): () => void;
  set(field: string, value: unknown): Promise<void>;
  unset(field: string): Promise<void>;
}

export type SessionListState = {
  current?: string;
  byId: Record<string, { blank?: boolean } | undefined>;
};
