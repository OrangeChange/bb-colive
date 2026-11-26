import { recordFeatureDiagnostic } from "../diagnostics/featureDiagnostics";
import {
  useEffect,
  useRef,
  useState,
  useId,
  useMemo,
  type ReactNode,
  type RefObject,
} from "react";
import { MessageCirclePlus, Smile, X, Send } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "./shadcn/popover";
import { Button } from "./shadcn/button";
import { DanmakuRichInput, type DanmakuInputHandle } from "./DanmakuRichInput";
import { DanmakuMedalControl } from "./DanmakuMedalControl";
import { useSession } from "../stores/session";
import { useConnection } from "../stores/connection";
import {
  useDanmakuComposer,
  EMPTY_COMPOSER_DRAFT,
} from "../stores/danmakuComposer";
import {
  sendLiveDanmaku,
  prepareLiveDanmaku,
  clearLiveSendingPreparation,
  invalidateLiveEmoticons,
} from "../protocol/danmakuSending";
import {
  danmakuTextUsage,
  type LiveEmoticon,
} from "../protocol/danmakuSendingModel";
import { DanmakuEmoticonPicker } from "./DanmakuEmoticonPicker";
import { uiText } from "../i18n";
import { useUiLanguage } from "../i18n/react";
export function DanmakuComposer({
  children,
  fallbackRef,
}: {
  children: ReactNode;
  fallbackRef?: RefObject<HTMLElement | null>;
}) {
  useUiLanguage();
  const session = useSession((s) => s.session);
  const phase = useSession((s) => s.phase);
  const roomId = useConnection((s) => s.state.roomId);
  const status = useConnection((s) => s.state.status);
  const name = useConnection((s) => s.state.anchorName);
  const context = session && roomId ? `${session.mid}:${roomId}` : "";
  const state = useDanmakuComposer();
  const draft = state.drafts[context] ?? EMPTY_COMPOSER_DRAFT;
  const open = state.open && state.context === context;
  const input = useRef<DanmakuInputHandle>(null);
  const requestAbort = useRef<AbortController | null>(null);
  const anchor = useMemo(
    () => ({
      current: {
        getBoundingClientRect: () =>
          document
            .querySelector<HTMLElement>("[data-danmaku-trigger]")
            ?.getBoundingClientRect() ??
          fallbackRef?.current?.getBoundingClientRect() ??
          new DOMRect(16, 72, 0, 0),
      },
    }),
    [fallbackRef],
  );
  useEffect(() => {
    return () => {
      requestAbort.current?.abort();
    };
  }, [context, phase, session?.savedAt, status]);
  useEffect(() => {
    setEmotes(false);
  }, [open]);
  const id = useId();
  const [emotes, setEmotes] = useState(false);
  const [emoteRevision, setEmoteRevision] = useState(0);
  const [limit, setLimit] = useState<number>();
  const [emptyError, setEmptyError] = useState(false);
  const available = phase === "loggedIn" && !!context && status === "connected";
  useEffect(() => {
    if (phase !== "loggedIn") clearLiveSendingPreparation();
  }, [phase]);
  useEffect(() => {
    if (!available || !session) return;
    let stopped = false;
    let timer: number | undefined;
    const warm = async () => {
      try {
        const ready = await prepareLiveDanmaku(session, 60_000);
        if (!stopped && open)
          timer = window.setTimeout(
            () => void warm(),
            Math.max(1000, ready.expiresAt - Date.now() - 60_000),
          );
      } catch {
        if (!stopped && open)
          timer = window.setTimeout(() => void warm(), 60_000);
      }
    };
    void warm();
    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [available, session?.mid, session?.savedAt, session?.cookie, open]);
  useEffect(() => {
    state.setContext(context);
    setEmotes(false);
    setEmptyError(false);
    setLimit(undefined);
  }, [context, state.setContext]);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, state.focusRevision]);
  const edit = state.edit;
  const choose = (e: LiveEmoticon) => {
    if (!e.available || state.busy || !available) return;
    if (e.textual) {
      edit({
        inlineEmoticons: { ...draft.inlineEmoticons, [e.text]: e },
        mode: "text",
      });
      input.current?.insert(e);
    } else {
      setEmotes(false);
      void send(e);
    }
  };
  const send = async (immediateEmoticon?: LiveEmoticon) => {
    if (!available || !session || !roomId || state.busy) return;
    if (!immediateEmoticon && !draft.text.trim()) {
      setEmptyError(true);
      input.current?.focus();
      return;
    }
    setEmptyError(false);
    recordFeatureDiagnostic({
      featureId: "danmaku-sending",
      stage: "request",
      action: "send",
      outcome: "requested",
    });
    const abort = new AbortController();
    requestAbort.current = abort;
    await state.submit(async (d) => {
      const result = await sendLiveDanmaku(
        d.mode === "emoticon" && d.emoticon
          ? { roomId, kind: "emoticon", unique: d.emoticon.unique }
          : { roomId, kind: "text", text: d.text, replyUid: d.reply?.uid },
        session,
        abort.signal,
      );
      recordFeatureDiagnostic({
        featureId: "danmaku-sending",
        stage: result.status === "sent" ? "success" : "failure",
        action: "send",
        outcome: result.status,
        data: { roomId, ...("code" in result ? { code: result.code } : {}) },
      });
      return result;
    }, immediateEmoticon);
  };
  const reason =
    phase !== "loggedIn" ? uiText("danmaku.login") : uiText("danmaku.noRoom");
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        if (value) state.show();
        else state.close();
      }}
    >
      {children}
      <PopoverAnchor virtualRef={anchor} />
      <PopoverContent
        align="start"
        side="bottom"
        collisionPadding={8}
        className="w-[360px] max-w-[calc(100vw-24px)] max-h-[calc(100vh-32px)] overflow-y-auto"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target =
            document.querySelector<HTMLElement>("[data-danmaku-trigger]") ??
            fallbackRef?.current?.querySelector<HTMLElement>(
              ".event-menu-trigger",
            );
          target?.focus();
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          input.current?.focus();
        }}
      >
        <form
          aria-label={uiText("danmaku.open")}
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
          className="flex min-w-0 flex-col gap-2"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-medium" title={name}>
              {name || roomId}
            </span>
            {session && roomId && (
              <DanmakuMedalControl
                key={context + ":" + session.savedAt}
                session={session}
                roomId={roomId}
                disabled={state.busy || !available}
                onLimit={setLimit}
                onChanged={() => {
                  invalidateLiveEmoticons(session.cookie);
                  setEmoteRevision((n) => n + 1);
                }}
              />
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="order-2"
              aria-label={uiText("common.close")}
              onClick={state.close}
            >
              <X size={14} />
            </Button>
          </div>
          {draft.reply && (
            <div className="flex items-center justify-between rounded bg-accent/10 px-2 py-1 text-sm">
              <span className="truncate">
                {uiText("danmaku.replyTo", { name: draft.reply.name })}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={uiText("danmaku.cancelReply")}
                onClick={() => edit({ reply: undefined })}
              >
                <X size={14} />
              </Button>
            </div>
          )}
          <DanmakuRichInput
            ref={input}
            id={id}
            value={draft.text}
            emoticons={draft.inlineEmoticons ?? {}}
            readOnly={state.busy || !available}
            label={uiText("danmaku.content")}
            statusId={`${id}-status`}
            invalid={emptyError}
            onChange={(text) => {
              edit({ text, mode: "text" });
              setEmptyError(false);
            }}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing &&
                e.keyCode !== 229
              ) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={state.busy}
              aria-label={uiText("danmaku.emoticons")}
              title={uiText("danmaku.emoticons")}
              aria-expanded={emotes}
              onClick={() => setEmotes((v) => !v)}
            >
              <Smile size={16} />
            </Button>
            <span className="mr-auto text-xs text-t3">
              {limit
                ? uiText("danmaku.usageLimit", {
                    count: danmakuTextUsage(draft.text),
                    limit,
                  })
                : uiText("danmaku.usage", {
                    count: danmakuTextUsage(draft.text),
                  })}
            </span>
            <Button type="submit" disabled={state.busy || !available}>
              <Send size={14} />
              {uiText("danmaku.send")}
            </Button>
          </div>
          {emotes && session && roomId && (
            <DanmakuEmoticonPicker
              key={`${context}:${emoteRevision}`}
              roomId={roomId}
              cookie={session.cookie}
              accountKey={`${session.mid}:${session.savedAt}`}
              onChoose={choose}
              disabled={state.busy || !available}
            />
          )}
          <p id={`${id}-status`} role="status" className="text-sm text-t2">
            {emptyError
              ? uiText("danmaku.empty")
              : draft.status
                ? uiText(`danmaku.${draft.status}`)
                : !available
                  ? reason
                  : ""}
          </p>
        </form>
      </PopoverContent>
    </Popover>
  );
}

export function DanmakuComposerTrigger() {
  useUiLanguage();
  const state = useDanmakuComposer();
  return (
    <Button
      data-danmaku-trigger
      type="button"
      variant="ghost"
      size="icon-sm"
      title={uiText("danmaku.open")}
      aria-label={uiText("danmaku.open")}
      aria-expanded={state.open}
      onClick={() => (state.open ? state.close() : state.show())}
    >
      <MessageCirclePlus size={16} />
    </Button>
  );
}
