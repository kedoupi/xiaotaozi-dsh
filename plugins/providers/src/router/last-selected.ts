export interface LastRouteRef {
  provider: string;
  model: string;
}

export function createLastRouteMemory(): {
  remember(ref: LastRouteRef): void;
  read(): LastRouteRef | undefined;
} {
  let current: LastRouteRef | undefined;
  return {
    remember(ref: LastRouteRef): void {
      current = { provider: ref.provider, model: ref.model };
    },
    read(): LastRouteRef | undefined {
      return current === undefined ? undefined : { ...current };
    },
  };
}
