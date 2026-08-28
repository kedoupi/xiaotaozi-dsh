import { useCallback, useEffect, useState, type FormEvent, type ReactElement } from "react";
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import { isValidCron } from "../board/schedule.ts";
import { COLUMNS, type BoardWorkspace, type TaskRecord } from "../board/types.ts";
import { XTZ_UI_BOARD_NAMESPACE, XTZ_UI_BOARD_PREFIX } from "../names.ts";
import type { BoardKey } from "./board-locales.ts";
import { fmt } from "./copy.ts";
import type { PanelOpen } from "./panel-open.ts";
import { EditTaskModal } from "./EditTaskModal.tsx";

function k(name: string): string {
  return `dshH-tb-${name}`;
}

async function fetchJson(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(path, { cache: "no-store", ...init });
  const payload = await response.json() as { ok?: boolean; error?: string };
  if (!response.ok || payload.ok === false) throw new Error(payload.error ?? `http ${String(response.status)}`);
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

export function BoardPanel(props: { ctx: ClientContext; panel: PanelOpen }): ReactElement {
  const t = props.ctx.locale.bind(XTZ_UI_BOARD_NAMESPACE) as (key: BoardKey) => string;
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [workspaces, setWorkspaces] = useState<BoardWorkspace[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [filter, setFilter] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      const payload = await fetchJson(XTZ_UI_BOARD_PREFIX);
      setTasks(Array.isArray(payload.tasks) ? payload.tasks as TaskRecord[] : []);
      setWorkspaces(Array.isArray(payload.workspaces) ? payload.workspaces as BoardWorkspace[] : []);
      setError(undefined);
    } catch {
      setError(t("loadFailed"));
    }
  }, [t]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [load]);

  const post = async (path: string, body: unknown, method = "POST"): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      const payload = await fetchJson(`${XTZ_UI_BOARD_PREFIX}${path}`, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (Array.isArray(payload.tasks)) setTasks(payload.tasks as TaskRecord[]);
      setError(undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("loadFailed"));
    } finally {
      setBusy(false);
    }
  };

  const visible = tasks.filter((task) => {
    const needle = filter.trim().toLowerCase();
    if (needle === "") return true;
    return task.title.toLowerCase().includes(needle) || task.description.toLowerCase().includes(needle);
  });
  const selectedTask = tasks.find((task) => task.id === selected);
  const editingTask = tasks.find((task) => task.id === editing);

  return (
    <div className={k("board")} data-dsh-plugin="xtz-ui-board">
      <header className={k("boardHeader")}>
        <button type="button" className={`${k("ghostButton")} ${k("backButton")}`} onClick={() => props.panel.close()}>
          <span aria-hidden="true">‹</span>
          <span>{t("back")}</span>
        </button>
        <h2 className={k("boardTitle")}>{t("title")}</h2>
        <input className={k("search")} type="search" placeholder={t("search")} value={filter} onChange={(event) => setFilter(event.target.value)} />
        <button type="button" className={k("primaryButton")} onClick={() => setShowNew(true)}>+ {t("new")}</button>
      </header>
      {error !== undefined ? <div className={k("formError")}>{error}</div> : null}
      <div className={k("columns")}>
        {COLUMNS.map((column) => {
          const items = visible.filter((task) => task.status === column.status);
          return (
            <section key={column.status} className={k("column")} data-status={column.status}>
              <header className={k("columnHeader")}>
                <span className={k("statusDot")} data-status={column.status} aria-hidden="true" />
                <h3 className={k("columnTitle")}>{t(column.labelKey)}</h3>
                <span className={k("columnCount")}>{items.length}</span>
              </header>
              <div className={k("cards")}>
                {items.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    className={k("card")}
                    data-status={task.status}
                    onClick={() => setSelected(task.id)}
                  >
                    <span className={k("cardTitle")}>{task.title}</span>
                    {task.description !== "" ? <span className={k("cardExcerpt")}>{task.description}</span> : null}
                    <span className={k("cardMeta")}>
                      <span className={k("cardTime")}>{t("updated")} {formatTime(task.updatedAt, t("justNow"))}</span>
                      {task.schedule?.enabled === true ? <span className={k("cardSchedule")}>{t("scheduled")}</span> : null}
                      {task.executions.length > 0 ? <span className={k("cardRun")}>{task.executions.length} {t("runs")}</span> : null}
                      {task.status === "running" ? <span className={k("cardSpinner")} aria-hidden="true" /> : null}
                    </span>
                  </button>
                ))}
                {items.length === 0 ? <div className={k("columnEmpty")}>{t("empty")}</div> : null}
              </div>
            </section>
          );
        })}
      </div>
      {showNew ? (
        <NewTaskModal
          t={t}
          workspaces={workspaces}
          busy={busy}
          onClose={() => setShowNew(false)}
          onCreate={(body) => {
            void (async () => {
              await post("/tasks", body);
              setShowNew(false);
            })();
          }}
        />
      ) : null}
      {editingTask !== undefined ? (
        <EditTaskModal
          t={t}
          task={editingTask}
          busy={busy}
          onClose={() => setEditing(undefined)}
          onSave={(body) => { void (async () => { await post("/tasks", { id: editingTask.id, ...body }, "PATCH"); setEditing(undefined); })(); }}
        />
      ) : null}
      {selectedTask !== undefined ? (
        <TaskDetail
          t={t}
          task={selectedTask}
          busy={busy}
          onClose={() => setSelected(undefined)}
          onPost={post}
          onEdit={() => { setSelected(undefined); setEditing(selectedTask.id); }}
          onOpenSession={(sessionId) => { props.ctx.sessions.open(sessionId); props.panel.close(); }}
        />
      ) : null}
    </div>
  );
}

