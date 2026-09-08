import * as React from 'react';

type PollSchedulerOptions = {
  setTimeoutFn: (callback: () => void, delayMs: number) => number;
  clearTimeoutFn: (timer: number) => void;
};

export function createPollScheduler({ setTimeoutFn, clearTimeoutFn }: PollSchedulerOptions) {
  let disposed = false;
  let timer: number | undefined;

  return {
    get disposed() {
      return disposed;
    },
    schedule(callback: () => void, delayMs: number) {
      if (disposed) return false;
      if (timer !== undefined) clearTimeoutFn(timer);
      timer = setTimeoutFn(() => {
        timer = undefined;
        if (!disposed) void callback();
      }, delayMs);
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (timer !== undefined) clearTimeoutFn(timer);
      timer = undefined;
    },
  };
}

type AnimationFrameSchedulerOptions = {
  requestFrame: (callback: () => void) => number;
  cancelFrame: (frame: number) => void;
};

export function createAnimationFrameScheduler({ requestFrame, cancelFrame }: AnimationFrameSchedulerOptions) {
  let disposed = false;
  const frames = new Set<number>();
  const keyedFrames = new Map<unknown, number>();

  return {
    schedule(callback: () => void, key?: unknown) {
      if (disposed) return false;
      const previous = key === undefined ? undefined : keyedFrames.get(key);
      if (previous !== undefined) {
        keyedFrames.delete(key);
        frames.delete(previous);
        cancelFrame(previous);
      }
      let frame: number | undefined;
      let completed = false;
      frame = requestFrame(() => {
        completed = true;
        if (frame !== undefined) frames.delete(frame);
        if (key !== undefined && keyedFrames.get(key) === frame) keyedFrames.delete(key);
        if (!disposed) callback();
      });
      if (!completed) {
        frames.add(frame);
        if (key !== undefined) keyedFrames.set(key, frame);
      }
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const frame of frames) cancelFrame(frame);
      frames.clear();
      keyedFrames.clear();
    },
  };
}

type AnimationFrameScheduler = ReturnType<typeof createAnimationFrameScheduler>;

export function useAnimationFrameScheduler() {
  const schedulerRef = React.useRef<AnimationFrameScheduler | null>(null);

  React.useEffect(() => {
    const scheduler = createAnimationFrameScheduler({
      requestFrame: (callback) => window.requestAnimationFrame(callback),
      cancelFrame: (frame) => window.cancelAnimationFrame(frame),
    });
    schedulerRef.current = scheduler;
    return () => {
      scheduler.dispose();
      if (schedulerRef.current === scheduler) schedulerRef.current = null;
    };
  }, []);

  return React.useCallback(
    (callback: () => void, key?: unknown) => schedulerRef.current?.schedule(callback, key) ?? false,
    [],
  );
}
