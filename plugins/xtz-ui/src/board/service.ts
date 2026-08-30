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

export class BoardService {
  private tasks: TaskRecord[];
  private lastTick: number | undefined;
  private timers: Array<ReturnType<typeof setInterval>> = [];
  private disposed = false;

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
    if (this.timers.length > 0) return;
    this.timers.push(setInterval(() => void this.poll().catch(() => pluginTrace("board poll failed")), SESSION_POLL_MS));
    this.timers.push(setInterval(() => this.tick(false), SCHEDULE_TICK_MS));
    void this.poll().catch(() => pluginTrace("board poll failed"));
    this.tick(true);
  }

  dispose(): void {
    this.disposed = true;
    for (const timer of this.timers.splice(0)) clearInterval(timer);
  }

  snapshot(): { tasks: TaskRecord[]; workspaces: BoardWorkspace[] } {
    return { tasks: this.tasks, workspaces: listWorkspaces(this.host.workspaceRegistry) };
  }

  create(input: NewTaskInput): TaskRecord[] {
    return this.commit(createTask(this.tasks, input, this.now()));
  }

  update(id: string, patch: Partial<NewTaskInput>): TaskRecord[] {
    return this.commit(updateTask(this.tasks, id, patch, this.now()));
  }

  move(id: string, status: TaskStatus): TaskRecord[] {
    return this.commit(moveTask(this.tasks, id, status, this.now()));
  }

  remove(id: string): TaskRecord[] {
    return this.commit(deleteTask(this.tasks, id));
  }

  run(id: string): TaskRecord[] {
    const now = this.now();
    const opened = openRun(this.tasks, id, now);
    const next = opened.tasks.map((task) => task.id === id ? armAfterTrigger(task, now) : task);
    this.commit(next);
    void this.launch(id, opened.executionId).catch(() => pluginTrace("board launch persistence failed"));
    return this.tasks;
  }

  async cancel(id: string): Promise<TaskRecord[]> {
    const task = this.tasks.find((item) => item.id === id);
    if (task === undefined) throw new Error("task not found");
    if (task.status !== "running") throw new Error("task is not running");
    const execution = activeExecution(task);
    if (execution.sessionId === undefined) throw new Error("execution session is not ready");
    await cancelSession(this.host.apiProxy, execution.sessionId);
    if (this.disposed) return this.tasks;
    return this.commit(settleRun(this.tasks, id, execution.id, "cancelled", "cancelled by user", this.now()));
  }

  private commit(next: TaskRecord[]): TaskRecord[] {
    saveBoard(next, this.env);
    this.tasks = next;
    return next;
  }

  private persist(): void {
    this.commit(this.tasks);
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

  private async launch(taskId: string, executionId: string): Promise<void> {
    const task = this.tasks.find((item) => item.id === taskId);
    if (task === undefined) return;
    let sessionId: string;
    try {
      sessionId = await launchTask(this.host.apiProxy, {
        title: task.title,
        prompt: task.prompt !== "" ? task.prompt : task.title,
        workspaceId: task.workspaceId,
      });
    } catch (error) {
      if (this.disposed) return;
      const failedSessionId = (error as { sessionId?: string }).sessionId;
      let next = this.tasks;
      if (typeof failedSessionId === "string") next = attachSession(next, taskId, executionId, failedSessionId);
      next = settleRun(next, taskId, executionId, "failed", error instanceof Error ? error.message : String(error), this.now());
      this.commit(next);
      return;
    }
    if (this.disposed) return;
    this.commit(attachSession(this.tasks, taskId, executionId, sessionId));
  }

  private async poll(): Promise<void> {
    if (this.disposed) return;
    const open = this.tasks.flatMap((task) =>
      task.executions.filter((item) => item.endedAt === undefined && item.sessionId !== undefined)
        .map((item) => ({ taskId: task.id, executionId: item.id, sessionId: item.sessionId! })),
    );
    for (const item of open) {
      const result = await inspectSession(this.host.apiProxy, item.sessionId);
      if (this.disposed) return;
      if (result.outcome === "pending") continue;
      const next = settleRun(
        this.tasks,
        item.taskId,
        item.executionId,
        result.outcome,
        "error" in result ? result.error : undefined,
        this.now(),
      );
      this.commit(next);
    }
  }
}
