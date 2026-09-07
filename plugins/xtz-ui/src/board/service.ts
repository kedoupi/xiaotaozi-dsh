import {
  armAfterTrigger,
  activeExecution,
  attachSession,
  createTask,
  deleteTask,
  dueTaskIds,
  failOrphanedRuns,
  moveTask,
  openRun,
  settleRun,
  skipMissed,
  updateTask,
  type NewTaskInput,
} from "./ledger.ts";
import { cancelSession, inspectSession, launchTask, listWorkspaces } from "./runner.ts";
import { loadBoard, saveBoard } from "./store.ts";
import type { BoardWorkspace, TaskRecord, TaskStatus } from "./types.ts";
import { pluginTrace } from "../trace.ts";

const SESSION_POLL_MS = 5_000;
const SCHEDULE_TICK_MS = 30_000;
const RESUME_GAP_MS = SCHEDULE_TICK_MS + 15_000;

export interface BoardHost {
  apiProxy: unknown;
  workspaceRegistry: unknown;
}

interface LaunchOwnership {
  taskId: string;
  executionId: string;
  sessionId?: string;
  launching: boolean;
  cancelRequested: boolean;
  promptStarted: boolean;
  launchPromise: Promise<void>;
  cancelPromise?: Promise<void>;
}

export class BoardService {
  private tasks: TaskRecord[];
  private lastTick: number | undefined;
  private timers: Array<ReturnType<typeof setInterval>> = [];
  private disposed = false;
  private readonly launches = new Map<string, LaunchOwnership>();
  private disposal?: Promise<void>;

  constructor(
    private readonly host: BoardHost,
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly now: () => number = Date.now,
  ) {
    const loaded = loadBoard(env);
    this.tasks = loaded;
    const hasOrphanedRun = loaded.some((task) => task.status === "running" && task.executions.some(
      (execution) => execution.endedAt === undefined && execution.sessionId === undefined,
    ));
    if (!hasOrphanedRun) return;
    const recovered = failOrphanedRuns(loaded, this.now());
    this.tasks = recovered.tasks;
    if (recovered.recovered > 0) {
      saveBoard(this.tasks, this.env);
      pluginTrace(`board recovered orphaned executions n=${String(recovered.recovered)}`);
    }
  }

  start(): void {
    if (this.disposed || this.timers.length > 0) return;
    this.timers.push(setInterval(() => void this.poll().catch(() => pluginTrace("board poll failed")), SESSION_POLL_MS));
    this.timers.push(setInterval(() => this.tick(false), SCHEDULE_TICK_MS));
    void this.poll().catch(() => pluginTrace("board poll failed"));
    this.tick(true);
  }

  dispose(): Promise<void> {
    if (this.disposal !== undefined) return this.disposal;
    this.disposed = true;
    for (const timer of this.timers.splice(0)) clearInterval(timer);
    // Request every cancellation before waiting; one uncertain RPC must not
    // prevent another accepted execution from being drained.
    const drains = this.tasks.filter((task) => task.status === "running")
      .map((task) => this.requestCancel(this.ownership(task)));
    this.disposal = Promise.allSettled(drains).then((results) => {
      if (results.some((result) => result.status === "rejected")) {
        throw new Error("board cancellation uncertain");
      }
    });
    return this.disposal;
  }

  snapshot(): { tasks: TaskRecord[]; workspaces: BoardWorkspace[] } {
    return { tasks: this.tasks, workspaces: listWorkspaces(this.host.workspaceRegistry) };
  }

  create(input: NewTaskInput): TaskRecord[] {
    if (this.disposed) throw new Error("board service disposed");
    return this.commit(createTask(this.tasks, input, this.now()));
  }

  update(id: string, patch: Partial<NewTaskInput>): TaskRecord[] {
    if (this.disposed) throw new Error("board service disposed");
    return this.commit(updateTask(this.tasks, id, patch, this.now()));
  }

  move(id: string, status: TaskStatus): TaskRecord[] {
    if (this.disposed) throw new Error("board service disposed");
    return this.commit(moveTask(this.tasks, id, status, this.now()));
  }

  remove(id: string): TaskRecord[] {
    if (this.disposed) throw new Error("board service disposed");
    return this.commit(deleteTask(this.tasks, id));
  }

  run(id: string): TaskRecord[] {
    if (this.disposed) throw new Error("board service disposed");
    const now = this.now();
    const opened = openRun(this.tasks, id, now);
    const next = opened.tasks.map((task) => task.id === id ? armAfterTrigger(task, now) : task);
    this.commit(next);
    const entry = this.ownership(this.tasks.find((task) => task.id === id)!);
    entry.launching = true;
    entry.launchPromise = this.launch(entry);
    void entry.launchPromise.catch(() => pluginTrace("board launch persistence failed"));
    return this.tasks;
  }

  async cancel(id: string): Promise<TaskRecord[]> {
    const task = this.tasks.find((item) => item.id === id);
    if (task === undefined) throw new Error("task not found");
    if (task.status !== "running") throw new Error("task is not running");
    await this.requestCancel(this.ownership(task));
    return this.tasks;
  }

