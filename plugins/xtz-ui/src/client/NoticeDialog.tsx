import { useEffect, useId, useRef } from "react";
import type { Notice, NoticeCopy } from "../notices.ts";
import { BrandLogo } from "./BrandLogo.tsx";

export interface NoticeDialogProps {
  notice: Notice;
  copy: NoticeCopy;
  onConfirm: () => void;
}

export function NoticeDialog(props: NoticeDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    // Native modal inertness does not overwrite the Host onboarding's root.inert snapshot.
    dialog?.showModal();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        props.onConfirm();
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        confirmRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    confirmRef.current?.focus();
    return () => {
      dialog?.close();
      document.removeEventListener("keydown", onKey);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [props.notice.id, props.onConfirm]);

  return (
    <dialog ref={dialogRef} className="dshH-native" aria-labelledby={titleId}>
    <div className="dshH-overlay" role="presentation">
      <div className="dshH-mask" aria-hidden="true" />
      <div className="dshH-card" tabIndex={-1}>
        {props.notice.mark === "logo" ? <BrandLogo /> : null}
        {props.copy.kicker !== undefined ? <p className="dshH-kicker">{props.copy.kicker}</p> : null}
        <h1 className="dshH-title" id={titleId}>{props.copy.title}</h1>
        <p className="dshH-body">{props.copy.body}</p>
        <div className="dshH-actions">
          <button ref={confirmRef} type="button" className="dshH-confirm" onClick={props.onConfirm}>
            {props.copy.confirm}
          </button>
        </div>
      </div>
    </div>
    </dialog>
  );
}
