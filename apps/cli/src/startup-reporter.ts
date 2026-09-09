import { StringDecoder } from "node:string_decoder";
import {
  createLaunchOutputCollector,
  isStartupDone,
  LAUNCH_CAPTURE_TIMEOUT_MS,
  LAUNCH_MAX_LINE_BYTES,
} from "./launch-output";

/** Private Node preload: observes startup only; detached output always goes to OS ignore sinks. */
export function installStartupReporter(
  target: NodeJS.Process = process,
  timeoutMs = LAUNCH_CAPTURE_TIMEOUT_MS,
): void {
  if (!target.connected || typeof target.send !== "function") return;
  const collector = createLaunchOutputCollector({
    timeoutMs,
    maxLineBytes: LAUNCH_MAX_LINE_BYTES,
  });
  const originals = {
    stdout: target.stdout.write,
    stderr: target.stderr.write,
  };
  const decoders = {
    stdout: new StringDecoder("utf8"),
    stderr: new StringDecoder("utf8"),
  };
  let stopped = false;
  let restored = false;
  // Includes a pending IPC send: collector completion alone is not delivery.
  const deadline = setTimeout(() => stop(), timeoutMs);
  deadline.unref();
  function restore(): void {
    if (restored) return;
    restored = true;
    for (const stream of ["stdout", "stderr"] as const) {
      if (target[stream].write === hooks[stream])
        target[stream].write = originals[stream];
    }
  }
  function stop(): void {
    if (stopped) return;
    stopped = true;
    clearTimeout(deadline);
    restore();
    collector.dispose();
    target.off("message", onMessage);
    target.off("disconnect", stop);
    target.off("beforeExit", onEnd);
    target.off("exit", stop);
    target.stdout.off("finish", onStdoutEnd);
    target.stderr.off("finish", onStderrEnd);
    target.channel?.unref();
    if (target.connected) {
      try {
        target.disconnect();
      } catch {
        /* Already disconnected. */
      }
    }
  }
  function onMessage(message: unknown): void {
    // The sole valid parent message is done. Malformed messages fail closed too.
    if (!isStartupDone(message)) {
      stop();
      return;
    }
    collector.dispose();
  }
  function end(stream: "stdout" | "stderr"): void {
    collector.push(stream, decoders[stream].end());
    collector.end(stream);
  }
  const onStdoutEnd = (): void => end("stdout");
  const onStderrEnd = (): void => end("stderr");
  function onEnd(): void {
    onStdoutEnd();
    onStderrEnd();
  }
  function hook(stream: "stdout" | "stderr"): typeof target.stdout.write {
    const original = originals[stream];
    return function (
      this: NodeJS.WriteStream,
      ...args: Parameters<typeof original>
    ): boolean {
      // Forward first, exactly once. Observation must never swallow legitimate output/errors.
      const result = original.apply(this, args);
      if (!stopped && !restored) {
        try {
          const [chunk, encoding] = args;
          const bytes =
            typeof chunk === "string"
              ? Buffer.from(
                  chunk,
                  typeof encoding === "string" ? encoding : "utf8",
                )
              : chunk;
          collector.push(stream, decoders[stream].write(bytes));
        } catch {
          stop();
        }
      }
      return result;
    } as typeof target.stdout.write;
  }
  const hooks = { stdout: hook("stdout"), stderr: hook("stderr") };
  target.stdout.write = hooks.stdout;
  target.stderr.write = hooks.stderr;
  target.on("message", onMessage);
  target.once("disconnect", stop);
  target.once("beforeExit", onEnd);
  target.once("exit", stop);
  target.stdout.once("finish", onStdoutEnd);
  target.stderr.once("finish", onStderrEnd);
  target.channel?.unref();
  void collector.url.then((url) => {
    restore();
    if (stopped) return;
    if (url === undefined || !target.connected) {
      stop();
      return;
    }
    try {
      target.send!({ kind: "xtz-startup-url", version: 1, url }, () => stop());
    } catch {
      stop();
    }
  });
}

installStartupReporter();
