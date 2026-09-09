import { parseDshWebAuthenticatedUrl } from "./web-auth-url";

export const LAUNCH_CAPTURE_TIMEOUT_MS = 10_000;
export const LAUNCH_MAX_LINE_BYTES = 65_536;
type OutputStream = "stdout" | "stderr";

/** Parse complete logical lines only; an overlong line is discarded through its delimiter. */
export function createLaunchOutputCollector({
  timeoutMs,
  maxLineBytes,
}: {
  timeoutMs: number;
  maxLineBytes: number;
}) {
  const streams = {
    stdout: { text: "", bytes: 0, overflow: false, ended: false },
    stderr: { text: "", bytes: 0, overflow: false, ended: false },
  };
  let settled = false;
  let resolveUrl!: (value: string | undefined) => void;
  const url = new Promise<string | undefined>((resolve) => {
    resolveUrl = resolve;
  });
  const timer = setTimeout(() => finish(undefined), timeoutMs);
  // Observation alone must not keep an otherwise finished child alive.
  timer.unref();
  function finish(value: string | undefined): void {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    for (const state of Object.values(streams)) {
      state.text = "";
      state.bytes = 0;
    }
    resolveUrl(value);
  }
  function complete(stream: OutputStream): void {
    const state = streams[stream];
    const value = state.overflow
      ? undefined
      : parseDshWebAuthenticatedUrl(state.text);
    state.text = "";
    state.bytes = 0;
    state.overflow = false;
    if (value !== undefined) finish(value);
  }
  return {
    url,
    push(stream: OutputStream, text: string): void {
      const state = streams[stream];
      if (settled || state.ended) return;
      let start = 0;
      while (start < text.length && !settled) {
        const newline = text.indexOf("\n", start);
        const end = newline < 0 ? text.length : newline;
        if (!state.overflow) {
          // Check length first so even a huge chunk never creates a huge retained substring.
          if (end - start > maxLineBytes - state.bytes) state.overflow = true;
          else {
            const part = text.slice(start, end);
            state.bytes += Buffer.byteLength(part, "utf8");
            if (state.bytes > maxLineBytes) state.overflow = true;
            else state.text += part;
          }
          if (state.overflow) state.text = "";
        }
        if (newline < 0) break;
        complete(stream);
        start = newline + 1;
      }
    },
    end(stream: OutputStream): void {
      const state = streams[stream];
      if (settled || state.ended) return;
      state.ended = true;
      complete(stream);
      if (streams.stdout.ended && streams.stderr.ended) finish(undefined);
    },
    fail(): void {
      finish(undefined);
    },
    dispose(): void {
      finish(undefined);
    },
  };
}

export function isStartupDone(message: unknown): boolean {
  return (
    isMessage(message, ["kind", "version"]) &&
    message.kind === "xtz-startup-done" &&
    message.version === 1
  );
}

function isMessage(
  message: unknown,
  keys: string[],
): message is Record<string, unknown> {
  return (
    message !== null &&
    typeof message === "object" &&
    Object.getPrototypeOf(message) === Object.prototype &&
    Object.keys(message).length === keys.length &&
    keys.every((key) => Object.hasOwn(message, key))
  );
}

export function startupMessageUrl(message: unknown): string | undefined {
  if (
    !isMessage(message, ["kind", "version", "url"]) ||
    message.kind !== "xtz-startup-url" ||
    message.version !== 1 ||
    typeof message.url !== "string" ||
    message.url.length > LAUNCH_MAX_LINE_BYTES ||
    /\s/u.test(message.url)
  )
    return undefined;
  return parseDshWebAuthenticatedUrl(`dsh web: ${message.url}`);
}
