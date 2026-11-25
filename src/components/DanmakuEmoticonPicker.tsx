import { useEffect, useState, useRef } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "./shadcn/button";
import { getRoomEmoticonPackages } from "../protocol/danmakuSending";
import type {
  LiveEmoticon,
  RoomEmoticonPackage,
} from "../protocol/danmakuSendingModel";
import { uiText } from "../i18n";
const cache = new Map<string, RoomEmoticonPackage[]>();
export function DanmakuEmoticonPicker({
  roomId,
  cookie,
  accountKey,
  onChoose,
  onPackages,
}: {
  roomId: number;
  cookie: string;
  accountKey: string;
  onChoose: (emoticon: LiveEmoticon) => void;
  onPackages?: (packages: RoomEmoticonPackage[]) => void;
}) {
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
    const existing = cache.get(key);
    const load = existing
      ? Promise.resolve(existing)
      : getRoomEmoticonPackages(roomId, cookie, abort.signal);
    void load
      .then((value) => {
        if (abort.signal.aborted) return;
        cache.set(key, value);
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
    cache.delete(key);
    setRevision((n) => n + 1);
  };
  return (
    <section
      aria-label={uiText("danmaku.emoticons")}
      className="rounded-md border border-line p-2"
    >
      <div className="mb-2 flex items-center gap-1 overflow-x-auto">
        {packages.map((p) => (
          <Button
            key={p.id}
            type="button"
            variant={tab === p.id ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={tab === p.id}
            onClick={() => setTab(p.id)}
          >
            {p.name}
          </Button>
        ))}
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
        <div className="grid max-h-44 grid-cols-6 gap-1 overflow-y-auto">
          {packages
            .find((p) => p.id === tab)
            ?.emoticons.map((e) => (
              <button
                key={e.unique}
                type="button"
                disabled={!e.available}
                aria-label={e.text}
                title={
                  e.available
                    ? e.text
                    : e.unlockText || uiText("danmaku.unavailable")
                }
                className="flex h-12 min-w-0 items-center justify-center rounded border border-transparent p-1 hover:border-accent focus-visible:ring-2 focus-visible:ring-accent-ring disabled:opacity-40"
                onClick={() => onChoose(e)}
              >
                <img
                  src={e.url}
                  alt={e.text}
                  loading="lazy"
                  className="max-h-full max-w-full object-contain"
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
