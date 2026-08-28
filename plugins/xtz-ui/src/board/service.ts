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
    this.timers.push(setInterval(() => void this.poll(), SESSION_POLL_MS));
    this.timers.push(setInterval(() => this.tick(false), SCHEDULE_TICK_MS));
    void this.poll();
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
    this.tasks = createTask(this.tasks, input, this.now());
    this.persist();
    return this.tasks;
  }

  update(id: string, patch: Partial<NewTaskInput>): TaskRecord[] {
    this.tasks = updateTask(this.tasks, id, patch, this.now());
    this.persist();
    return this.tasks;
  }

  move(id: string, status: TaskStatus): TaskRecord[] {
    this.tasks = moveTask(this.tasks, id, status, this.now());
    this.persist();
    return this.tasks;
  }

  remove(id: string): TaskRecord[] {
    this.tasks = deleteTask(this.tasks, id);
    this.persist();
    return this.tasks;
  }

  run(id: string): TaskRecord[] {
    const now = this.now();
    const opened = openRun(this.tasks, id, now);
    this.tasks = opened.tasks.map((task) => task.id === id ? armAfterTrigger(task, now) : task);
    this.persist();
    void this.launch(id, opened.executionId);
    return this.tasks;
  }

  async cancel(id: string): Promise<TaskRecord[]> {
    const task = this.tasks.find((item) => item.id === id);
    if (task === undefined) throw new Error("task not found");
    if (task.status !== "running") throw new Error("task is not running");
    const execution = activeExecution(task);
    if (execution.sessionId === undefined) throw new Error("execution session is not ready");
    await cancelSession(this.host.apiProxy, execution.sessionId);
    this.tasks = settleRun(this.tasks, id, execution.id, "cancelled", "cancelled by user", this.now());
    this.persist();
    return this.tasks;
  }

  private persist(): void {
    saveBoard(this.tasks, this.env);
  }

  private tick(first: boolean): void {
    if (this.disposed) return;
    const now = this.now();
    const recovered = first || (this.lastTick !== undefined && now - this.lastTick > RESUME_GAP_MS);
    this.lastTick = now;
    if (recovered) {
      this.tasks = skipMissed(this.tasks, now);
      this.persist();
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
    try {
      const sessionId = await launchTask(this.host.apiProxy, {
        title: task.title,
        prompt: task.prompt !== "" ? task.prompt : task.title,
        workspaceId: task.workspaceId,
      });
      this.tasks = attachSession(this.tasks, taskId, executionId, sessionId);
      this.persist();
    } catch (error) {
      const sessionId = (error as { sessionId?: string }).sessionId;
      if (typeof sessionId === "string") this.tasks = attachSession(this.tasks, taskId, executionId, sessionId);
      this.tasks = settleRun(this.tasks, taskId, executionId, "failed", error instanceof Error ? error.message : String(error), this.now());
      this.persist();
    }
  }

  private async poll(): Promise<void> {
    if (this.disposed) return;
    const open = this.tasks.flatMap((task) =>
      task.executions.filter((item) => item.endedAt === undefined && item.sessionId !== undefined)
        .map((item) => ({ taskId: task.id, executionId: item.id, sessionId: item.sessionId! })),
    );
    for (const item of open) {
      const result = await inspectSession(this.host.apiProxy, item.sessionId);
      if (result.outcome === "pending") continue;
      this.tasks = settleRun(
        this.tasks,
        item.taskId,
        item.executionId,
        result.outcome,
        "error" in result ? result.error : undefined,
        this.now(),
      );
      this.persist();
    }
  }
}
