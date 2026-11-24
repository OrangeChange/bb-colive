import type {
  StylePreviewDraft,
  StylePreviewSnapshot,
} from "./stylePreviewState.ts";
export function createStylePreviewSession() {
  let owner: string | null = null,
    current: StylePreviewSnapshot | null = null,
    revision = 0;
  const listeners = new Set<(state: StylePreviewSnapshot | null) => void>();
  const notify = () => listeners.forEach((listener) => listener(current));
  return {
    activatePreview(id: string) {
      if (owner === id) return;
      owner = id;
      current = null;
      notify();
    },
    publishPreview(id: string, state: StylePreviewDraft | null) {
      if (owner !== id) return;
      current = state ? { ...state, ownerId: id, revision: ++revision } : null;
      notify();
    },
    clearPreview(id: string) {
      if (owner !== id) return;
      owner = null;
      current = null;
      notify();
    },
    getPreview: () => current,
    subscribePreview(listener: (state: StylePreviewSnapshot | null) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
export const stylePreviewSession = createStylePreviewSession();
export const {
  activatePreview,
  publishPreview,
  clearPreview,
  getPreview,
  subscribePreview,
} = stylePreviewSession;
