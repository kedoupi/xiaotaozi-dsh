import { useEffect, useId, useRef } from "react";
import type { Notice, NoticeCopy } from "../notices.ts";
import { BrandLogo } from "./BrandLogo.tsx";

export interface NoticeDialogProps {
  notice: Notice;
  copy: NoticeCopy;
  onConfirm: () => void;
}

export function NoticeDialog(props: NoticeDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const marked: HTMLElement[] = [];
    for (const child of Array.from(document.body.children)) {
      if (!(child instanceof HTMLElement)) continue;
      if (child.dataset.plugin === "dsh-xtz-ui") continue;
      if (child.hasAttribute("inert")) continue;
      child.setAttribute("inert", "");
      marked.push(child);
    }
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
      for (const node of marked) node.removeAttribute("inert");
      document.removeEventListener("keydown", onKey);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [props.notice.id, props.onConfirm]);

  return (
    <div className="dshH-overlay" role="presentation">
      <div className="dshH-mask" aria-hidden="true" />
      <div className="dshH-card" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
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
  );
}