function NewTaskModal(props: {
  t: (key: BoardKey) => string;
  workspaces: BoardWorkspace[];
  busy: boolean;
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

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (title.trim() === "") {
      setError(props.t("required"));
      return;
    }
    if (scheduleEnabled && (cron.trim() === "" || !isValidCron(cron))) {
      setError(props.t("cronPh"));
      return;
    }
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
    <div className={k("modalBackdrop")} onMouseDown={(event) => {
      if (event.target === event.currentTarget) props.onClose();
    }}>
      <form className={k("modal")} role="dialog" onSubmit={submit}>
        <h2 className={k("modalTitle")}>{props.t("new")}</h2>
        <label className={k("field")}>
          <span className={k("fieldLabel")}>{props.t("newTitle")}</span>
          <input className={k("input")} value={title} autoFocus placeholder={props.t("titlePh")} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className={k("field")}>
          <span className={k("fieldLabel")}>{props.t("description")}</span>
          <textarea className={k("input")} rows={3} value={description} placeholder={props.t("descPh")} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <label className={k("field")}>
          <span className={k("fieldLabel")}>{props.t("prompt")}</span>
          <textarea className={k("input")} rows={4} value={prompt} placeholder={props.t("promptPh")} onChange={(event) => setPrompt(event.target.value)} />
        </label>
        <label className={k("field")}>
          <span className={k("fieldLabel")}>{props.t("workspace")}</span>
          <select className={k("select")} value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>
            <option value="">{props.t("workspaceNone")}</option>
            {props.workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>{workspace.title}</option>
            ))}
          </select>
        </label>
        <label className={k("scheduleToggle")}>
          <input type="checkbox" checked={scheduleEnabled} onChange={(event) => setScheduleEnabled(event.target.checked)} />
          {props.t("cronEnable")}
        </label>
        {scheduleEnabled ? (
          <input className={k("input")} value={cron} placeholder={props.t("cronPh")} onChange={(event) => setCron(event.target.value)} />
        ) : null}
        {error !== undefined ? <p className={k("formError")}>{error}</p> : null}
        <div className={k("modalFooter")}>
          <button type="button" className={k("ghostButton")} onClick={props.onClose}>{props.t("cancel")}</button>
          <button type="submit" className={k("primaryButton")} disabled={props.busy}>{props.t("create")}</button>
        </div>
      </form>
    </div>
  );
}

