import { useId, useRef, useState, type FormEvent, type ReactElement, type RefObject } from "react";
import type { TaskRecord } from "../board/types.ts";
import type { BoardKey } from "./board-locales.ts";
import { useDialogFocus } from "./dialog-focus.ts";
import { CloseIcon } from "./icons.tsx";

function k(name: string): string { return `dshH-tb-${name}`; }

export function EditTaskModal(props: {
  t: (key: BoardKey) => string;
  task: TaskRecord;
  busy: boolean;
  requestError?: string;
  fallbackFocus?: RefObject<HTMLElement | null>;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => void;
}): ReactElement {
  const [title, setTitle] = useState(props.task.title);
  const [description, setDescription] = useState(props.task.description);
  const [prompt, setPrompt] = useState(props.task.prompt);
  const [validationError, setValidationError] = useState<string | undefined>(undefined);
  const titleId = useId();
  const errorId = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  const close = (): void => { if (!props.busy) props.onClose(); };
  const dialogRef = useDialogFocus<HTMLFormElement>(close, titleRef, props.fallbackFocus);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (title.trim() === "") {
      setValidationError(props.t("required"));
      titleRef.current?.focus();
      return;
    }
    setValidationError(undefined);
    props.onSave({ title, description, prompt });
  };

  return (
    <div className={k("modalBackdrop")} onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <form ref={dialogRef} className={k("modal")} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={validationError === undefined && props.requestError === undefined ? undefined : errorId} aria-busy={props.busy} tabIndex={-1} noValidate onSubmit={submit}>
        <div className={k("modalHeader")}>
          <h2 id={titleId} className={k("modalTitle")}>{props.t("edit")}</h2>
          <button type="button" className={k("iconButton")} aria-label={props.t("close")} disabled={props.busy} onClick={close}><CloseIcon /></button>
        </div>
        <div className={k("modalBody")}>
          <label className={k("field")}><span className={k("fieldLabel")}>{props.t("newTitle")}</span><input ref={titleRef} className={k("input")} value={title} aria-invalid={validationError !== undefined} aria-describedby={validationError === undefined ? undefined : errorId} onChange={(event) => { setTitle(event.target.value); setValidationError(undefined); }} required /></label>
          <label className={k("field")}><span className={k("fieldLabel")}>{props.t("description")}</span><textarea className={k("input")} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
          <label className={k("field")}><span className={k("fieldLabel")}>{props.t("prompt")}</span><textarea className={k("input")} rows={5} value={prompt} onChange={(event) => setPrompt(event.target.value)} /></label>
          {validationError !== undefined || props.requestError !== undefined ? <p id={errorId} className={k("formError")} role="alert">{validationError ?? props.requestError}</p> : null}
        </div>
        <div className={k("modalFooter")}>
          <button type="button" className={k("ghostButton")} disabled={props.busy} onClick={close}>{props.t("cancel")}</button>
          <button type="submit" className={k("primaryButton")} disabled={props.busy}>{props.t("edit")}</button>
        </div>
      </form>
    </div>
  );
}
