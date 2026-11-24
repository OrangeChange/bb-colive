const STORAGE_PREFIX = "danmu-review-dismissed-notices:";

type NoticeStorage = Pick<Storage, "getItem" | "setItem">;

function getSessionStorage(): NoticeStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function storageKey(sessionId: string): string {
  return `${STORAGE_PREFIX}${sessionId}`;
}

export function loadDismissedArchiveNotices(
  sessionId: string,
  storage: NoticeStorage | null = getSessionStorage(),
): string[] {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(storageKey(sessionId)) ?? "null");
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((value): value is string => typeof value === "string" && value.trim() !== ""))];
  } catch {
    return [];
  }
}

export function dismissArchiveNotice(
  sessionId: string,
  noticeCode: string,
  storage: NoticeStorage | null = getSessionStorage(),
): void {
  if (!storage || !noticeCode.trim()) return;
  const next = loadDismissedArchiveNotices(sessionId, storage);
  if (next.includes(noticeCode)) return;
  try {
    storage.setItem(storageKey(sessionId), JSON.stringify([...next, noticeCode]));
  } catch {
    // sessionStorage 不可用时，提示仍可由当前组件状态隐藏。
  }
}