function TaskDetail(props: {
  t: (key: BoardKey) => string;
  task: TaskRecord;
  busy: boolean;
  onClose: () => void;
  onPost: (path: string, body: unknown) => Promise<void>;
  onEdit: () => void;
  onOpenSession: (sessionId: string) => void;
}): ReactElement {
  const task = props.task;
  return (
    <div className={k("modalBackdrop")} onMouseDown={(event) => {
      if (event.target === event.currentTarget) props.onClose();
    }}>
      <div className={k("detail")} role="dialog" aria-label={props.t("detail")}>
        <div className={k("detailHeader")}>
          <h2 className={k("detailTitle")}>{task.title}</h2>
          <span className={k("statusBadge")} data-status={task.status}>{task.status}</span>
          <button type="button" className={k("ghostButton")} onClick={props.onClose}>{props.t("close")}</button>
        </div>
        <div className={k("detailBody")}>
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
          {task.schedule?.enabled === true && task.schedule.nextRunAt !== undefined ? (
            <section className={k("detailSection")}>
              <h4>{props.t("nextRun")}</h4>
              <p className={k("scheduleMeta")}>{new Date(task.schedule.nextRunAt).toLocaleString()}</p>
            </section>
          ) : null}
          <section className={k("detailSection")}>
            <h4>{props.t("runs")}</h4>
            {task.executions.length === 0 ? <p className={k("detailText")}>{props.t("noExecution")}</p> : (
              <ul className={k("executionList")}>
                {task.executions.map((item) => (
                  <li key={item.id} className={k("executionRow")}>
                    <span className={k("executionBadge")} data-result={item.result}>{item.result ?? "running"}</span>
                    <span className={k("executionTimes")}>{formatTime(item.startedAt, props.t("justNow"))}</span>
                    {item.sessionId !== undefined ? <button type="button" className={k("ghostButton")} onClick={() => props.onOpenSession(item.sessionId!)}>{props.t("openSession")}</button> : null}
                    {item.error !== undefined ? <span className={k("executionError")}>{item.error}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <div className={k("detailFooter")}>
          {task.status !== "running" ? (
            <button type="button" className={k("primaryButton")} disabled={props.busy} onClick={() => void props.onPost("/run", { id: task.id })}>{props.t("run")}</button>
          ) : (
            <button type="button" className={k("dangerButton")} disabled={props.busy} onClick={() => void props.onPost("/cancel", { id: task.id })}>{props.t("stop")}</button>
          )
          }
          {task.status !== "running" ? <button type="button" className={k("ghostButton")} disabled={props.busy} onClick={props.onEdit}>{props.t("edit")}</button> : null}
          {task.status !== "running" && task.status !== "backlog" ? (
            <button type="button" className={k("ghostButton")} disabled={props.busy} onClick={() => void props.onPost("/move", { id: task.id, status: "backlog" })}>{props.t("toBacklog")}</button>
          ) : null}
          {task.status !== "running" && task.status !== "todo" ? (
            <button type="button" className={k("ghostButton")} disabled={props.busy} onClick={() => void props.onPost("/move", { id: task.id, status: "todo" })}>{props.t("toTodo")}</button>
          ) : null}
          {task.status !== "running" ? (
            <button
              type="button"
              className={k("dangerButton")}
              disabled={props.busy}
              onClick={() => {
                if (!window.confirm(fmt(props.t("confirmDelete"), { name: task.title }))) return;
                void props.onPost("/delete", { id: task.id }).then(props.onClose);
              }}
            >{props.t("delete")}</button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
