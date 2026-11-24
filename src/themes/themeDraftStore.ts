import type { ThemeEditorSession } from "./themeEditorSession.ts";

export type ThemeEditorDraft = Omit<ThemeEditorSession, "undo" | "redo" | "externalDocument" | "historyGroup">;
export function captureThemeDraft(session: ThemeEditorSession): ThemeEditorDraft {
  const { undo: _undo, redo: _redo, externalDocument: _external, historyGroup: _group, ...draft } = session;
  return structuredClone(draft);
}

export function createThemeDraftStore(factory: IDBFactory = indexedDB) {
  let database: Promise<IDBDatabase> | undefined;
  let pending: Promise<unknown> = Promise.resolve();
  const connect = () => database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open("danmu-theme-editor-drafts", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts", { keyPath: "themeId" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined; reject(request.error); };
  });
  const run = <T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const result = pending.then(async () => {
      const db = await connect();
      return new Promise<T>((resolve, reject) => {
        const transaction = db.transaction("drafts", mode);
        const request = operation(transaction.objectStore("drafts"));
        transaction.oncomplete = () => resolve(request.result);
        transaction.onerror = () => reject(transaction.error ?? request.error);
        transaction.onabort = () => reject(transaction.error ?? new Error("草稿写入已中断"));
      });
    });
    pending = result.catch(() => undefined);
    return result;
  };
  return {
    list: () => run<ThemeEditorDraft[]>("readonly", store => store.getAll()),
    write: (draft: ThemeEditorDraft) => run("readwrite", store => store.put(draft)),
    remove: (themeId: string) => run("readwrite", store => store.delete(themeId)),
  };
}
