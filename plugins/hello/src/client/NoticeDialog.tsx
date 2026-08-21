import { useEffect, useRef } from "react";
import type { Notice, NoticeCopy } from "../notices.ts";
import { BrandLogo } from "./BrandLogo.tsx";

export interface NoticeDialogProps {
  notice: Notice;
  copy: NoticeCopy;
  onConfirm: () => void;
}

export function NoticeDialog(props: NoticeDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const marked: HTMLElement[] = [];
    for (const child of Array.from(document.body.children)) {
      if (!(child instanceof HTMLElement)) continue;
      if (child.dataset.plugin === "dsh-hello") continue;
      if (child.hasAttribute("inert")) continue;
      child.setAttribute("inert", "");
      marked.push(child);
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        props.onConfirm();
      }
    };
    document.addEventListener("keydown", onKey);
    confirmRef.current?.focus();
    return () => {
      for (const node of marked) node.removeAttribute("inert");
      document.removeEventListener("keydown", onKey);
    };
  }, [props.notice.id, props.onConfirm]);

  return (
    <div className="dshH-overlay" role="presentation">
      <div className="dshH-mask" aria-hidden="true" />
      <div className="dshH-card" role="dialog" aria-modal="true" aria-labelledby="dshH-title">
        {props.notice.mark === "logo" ? <BrandLogo /> : null}
        {props.copy.kicker !== undefined ? <p className="dshH-kicker">{props.copy.kicker}</p> : null}
        <h1 className="dshH-title" id="dshH-title">{props.copy.title}</h1>
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
