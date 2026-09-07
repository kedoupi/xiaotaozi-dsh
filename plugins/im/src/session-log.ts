/**
 * Read a Session event log on DSH 0.1.2+ (`snapshotEvents`) with a
 * fallback for test doubles that still expose a plain `events` array.
 */
export function sessionEventLog<T = unknown>(
  session:
    | {
        snapshotEvents?: () => unknown;
        events?: unknown;
      }
    | null
    | undefined,
): readonly T[] {
  if (session == null) return [];
  if (typeof session.snapshotEvents === "function") {
    try {
      const snapshot = session.snapshotEvents();
      if (Array.isArray(snapshot)) return snapshot as T[];
    } catch {
      // Fall through to the array face used by unit-test doubles.
    }
  }
  return Array.isArray(session.events) ? session.events as T[] : [];
}
