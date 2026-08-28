export type NoticeKind = "welcome" | "notice";

export interface NoticeCopy {
  kicker?: string;
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
      kicker: "说明",
      title: "小桃子 DSH",
      body: "这是小桃子打包的 DeepSeek Harness。点确定后即可使用。",
      confirm: "确定",
    },
    en: {
      kicker: "Notice",
      title: "Xiaotaozi DSH",
      body: "This is DeepSeek Harness, packaged by Xiaotaozi. Click OK to continue.",
      confirm: "OK",
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
