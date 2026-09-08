import type { RuntimeCredentials } from "./advanced-runtime.ts";

type Result<T> = { ok: true; value: T } | { ok: false; error: { message: string } };

/** RC1 takes positional arguments; metadata is the success value, without a credentials envelope. */
export interface CredentialsRemote {
  credentials: {
    describe(refs: string[]): Promise<Result<Record<string, { configured?: boolean; writable?: boolean }>>>;
    set(ref: string, value: string): Promise<Result<void>>;
  };
}

export function runtimeCredentialsFromRemote(remote: CredentialsRemote): RuntimeCredentials {
  return {
    async describe({ refs }) {
      const credentials = await remote.credentials.describe(refs);
      return { result: credentials.ok ? { ok: true, value: { credentials: credentials.value } } : credentials };
    },
    async set({ ref, value }) {
      return { result: await remote.credentials.set(ref, value) };
    },
  };
}