  private commit(next: TaskRecord[]): TaskRecord[] {
    if (next.length === this.tasks.length && next.every((task, index) => task === this.tasks[index])) return this.tasks;
    saveBoard(next, this.env);
    this.tasks = next;
    return next;
  }

  private tick(first: boolean): void {
    if (this.disposed) return;
    const now = this.now();
    const recovered = first || (this.lastTick !== undefined && now - this.lastTick > RESUME_GAP_MS);
    this.lastTick = now;
    if (recovered) {
      this.commit(skipMissed(this.tasks, now));
      return;
    }
    for (const id of dueTaskIds(this.tasks, now)) {
      try {
        this.run(id);
      } catch {
        // skip a card that cannot start; next tick retries
      }
    }
  }

  private ownership(task: TaskRecord): LaunchOwnership {
    const execution = activeExecution(task);
    let entry = this.launches.get(execution.id);
    if (entry === undefined) {
      entry = {
        taskId: task.id, executionId: execution.id, sessionId: execution.sessionId,
        launching: false, cancelRequested: false, promptStarted: false,
        launchPromise: Promise.resolve(),
      };
      this.launches.set(execution.id, entry);
    }
    return entry;
  }

  private isCurrent(entry: { taskId: string; executionId: string; sessionId?: string }): boolean {
    const task = this.tasks.find((item) => item.id === entry.taskId);
    if (task?.status !== "running") return false;
    const current = [...task.executions].reverse().find((item) => item.endedAt === undefined);
    return current?.id === entry.executionId && current.sessionId === entry.sessionId;
  }

  private pollable(entry: { taskId: string; executionId: string; sessionId: string }): boolean {
    const owner = this.launches.get(entry.executionId);
    return !this.disposed && this.isCurrent(entry)
      && !owner?.launching && !owner?.cancelRequested && owner?.cancelPromise === undefined;
  }

  private requestCancel(entry: LaunchOwnership): Promise<void> {
    // This intent is synchronous, including while create/rename is awaiting.
    entry.cancelRequested = true;
    entry.cancelPromise ??= this.drainCancellation(entry);
    return entry.cancelPromise;
  }

  private async drainCancellation(entry: LaunchOwnership): Promise<void> {
    const earlySession = entry.sessionId;
    const promptInFlight = entry.launching && entry.promptStarted;
    let uncertain = false;
    if (earlySession !== undefined && this.isCurrent(entry)) {
      try { await cancelSession(this.host.apiProxy, earlySession); }
      catch { uncertain = true; }
    }
    // Raw launch only: never await a wrapper that waits on this cancelPromise.
    try { await entry.launchPromise; }
    catch { uncertain = true; }
    if (uncertain) throw new Error("board cancellation uncertain");
    if (!this.isCurrent(entry)) return;
    // An early acknowledgement cannot stop a prompt accepted afterwards.
    if (entry.sessionId !== undefined && (earlySession === undefined || promptInFlight)) {
      try { await cancelSession(this.host.apiProxy, entry.sessionId); }
      catch { throw new Error("board cancellation uncertain"); }
      if (!this.isCurrent(entry)) return;
    }
    this.commit(settleRun(this.tasks, entry.taskId, entry.executionId, "cancelled", "cancelled by user", this.now()));
    this.launches.delete(entry.executionId);
  }

  private async launch(entry: LaunchOwnership): Promise<void> {
    const { taskId, executionId } = entry;
    const task = this.tasks.find((item) => item.id === taskId)!;
    try {
      await launchTask(this.host.apiProxy, {
        title: task.title,
        prompt: task.prompt !== "" ? task.prompt : task.title,
        workspaceId: task.workspaceId,
      }, {
        onCreated: (sessionId) => {
          entry.sessionId = sessionId;
          this.commit(attachSession(this.tasks, taskId, executionId, sessionId));
        },
        shouldPrompt: () => {
          if (this.disposed || entry.cancelRequested || !this.isCurrent(entry)) return false;
          entry.promptStarted = true;
          return true;
        },
      });
    } catch (error) {
      if (entry.cancelRequested) return;
      this.commit(settleRun(this.tasks, taskId, executionId, "failed", error instanceof Error ? error.message : String(error), this.now()));
      this.launches.delete(executionId);
    } finally {
      // Keep the entry and intent on pending/uncertain cancellation.
      entry.launching = false;
    }
  }

  private async poll(): Promise<void> {
    if (this.disposed) return;
    const open = this.tasks.flatMap((task) =>
      task.executions.filter((item) => item.endedAt === undefined && item.sessionId !== undefined)
        .map((item) => ({ taskId: task.id, executionId: item.id, sessionId: item.sessionId! }))
        .filter((item) => this.pollable(item)),
    );
    for (const item of open) {
      if (!this.pollable(item)) continue;
      const result = await inspectSession(this.host.apiProxy, item.sessionId);
      if (!this.pollable(item) || result.outcome === "pending") continue;
      const next = settleRun(
        this.tasks,
        item.taskId,
        item.executionId,
        result.outcome,
        "error" in result ? result.error : undefined,
        this.now(),
      );
      this.commit(next);
      this.launches.delete(item.executionId);
    }
  }
}
