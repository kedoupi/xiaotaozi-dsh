import { useState, type FormEvent, type ReactElement } from "react";
import type { TaskRecord } from "../board/types.ts";
import type { BoardKey } from "./board-locales.ts";

function k(name: string): string { return `dshH-tb-${name}`; }


export function EditTaskModal(props: { t: (key: BoardKey) => string; task: TaskRecord; busy: boolean; onClose: () => void; onSave: (body: Record<string, unknown>) => void }): ReactElement {
  const [title, setTitle] = useState(props.task.title);
  const [description, setDescription] = useState(props.task.description);
  const [prompt, setPrompt] = useState(props.task.prompt);
  const submit = (event: FormEvent): void => { event.preventDefault(); if (title.trim() !== "") props.onSave({ title, description, prompt }); };
  return (
    <div className={k("modalBackdrop")} onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose(); }}>
      <form className={k("modal")} onSubmit={submit}>
        <div className={k("modalHeader")}><h2>{props.t("edit")}</h2><button type="button" className={k("ghostButton")} onClick={props.onClose}>{props.t("close")}</button></div>
        <label className={k("field")}><span>{props.t("newTitle")}</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} required /></label>
        <label className={k("field")}><span>{props.t("description")}</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <label className={k("field")}><span>{props.t("prompt")}</span><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} /></label>
        <div className={k("modalFooter")}><button type="button" className={k("ghostButton")} onClick={props.onClose}>{props.t("cancel")}</button><button type="submit" className={k("primaryButton")} disabled={props.busy}>{props.t("edit")}</button></div>
      </form>
    </div>
  );
}
