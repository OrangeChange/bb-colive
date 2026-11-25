import { recordFeatureDiagnostic } from "../diagnostics/featureDiagnostics";
import { useEffect, useRef, useState, useId } from "react";
import { SquarePen, Smile, X, Send } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "./shadcn/popover";
import { Button } from "./shadcn/button";
import { Textarea } from "./shadcn/textarea";
import { useSession } from "../stores/session";
import { useConnection } from "../stores/connection";
import {
  useDanmakuComposer,
  EMPTY_COMPOSER_DRAFT,
} from "../stores/danmakuComposer";
import { sendLiveDanmaku } from "../protocol/danmakuSending";
import type { LiveEmoticon } from "../protocol/danmakuSendingModel";
import { DanmakuEmoticonPicker } from "./DanmakuEmoticonPicker";
import { uiText } from "../i18n";
import { useUiLanguage } from "../i18n/react";
export function DanmakuComposer() {
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
  const input = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const [emotes, setEmotes] = useState(false);
  const [pendingEmote, setPendingEmote] = useState<LiveEmoticon>();
  const [emptyError, setEmptyError] = useState(false);
  const available = phase === "loggedIn" && !!context && status === "connected";
  useEffect(() => {
    state.setContext(context);
    setEmotes(false);
    setPendingEmote(undefined);
    setEmptyError(false);
  }, [context, state.setContext]);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, state.focusRevision]);
  const edit = state.edit;
  const choose = (e: LiveEmoticon) => {
    if (!e.available) return;
    if (!e.textual && draft.reply) {
      setPendingEmote(e);
      return;
    }
    if (e.textual) {
      const start = input.current?.selectionStart ?? draft.text.length;
      const end = input.current?.selectionEnd ?? start;
      edit({
        text: draft.text.slice(0, start) + e.text + draft.text.slice(end),
        emoticon: undefined,
      });
      requestAnimationFrame(() => {
        input.current?.focus();
        input.current?.setSelectionRange(
          start + e.text.length,
          start + e.text.length,
        );
      });
    } else edit({ emoticon: e });
    setEmotes(false);
  };
  const send = async () => {
    if (!available || !session || !roomId || state.busy) return;
    if (!draft.emoticon && !draft.text.trim()) {
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
    await state.submit(async (d) => {
      const result = await sendLiveDanmaku(
        d.emoticon
          ? { roomId, kind: "emoticon", unique: d.emoticon.unique }
          : { roomId, kind: "text", text: d.text, replyUid: d.reply?.uid },
        session,
      );
      recordFeatureDiagnostic({
        featureId: "danmaku-sending",
        stage: result.status === "sent" ? "success" : "failure",
        action: "send",
        outcome: result.status,
        data: { roomId, ...("code" in result ? { code: result.code } : {}) },
      });
      return result;
    });
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
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title={available ? uiText("danmaku.open") : reason}
          aria-label={uiText("danmaku.open")}
          disabled={!available}
        >
          <SquarePen size={16} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        collisionPadding={8}
        className="w-[360px] max-w-[calc(100vw-24px)] max-h-[calc(100vh-32px)] overflow-y-auto"
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
          <div className="flex min-w-0 items-center justify-between gap-2">
            <span className="truncate font-medium" title={name}>
              {name || roomId}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
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
          <label htmlFor={id} className="text-sm text-t2">
            {uiText("danmaku.content")}
          </label>
          {draft.emoticon ? (
            <div className="flex min-h-20 items-center gap-2 rounded border border-line p-2">
              <img
                src={draft.emoticon.url}
                alt={draft.emoticon.text}
                className="max-h-20 max-w-40 object-contain"
              />
              <span className="truncate">{draft.emoticon.text}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={uiText("danmaku.cancelEmoticon")}
                onClick={() => edit({ emoticon: undefined })}
              >
                <X size={14} />
              </Button>
            </div>
          ) : (
            <Textarea
              ref={input}
              id={id}
              name="message"
              value={draft.text}
              readOnly={state.busy}
              aria-describedby={`${id}-status`}
              aria-invalid={emptyError || undefined}
              className="max-h-40 resize-y"
              onChange={(e) => {
                edit({ text: e.target.value });
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
          )}
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
              {uiText("danmaku.count", {
                count: Array.from(draft.text).length,
              })}
            </span>
            <Button type="submit" disabled={state.busy || !available}>
              <Send size={14} />
              {uiText("danmaku.send")}
            </Button>
          </div>
          {emotes && session && roomId && (
            <DanmakuEmoticonPicker
              roomId={roomId}
              cookie={session.cookie}
              accountKey={`${session.mid}:${session.savedAt}`}
              onChoose={choose}
            />
          )}
          {pendingEmote && (
            <div className="text-sm">
              <p>{uiText("danmaku.emoticonReply")}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    edit({ reply: undefined, emoticon: pendingEmote });
                    setPendingEmote(undefined);
                    setEmotes(false);
                  }}
                >
                  {uiText("danmaku.sendNormally")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPendingEmote(undefined)}
                >
                  {uiText("danmaku.cancel")}
                </Button>
              </div>
            </div>
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
