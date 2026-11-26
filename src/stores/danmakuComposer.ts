import { create } from "zustand";
import type {
  LiveEmoticon,
  SendStatus,
} from "../protocol/danmakuSendingModel.ts";
export interface ComposerDraft {
  text: string;
  mode: "text" | "emoticon";
  inlineEmoticons?: Record<string, LiveEmoticon>;
  reply?: { uid: string; name: string };
  emoticon?: LiveEmoticon;
  status?: SendStatus;
  revision: number;
}
const empty = (): ComposerDraft => ({ text: "", mode: "text", revision: 0 });
interface ComposerState {
  context: string;
  open: boolean;
  focusRevision: number;
  busy: boolean;
  drafts: Record<string, ComposerDraft>;
  setContext: (key: string) => void;
  show: (reply?: ComposerDraft["reply"]) => void;
  close: () => void;
  edit: (patch: Partial<ComposerDraft>) => void;
  submit: (
    send: (draft: ComposerDraft) => Promise<{ status: SendStatus }>,
    immediateEmoticon?: LiveEmoticon,
  ) => Promise<void>;
}
export const useDanmakuComposer = create<ComposerState>((set, get) => ({
  context: "",
  open: false,
  focusRevision: 0,
  busy: false,
  drafts: {},
  setContext: (key) => {
    if (get().context !== key) set({ context: key, open: false });
  },
  show: (reply) => {
    if (reply && !get().context) return;
    if (reply) get().edit({ reply, mode: "text" });
    set((s) => ({ open: true, focusRevision: s.focusRevision + 1 }));
  },
  close: () => set({ open: false }),
  edit: (patch) =>
    set((s) => {
      const d = s.drafts[s.context] ?? empty();
      return {
        drafts: {
          ...s.drafts,
          [s.context]: {
            ...d,
            ...patch,
            mode: patch.mode ?? (patch.emoticon ? "emoticon" : d.mode),
            revision: d.revision + 1,
            status: undefined,
          },
        },
      };
    }),
  submit: async (send, immediateEmoticon) => {
    const { context, busy, drafts } = get();
    if (busy || !context) return;
    const draft = drafts[context] ?? empty();
    set((s) => ({
      busy: true,
      drafts: { ...s.drafts, [context]: { ...draft, status: "sending" } },
    }));
    let status: SendStatus;
    try {
      status = (
        await send(
          immediateEmoticon
            ? {
                ...draft,
                mode: "emoticon",
                emoticon: immediateEmoticon,
                reply: undefined,
              }
            : draft,
        )
      ).status;
    } catch {
      status = "unknown";
    }
    set((s) => {
      const current = s.drafts[context] ?? draft;
      const unchanged = current.revision === draft.revision;
      return {
        busy: false,
        drafts: {
          ...s.drafts,
          [context]: {
            ...current,
            ...(unchanged && status === "sent" && !immediateEmoticon
              ? draft.mode === "emoticon"
                ? { emoticon: undefined, mode: "text" as const }
                : { text: "" }
              : {}),
            status: unchanged ? status : current.status,
          },
        },
      };
    });
  },
}));
export const EMPTY_COMPOSER_DRAFT: ComposerDraft = {
  text: "",
  mode: "text",
  revision: 0,
};
