import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type ReactElement,
} from "react";
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import { isValidCron } from "../board/schedule.ts";
import {
  COLUMNS,
  canMoveManually,
  type BoardWorkspace,
  type TaskRecord,
} from "../board/types.ts";
import { XTZ_UI_BOARD_NAMESPACE, XTZ_UI_BOARD_PREFIX } from "../names.ts";
import type { BoardKey } from "./board-locales.ts";
import { fmt } from "./copy.ts";
import type { PanelOpen } from "./panel-open.ts";
import { EditTaskModal } from "./EditTaskModal.tsx";
import { useDialogFocus } from "./dialog-focus.ts";
import { BackIcon, CloseIcon, PlusIcon } from "./icons.tsx";
import { APP_ICON } from "./logo.ts";

function k(name: string): string {
  return `dshH-tb-${name}`;
}

async function fetchJson(
  path: string,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  const response = await fetch(path, { cache: "no-store", ...init });
  const payload = (await response.json()) as { ok?: boolean; error?: string };
  if (!response.ok || payload.ok === false)
    throw new Error(payload.error ?? `http ${String(response.status)}`);
  return payload as Record<string, unknown>;
}

function formatTime(ms: number, justNow: string): string {
  const minutes = Math.floor((Date.now() - ms) / 60000);
  if (minutes < 1) return justNow;
  if (minutes < 60) return `${String(minutes)}m`;
  if (minutes < 60 * 24) return `${String(Math.floor(minutes / 60))}h`;
  const date = new Date(ms);
  return `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function statusLabel(
  t: (key: BoardKey) => string,
  status: TaskRecord["status"],
): string {
  return t(
    COLUMNS.find((column) => column.status === status)?.labelKey ?? "title",
  );
}

/** Decorative leaf from the peach mark — brand.zh.md §2.1: decoration only, never semantics. */
function LeafGlyph(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 20C4 11 10.5 4.5 20 4c.5 9.5-6 16-15 16" />
      <path d="M4 20c3-5.5 7-9.5 11-11.5" />
    </svg>
  );
}

/** Board-level empty state: a brand moment (brand.zh.md §4), shown only when
 *  there are no tasks at all — a filtered-out board still shows the columns. */
function EmptyBoard(props: {
  t: (key: BoardKey) => string;
  onCreate: () => void;
}): ReactElement {
  return (
    <div className={k("emptyBoard")}>
      <div className={k("emptyBoardInner")}>
        <div className={k("emptyTray")}>
          <img src={APP_ICON} alt="" />
          <span className={k("emptyLeaf")} aria-hidden="true">
            <LeafGlyph />
          </span>
        </div>
        <h3 className={k("emptyTitle")}>{props.t("emptyBoardTitle")}</h3>
        <p className={k("emptyBody")}>{props.t("emptyBoardBody")}</p>
        <button
          type="button"
          className={k("primaryButton")}
          onClick={props.onCreate}
        >
          <PlusIcon />
          {props.t("new")}
        </button>
      </div>
    </div>
  );
}

export function BoardPanel(props: {
  ctx: ClientContext;
  panel: PanelOpen;
}): ReactElement {
  const t = useMemo(
    () =>
      props.ctx.locale.bind(XTZ_UI_BOARD_NAMESPACE) as (
        key: BoardKey,
      ) => string,
    [props.ctx],
  );
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [workspaces, setWorkspaces] = useState<BoardWorkspace[]>([]);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [operationError, setOperationError] = useState<string | undefined>(
    undefined,
  );
  const [operationSuccess, setOperationSuccess] = useState<string | undefined>(
    undefined,
  );
  const [draggedTaskId, setDraggedTaskId] = useState<string | undefined>(
    undefined,
  );
  const [dropTarget, setDropTarget] = useState<
    TaskRecord["status"] | undefined
  >(undefined);
  const [dragAnnouncement, setDragAnnouncement] = useState<string | undefined>(
    undefined,
  );
  const [filter, setFilter] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const boardFallbackRef = useRef<HTMLHeadingElement>(null);
  const pollingPaused = useRef(false);
  pollingPaused.current =
    busy || showNew || editing !== undefined || selected !== undefined;

  const load = useCallback(async (): Promise<void> => {
    try {
      const payload = await fetchJson(XTZ_UI_BOARD_PREFIX);
      setTasks(
        Array.isArray(payload.tasks) ? (payload.tasks as TaskRecord[]) : [],
      );
      setWorkspaces(
        Array.isArray(payload.workspaces)
          ? (payload.workspaces as BoardWorkspace[])
          : [],
      );
      setLoadError(undefined);
    } catch {
      setLoadError(t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !pollingPaused.current)
        void load();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [load]);

  const post = async (
    path: string,
    body: unknown,
    method = "POST",
  ): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    setOperationError(undefined);
    setOperationSuccess(undefined);
    try {
      const payload = await fetchJson(`${XTZ_UI_BOARD_PREFIX}${path}`, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (Array.isArray(payload.tasks)) setTasks(payload.tasks as TaskRecord[]);
      setOperationError(undefined);
      setOperationSuccess(t("operationSuccess"));
      return true;
    } catch (caught) {
      setOperationError(
        caught instanceof Error ? caught.message : t("loadFailed"),
      );
      return false;
    } finally {
      setBusy(false);
    }
  };

  const visible = tasks.filter((task) => {
    const needle = filter.trim().toLowerCase();
    if (needle === "") return true;
    return (
      task.title.toLowerCase().includes(needle) ||
      task.description.toLowerCase().includes(needle)
    );
  });
  const selectedTask = tasks.find((task) => task.id === selected);
  const editingTask = tasks.find((task) => task.id === editing);
  const draggedTask = tasks.find((task) => task.id === draggedTaskId);

  const enterDropTarget = (status: TaskRecord["status"]): void => {
    if (
      draggedTask === undefined ||
      !canMoveManually(draggedTask.status, status)
    ) {
      setDropTarget(undefined);
      return;
    }
    setDropTarget(status);
    setDragAnnouncement(
      fmt(t("dropTarget"), {
        name: draggedTask.title,
        status: statusLabel(t, status),
      }),
    );
  };

  const dropTask = (
    event: DragEvent<HTMLElement>,
    status: TaskRecord["status"],
  ): void => {
    event.preventDefault();
    const task = draggedTask;
    setDropTarget(undefined);
    setDraggedTaskId(undefined);
    if (task === undefined || !canMoveManually(task.status, status)) return;
    void post("/move", { id: task.id, status }).then((ok) => {
      setDragAnnouncement(
        ok
          ? fmt(t("dropSuccess"), {
              name: task.title,
              status: statusLabel(t, status),
            })
          : undefined,
      );
    });
  };

  return (
    <div
      className={k("board")}
      data-dsh-plugin="xtz-ui-board"
      aria-busy={loading || busy}
    >
      <header className={k("boardHeader")}>
        <button
          type="button"
          className={`${k("ghostButton")} ${k("backButton")}`}
          disabled={busy}
          onClick={() => props.panel.close()}
        >
          <BackIcon />
          <span>{t("back")}</span>
        </button>
        <h2 ref={boardFallbackRef} className={k("boardTitle")} tabIndex={-1}>
          {t("title")}
        </h2>
        <input
          className={k("search")}
          type="search"
          aria-label={t("search")}
          placeholder={t("search")}
          value={filter}
          disabled={busy}
          onChange={(event) => setFilter(event.target.value)}
        />
        <button
          type="button"
          className={k("primaryButton")}
          disabled={busy}
          onClick={() => {
            setOperationError(undefined);
            setOperationSuccess(undefined);
            setShowNew(true);
          }}
        >
          <PlusIcon />
          {t("new")}
        </button>
      </header>
      {busy ||
      operationSuccess !== undefined ||
      dragAnnouncement !== undefined ? (
        <p className={k("operationStatus")} role="status" aria-live="polite">
          {busy ? t("operationBusy") : (dragAnnouncement ?? operationSuccess)}
        </p>
      ) : null}
      {operationError !== undefined &&
      !showNew &&
      editingTask === undefined &&
      selectedTask === undefined ? (
        <div className={k("formError")} role="alert">
          {operationError}
        </div>
      ) : null}
      {loadError !== undefined &&
      !showNew &&
      editingTask === undefined &&
      selectedTask === undefined ? (
        <div className={k("formError")} role="alert">
          {loadError}
        </div>
      ) : null}
      {loading ? (
        <div className={k("boardLoading")} role="status" aria-live="polite">
          {t("loading")}
        </div>
      ) : tasks.length === 0 ? (
        <EmptyBoard
          t={t}
          onCreate={() => {
            setOperationError(undefined);
            setShowNew(true);
          }}
        />
      ) : (
        <div
          className={k("columns")}
          role="region"
          aria-label={t("boardScroller")}
          aria-describedby="dshH-tb-dragInstructions"
          tabIndex={0}
        >
          <p id="dshH-tb-dragInstructions" className={k("srOnly")}>
            {t("dragInstructions")}
          </p>
          {COLUMNS.map((column) => {
            const items = visible.filter(
              (task) => task.status === column.status,
            );
            return (
              <section
                key={column.status}
                className={k("column")}
                data-status={column.status}
                data-drop-target={
                  dropTarget === column.status ? "true" : undefined
                }
                onDragEnter={() => enterDropTarget(column.status)}
                onDragOver={(event) => {
                  if (
                    draggedTask !== undefined &&
                    canMoveManually(draggedTask.status, column.status)
                  )
                    event.preventDefault();
                }}
                onDragLeave={(event) => {
                  if (
                    !(event.relatedTarget instanceof Node) ||
                    !event.currentTarget.contains(event.relatedTarget)
                  )
                    setDropTarget(undefined);
                }}
                onDrop={(event) => dropTask(event, column.status)}
              >
                <header className={k("columnHeader")}>
                  <span
                    className={k("statusDot")}
                    data-status={column.status}
                    aria-hidden="true"
                  />
                  <h3 className={k("columnTitle")}>{t(column.labelKey)}</h3>
                  <span
                    className={k("columnCount")}
                    aria-label={`${statusLabel(t, column.status)}: ${String(items.length)}`}
                  >
                    {items.length}
                  </span>
                </header>
                <div className={k("cards")}>
                  {items.map((task) => (
                    <div
                      key={task.id}
                      className={k("cardShell")}
                      data-status={task.status}
                      data-dragging={
                        draggedTaskId === task.id ? "true" : undefined
                      }
                      draggable={!busy && task.status !== "running"}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", task.id);
                        setOperationError(undefined);
                        setOperationSuccess(undefined);
                        setDraggedTaskId(task.id);
                        setDragAnnouncement(
                          fmt(t("dragging"), { name: task.title }),
                        );
                      }}
                      onDragEnd={() => {
                        setDraggedTaskId(undefined);
                        setDropTarget(undefined);
                        setDragAnnouncement(undefined);
                      }}
                    >
                      <button
                        type="button"
                        className={k("card")}
                        aria-describedby="dshH-tb-dragInstructions"
                        disabled={busy}
                        onClick={() => {
                          setOperationError(undefined);
                          setOperationSuccess(undefined);
                          setSelected(task.id);
                        }}
                      >
                        <span className={k("cardTitle")}>{task.title}</span>
                        {task.description !== "" ? (
                          <span className={k("cardExcerpt")}>
                            {task.description}
                          </span>
                        ) : null}
                        <span className={k("cardStatus")}>
                          <span
                            className={k("statusDot")}
                            data-status={task.status}
                            aria-hidden="true"
                          />
                          {statusLabel(t, task.status)}
                        </span>
                        <span className={k("cardMeta")}>
                          <span className={k("cardTime")}>
                            {t("updated")}{" "}
                            {formatTime(task.updatedAt, t("justNow"))}
                          </span>
                          {task.schedule?.enabled === true ? (
                            <span className={k("cardSchedule")}>
                              {t("scheduled")}
                            </span>
                          ) : null}
                          {task.executions.length > 0 ? (
                            <span className={k("cardRun")}>
                              {task.executions.length} {t("runs")}
                            </span>
                          ) : null}
                          {task.status === "running" ? (
                            <span
                              className={k("cardSpinner")}
                              aria-hidden="true"
                            />
                          ) : null}
                        </span>
                      </button>
                      {task.status !== "running" ? (
                        <button
                          type="button"
                          className={k("cardEdit")}
                          aria-label={`${t("edit")}: ${task.title}`}
                          disabled={busy}
                          onClick={() => {
                            setOperationError(undefined);
                            setOperationSuccess(undefined);
                            setEditing(task.id);
                          }}
                        >
                          {t("edit")}
                        </button>
                      ) : null}
                    </div>
                  ))}
                  {items.length === 0 ? (
                    <div className={k("columnEmpty")}>{t("empty")}</div>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {showNew ? (
        <NewTaskModal
          t={t}
          workspaces={workspaces}
          busy={busy}
          requestError={operationError}
          onClose={() => setShowNew(false)}
          onCreate={(body) => {
            void (async () => {
              if (await post("/tasks", body)) setShowNew(false);
            })();
          }}
        />
      ) : null}
      {editingTask !== undefined ? (
        <EditTaskModal
          t={t}
          task={editingTask}
          busy={busy}
          requestError={operationError}
          fallbackFocus={boardFallbackRef}
          onClose={() => setEditing(undefined)}
          onSave={(body) => {
            void (async () => {
              if (
                await post("/tasks", { id: editingTask.id, ...body }, "PATCH")
              )
                setEditing(undefined);
            })();
          }}
        />
      ) : null}
      {selectedTask !== undefined ? (
        <TaskDetail
          t={t}
          task={selectedTask}
          busy={busy}
          error={operationError}
          onClose={() => setSelected(undefined)}
          onPost={post}
          onOpenSession={(sessionId) => {
            props.ctx.sessions.open(sessionId);
            props.panel.close();
          }}
        />
      ) : null}
    </div>
  );
}

function NewTaskModal(props: {
  t: (key: BoardKey) => string;
  workspaces: BoardWorkspace[];
  busy: boolean;
  requestError?: string;
  onClose: () => void;
  onCreate: (body: Record<string, unknown>) => void;
}): ReactElement {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [cron, setCron] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const titleId = useId();
  const errorId = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  const cronRef = useRef<HTMLInputElement>(null);
  const close = (): void => {
    if (!props.busy) props.onClose();
  };
  const dialogRef = useDialogFocus<HTMLFormElement>(close, titleRef);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (title.trim() === "") {
      setError(props.t("required"));
      titleRef.current?.focus();
      return;
    }
    if (scheduleEnabled && (cron.trim() === "" || !isValidCron(cron))) {
      setError(props.t("cronPh"));
      cronRef.current?.focus();
      return;
    }
    setError(undefined);
    props.onCreate({
      title,
      description,
      prompt: prompt === "" ? title : prompt,
      workspaceId: workspaceId === "" ? undefined : workspaceId,
      cron,
      scheduleEnabled,
    });
  };

  return (
    <div
      className={k("modalBackdrop")}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <form
        ref={dialogRef}
        className={k("modal")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={
          error === undefined && props.requestError === undefined
            ? undefined
            : errorId
        }
        aria-busy={props.busy}
        tabIndex={-1}
        noValidate
        onSubmit={submit}
      >
        <div className={k("modalHeader")}>
          <h2 id={titleId} className={k("modalTitle")}>
            {props.t("new")}
          </h2>
          <button
            type="button"
            className={k("iconButton")}
            aria-label={props.t("close")}
            disabled={props.busy}
            onClick={close}
          >
            <CloseIcon />
          </button>
        </div>
        <div className={k("modalBody")}>
          <label className={k("field")}>
            <span className={k("fieldLabel")}>{props.t("newTitle")}</span>
            <input
              ref={titleRef}
              className={k("input")}
              value={title}
              required
              aria-invalid={error === props.t("required")}
              aria-describedby={
                error === props.t("required") ? errorId : undefined
              }
              placeholder={props.t("titlePh")}
              onChange={(event) => {
                setTitle(event.target.value);
                setError(undefined);
              }}
            />
          </label>
          <label className={k("field")}>
            <span className={k("fieldLabel")}>{props.t("description")}</span>
            <textarea
              className={k("input")}
              rows={3}
              value={description}
              placeholder={props.t("descPh")}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <label className={k("field")}>
            <span className={k("fieldLabel")}>{props.t("prompt")}</span>
            <textarea
              className={k("input")}
              rows={4}
              value={prompt}
              placeholder={props.t("promptPh")}
              onChange={(event) => setPrompt(event.target.value)}
            />
          </label>
          <label className={k("field")}>
            <span className={k("fieldLabel")}>{props.t("workspace")}</span>
            <select
              className={k("select")}
              value={workspaceId}
              onChange={(event) => setWorkspaceId(event.target.value)}
            >
              <option value="">{props.t("workspaceNone")}</option>
              {props.workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.title}
                </option>
              ))}
            </select>
          </label>
          <label className={k("scheduleToggle")}>
            <input
              type="checkbox"
              checked={scheduleEnabled}
              onChange={(event) => {
                setScheduleEnabled(event.target.checked);
                setError(undefined);
              }}
            />
            {props.t("cronEnable")}
          </label>
          {scheduleEnabled ? (
            <label className={k("field")}>
              <span className={k("fieldLabel")}>{props.t("cronPh")}</span>
              <input
                ref={cronRef}
                className={k("input")}
                value={cron}
                required
                aria-invalid={error === props.t("cronPh")}
                aria-describedby={
                  error === props.t("cronPh") ? errorId : undefined
                }
                placeholder={props.t("cronPh")}
                onChange={(event) => {
                  setCron(event.target.value);
                  setError(undefined);
                }}
              />
            </label>
          ) : null}
          {error !== undefined || props.requestError !== undefined ? (
            <p id={errorId} className={k("formError")} role="alert">
              {error ?? props.requestError}
            </p>
          ) : null}
        </div>
        <div className={k("modalFooter")}>
          <button
            type="button"
            className={k("ghostButton")}
            disabled={props.busy}
            onClick={close}
          >
            {props.t("cancel")}
          </button>
          <button
            type="submit"
            className={k("primaryButton")}
            disabled={props.busy}
          >
            {props.t("create")}
          </button>
        </div>
      </form>
    </div>
  );
}

function TaskDetail(props: {
  t: (key: BoardKey) => string;
  task: TaskRecord;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onPost: (path: string, body: unknown) => Promise<boolean>;
  onOpenSession: (sessionId: string) => void;
}): ReactElement {
  const task = props.task;
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const close = (): void => {
    if (!props.busy) props.onClose();
  };
  const dialogRef = useDialogFocus<HTMLDivElement>(close, closeRef);
  return (
    <div
      className={k("modalBackdrop")}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        className={k("detail")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={props.busy}
        tabIndex={-1}
      >
        <div className={k("detailHeader")}>
          <h2 id={titleId} className={k("detailTitle")}>
            {task.title}
          </h2>
          <span className={k("statusBadge")} data-status={task.status}>
            {statusLabel(props.t, task.status)}
          </span>
          <button
            ref={closeRef}
            type="button"
            className={k("iconButton")}
            aria-label={props.t("close")}
            disabled={props.busy}
            onClick={close}
          >
            <CloseIcon />
          </button>
        </div>
        <div className={k("detailBody")}>
          {props.error !== undefined ? (
            <p className={k("formError")} role="alert">
              {props.error}
            </p>
          ) : null}
          {task.description !== "" ? (
            <section className={k("detailSection")}>
              <h4>{props.t("description")}</h4>
              <p className={k("detailText")}>{task.description}</p>
            </section>
          ) : null}
          <section className={k("detailSection")}>
            <h4>{props.t("prompt")}</h4>
            <pre className={k("promptBlock")}>{task.prompt}</pre>
          </section>
          {task.schedule?.enabled === true &&
          task.schedule.nextRunAt !== undefined ? (
            <section className={k("detailSection")}>
              <h4>{props.t("nextRun")}</h4>
              <p className={k("scheduleMeta")}>
                {new Date(task.schedule.nextRunAt).toLocaleString()}
              </p>
            </section>
          ) : null}
          <section className={k("detailSection")}>
            <h4>{props.t("runs")}</h4>
            {task.executions.length === 0 ? (
              <p className={k("detailText")}>{props.t("noExecution")}</p>
            ) : (
              <ul className={k("executionList")}>
                {task.executions.map((item) => (
                  <li key={item.id} className={k("executionRow")}>
                    <span
                      className={k("executionBadge")}
                      data-result={item.result}
                    >
                      {item.result ?? "running"}
                    </span>
                    <span className={k("executionTimes")}>
                      {formatTime(item.startedAt, props.t("justNow"))}
                    </span>
                    {item.sessionId !== undefined ? (
                      <button
                        type="button"
                        className={k("ghostButton")}
                        onClick={() => props.onOpenSession(item.sessionId!)}
                      >
                        {props.t("openSession")}
                      </button>
                    ) : null}
                    {item.error !== undefined ? (
                      <span className={k("executionError")}>{item.error}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <div className={k("detailFooter")}>
          {task.status !== "running" ? (
            <button
              type="button"
              className={k("primaryButton")}
              disabled={props.busy}
              onClick={() => void props.onPost("/run", { id: task.id })}
            >
              {props.t("run")}
            </button>
          ) : (
            <button
              type="button"
              className={k("dangerButton")}
              disabled={props.busy}
              onClick={() => void props.onPost("/cancel", { id: task.id })}
            >
              {props.t("stop")}
            </button>
          )}
          {task.status !== "running" && task.status !== "backlog" ? (
            <button
              type="button"
              className={k("ghostButton")}
              disabled={props.busy}
              onClick={() =>
                void props.onPost("/move", { id: task.id, status: "backlog" })
              }
            >
              {props.t("toBacklog")}
            </button>
          ) : null}
          {task.status !== "running" && task.status !== "todo" ? (
            <button
              type="button"
              className={k("ghostButton")}
              disabled={props.busy}
              onClick={() =>
                void props.onPost("/move", { id: task.id, status: "todo" })
              }
            >
              {props.t("toTodo")}
            </button>
          ) : null}
          {task.status !== "running" ? (
            <button
              type="button"
              className={k("dangerButton")}
              disabled={props.busy}
              onClick={() => {
                if (
                  !window.confirm(
                    fmt(props.t("confirmDelete"), { name: task.title }),
                  )
                )
                  return;
                void props.onPost("/delete", { id: task.id }).then((ok) => {
                  if (ok) props.onClose();
                });
              }}
            >
              {props.t("delete")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
