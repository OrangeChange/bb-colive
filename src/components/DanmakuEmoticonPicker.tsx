import { useEffect, useState, useRef } from "react";
import { RefreshCw, Smile } from "lucide-react";
import { Button } from "./shadcn/button";
import { getRoomEmoticonPackages } from "../protocol/danmakuSending";
import type {
  LiveEmoticon,
  RoomEmoticonPackage,
} from "../protocol/danmakuSendingModel";
import { uiText } from "../i18n";
export function DanmakuEmoticonPicker({
  roomId,
  cookie,
  accountKey,
  onChoose,
  onPackages,
  disabled = false,
}: {
  disabled?: boolean;
  roomId: number;
  cookie: string;
  accountKey: string;
  onChoose: (emoticon: LiveEmoticon) => void;
  onPackages?: (packages: RoomEmoticonPackage[]) => void;
}) {
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = strip.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY))
        return;
      const distance =
        event.deltaY *
        (event.deltaMode === 1
          ? 20
          : event.deltaMode === 2
            ? element.clientWidth
            : 1);
      const next = Math.max(
        0,
        Math.min(
          element.scrollWidth - element.clientWidth,
          element.scrollLeft + distance,
        ),
      );
      if (Math.abs(next - element.scrollLeft) < 1) return;
      event.preventDefault();
      element.scrollLeft = next;
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);
  const onPackagesRef = useRef(onPackages);
  onPackagesRef.current = onPackages;
  const key = `${accountKey}:${roomId}`;
  const [packages, setPackages] = useState<RoomEmoticonPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const [tab, setTab] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setFailed(false);
    const load = getRoomEmoticonPackages(
      roomId,
      cookie,
      abort.signal,
      revision > 0,
    );
    void load
      .then((value) => {
        if (abort.signal.aborted) return;
        setPackages(value);
        onPackagesRef.current?.(value);
        setTab(value[0]?.id ?? "");
        setLoading(false);
      })
      .catch(() => {
        if (!abort.signal.aborted) {
          setFailed(true);
          setLoading(false);
        }
      });
    return () => abort.abort();
  }, [key, roomId, cookie, revision]);
  const refresh = () => {
    setRevision((n) => n + 1);
  };
  const selected = packages.find((p) => p.id === tab);
  const small = selected?.type === 3;
  const banner = selected?.type === 1;
  return (
    <section
      aria-label={uiText("danmaku.emoticons")}
      className="rounded-md border border-line p-2"
    >
      <div className="mb-2 flex items-center gap-1">
        <div
          ref={strip}
          role="tablist"
          aria-label={uiText("danmaku.emoticons")}
          className="flex min-w-0 flex-1 gap-1 overflow-x-auto"
        >
          {packages.map((p) => (
            <Button
              key={p.id}
              type="button"
              variant={tab === p.id ? "secondary" : "ghost"}
              size="icon-sm"
              className="shrink-0"
              title={p.name}
              aria-label={p.name}
              role="tab"
              aria-selected={tab === p.id}
              tabIndex={tab === p.id ? 0 : -1}
              onKeyDown={(event) => {
                const index = packages.findIndex((v) => v.id === p.id);
                const next =
                  event.key === "ArrowRight"
                    ? (index + 1) % packages.length
                    : event.key === "ArrowLeft"
                      ? (index - 1 + packages.length) % packages.length
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? packages.length - 1
                          : -1;
                if (next >= 0) {
                  event.preventDefault();
                  setTab(packages[next].id);
                  const element =
                    event.currentTarget.parentElement?.querySelectorAll<HTMLElement>(
                      '[role="tab"]',
                    )[next];
                  element?.focus();
                  element?.scrollIntoView({
                    block: "nearest",
                    inline: "nearest",
                  });
                }
              }}
              onClick={() => setTab(p.id)}
            >
              {p.cover ? (
                <img src={p.cover} alt="" className="h-6 w-6 object-contain" />
              ) : (
                <Smile size={18} />
              )}
            </Button>
          ))}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="ml-auto shrink-0"
          title={uiText("danmaku.refresh")}
          aria-label={uiText("danmaku.refresh")}
          disabled={loading}
          onClick={refresh}
        >
          <RefreshCw size={14} />
        </Button>
      </div>
      {loading ? (
        <p role="status">{uiText("danmaku.loading")}</p>
      ) : failed ? (
        <Button type="button" variant="ghost" onClick={refresh}>
          {uiText("danmaku.loadError")}
        </Button>
      ) : !packages.length ? (
        <p>{uiText("danmaku.emptyEmoticons")}</p>
      ) : (
        <div
          className={`grid max-h-44 gap-1 overflow-y-auto ${small ? "grid-cols-8" : "grid-cols-6"}`}
        >
          {selected?.emoticons.map((e) => (
            <button
              key={e.unique}
              type="button"
              disabled={disabled || !e.available}
              aria-label={e.text}
              title={
                e.available
                  ? e.text
                  : e.unlockText || uiText("danmaku.unavailable")
              }
              className={`flex min-w-0 items-center justify-center rounded border border-transparent p-1 hover:border-accent focus-visible:ring-2 focus-visible:ring-accent-ring disabled:opacity-40 ${small ? "h-8" : banner ? "h-7" : "h-12"}`}
              onClick={() => onChoose(e)}
            >
              <img
                src={e.url}
                alt={e.text}
                loading="lazy"
                className={
                  small
                    ? "h-6 w-6 object-contain"
                    : "max-h-full max-w-full object-contain"
                }
                onError={(event) => {
                  event.currentTarget.hidden = true;
                  event.currentTarget.nextElementSibling?.removeAttribute(
                    "hidden",
                  );
                }}
              />
              <span hidden className="text-xs">
                {e.text}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
