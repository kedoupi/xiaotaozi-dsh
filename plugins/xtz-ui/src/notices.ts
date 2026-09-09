export type NoticeKind = "welcome" | "notice";

export interface NoticeCopy {
  title: string;
  body: string;
  confirm: string;
}

/** One in-app dialog. Add items here for later announcements or user notices. */
export interface Notice {
  id: string;
  kind: NoticeKind;
  mark?: "logo";
  zh: NoticeCopy;
  en: NoticeCopy;
}

export const NOTICES: readonly Notice[] = [
  {
    id: "xiaotaozi-welcome",
    kind: "welcome",
    mark: "logo",
    zh: {
      title: "我是小桃子",
      body: "住在你电脑里的工作伙伴。先接一个你已经在付的模型，就可以开工。",
      confirm: "去接模型",
    },
    en: {
      title: "Xiaotaozi here",
      body: "Your work companion on this machine. Connect a model you already pay for, then we can start.",
      confirm: "Connect a model",
    },
  },
];

export const DISMISSED_STORAGE_KEY = "dsh-xtz-ui.dismissed";
export const LEGACY_DISMISSED_STORAGE_KEY = "dsh-hello.dismissed";

export function readDismissed(storage: Pick<Storage, "getItem">): string[] {
  const raw = storage.getItem(DISMISSED_STORAGE_KEY) ?? storage.getItem(LEGACY_DISMISSED_STORAGE_KEY);
  if (raw === null || raw.length === 0) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

export function dismissNotice(storage: Pick<Storage, "getItem" | "setItem">, id: string): void {
  const next = [...new Set([...readDismissed(storage), id])];
  storage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify(next));
}

export function nextNotice(notices: readonly Notice[], dismissed: readonly string[]): Notice | undefined {
  const seen = new Set(dismissed);
  return notices.find((notice) => !seen.has(notice.id));
}

export function completeNotice(
  storage: Pick<Storage, "getItem" | "setItem">,
  notices: readonly Notice[],
  notice: Notice,
  openModels: boolean,
  openCenter?: (capability: "models") => void,
): Notice | undefined {
  dismissNotice(storage, notice.id);
  const remaining = nextNotice(notices, readDismissed(storage));
  if (remaining === undefined && openModels && notice.id === "xiaotaozi-welcome") {
    openCenter?.("models");
  }
  return remaining;
}
