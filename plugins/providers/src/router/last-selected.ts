export interface LastRouteRef {
  provider: string;
  model: string;
  displayName?: string;
  sessionId?: string;
  turn?: number;
  step?: number;
}

export function parseLastRouteRef(raw: unknown): LastRouteRef | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return undefined;
  const item = raw as Record<string, unknown>;
  if (typeof item.provider !== "string" || item.provider.length === 0)
    return undefined;
  if (typeof item.model !== "string" || item.model.length === 0)
    return undefined;
  const displayName =
    typeof item.displayName === "string" ? item.displayName.trim() : "";
  return {
    provider: item.provider,
    model: item.model,
    ...(displayName.length === 0 ? {} : { displayName }),
    ...(typeof item.sessionId === "string" && item.sessionId.length > 0
      ? { sessionId: item.sessionId }
      : {}),
    ...(typeof item.turn === "number" &&
    Number.isSafeInteger(item.turn) &&
    item.turn >= 0
      ? { turn: item.turn }
      : {}),
    ...(typeof item.step === "number" &&
    Number.isSafeInteger(item.step) &&
    item.step >= 0
      ? { step: item.step }
      : {}),
  };
}

export function createLastRouteMemory(): {
  remember(ref: LastRouteRef, notice?: string): void;
  read(): LastRouteRef | undefined;
  readNotice(): string | undefined;
} {
  let current: LastRouteRef | undefined;
  let notice: string | undefined;
  return {
    remember(ref: LastRouteRef, nextNotice?: string): void {
      current = parseLastRouteRef(ref);
      notice = typeof nextNotice === "string" && nextNotice.trim().length > 0
        ? nextNotice.trim()
        : undefined;
    },
    read(): LastRouteRef | undefined {
      return current === undefined ? undefined : { ...current };
    },
    readNotice(): string | undefined {
      return notice;
    },
  };
}
