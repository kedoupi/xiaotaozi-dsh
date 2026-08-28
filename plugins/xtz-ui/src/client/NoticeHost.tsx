import { useCallback, useMemo, useState } from "react";
import { dismissNotice, nextNotice, readDismissed, type Notice } from "../notices.ts";
import { NoticeDialog } from "./NoticeDialog.tsx";

export interface NoticeHostProps {
  notices: readonly Notice[];
  locale: "zh" | "en";
  storage: Pick<Storage, "getItem" | "setItem">;
  onDone: () => void;
}

export function NoticeHost(props: NoticeHostProps) {
  const [dismissed, setDismissed] = useState(() => readDismissed(props.storage));
  const current = useMemo(() => nextNotice(props.notices, dismissed), [dismissed, props.notices]);

  const confirm = useCallback(() => {
    if (current === undefined) {
      props.onDone();
      return;
    }
    dismissNotice(props.storage, current.id);
    const remaining = nextNotice(props.notices, readDismissed(props.storage));
    if (remaining === undefined) {
      props.onDone();
      return;
    }
    setDismissed(readDismissed(props.storage));
  }, [current, props]);

  if (current === undefined) return null;
  return <NoticeDialog notice={current} copy={current[props.locale]} onConfirm={confirm} />;
}
