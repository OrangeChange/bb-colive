import { useEffect, useState } from "react";
import {
  Award,
  Check,
  Circle,
  CircleCheck,
  ChevronDown,
  RefreshCw,
} from "lucide-react";
import { FanMedalBadge } from "./FanMedalBadge";
import { Button } from "./shadcn/button";
import { getLiveMedals, wearLiveMedal } from "../protocol/liveMedals";
import type { LiveMedal } from "../protocol/liveMedalsModel";
import type { Session } from "../protocol/login";
import { uiText } from "../i18n";
export function DanmakuMedalControl({
  session,
  roomId,
  disabled,
  onChanged,
  onLimit,
}: {
  session: Session;
  roomId: number;
  disabled: boolean;
  onChanged(): void;
  onLimit(value: number | undefined): void;
}) {
  const [expanded, setExpanded] = useState(false),
    [medals, setMedals] = useState<LiveMedal[]>([]);
  const [current, setCurrent] = useState<LiveMedal | null>(null);
  const [loading, setLoading] = useState(false),
    [wearing, setWearing] = useState(false),
    [error, setError] = useState("");
  const [page, setPage] = useState(1),
    [nextPage, setNextPage] = useState(0),
    [revision, setRevision] = useState(0);
  const [request, setRequest] = useState<AbortController>();
  useEffect(() => {
    const abort = new AbortController();
    setRequest(abort);
    setExpanded(false);
    setMedals([]);
    setPage(1);
    setError("");
    return () => abort.abort();
  }, [session.mid, session.savedAt, roomId]);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError("");
    void getLiveMedals(roomId, session.cookie, page, abort.signal)
      .then((result) => {
        if (abort.signal.aborted) return;
        setMedals((old) =>
          page === 1
            ? result.medals
            : [
                ...old,
                ...result.medals.filter((m) => !old.some((o) => o.id === m.id)),
              ],
        );
        setNextPage(
          result.hasMore &&
            (page - 1) * 20 + result.medals.length < result.total
            ? result.nextPage
            : 0,
        );
        if (page === 1) {
          setCurrent(result.current ?? null);
          onLimit(result.limit);
        }
      })
      .catch(() => {
        if (!abort.signal.aborted) setError(uiText("danmaku.medalLoadError"));
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [session.mid, session.savedAt, session.cookie, roomId, page, revision]);
  const wear = async (m: LiveMedal) => {
    if (wearing || disabled || m.worn || !request || request.signal.aborted)
      return;
    setWearing(true);
    setError("");
    try {
      await wearLiveMedal(m.id, session, request.signal);
      if (request.signal.aborted) return;
      setMedals((old) => old.map((v) => ({ ...v, worn: v.id === m.id })));
      setCurrent({ ...m, worn: true });
      setExpanded(false);
      onChanged();
    } catch {
      if (!request.signal.aborted) setError(uiText("danmaku.medalWearError"));
    } finally {
      setWearing(false);
    }
  };
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="order-1 max-w-[60%] justify-start gap-1 px-1"
        disabled={disabled || wearing}
        aria-label={uiText("danmaku.medals")}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        {!current && <Award size={14} className="shrink-0" />}
        {current && (
          <span
            className="min-w-0 max-w-full truncate"
            title={
              current.lighted
                ? uiText("danmaku.medalLit")
                : uiText("danmaku.medalUnlit")
            }
          >
            <FanMedalBadge
              medal={{
                name: current.name,
                level: current.level,
                isLighted: current.lighted,
              }}
            />
          </span>
        )}
        <ChevronDown size={12} />
      </Button>
      {expanded && (
        <section
          aria-label={uiText("danmaku.medals")}
          className="order-3 w-full rounded-md border border-line p-1"
        >
          <div className="max-h-40 overflow-y-auto">
            {medals.map((m) => (
              <Button
                key={m.id}
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2"
                disabled={loading || wearing || disabled}
                onClick={() => void wear(m)}
                aria-pressed={m.worn}
              >
                <FanMedalBadge
                  medal={{ name: m.name, level: m.level, isLighted: m.lighted }}
                />
                <span className="mr-auto truncate text-t2">{m.anchor}</span>
                <span
                  title={
                    m.lighted
                      ? uiText("danmaku.medalLit")
                      : uiText("danmaku.medalUnlit")
                  }
                  aria-label={
                    m.lighted
                      ? uiText("danmaku.medalLit")
                      : uiText("danmaku.medalUnlit")
                  }
                >
                  {m.lighted ? <CircleCheck size={14} /> : <Circle size={14} />}
                </span>
                {m.worn && (
                  <Check size={14} aria-label={uiText("danmaku.medalWorn")} />
                )}
              </Button>
            ))}
          </div>
          {loading ? (
            <p role="status" className="p-1 text-xs text-t2">
              {uiText("danmaku.medalLoading")}
            </p>
          ) : !medals.length && !error ? (
            <p className="p-1 text-xs text-t2">
              {uiText("danmaku.medalEmpty")}
            </p>
          ) : null}
          <div className="flex justify-end gap-1">
            {nextPage > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={loading || wearing}
                onClick={() => {
                  setPage(nextPage);
                  setRevision((n) => n + 1);
                }}
              >
                {uiText("danmaku.medalMore")}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title={uiText("danmaku.medalRefresh")}
              aria-label={uiText("danmaku.medalRefresh")}
              disabled={loading || wearing}
              onClick={() => {
                setPage(1);
                setRevision((n) => n + 1);
              }}
            >
              <RefreshCw size={14} />
            </Button>
          </div>
        </section>
      )}
      {error && (
        <p role="status" className="order-3 w-full text-xs text-t2">
          {error}
        </p>
      )}
    </>
  );
}
